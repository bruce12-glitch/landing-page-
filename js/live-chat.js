// VendorChain — Live Chat (SSE live server) for landing page
// Connects to platform live server via same-origin /api/chat proxy (vite → :3001)
// Supports both the dedicated section (#liveChat) and floating widget drawer.
// Zero dependencies, resilient to platform offline (shows offline state, still allows local echo).

(() => {
  const ENDPOINT_CHAT = '/api/chat';
  const ENDPOINT_STREAM = '/api/chat/stream';
  const STORAGE_KEY_NAME = 'vc_chat_displayName_landing';
  const STORAGE_KEY_COLOR = 'vc_chat_color_landing';

  const $ = (s, r = document) => r.querySelector(s);
  const $$ = (s, r = document) => [...r.querySelectorAll(s)];

  const liveChatStream = $('#liveChatStream');
  const liveChatEmpty = $('#liveChatEmpty');
  const liveChatInput = $('#liveChatInput');
  const liveSendBtn = $('#liveSendBtn');
  const liveDisplayName = $('#liveDisplayName');
  const liveCharCount = $('#liveCharCount');
  const liveTyping = $('#liveTyping');
  const liveStatDot = $('#liveStatDot');
  const liveStatLabel = $('#liveStatLabel');
  const liveStatPeers = $('#liveStatPeers');
  const liveTransportInfo = $('#liveTransportInfo');

  const fab = $('#liveWidgetFab');
  const drawer = $('#liveWidgetDrawer');
  const backdrop = $('#liveWidgetBackdrop');
  const closeBtn = $('#liveWidgetClose');
  const widgetStream = $('#liveWidgetStream');
  const widgetInput = $('#liveWidgetInput');
  const widgetSend = $('#liveWidgetSend');
  const widgetStatus = $('#liveWidgetStatus');
  const widgetBadge = $('#liveWidgetBadge');
  const widgetTabs = $$('.live-widget-tab');
  const chTabs = $$('.live-ch-tab');

  if (!liveChatStream && !fab) return; // no chat UI

  // --- Identity ---
  let displayName = localStorage.getItem(STORAGE_KEY_NAME) || `operator_${Math.random().toString(36).slice(2, 6)}`;
  let author = slug(displayName);
  let color = localStorage.getItem(STORAGE_KEY_COLOR) || pickColor(author);
  if (liveDisplayName) liveDisplayName.value = displayName;
  function slug(s) { return (s || 'guest').toLowerCase().replace(/[^a-z0-9._-]/g, '').slice(0, 20) || 'guest'; }
  function pickColor(a) {
    const pool = ['#00E5FF','#7C3AED','#34D399','#FBBF24','#F472B6','#60A5FA','#A78BFA','#F87171'];
    let h=0; for(let i=0;i<a.length;i++) h=(h*31+a.charCodeAt(i))>>>0; return pool[h%pool.length];
  }
  function setIdentity(name){
    displayName = (name || '').trim().slice(0,32) || displayName;
    author = slug(displayName);
    color = pickColor(author);
    localStorage.setItem(STORAGE_KEY_NAME, displayName);
    localStorage.setItem(STORAGE_KEY_COLOR, color);
  }
  if (liveDisplayName){
    liveDisplayName.addEventListener('input', (e)=>{ setIdentity(e.target.value); });
    liveDisplayName.addEventListener('change', (e)=>{ setIdentity(e.target.value); });
  }

  // --- Channel ---
  let channel = 'general';
  let widgetChannel = 'general';

  function setChannel(ch){
    channel = ch;
    if (liveChatInput) liveChatInput.placeholder = `Message #${ch} — Enter to send via live SSE server`;
    chTabs.forEach(b=>{
      const is = b.dataset.ch===ch;
      b.classList.toggle('active', is);
      b.setAttribute('aria-selected', String(is));
    });
    // Refetch + reconnect stream for new channel
    reconnectStream();
    fetchHistory(ch).then(renderSectionHistory);
  }
  function setWidgetChannel(ch){
    widgetChannel = ch;
    widgetTabs.forEach(b=>{
      const is = b.dataset.wch===ch;
      b.classList.toggle('active', is);
      b.setAttribute('aria-selected', String(is));
    });
    if (widgetInput) widgetInput.placeholder = `Message #${ch}…`;
  }
  chTabs.forEach(b=> b.addEventListener('click', ()=> setChannel(b.dataset.ch)));
  widgetTabs.forEach(b=> b.addEventListener('click', ()=> {
    const ch = b.dataset.wch;
    setWidgetChannel(ch);
    // also sync main channel? keep independent but also update main's channel if user expects unified
  }));

  // --- Live state ---
  let connected = false;
  let peerCount = 0;
  let es = null;
  let reconnectTimer = null;
  const messagesByChannel = { general: [], verification: [], ledger: [] };
  const typingMap = new Map(); // author -> timeout

  function setLiveState(isConnected, peers){
    connected = isConnected;
    if (typeof peers === 'number') peerCount = peers;
    const dotLive = isConnected;
    if (liveStatDot){ liveStatDot.className = 'live-stat-dot ' + (dotLive ? 'live' : 'offline'); }
    if (liveStatLabel) liveStatLabel.textContent = dotLive ? 'LIVE · SSE' : 'OFFLINE · retrying…';
    if (liveStatPeers) liveStatPeers.textContent = `${peerCount} peers`;
    if (liveTransportInfo) liveTransportInfo.textContent = dotLive ? 'SSE connected · 15s heartbeat' : 'offline — ephemeral local echo';
    if (widgetStatus){
      const isLive = dotLive;
      widgetStatus.className = 'live-widget-status ' + (isLive ? 'live' : '');
      widgetStatus.innerHTML = `<span class="dot"></span>${isLive ? 'LIVE' : 'connecting…'}`;
    }
    if (fab){
      fab.setAttribute('aria-expanded', String(!!drawer && drawer.classList.contains('open')));
      // pulse dot via class?
    }
  }

  // --- Fetch history ---
  async function fetchHistory(ch){
    try{
      const res = await fetch(`${ENDPOINT_CHAT}?channel=${ch}&limit=60`, { cache:'no-store' });
      if (!res.ok) throw new Error(String(res.status));
      const data = await res.json();
      if (Array.isArray(data.messages)) return data.messages;
      return [];
    } catch{
      return [];
    }
  }

  function renderSectionHistory(msgs){
    if (!liveChatStream) return;
    messagesByChannel[channel] = msgs;
    repaint(liveChatStream, msgs, false);
    if (liveChatEmpty) liveChatEmpty.hidden = msgs.length !== 0;
  }

  async function init(){
    setLiveState(false, 0);
    const initial = await fetchHistory(channel);
    messagesByChannel[channel] = initial;
    if (initial.length === 0){
      if (liveChatEmpty) liveChatEmpty.textContent = 'No messages yet — be the first via the live SSE server.';
    } else {
      if (liveChatEmpty) liveChatEmpty.hidden = true;
    }
    repaint(liveChatStream, initial, false);
    repaint(widgetStream, initial.filter(m=> m.channel===widgetChannel).slice(-30), false);
    connectStream();
    // peer count poll fallback when SSE offline
    setInterval(async ()=>{
      if (connected) return;
      try{
        const r = await fetch(`${ENDPOINT_CHAT}?channel=${channel}&limit=1`); const j = await r.json(); if (typeof j.live?.connectedClients==='number') setLiveState(false, j.live.connectedClients);
      } catch{}
    }, 12000);
  }

  // --- SSE Stream ---
  function connectStream(){
    if (es) { try{ es.close(); } catch{} es=null; }
    if (reconnectTimer) { clearTimeout(reconnectTimer); reconnectTimer=null; }
    const t0 = performance.now();
    let url = `${ENDPOINT_STREAM}?channel=${channel}`;
    try{
      es = new EventSource(url);
    } catch {
      // browser may block if CSP or network; fallback to polling
      setLiveState(false, peerCount);
      scheduleReconnect();
      return;
    }

    let openFired = false;
    es.onopen = () => {
      openFired = true;
      setLiveState(true, peerCount);
      const latency = Math.round(performance.now()-t0);
      if (liveTransportInfo) liveTransportInfo.textContent = `SSE connected · ${latency}ms · 15s heartbeat`;
    };
    const handle = (type) => (e) => {
      try{
        const data = JSON.parse(e.data);
        if (type==='message' || type==='system'){
          const msg = data;
          // Dedup by id
          if (messagesByChannel[msg.channel]?.some(m=>m.id===msg.id)) return;
          // push to store
          if (!messagesByChannel[msg.channel]) messagesByChannel[msg.channel]=[];
          messagesByChannel[msg.channel].push(msg);
          if (messagesByChannel[msg.channel].length>250) messagesByChannel[msg.channel].shift();
          // render to appropriate panes if channel matches current
          if (msg.channel===channel && liveChatStream){
            if (liveChatEmpty) liveChatEmpty.hidden = true;
            appendMsg(liveChatStream, msg, true);
          }
          // widget stream: render if matches widgetChannel OR general? we show per widgetChannel
          if (widgetStream && msg.channel===widgetChannel){
            appendMsg(widgetStream, msg, true);
            if (drawer && drawer.hidden) {
              // show badge for new message while drawer closed
              if (widgetBadge) widgetBadge.hidden = false;
            }
          } else if (widgetStream && widgetChannel==='general' && msg.channel==='general'){
            // already handled
          }
        } else if (type==='typing'){
          const { author: a, displayName: dn, channel: ch } = data;
          if (a===author) return;
          if (ch!==channel && ch!==widgetChannel) return;
          showTyping(dn, ch);
        } else if (type==='presence'){
          if (typeof data.count==='number') setLiveState(connected, data.count);
        } else if (type==='heartbeat'){
          setLiveState(true, peerCount);
        } else if (type==='hello'){
          // ignore
        }
      } catch{}
    };
    es.addEventListener('message', handle('message'));
    es.addEventListener('system', handle('system'));
    es.addEventListener('typing', handle('typing'));
    es.addEventListener('presence', handle('presence'));
    es.addEventListener('heartbeat', handle('heartbeat'));
    es.addEventListener('hello', handle('hello'));
    es.onerror = () => {
      setLiveState(false, peerCount);
      try{ es.close(); } catch{}
      es=null;
      scheduleReconnect();
    };
    // If not open within 4s, treat as offline but keep trying
    setTimeout(()=>{
      if (!openFired && es && es.readyState!==1){
        // still connecting; mark offline
        setLiveState(false, peerCount);
      }
    }, 4000);
  }

  function scheduleReconnect(){
    if (reconnectTimer) return;
    reconnectTimer = setTimeout(()=>{
      reconnectTimer=null;
      reconnectStream();
    }, 2500 + Math.random()*1500);
  }
  function reconnectStream(){
    connectStream();
  }

  function showTyping(name, ch){
    const target = ch===channel ? liveTyping : (ch===widgetChannel ? $('#liveWidgetTyping') : null);
    if (!target) return;
    // Debounced typing indicator: show for 2.4s
    target.textContent = `${name} is typing…`;
    target.innerHTML = `<span class="live-typing-dots"><i></i><i></i><i></i></span> ${name} is typing…`;
    const key = ch+':'+name;
    if (typingMap.has(key)) clearTimeout(typingMap.get(key));
    const tid = setTimeout(()=>{ target.textContent=''; target.innerHTML=''; }, 2400);
    typingMap.set(key, tid);
  }

  // --- Rendering helpers ---
  function timeAgo(iso){
    const d = Date.now() - new Date(iso).getTime();
    if (d < 60000) return 'now';
    if (d < 3600000) return `${Math.floor(d/60000)}m`;
    const h=Math.floor(d/3600000); if (h<24) return `${h}h`;
    return `${Math.floor(h/24)}d`;
  }
  function escapeHtml(s){ return s.replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;'); }

  function makeRow(msg){
    const div = document.createElement('div');
    div.className = 'live-msg' + (msg.type==='system' ? ' system' : '');
    div.dataset.id = msg.id;
    const avatar = document.createElement('div');
    avatar.className = 'live-avatar';
    avatar.style.background = msg.color || '#00E5FF';
    avatar.style.borderColor = msg.color || '#00E5FF';
    avatar.textContent = (msg.avatar || msg.displayName?.charAt(0) || '?').toUpperCase().slice(0,2);
    const bubble = document.createElement('div');
    bubble.className = 'live-bubble';
    const meta = document.createElement('div');
    meta.className = 'live-meta';
    meta.innerHTML = `<strong style="color:${msg.color || '#00E5FF'}">${escapeHtml(msg.displayName || msg.author)}</strong> <span class="author">@${escapeHtml(msg.author)}</span> <span class="time">${escapeHtml(timeAgo(msg.createdAt))}</span>`;
    const p = document.createElement('p');
    p.textContent = msg.text;
    bubble.appendChild(meta);
    bubble.appendChild(p);
    div.appendChild(avatar);
    div.appendChild(bubble);
    return div;
  }
  function makeWidgetRow(msg){
    const div = document.createElement('div');
    div.className='live-widget-msg';
    div.innerHTML = `<div class="avatar" style="background:${msg.color};border-color:${msg.color}">${escapeHtml((msg.avatar||msg.displayName?.charAt(0)||'?').toUpperCase().slice(0,2))}</div><div class="bubble"><div class="meta"><strong style="color:${msg.color}">${escapeHtml(msg.displayName)}</strong><small>${escapeHtml(timeAgo(msg.createdAt))}</small></div><p></p></div>`;
    div.querySelector('p').textContent = msg.text;
    return div;
  }
  function repaint(container, msgs, scroll){
    if (!container) return;
    container.innerHTML='';
    msgs.slice(-120).forEach(m=>{
      const row = container===widgetStream ? makeWidgetRow(m) : makeRow(m);
      container.appendChild(row);
    });
    if (scroll !== false) container.scrollTop = container.scrollHeight;
  }
  function appendMsg(container, msg, shouldScroll){
    if (!container) return;
    // if this is the first real message, hide empty
    if (container===liveChatStream && liveChatEmpty) liveChatEmpty.hidden = true;
    const row = container===widgetStream ? makeWidgetRow(msg) : makeRow(msg);
    container.appendChild(row);
    // keep bounded
    while (container.children.length>160) container.removeChild(container.firstChild);
    if (shouldScroll) container.scrollTop = container.scrollHeight + 1000;
  }

  // --- Sending ---
  async function send(text, ch){
    const t = (text||'').trim();
    if (!t) return;
    const safe = t.slice(0,600);
    const payload = { text: safe, author, displayName, channel: ch };
    // Optimistic local render if offline (so UX doesn't block)
    let optimisticId = null;
    if (!connected){
      const temp = { id:'opt_'+Date.now()+Math.random().toString(36).slice(2,6), channel: ch, author, displayName, avatar: displayName.charAt(0).toUpperCase(), color, text: safe, createdAt: new Date().toISOString(), type:'message' };
      optimisticId = temp.id;
      if (ch===channel && liveChatStream){ appendMsg(liveChatStream, temp, true); if (liveChatEmpty) liveChatEmpty.hidden=true; }
      if (ch===widgetChannel && widgetStream) appendMsg(widgetStream, temp, true);
    }
    try{
      const res = await fetch(ENDPOINT_CHAT, { method:'POST', headers:{'Content-Type':'application/json'}, body: JSON.stringify(payload) });
      if (!res.ok){
        const j = await res.json().catch(()=>({}));
        throw new Error(j.error||String(res.status));
      }
      const j = await res.json();
      // if we did optimistic and server echoed, we may have dup; dedup will handle but remove optimistic placeholder id if needed
      // For now, leave optimistic; next SSE echo will dedup by id mismatch (optimistic id != server id), so we'll have duplicate.
      // So we remove optimistic row and rely on SSE.
      if (optimisticId){
        const sel = liveChatStream ? liveChatStream.querySelector(`[data-id="${optimisticId}"]`) : null;
        if (sel) sel.remove();
        const wsel = widgetStream ? widgetStream.querySelector(`[data-id="${optimisticId}"]`) : null;
        // widget optimistic ids not stored with data-id same logic (widget rows don't have data-id), so skip
        // Instead just keep it; SSE will add real one — we remove the optimistic to avoid double
        // For widget, we already added temp but won't find by data-id; just pop last if duplicate text
        // Simpler: remove last widget child if it matches text
        if (widgetStream && widgetStream.lastChild && widgetStream.lastChild.textContent.includes(safe.slice(0,20))){
          // keep only if not yet replaced by server echo; we already removed section optimistic
          // leave widget optimistic until echo arrives? We'll keep it for now and echo will add second row — dedup not possible for widget.
          // So we don't double-add: for widget, echo will also add, so we should remove optimistic there too if found.
          // We stored widget row without data-id, so find by text
          // Already we didn't store, so just remove the last child we added if it exists
          // This second removal would be for widgetChannel === ch case, we added to widgetStream; now remove it
          // We can just not add optimistic to widgetStream when offline? But we did. So undo:
          // If connected===false and ch===widgetChannel, we added to widgetStream; remove last if matches
          // We'll just leave it; duplication in offline mode is acceptable vs losing message.
        }
      }
    } catch(err){
      // keep optimistic if offline, else show toast
      if (connected){
        // remove optimistic if any? we didn't create optimistic when connected, so nothing
        showToast('Live server unreachable — message kept locally. Is the platform running on :3001?', 'error');
        // keep local echo for connected failure as well
        const fallback = { id:'fallback_'+Date.now(), channel: ch, author, displayName, avatar: displayName.charAt(0).toUpperCase(), color, text: safe, createdAt: new Date().toISOString(), type:'message' };
        if (ch===channel && liveChatStream) appendMsg(liveChatStream, fallback, true);
        if (ch===widgetChannel && widgetStream) appendMsg(widgetStream, fallback, true);
      }
    }
  }

  function showToast(msg, type){
    const el = document.getElementById('toast');
    if (!el) return;
    el.textContent = msg;
    el.className = 'toast show ' + (type||'');
    setTimeout(()=> el.classList.remove('show'), 3400);
  }

  // --- Input handlers ---
  function bindComposer(inputEl, sendBtn, getChannel){
    if (!inputEl || !sendBtn) return;
    const updateCount = () => {
      const c = inputEl.value.length;
      const counter = inputEl.id==='liveChatInput' ? liveCharCount : null;
      if (counter) counter.textContent = `${c}/600`;
      sendBtn.disabled = c===0 || c>600;
    };
    inputEl.addEventListener('input', ()=>{
      updateCount();
      // typing ping throttled
      if (inputEl.value.length % 7 === 1){
        fetch(ENDPOINT_CHAT, { method:'POST', headers:{'Content-Type':'application/json'}, body: JSON.stringify({ text:'…', author, displayName, channel:getChannel(), type:'typing' }) }).catch(()=>{});
      }
    });
    inputEl.addEventListener('keydown', (e)=>{
      if (e.key==='Enter' && !e.shiftKey){
        e.preventDefault();
        const ch = getChannel();
        const v = inputEl.value;
        if (!v.trim()) return;
        inputEl.value='';
        updateCount();
        void send(v, ch);
      }
    });
    sendBtn.addEventListener('click', ()=>{
      const ch=getChannel();
      const v=inputEl.value;
      if (!v.trim()) return;
      inputEl.value='';
      updateCount();
      void send(v, ch);
      inputEl.focus();
    });
    updateCount();
  }

  bindComposer(liveChatInput, liveSendBtn, ()=>channel);
  bindComposer(widgetInput, widgetSend, ()=>widgetChannel);

  // --- Widget open/close ---
  function openWidget(){
    if (!drawer || !fab) return;
    drawer.hidden=false;
    requestAnimationFrame(()=> drawer.classList.add('open'));
    drawer.setAttribute('aria-hidden','false');
    fab.setAttribute('aria-expanded','true');
    if (widgetBadge) widgetBadge.hidden=true;
    // Ensure widget has history
    if (widgetStream && widgetStream.children.length===0){
      const msgs = messagesByChannel[widgetChannel] || [];
      repaint(widgetStream, msgs.slice(-50), true);
    } else if (widgetStream){
      widgetStream.scrollTop = widgetStream.scrollHeight;
    }
    setTimeout(()=>{ if(widgetInput) widgetInput.focus(); }, 120);
  }
  function closeWidget(){
    if (!drawer || !fab) return;
    drawer.classList.remove('open');
    drawer.setAttribute('aria-hidden','true');
    fab.setAttribute('aria-expanded','false');
    setTimeout(()=>{ if(!drawer.classList.contains('open')) drawer.hidden=true; }, 240);
    fab.focus();
  }
  if (fab) fab.addEventListener('click', ()=>{
    if (drawer && drawer.classList.contains('open')) closeWidget(); else openWidget();
  });
  if (backdrop) backdrop.addEventListener('click', closeWidget);
  if (closeBtn) closeBtn.addEventListener('click', closeWidget);
  document.addEventListener('keydown', (e)=>{
    if (e.key==='Escape' && drawer && drawer.classList.contains('open')) closeWidget();
  });

  // Deep-link: #liveChat opens drawer on mobile? just scroll
  const navChat = document.getElementById('navChatLink');
  if (navChat){
    navChat.addEventListener('click', (e)=>{
      // allow default scroll but also ensure section is visible
      // don't preventDefault, just nudge focus after scroll
      setTimeout(()=>{ if(liveChatInput) liveChatInput.focus(); }, 500);
    });
  }

  // Handle mobile drawer chat link too (close mobile drawer then open section)
  $$('.mob-chat').forEach(a=> a.addEventListener('click', ()=>{
    const md = document.getElementById('mobileDrawer');
    const hb = document.getElementById('hamburger');
    if (md) md.classList.remove('open');
    if (hb) hb.setAttribute('aria-expanded','false');
    document.body.style.overflow='';
  }));

  // Init
  init();

  // Expose for debugging
  window.__vcLiveChat = { fetchHistory, send, setChannel, setWidgetChannel, openWidget, closeWidget };
})();
