import { subscribe, listMessages, type ChatBroadcastEvent } from '@/lib/chat/store';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

function sseEncode(event: string, data: unknown, id?: string): string {
  let chunk = '';
  if (id) chunk += `id: ${id}\n`;
  chunk += `event: ${event}\n`;
  chunk += `data: ${JSON.stringify(data)}\n\n`;
  return chunk;
}

/**
 * GET /api/chat/stream?channel=general
 * SSE live server — streams every new ChatBroadcastEvent in real-time.
 * Query:
 *   channel - subscribes to a specific channel (default: all via 'general' bridge)
 * Headers:
 *   Last-Event-ID is honoured for reconnection replay (we re-send history tail).
 *
 * Keeps the connection alive with a 15s heartbeat comment.
 */
export async function GET(req: Request) {
  const url = new URL(req.url);
  const channel = url.searchParams.get('channel') ?? undefined;

  const stream = new ReadableStream<Uint8Array>({
    start(controller) {
      const encoder = new TextEncoder();
      let closed = false;
      let heartbeat: ReturnType<typeof setInterval> | undefined;

      const send = (chunk: string) => {
        if (closed) return;
        try {
          controller.enqueue(encoder.encode(chunk));
        } catch {
          closed = true;
        }
      };

      // Initial hello + history replay (last 30) so late joiners sync instantly
      send(`: vc-chat live server connected ${new Date().toISOString()}\n\n`);
      send(sseEncode('hello', { serverTime: new Date().toISOString(), channel: channel ?? 'all', transport: 'sse' }));
      // replay history
      const history = listMessages(channel as never, 30);
      for (const m of history) {
        send(sseEncode('message', m, m.id));
      }

      const handler = (ev: ChatBroadcastEvent) => {
        // If client subscribed to a specific channel, only push that channel + system/presence
        if (channel && ev.channel !== channel && ev.type !== 'presence' && ev.type !== 'system') return;
        const eventName = ev.type === 'typing' ? 'typing' : ev.type === 'presence' ? 'presence' : ev.type === 'system' ? 'system' : 'message';
        send(sseEncode(eventName, ev.payload, (ev as { id?: string }).id ?? (ev.payload as { id?: string })?.id));
      };

      const unsubscribe = subscribe(handler);

      // Heartbeat every 15s to keep proxies/load balancers from closing the stream
      heartbeat = setInterval(() => {
        send(`: heartbeat ${Date.now()}\n\n`);
        send(sseEncode('heartbeat', { t: Date.now(), count: 1 }));
      }, 15_000);

      // Cleanup on client abort
      const signal = (req as unknown as { signal?: AbortSignal }).signal;
      const cleanup = () => {
        if (closed) return;
        closed = true;
        if (heartbeat) clearInterval(heartbeat);
        unsubscribe();
        try {
          controller.close();
        } catch {}
      };

      if (signal) {
        signal.addEventListener('abort', cleanup, { once: true });
      }

      // Also close after a very long TTL (4h) to avoid zombie connections
      setTimeout(cleanup, 4 * 60 * 60 * 1000);
    },
    cancel() {
      // handled via abort signal
    },
  });

  return new Response(stream, {
    headers: {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache, no-transform',
      Connection: 'keep-alive',
      'X-Accel-Buffering': 'no',
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Headers': 'Cache-Control',
    },
  });
}

export async function OPTIONS() {
  return new Response(null, {
    status: 204,
    headers: {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'GET, OPTIONS',
      'Access-Control-Allow-Headers': 'Cache-Control, Last-Event-ID',
    },
  });
}
