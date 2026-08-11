'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import Link from 'next/link';

type ChatChannel = 'general' | 'verification' | 'ledger';
type ChatMessage = {
  id: string;
  channel: ChatChannel;
  author: string;
  displayName: string;
  avatar: string;
  color: string;
  text: string;
  createdAt: string;
  type: string;
};

const CHANNELS: { id: ChatChannel; label: string; desc: string; icon: string }[] = [
  { id: 'general', label: '#general', desc: 'Live ops & team chat', icon: '◉' },
  { id: 'verification', label: '#verification-feed', desc: 'GST / PAN / OCR events', icon: '◈' },
  { id: 'ledger', label: '#ledger-ops', desc: 'Polygon L2 commitments', icon: '⬣' },
];

function timeAgo(iso: string) {
  const d = Date.now() - new Date(iso).getTime();
  if (d < 60_000) return 'now';
  if (d < 3600_000) return `${Math.floor(d / 60_000)}m`;
  const h = Math.floor(d / 3600_000);
  if (h < 24) return `${h}h`;
  return `${Math.floor(h / 24)}d`;
}

export default function ChatPage() {
  const [channel, setChannel] = useState<ChatChannel>('general');
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState('');
  const [displayName, setDisplayName] = useState('');
  const [author, setAuthor] = useState('');
  const [live, setLive] = useState<{ connected: boolean; latencyMs: number | null; clients: number }>({ connected: false, latencyMs: null, clients: 0 });
  const [typingUsers, setTypingUsers] = useState<string[]>([]);
  const [sending, setSending] = useState(false);
  const listRef = useRef<HTMLDivElement>(null);
  const esRef = useRef<EventSource | null>(null);
  const typingTimeout = useRef<Record<string, number>>({});

  // Display name persistence + author slug
  useEffect(() => {
    const stored = typeof window !== 'undefined' ? localStorage.getItem('vc_chat_displayName') : null;
    const initial = stored || `operator_${Math.random().toString(36).slice(2, 6)}`;
    setDisplayName(initial);
    setAuthor(initial.toLowerCase().replace(/[^a-z0-9._-]/g, '').slice(0, 20) || 'guest');
  }, []);

  useEffect(() => {
    if (displayName) localStorage.setItem('vc_chat_displayName', displayName);
    if (displayName) setAuthor(displayName.toLowerCase().replace(/[^a-z0-9._-]/g, '').slice(0, 20) || 'guest');
  }, [displayName]);

  // Fetch initial history when channel changes
  const fetchHistory = useCallback(async (ch: ChatChannel) => {
    try {
      const res = await fetch(`/api/chat?channel=${ch}&limit=80`, { cache: 'no-store' });
      const data = await res.json();
      setMessages(data.messages ?? []);
      setLive((l) => ({ ...l, clients: data.live?.connectedClients ?? l.clients }));
    } catch {}
  }, []);

  useEffect(() => {
    fetchHistory(channel);
  }, [channel, fetchHistory]);

  // Live SSE subscription
  useEffect(() => {
    let es: EventSource | null = null;
    let latencyProbe: number | null = null;
    const connect = () => {
      const t0 = performance.now();
      es = new EventSource(`/api/chat/stream?channel=${channel}`);
      esRef.current = es;
      es.onopen = () => {
        setLive((l) => ({ ...l, connected: true, latencyMs: Math.round(performance.now() - t0) }));
      };
      const onMsg = (type: string) => (e: MessageEvent) => {
        try {
          const payload = JSON.parse(e.data);
          if (type === 'message' || type === 'system') {
            const msg = payload as ChatMessage;
            // only add if payload has channel matching (server already filters, but double-check)
            setMessages((prev) => {
              if (prev.some((m) => m.id === msg.id)) return prev;
              return [...prev.slice(-180), msg];
            });
          } else if (type === 'typing') {
            const t = payload as { author: string; displayName: string; channel: ChatChannel };
            if (t.author === author) return;
            setTypingUsers((prev) => (prev.includes(t.displayName) ? prev : [...prev, t.displayName]));
            const key = t.author;
            if (typingTimeout.current[key]) window.clearTimeout(typingTimeout.current[key]);
            typingTimeout.current[key] = window.setTimeout(() => {
              setTypingUsers((prev) => prev.filter((n) => n !== t.displayName));
            }, 2600);
          } else if (type === 'presence') {
            const p = payload as { count: number };
            if (typeof p.count === 'number') setLive((l) => ({ ...l, clients: p.count }));
          } else if (type === 'heartbeat') {
            setLive((l) => ({ ...l, connected: true }));
          }
        } catch {}
      };
      es.addEventListener('message', onMsg('message'));
      es.addEventListener('system', onMsg('system'));
      es.addEventListener('typing', onMsg('typing'));
      es.addEventListener('presence', onMsg('presence'));
      es.addEventListener('heartbeat', onMsg('heartbeat'));
      es.onerror = () => {
        setLive((l) => ({ ...l, connected: false }));
        // EventSource auto-reconnects; we mark reconnecting
        setTimeout(() => setLive((l) => ({ ...l, connected: l.connected })), 1200);
      };
    };
    connect();
    return () => {
      try { es?.close(); } catch {}
      esRef.current = null;
      if (latencyProbe) window.clearInterval(latencyProbe);
    };
  }, [channel, author]);

  // Auto scroll
  useEffect(() => {
    if (listRef.current) listRef.current.scrollTop = listRef.current.scrollHeight;
  }, [messages, typingUsers]);

  const send = async () => {
    const text = input.trim();
    if (!text || sending) return;
    setSending(true);
    try {
      const res = await fetch('/api/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ text, author, displayName, channel }),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.error ?? 'Failed to send');
      }
      setInput('');
    } catch (e) {
      // noop — show inline?
    } finally {
      setSending(false);
    }
  };

  const sendTyping = useCallback(() => {
    // fire-and-forget typing ping (throttled by server; client throttles at 1s)
    if (!displayName) return;
    fetch('/api/chat', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ text: '…', author, displayName, channel, type: 'typing' }) }).catch(() => {});
  }, [author, displayName, channel]);

  const onInput = (v: string) => {
    setInput(v);
    // throttled typing signal
    if (v.length % 6 === 1) sendTyping();
  };

  return (
    <main className="chat-shell">
      <style>{CHAT_CSS}</style>

      {/* Topbar */}
      <header className="chat-topbar">
        <div className="chat-brand">
          <span className="chat-mark">VC</span>
          <div>
            <strong>VendorChain Live</strong>
            <span>Zero-Trust Chat — SSE live server</span>
          </div>
        </div>
        <nav className="chat-nav">
          <Link href="/dashboard">Dashboard</Link>
          <Link href="/onboarding">Onboarding</Link>
          <Link className="active" href="/chat">Live Chat</Link>
          <Link href="/">Landing</Link>
        </nav>
        <div className="live-pill" data-live={live.connected ? 'on' : 'off'}>
          <span className="dot" />
          {live.connected ? 'LIVE' : 'RECONNECTING'}
          {live.latencyMs != null && live.connected ? ` · ${live.latencyMs}ms` : ''}
          <span className="sep" />
          {live.clients} online
        </div>
      </header>

      <div className="chat-layout">
        {/* Channels */}
        <aside className="chat-sidebar">
          <div className="sidebar-head">
            <span className="eyebrow">LIVE SERVER</span>
            <strong>Trust Network</strong>
            <p>Real-time SSE stream · {live.connected ? 'connected' : 'offline'} · no PII persisted</p>
            <div className="live-stats">
              <span><i />{live.clients} peers</span>
              <span><i className="cyan" />SSE transport</span>
            </div>
          </div>
          <div className="channel-list">
            {CHANNELS.map((c) => (
              <button
                key={c.id}
                className={c.id === channel ? 'active' : ''}
                onClick={() => setChannel(c.id)}
                aria-selected={c.id === channel}
              >
                <span className="icon">{c.icon}</span>
                <span className="labels">
                  <strong>{c.label}</strong>
                  <small>{c.desc}</small>
                </span>
                {c.id === channel && <span className="live-dot" />}
              </button>
            ))}
          </div>

          <div className="identity-card">
            <label htmlFor="displayName">Display name</label>
            <input id="displayName" value={displayName} onChange={(e) => setDisplayName(e.target.value.slice(0, 32))} placeholder="operator_7f3a" spellCheck={false} />
            <small>visible to peers · stored locally only</small>
          </div>

          <div className="server-card">
            <strong>Live server</strong>
            <code>GET /api/chat/stream?channel={channel}</code>
            <code>POST /api/chat</code>
            <p>15s heartbeat · in-memory pub/sub · 250-msg history · auto-reconnect via Last-Event-ID.</p>
            <a href="/api/chat?channel=general" target="_blank" rel="noreferrer">Inspect JSON →</a>
          </div>
        </aside>

        {/* Main chat */}
        <section className="chat-main">
          <div className="chat-header">
            <h1>{CHANNELS.find((c) => c.id === channel)?.label} <span>— {CHANNELS.find((c) => c.id === channel)?.desc}</span></h1>
            <span className="transport-badge">SSE Live Server · {live.connected ? 'connected' : 'offline'} · {messages.length} cached</span>
          </div>

          <div className="chat-list" ref={listRef} role="log" aria-live="polite" aria-relevant="additions">
            {messages.map((m) => (
              <div key={m.id} className={`chat-row ${m.type === 'system' ? 'system' : ''}`}>
                <div className="avatar" style={{ background: m.color, borderColor: m.color }}>
                  {m.avatar}
                </div>
                <div className="bubble">
                  <div className="meta">
                    <strong style={{ color: m.color }}>{m.displayName}</strong>
                    <span className="author">@{m.author}</span>
                    <span className="time">{timeAgo(m.createdAt)}</span>
                    {m.channel !== channel && <span className="ch">{m.channel}</span>}
                  </div>
                  <p>{m.text}</p>
                </div>
              </div>
            ))}
            {typingUsers.length > 0 && (
              <div className="typing-row">
                <span className="typing-dots">
                  <i /><i /><i />
                </span>
                {typingUsers.join(', ')} {typingUsers.length === 1 ? 'is' : 'are'} typing…
              </div>
            )}
            {messages.length === 0 && (
              <div className="empty">No messages yet — be the first to say hello. The live server is waiting on SSE.</div>
            )}
          </div>

          <div className="composer">
            <div className="composer-input-wrap">
              <input
                value={input}
                onChange={(e) => onInput(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); void send(); }
                }}
                placeholder={`Message ${CHANNELS.find((c) => c.id === channel)?.label} — press Enter to send`}
                maxLength={600}
                aria-label="Chat message"
              />
              <span className="char-count">{input.length}/600</span>
            </div>
            <button className="send-btn" onClick={() => void send()} disabled={!input.trim() || sending}>
              {sending ? 'Sending…' : 'Send →'}
            </button>
          </div>
          <p className="composer-hint">Live via SSE — messages fan out in &lt; 50ms. Ephemeral by design (no PAN/GST, no PII persisted). Use <code>/api/chat/stream</code> for integrations.</p>
        </section>

        {/* Presence */}
        <aside className="chat-presence">
          <div className="presence-head">
            <strong>Presence</strong>
            <span>{live.clients} online</span>
          </div>
          <div className="presence-card">
            <div className="presence-dot" />
            <div>
              <strong>Live server health</strong>
              <p>SSE keep-alive 15s · auto-reconnect · Last-Event-ID replay</p>
            </div>
          </div>
          <div className="presence-card">
            <div className="presence-dot cyan" />
            <div>
              <strong>Transport</strong>
              <p><code>text/event-stream</code> · Node ReadableStream · in-memory pub/sub</p>
            </div>
          </div>
          <div className="presence-card subtle">
            <strong>Channels</strong>
            <p>general · verification · ledger — isolated broadcast but presence is global.</p>
          </div>
          <div className="quick-links">
            <a href="/api/chat/stream?channel=general" target="_blank" rel="noreferrer">Open raw SSE →</a>
            <a href="/api/health" target="_blank" rel="noreferrer">Health →</a>
            <a href="/dashboard" rel="noreferrer">Dashboard →</a>
          </div>
        </aside>
      </div>
    </main>
  );
}

const CHAT_CSS = `
:root{ --bg:#070714; --panel:#131326; --panel2:#0F1116; --border:#1E1E3A; --border2:#252545; --text:#F8FAFC; --muted:#9AA0C5; --cyan:#00E5FF; --purple:#7C3AED; }
*{box-sizing:border-box}
.chat-shell{ min-height:100vh; background:radial-gradient(900px 520px at 50% -8%, rgba(138,43,226,.10) 0%, rgba(0,229,255,.06) 28%, transparent 64%), linear-gradient(180deg,#070714 0%, #050507 100%); color:var(--text); font-family:'Plus Jakarta Sans',system-ui,sans-serif; display:flex; flex-direction:column; }
.chat-topbar{ display:flex; align-items:center; gap:16px; padding:12px 18px; border-bottom:1px solid var(--border); background:rgba(19,19,38,.72); backdrop-filter:blur(14px); position:sticky; top:0; z-index:10; flex-wrap:wrap; }
.chat-brand{ display:flex; align-items:center; gap:12px; }
.chat-mark{ width:28px; height:28px; border-radius:8px; background:linear-gradient(135deg,#3B5BFF,#7C3AED); display:grid; place-items:center; font:800 11px 'JetBrains Mono',monospace; }
.chat-brand strong{ display:block; font:700 13px 'Plus Jakarta Sans',sans-serif; letter-spacing:-.02em; }
.chat-brand span{ display:block; font:500 11px 'JetBrains Mono',monospace; color:var(--muted); }
.chat-nav{ display:flex; gap:10px; margin-left:12px; }
.chat-nav a{ font-size:12px; font-weight:600; color:var(--muted); padding:6px 10px; border-radius:999px; border:1px solid transparent; text-decoration:none; }
.chat-nav a.active, .chat-nav a:hover{ color:#fff; border-color:rgba(255,255,255,.08); background:rgba(255,255,255,.06); }
.live-pill{ margin-left:auto; display:inline-flex; align-items:center; gap:8px; font:700 10px 'JetBrains Mono',monospace; letter-spacing:.08em; text-transform:uppercase; color:var(--cyan); background:rgba(0,229,255,.10); border:1px solid rgba(0,229,255,.28); padding:6px 10px; border-radius:999px; }
.live-pill[data-live='off']{ color:#FBBF24; background:rgba(251,191,36,.10); border-color:rgba(251,191,36,.28); }
.live-pill .dot{ width:7px; height:7px; border-radius:50%; background:currentColor; box-shadow:0 0 8px currentColor; animation:pulse 1.6s ease-in-out infinite; }
.live-pill .sep{ width:1px; height:12px; background:rgba(255,255,255,.12); margin:0 2px; }
@keyframes pulse{0%,100%{opacity:1}50%{opacity:.32}}

.chat-layout{ display:grid; grid-template-columns:280px 1fr 260px; gap:0; flex:1; min-height:0; max-width:1440px; margin:0 auto; width:100%; }
@media(max-width:1100px){ .chat-layout{ grid-template-columns:240px 1fr; } .chat-presence{ display:none; } }
@media(max-width:760px){ .chat-layout{ grid-template-columns:1fr; } .chat-sidebar{ order:2; } .chat-presence{ display:none; } }

.chat-sidebar{ border-right:1px solid var(--border); background:linear-gradient(180deg, rgba(19,19,38,.54) 0%, rgba(10,12,22,.72) 100%); padding:18px 14px; display:flex; flex-direction:column; gap:16px; min-height:0; }
.sidebar-head .eyebrow{ font:700 10px 'JetBrains Mono',monospace; letter-spacing:.12em; color:var(--cyan); display:block; }
.sidebar-head strong{ display:block; font:700 16px 'Plus Jakarta Sans',sans-serif; margin:4px 0 6px; }
.sidebar-head p{ margin:0; font-size:12px; line-height:1.5; color:var(--muted); }
.live-stats{ display:flex; gap:8px; margin-top:10px; }
.live-stats span{ display:inline-flex; align-items:center; gap:6px; font:600 11px 'JetBrains Mono',monospace; color:var(--muted); background:rgba(255,255,255,.04); border:1px solid rgba(255,255,255,.06); padding:4px 8px; border-radius:999px; }
.live-stats i{ width:6px; height:6px; border-radius:50%; background:#34D399; box-shadow:0 0 6px #34D399; display:inline-block; }
.live-stats i.cyan{ background:var(--cyan); box-shadow:0 0 6px var(--cyan); }

.channel-list{ display:flex; flex-direction:column; gap:8px; }
.channel-list button{ display:flex; align-items:center; gap:10px; width:100%; text-align:left; padding:10px 12px; border-radius:12px; border:1px solid rgba(255,255,255,.06); background:rgba(255,255,255,.03); cursor:pointer; color:var(--muted); transition:all .18s; }
.channel-list button:hover{ border-color:rgba(0,229,255,.18); color:#fff; transform:translateY(-1px); }
.channel-list button.active{ background:rgba(0,229,255,.08); border-color:rgba(0,229,255,.28); color:#fff; box-shadow:0 4px 16px rgba(0,229,255,.12); }
.channel-list .icon{ width:28px; height:28px; border-radius:8px; background:rgba(255,255,255,.06); border:1px solid rgba(255,255,255,.08); display:grid; place-items:center; font-size:12px; flex-shrink:0; }
.channel-list .labels{ flex:1; min-width:0; }
.channel-list strong{ display:block; font:700 12px 'JetBrains Mono',monospace; }
.channel-list small{ display:block; font:500 11px 'Plus Jakarta Sans',sans-serif; color:var(--muted); white-space:nowrap; overflow:hidden; text-overflow:ellipsis; }
.live-dot{ width:7px; height:7px; border-radius:50%; background:var(--cyan); box-shadow:0 0 8px var(--cyan); animation:pulse 1.6s infinite; flex-shrink:0; }

.identity-card{ background:rgba(255,255,255,.03); border:1px solid rgba(255,255,255,.06); border-radius:12px; padding:12px; }
.identity-card label{ display:block; font:700 11px 'JetBrains Mono',monospace; letter-spacing:.06em; text-transform:uppercase; color:var(--muted); margin-bottom:6px; }
.identity-card input{ width:100%; background:#070714; border:1px solid var(--border2); border-radius:8px; padding:8px 10px; font:500 13px 'Plus Jakarta Sans',sans-serif; color:#fff; outline:none; }
.identity-card input:focus{ border-color:var(--cyan); box-shadow:0 0 0 3px rgba(0,229,255,.12); }
.identity-card small{ display:block; margin-top:6px; font-size:11px; color:var(--muted); }

.server-card{ background:linear-gradient(180deg, rgba(0,229,255,.06) 0%, rgba(124,58,237,.06) 100%); border:1px solid rgba(0,229,255,.18); border-radius:12px; padding:12px; }
.server-card strong{ display:block; font:700 11px 'JetBrains Mono',monospace; letter-spacing:.06em; text-transform:uppercase; color:var(--cyan); margin-bottom:8px; }
.server-card code{ display:block; font:500 11px 'JetBrains Mono',monospace; color:#C9D1E0; background:rgba(0,0,0,.28); border:1px solid rgba(255,255,255,.06); padding:6px 8px; border-radius:8px; margin-bottom:6px; word-break:break-all; }
.server-card p{ margin:8px 0 8px; font-size:11px; line-height:1.5; color:var(--muted); }
.server-card a{ font:700 11px 'JetBrains Mono',monospace; color:var(--cyan); text-decoration:none; }
.server-card a:hover{ text-decoration:underline; }

.chat-main{ display:flex; flex-direction:column; min-height:0; background:rgba(7,7,20,.42); border-right:1px solid var(--border); }
.chat-header{ padding:14px 18px; border-bottom:1px solid var(--border); display:flex; align-items:center; justify-content:space-between; gap:12px; flex-wrap:wrap; background:rgba(255,255,255,.02); }
.chat-header h1{ margin:0; font:700 14px 'Plus Jakarta Sans',sans-serif; }
.chat-header h1 span{ font:500 12px 'Plus Jakarta Sans',sans-serif; color:var(--muted); }
.transport-badge{ font:600 11px 'JetBrains Mono',monospace; color:var(--muted); background:rgba(255,255,255,.04); border:1px solid rgba(255,255,255,.06); padding:4px 8px; border-radius:999px; }

.chat-list{ flex:1; overflow:auto; padding:18px; display:flex; flex-direction:column; gap:12px; scroll-behavior:smooth; }
.chat-row{ display:flex; gap:10px; align-items:flex-start; }
.chat-row.system{ opacity:.9; }
.chat-row.system .bubble{ background:rgba(0,229,255,.06); border-color:rgba(0,229,255,.16); }
.avatar{ width:28px; height:28px; border-radius:50%; display:grid; place-items:center; font:700 11px 'JetBrains Mono',monospace; color:#070714; flex-shrink:0; border:1px solid transparent; }
.bubble{ flex:1; min-width:0; background:rgba(255,255,255,.04); border:1px solid rgba(255,255,255,.06); border-radius:12px; padding:10px 12px; }
.meta{ display:flex; align-items:baseline; gap:8px; flex-wrap:wrap; margin-bottom:6px; }
.meta strong{ font:700 13px 'Plus Jakarta Sans',sans-serif; }
.meta .author{ font:500 11px 'JetBrains Mono',monospace; color:var(--muted); }
.meta .time{ font:500 11px 'JetBrains Mono',monospace; color:var(--muted); margin-left:auto; }
.meta .ch{ font:600 10px 'JetBrains Mono',monospace; letter-spacing:.04em; text-transform:uppercase; background:rgba(255,255,255,.06); border:1px solid rgba(255,255,255,.08); padding:2px 6px; border-radius:999px; color:var(--muted); }
.bubble p{ margin:0; font:500 13px/1.55 'Plus Jakarta Sans',sans-serif; color:#E2E8F0; white-space:pre-wrap; word-break:break-word; }

.typing-row{ display:flex; align-items:center; gap:10px; font:500 12px 'JetBrains Mono',monospace; color:var(--muted); padding:6px 2px; }
.typing-dots{ display:inline-flex; gap:4px; }
.typing-dots i{ width:6px; height:6px; border-radius:50%; background:var(--cyan); opacity:.9; animation:typingBounce 1.2s ease-in-out infinite; }
.typing-dots i:nth-child(2){ animation-delay:.15s; }
.typing-dots i:nth-child(3){ animation-delay:.30s; }
@keyframes typingBounce{0%,80%,100%{transform:translateY(0);opacity:.5}40%{transform:translateY(-4px);opacity:1}}
.empty{ text-align:center; padding:32px 18px; font:500 12px 'JetBrains Mono',monospace; color:var(--muted); background:rgba(255,255,255,.02); border:1px dashed rgba(255,255,255,.08); border-radius:12px; }

.composer{ display:flex; gap:10px; padding:14px 16px; border-top:1px solid var(--border); background:rgba(19,19,38,.42); }
.composer-input-wrap{ flex:1; position:relative; }
.composer-input-wrap input{ width:100%; background:#070714; border:1px solid var(--border2); border-radius:12px; padding:12px 56px 12px 12px; font:500 13px 'Plus Jakarta Sans',sans-serif; color:#fff; outline:none; }
.composer-input-wrap input:focus{ border-color:var(--cyan); box-shadow:0 0 0 3px rgba(0,229,255,.12); }
.char-count{ position:absolute; right:10px; top:50%; transform:translateY(-50%); font:500 11px 'JetBrains Mono',monospace; color:var(--muted); }
.send-btn{ appearance:none; border:1px solid rgba(0,229,255,.9); background:var(--cyan); color:#070714; font:800 13px 'Plus Jakarta Sans',sans-serif; padding:12px 16px; border-radius:12px; cursor:pointer; transition:all .18s; white-space:nowrap; }
.send-btn:hover:not(:disabled){ background:#2FE9FF; transform:translateY(-1px); box-shadow:0 8px 22px rgba(0,229,255,.22); }
.send-btn:disabled{ opacity:.45; cursor:not-allowed; }
.composer-hint{ margin:0; padding:8px 16px 14px; font:500 11px 'JetBrains Mono',monospace; color:var(--muted); background:rgba(19,19,38,.22); }
.composer-hint code{ background:rgba(255,255,255,.06); border:1px solid rgba(255,255,255,.06); padding:2px 6px; border-radius:6px; }

.chat-presence{ padding:18px 14px; display:flex; flex-direction:column; gap:14px; background:linear-gradient(180deg, rgba(19,19,38,.32) 0%, rgba(7,7,20,.62) 100%); }
.presence-head{ display:flex; align-items:center; justify-content:space-between; }
.presence-head strong{ font:700 12px 'Plus Jakarta Sans',sans-serif; }
.presence-head span{ font:600 11px 'JetBrains Mono',monospace; color:var(--muted); background:rgba(255,255,255,.04); border:1px solid rgba(255,255,255,.06); padding:4px 8px; border-radius:999px; }
.presence-card{ display:flex; gap:10px; padding:12px; background:rgba(255,255,255,.03); border:1px solid rgba(255,255,255,.06); border-radius:12px; }
.presence-card.subtle{ background:transparent; border-style:dashed; }
.presence-dot{ width:8px; height:8px; border-radius:50%; background:#34D399; box-shadow:0 0 8px #34D399; margin-top:4px; flex-shrink:0; }
.presence-dot.cyan{ background:var(--cyan); box-shadow:0 0 8px var(--cyan); }
.presence-card strong{ display:block; font:700 12px 'Plus Jakarta Sans',sans-serif; }
.presence-card p{ margin:4px 0 0; font:500 11px 'JetBrains Mono',monospace; color:var(--muted); line-height:1.5; }
.presence-card code{ background:rgba(255,255,255,.06); padding:2px 6px; border-radius:6px; }
.quick-links{ display:flex; flex-direction:column; gap:8px; margin-top:8px; }
.quick-links a{ font:600 11px 'JetBrains Mono',monospace; color:var(--cyan); text-decoration:none; background:rgba(0,229,255,.06); border:1px solid rgba(0,229,255,.14); padding:8px 10px; border-radius:8px; text-align:center; }
.quick-links a:hover{ background:rgba(0,229,255,.10); }
`;
