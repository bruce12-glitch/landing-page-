// =============================================================================
// VendorChain — Live Chat Server (in-memory pub/sub + history)
// =============================================================================
// Deterministic, zero-dependency live server for the chat page. The store
// survives Next.js HMR via globalThis, keeps a bounded history (250 messages),
// and fans every new message to all SSE subscribers in the same Node process.
//
// In production this would be backed by Redis Pub/Sub or Pusher/Ably —
// locally the in-memory broadcast is sufficient and keeps the operational
// surface minimal. The API is intentionally synchronous to keep the SSE stream
// latency < 2ms on localhost.
//
// Channels: general (default), verification, ledger
// Event types pushed over SSE: message | typing | presence | system
// =============================================================================

export type ChatChannel = 'general' | 'verification' | 'ledger';
export type ChatEventType = 'message' | 'typing' | 'presence' | 'system' | 'heartbeat';

export interface ChatMessage {
  id: string;
  channel: ChatChannel;
  author: string;
  displayName: string;
  avatar: string; // single letter or emoji
  color: string; // tailwind-like accent
  text: string;
  createdAt: string; // ISO
  type: ChatEventType;
  meta?: Record<string, unknown>;
}

export interface ChatBroadcastEvent {
  type: ChatEventType;
  channel: ChatChannel;
  payload: ChatMessage | { typing: boolean; author: string; displayName: string; channel: ChatChannel } | { count: number };
  id?: string;
}

type Subscriber = (event: ChatBroadcastEvent) => void;

const MAX_HISTORY = 250;
const ALLOWED_CHANNELS: ChatChannel[] = ['general', 'verification', 'ledger'];

function sanitizeChannel(c: string | null): ChatChannel {
  if (c && (ALLOWED_CHANNELS as string[]).includes(c)) return c as ChatChannel;
  return 'general';
}

// --- Global singleton so HMR does not drop history/subscribers ---
type GlobalChatState = {
  messages: ChatMessage[];
  subscribers: Set<Subscriber>;
  connectedClients: number;
};

function getState(): GlobalChatState {
  const g = globalThis as unknown as { __vc_chat?: GlobalChatState };
  if (!g.__vc_chat) {
    g.__vc_chat = {
      messages: [],
      subscribers: new Set(),
      connectedClients: 0,
    };
    // Seed with system welcome so the UI is never empty
    const now = new Date().toISOString();
    g.__vc_chat.messages = [
      {
        id: `sys_${Date.now()}_welcome`,
        channel: 'general',
        author: 'system',
        displayName: 'VendorChain',
        avatar: 'VC',
        color: '#00E5FF',
        text: 'Welcome to VendorChain Live — zero-trust chat is online. Messages are ephemeral and streamed via SSE live server (no PII persisted).',
        createdAt: now,
        type: 'system',
      },
      {
        id: `sys_${Date.now() + 1}_ledger`,
        channel: 'ledger',
        author: 'system',
        displayName: 'Ledger Stream',
        avatar: '◈',
        color: '#7C3AED',
        text: 'Polygon L2 anchoring is live — new SHA-256 state commitments will appear here in real-time.',
        createdAt: now,
        type: 'system',
      },
    ];
  }
  return g.__vc_chat;
}

// --- Public helpers ---

export function isValidChannel(c: string): c is ChatChannel {
  return (ALLOWED_CHANNELS as string[]).includes(c);
}

export function listMessages(channel?: ChatChannel, limit = 80): ChatMessage[] {
  const state = getState();
  const filtered = channel ? state.messages.filter((m) => m.channel === channel) : state.messages;
  return filtered.slice(-limit);
}

export function recentMessagesByChannel(channel: ChatChannel, limit = 80) {
  return listMessages(channel, limit);
}

export function getHistory(channel?: string | null, after?: string | null, limit = 80): ChatMessage[] {
  const c = channel ? sanitizeChannel(channel) : undefined;
  let msgs = listMessages(c, 1000);
  if (after) {
    const idx = msgs.findIndex((m) => m.id === after);
    if (idx !== -1) msgs = msgs.slice(idx + 1);
  }
  return msgs.slice(-limit);
}

export function appendMessage(msg: ChatMessage): ChatMessage {
  const state = getState();
  state.messages.push(msg);
  if (state.messages.length > MAX_HISTORY) {
    state.messages.splice(0, state.messages.length - MAX_HISTORY);
  }
  const event: ChatBroadcastEvent = { type: msg.type === 'typing' ? 'typing' : msg.type === 'system' ? 'system' : 'message', channel: msg.channel, payload: msg, id: msg.id };
  broadcast(event);
  return msg;
}

export function broadcast(event: ChatBroadcastEvent): void {
  const state = getState();
  for (const sub of state.subscribers) {
    try {
      sub(event);
    } catch {
      // ignore subscriber errors
    }
  }
}

export function subscribe(handler: Subscriber): () => void {
  const state = getState();
  state.subscribers.add(handler);
  state.connectedClients = state.subscribers.size;
  // Notify presence
  broadcast({ type: 'presence', channel: 'general', payload: { count: state.connectedClients } as unknown as ChatMessage });
  return () => {
    state.subscribers.delete(handler);
    state.connectedClients = state.subscribers.size;
    broadcast({ type: 'presence', channel: 'general', payload: { count: state.connectedClients } as unknown as ChatMessage });
  };
}

export function connectedCount(): number {
  return getState().connectedClients;
}

export function allChannels(): ChatChannel[] {
  return [...ALLOWED_CHANNELS];
}

export function sanitizeText(text: string): string {
  return text.trim().slice(0, 600).replace(/\x00/g, '');
}

const COLOR_POOL = ['#00E5FF', '#7C3AED', '#34D399', '#FBBF24', '#F472B6', '#60A5FA', '#A78BFA', '#F87171'];
export function colorFor(author: string): string {
  let h = 0;
  for (let i = 0; i < author.length; i++) h = (h * 31 + author.charCodeAt(i)) >>> 0;
  return COLOR_POOL[h % COLOR_POOL.length]!;
}

export function makeId(): string {
  const g = globalThis as { crypto?: { randomUUID?: () => string } };
  if (g.crypto?.randomUUID) return g.crypto.randomUUID().replace(/-/g, '').slice(0, 16);
  return `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 8)}`;
}
