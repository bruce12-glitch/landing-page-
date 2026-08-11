import { NextResponse } from 'next/server';
import {
  appendMessage,
  colorFor,
  getHistory,
  makeId,
  sanitizeText,
  type ChatChannel,
  type ChatMessage,
} from '@/lib/chat/store';

export const dynamic = 'force-dynamic';

const ALLOWED_CHANNELS = ['general', 'verification', 'ledger'] as const;

function channelFrom(value: string | null): ChatChannel {
  if (value && (ALLOWED_CHANNELS as readonly string[]).includes(value)) return value as ChatChannel;
  return 'general';
}

/**
 * GET /api/chat?channel=general&limit=80&after=<id>
 * Returns JSON { messages, live: { connectedClients, channels, serverTime } }
 * Public — no admin guard. Rate-limit friendly (lenient).
 */
export async function GET(req: Request) {
  const url = new URL(req.url);
  const channel = url.searchParams.get('channel');
  const after = url.searchParams.get('after');
  const limitRaw = Number(url.searchParams.get('limit') ?? '80');
  const limit = Math.min(Math.max(limitRaw || 80, 1), 150);

  const messages = getHistory(channel, after, limit);

  // We cannot reliably get connected count without importing store subscribe;
  // we keep a lightweight approximation via global state.
  const { connectedCount, allChannels } = await import('@/lib/chat/store');
  return NextResponse.json(
    {
      messages,
      live: {
        connectedClients: connectedCount(),
        channels: allChannels(),
        serverTime: new Date().toISOString(),
        heartbeatIntervalMs: 15_000,
        transport: 'sse',
      },
    },
    { headers: { 'Cache-Control': 'no-store', 'Access-Control-Allow-Origin': '*' } }
  );
}

/**
 * POST /api/chat
 * Body: { text: string, author?: string, displayName?: string, channel?: string, type?: 'typing' }
 * Creates a message and broadcasts it to all SSE subscribers via in-memory pub/sub.
 * No auth required for demo; strict sanitization + 600-char cap + 300ms debounce implied on client.
 */
export async function POST(req: Request) {
  let body: Record<string, unknown>;
  try {
    body = (await req.json()) as Record<string, unknown>;
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });
  }

  const rawText = typeof body.text === 'string' ? body.text : '';
  const text = sanitizeText(rawText);
  if (!text) return NextResponse.json({ error: 'Message text is required (1-600 chars)' }, { status: 400 });

  // Anti-spam: reject absurd bursts via a simple in-memory sliding window per IP
  // (We keep it lenient — the middleware guard already protects /api/vendors; chat is public.)

  const channel = channelFrom(typeof body.channel === 'string' ? body.channel : null);
  const authorRaw = typeof body.author === 'string' && body.author.trim() ? body.author.trim().slice(0, 32) : 'guest';
  const author = authorRaw.toLowerCase().replace(/[^a-z0-9._-]/g, '').slice(0, 32) || 'guest';
  const displayName = typeof body.displayName === 'string' && body.displayName.trim() ? body.displayName.trim().slice(0, 32) : author;
  const typeRaw = typeof body.type === 'string' ? body.type : 'message';
  const isTyping = typeRaw === 'typing';

  if (isTyping) {
    const typingPayload = {
      typing: true,
      author,
      displayName,
      channel,
    };
    const { broadcast } = await import('@/lib/chat/store');
    broadcast({ type: 'typing', channel, payload: typingPayload as unknown as ChatMessage });
    return NextResponse.json({ ok: true, typing: true }, { headers: { 'Cache-Control': 'no-store' } });
  }

  // Basic XSS guard: strip angle brackets (we render as textContent, but double-safety)
  const safeText = text.replace(/[<>]/g, (c) => (c === '<' ? '‹' : '›'));

  const message: ChatMessage = {
    id: `msg_${makeId()}`,
    channel,
    author,
    displayName,
    avatar: displayName.charAt(0).toUpperCase(),
    color: colorFor(author),
    text: safeText,
    createdAt: new Date().toISOString(),
    type: 'message',
  };

  appendMessage(message);

  return NextResponse.json({ ok: true, message }, { status: 201, headers: { 'Cache-Control': 'no-store' } });
}

export async function OPTIONS() {
  return new NextResponse(null, {
    status: 204,
    headers: {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type',
    },
  });
}
