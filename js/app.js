// VendorChain - Premium Landing Interactions
// Fixed version: reduced-motion, throttled rAF, visibility handling, accessible nav + form

(() => {
  const prefersReducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  const isHoverCapable = window.matchMedia('(hover:hover)').matches;
  let pageHidden = document.hidden;

  document.addEventListener('visibilitychange', () => {
    pageHidden = document.hidden;
  });

  // ---------- Reveal on scroll ----------
  try {
    const io = new IntersectionObserver((es) => es.forEach((e) => { if (e.isIntersecting) e.target.classList.add('in'); }), { threshold: .14 });
    document.querySelectorAll('.reveal').forEach((el) => io.observe(el));
    // ensure hero is visible immediately if reduced motion or IO not triggering
    if (prefersReducedMotion) document.querySelectorAll('.reveal').forEach((el) => el.classList.add('in'));
  } catch (_) {
    document.querySelectorAll('.reveal').forEach((el) => el.classList.add('in'));
  }

  // ---------- FAQ accordion ----------
  document.querySelectorAll('.faq-q').forEach((b) => b.addEventListener('click', () => {
    const it = b.parentElement;
    const open = it.classList.contains('open');
    document.querySelectorAll('.faq-item').forEach((x) => {
      x.classList.remove('open');
      const btn = x.querySelector('.faq-q');
      if (btn) btn.setAttribute('aria-expanded', 'false');
    });
    if (!open) {
      it.classList.add('open');
      b.setAttribute('aria-expanded', 'true');
    }
  }));

  // ---------- Arch tabs ----------
  document.querySelectorAll('.arch-tab').forEach((t) => t.addEventListener('click', () => {
    document.querySelectorAll('.arch-tab').forEach((x) => {
      x.classList.remove('active');
      x.setAttribute('aria-selected', 'false');
    });
    t.classList.add('active');
    t.setAttribute('aria-selected', 'true');
  }));

  // ---------- Mobile nav (hamburger) ----------
  const hamburger = document.getElementById('hamburger');
  const mobileDrawer = document.getElementById('mobileDrawer');
  if (hamburger && mobileDrawer) {
    const toggleDrawer = (open) => {
      const willOpen = open ?? !mobileDrawer.classList.contains('open');
      mobileDrawer.classList.toggle('open', willOpen);
      hamburger.setAttribute('aria-expanded', String(willOpen));
      mobileDrawer.setAttribute('aria-hidden', String(!willOpen));
      document.body.style.overflow = willOpen ? 'hidden' : '';
    };
    hamburger.addEventListener('click', () => toggleDrawer());
    // close on link click
    mobileDrawer.querySelectorAll('a').forEach((a) => a.addEventListener('click', () => toggleDrawer(false)));
    // close on outside click / escape
    document.addEventListener('click', (e) => {
      if (mobileDrawer.classList.contains('open') && !mobileDrawer.contains(e.target) && !hamburger.contains(e.target)) toggleDrawer(false);
    });
    document.addEventListener('keydown', (e) => {
      if (e.key === 'Escape' && mobileDrawer.classList.contains('open')) {
        toggleDrawer(false);
        hamburger.focus();
      }
    });
  }

  // ---------- Toast helper ----------
  const toastEl = document.getElementById('toast');
  let toastTimer;
  function showToast(msg, type = '') {
    if (!toastEl) return;
    toastEl.textContent = msg;
    toastEl.className = 'toast show' + (type ? ' ' + type : '');
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => { toastEl.classList.remove('show'); }, 3400);
  }

  // ---------- CTA form (CSP-safe, no inline onsubmit) ----------
  const demoForm = document.getElementById('demoForm');
  const emailInput = document.getElementById('emailInput');
  const formMsg = document.getElementById('formMsg');
  if (demoForm && emailInput) {
    demoForm.addEventListener('submit', (e) => {
      e.preventDefault();
      const email = emailInput.value.trim();
      const valid = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
      if (!valid) {
        emailInput.setAttribute('aria-invalid', 'true');
        if (formMsg) { formMsg.textContent = 'Please enter a valid work email.'; formMsg.className = 'form-msg error'; }
        showToast('Please enter a valid work email.', 'error');
        emailInput.focus();
        return;
      }
      emailInput.setAttribute('aria-invalid', 'false');
      // simulate success (replace with real fetch when backend ready)
      demoForm.innerHTML = '<div class="form-success" role="status" aria-live="polite">✓ You are on the list — we will reach out within 24h.</div>';
      showToast('You are on the list — we will reach out within 24h.', 'success');
      // analytics placeholder
      // window.posthog?.capture('waitlist_submit', { email_domain: email.split('@')[1] });
    });
    emailInput.addEventListener('input', () => {
      emailInput.setAttribute('aria-invalid', 'false');
      if (formMsg) formMsg.textContent = '';
    });
  }

  // ---------- Horizontal stack scroll parallax (throttled) ----------
  const hInner = document.getElementById('hStackInner');
  const hStack = document.getElementById('hStack');
  if (hInner && hStack && !prefersReducedMotion) {
    let ticking = false;
    const onScroll = () => {
      if (ticking) return;
      ticking = true;
      requestAnimationFrame(() => {
        if (pageHidden) { ticking = false; return; }
        const r = hStack.getBoundingClientRect();
        const vh = window.innerHeight;
        const progress = Math.min(1, Math.max(0, (vh - r.top) / (vh + r.height)));
        const layers = hInner.querySelectorAll('.h-layer');
        layers.forEach((l, i) => {
          const off = i * 3;
          l.style.transform = `translateZ(${i * 10}px) translateY(${off + progress * 10}px)`;
        });
        ticking = false;
      });
    };
    window.addEventListener('scroll', onScroll, { passive: true });
    onScroll();
  }

  // ---------- Coins mini float (pauses when hidden) ----------
  const coinsMini = document.getElementById('coinsMini');
  if (coinsMini && !prefersReducedMotion) {
    let t = 0;
    let rafId;
    const float = () => {
      if (!pageHidden) {
        t += 0.016;
        coinsMini.style.transform = `rotate(-7deg) translateY(${Math.sin(t) * 4}px)`;
      }
      rafId = requestAnimationFrame(float);
    };
    float();
    // pause when offscreen
    if ('IntersectionObserver' in window) {
      const obs = new IntersectionObserver((entries) => {
        entries.forEach((en) => {
          if (!en.isIntersecting) { /* keep running but hidden check will skip transform */ }
        });
      }, { threshold: 0 });
      obs.observe(coinsMini);
    }
  }

  // ---------- Magnet tilt for cards (throttled, hover only) ----------
  if (isHoverCapable && !prefersReducedMotion) {
    const tiltEls = document.querySelectorAll('[data-tilt]');
    tiltEls.forEach((el) => {
      let rafPending = false;
      let lastEvent = null;
      el.addEventListener('mousemove', (e) => {
        lastEvent = e;
        if (rafPending) return;
        rafPending = true;
        requestAnimationFrame(() => {
          if (!lastEvent || pageHidden) { rafPending = false; return; }
          const r = el.getBoundingClientRect();
          const x = (lastEvent.clientX - r.left) / r.width - .5;
          const y = (lastEvent.clientY - r.top) / r.height - .5;
          el.style.transform = `perspective(1000px) rotateX(${-y * 10}deg) rotateY(${x * 14}deg) translateY(-7px) translateZ(18px)`;
          rafPending = false;
        });
      });
      el.addEventListener('mouseleave', () => { el.style.transform = ''; lastEvent = null; });
    });
  }

  // ---------- Hero 3D motion + cursor glow (shape preserved, high contrast arc) ----------
  const heroShell = document.getElementById('heroShell');
  const hero = document.querySelector('.hero');
  const horizon = document.querySelector('.horizon');
  const horizonAfter = horizon; // after is pseudo, we move horizon itself but keep shape
  const halo = document.querySelector('.halo');
  const orbs = document.querySelectorAll('.orb-3d');
  const badge = document.querySelector('.hero .badge');
  const h1 = document.querySelector('.h1');
  const heroStack = document.getElementById('heroStack');
  const heroStackWrap = document.getElementById('heroStackWrap');
  const cursorGlow = document.getElementById('heroCursorGlow');
  const heroPcanvas = document.getElementById('particleCanvas');
  // keep shape strict: store base horizon transform
  const baseHorizon = 'translateX(-50%)';
  if (heroShell && isHoverCapable && !prefersReducedMotion) {
    let heroRaf = 0;
    let heroX = 0, heroY = 0;
    let heroTicking = false;
    let mxPct = 50, myPct = 38;
    const clamp = (v,a,b)=>Math.max(a,Math.min(b,v));
    heroShell.addEventListener('mousemove', (e) => {
      const rect = heroShell.getBoundingClientRect();
      heroX = (e.clientX - rect.left) / rect.width - 0.5; // -0.5..0.5
      heroY = (e.clientY - rect.top) / rect.height - 0.5;
      mxPct = ((e.clientX - rect.left) / rect.width) * 100;
      myPct = ((e.clientY - rect.top) / rect.height) * 100;
      // also update CSS vars for cursor glow immediately (no rAF lag for glow position)
      if (cursorGlow) {
        cursorGlow.style.setProperty('--mx', mxPct + '%');
        cursorGlow.style.setProperty('--my', myPct + '%');
        cursorGlow.classList.add('active');
      }
      if (hero) {
        hero.style.setProperty('--mx', mxPct + '%');
        hero.style.setProperty('--my', myPct + '%');
      }
      if (heroTicking) return;
      heroTicking = true;
      heroRaf = requestAnimationFrame(() => {
        // horizon: subtle 3D tilt but shape unchanged (width/height/radius untouched)
        if (horizon) {
          // keep translateX(-50%) as base, add perspective tilt + tiny parallax
          const rotX = heroY * 2.2;
          const rotY = heroX * 3.2;
          const transY = heroY * 4;
          const transX = heroX * 6;
          horizon.style.transform = `${baseHorizon} perspective(1100px) rotateX(${rotX}deg) rotateY(${rotY}deg) translate3d(${transX}px, ${transY}px, 0)`;
          // color contrast boost on move: make arc slightly brighter when cursor near center top
          const distToCenter = Math.hypot(heroX, heroY - (-0.12)); // center top is slightly above middle
          const bright = 1 + (0.12 * (1 - clamp(distToCenter * 1.6, 0, 1)));
          const hAfter = horizon; // pseudo can't be styled directly, we fake via filter on horizon
          horizon.style.filter = `blur(0.2px) brightness(${bright}) saturate(${1.15 + (0.10 * (1 - clamp(Math.abs(heroX),0,1)))})`;
          horizon.style.opacity = '1';
        }
        // halo subtle follow
        if (halo) halo.style.transform = `translateX(-50%) translate3d(${heroX * 10}px, ${heroY * 8}px, 0)`;
        // orbs: strong depth parallax, more vivid due to saturate
        orbs.forEach((orb, i) => {
          const depth = (i + 1) * 0.62;
          orb.style.transform = `translate3d(${heroX * 16 * depth}px, ${heroY * 11 * depth}px, ${depth * 10}px) scale(${1 + Math.abs(heroX)*0.02})`;
        });
        // particle canvas follows cursor
        if (heroPcanvas) heroPcanvas.style.transform = `translate3d(${heroX * 14}px, ${heroY * 10}px, 0)`;
        // badge and h1 3D depth - keep centered but add depth
        if (badge) {
          badge.style.transform = `translate3d(${heroX * 12}px, ${heroY * 8}px, 18px) rotateX(${-heroY * 4}deg) rotateY(${heroX * 5}deg)`;
        }
        if (h1) {
          h1.style.transform = `translate3d(${heroX * 10}px, ${heroY * 6}px, 12px) rotateX(${-heroY * 2.2}deg) rotateY(${heroX * 3.2}deg)`;
        }
        // if coins still exist (in other sections) they get subtle parallax, but hero coins removed
        document.querySelectorAll('.coin').forEach((c, i) => {
          if (c.matches(':hover')) return;
          const offset = (i - 2) * 0.9;
          const baseY = [5, 1.5, 0, 1.5, 5][i] ?? 0;
          c.style.transform = `translateY(${baseY - heroY * 4}px) translateX(${heroX * 5 + offset}px) rotateY(${heroX * 7}deg) rotateX(${-heroY * 3}deg)`;
        });
        // heroStack if present (now hidden) keep logic but no-op
        if (heroStack) {
          heroStack.style.transform = `rotateX(${14 + heroY * 4}deg) rotateY(${-14 + heroX * 8}deg) translateZ(0)`;
        }
        if (heroStackWrap) {
          heroStackWrap.style.transform = `translateX(${heroX * 10}px) translateY(${heroY * 6}px)`;
        }
        heroTicking = false;
      });
    });
    heroShell.addEventListener('mouseleave', () => {
      cancelAnimationFrame(heroRaf);
      heroTicking = false;
      if (horizon) {
        horizon.style.transform = baseHorizon;
        horizon.style.filter = 'blur(0.2px)';
      }
      if (halo) halo.style.transform = 'translateX(-50%)';
      if (badge) badge.style.transform = 'translateZ(18px)';
      if (h1) h1.style.transform = 'translateZ(12px)';
      orbs.forEach((orb) => { orb.style.transform = ''; });
      if (heroPcanvas) heroPcanvas.style.transform = '';
      document.querySelectorAll('.coin').forEach((c, i) => {
        const baseY = [5, 1.5, 0, 1.5, 5][i] ?? 0;
        c.style.transform = `translateY(${baseY}px)`;
      });
      if (heroStack) heroStack.style.transform = 'rotateX(14deg) rotateY(-14deg)';
      if (heroStackWrap) heroStackWrap.style.transform = '';
      if (cursorGlow) cursorGlow.classList.remove('active');
    });
    // subtle auto drift when not hovering - keep arc alive with very gentle float
    let driftT = 0;
    function driftLoop(){
      if (!pageHidden && heroShell && !heroShell.matches(':hover')) {
        driftT += 0.006;
        const dX = Math.sin(driftT) * 0.010;
        const dY = Math.cos(driftT*0.8) * 0.008;
        if (horizon) horizon.style.transform = `${baseHorizon} perspective(1100px) rotateX(${dY*2}deg) rotateY(${dX*3}deg)`;
        // orbs drift is already via CSS keyframes, keep light
      }
      requestAnimationFrame(driftLoop);
    }
    driftLoop();
  }
  // Hero stack gentle float (hidden now but keep for safety)
  if (heroStack && heroStackWrap && !prefersReducedMotion) {
    let t = 0;
    function floatStack() {
      if (!pageHidden) {
        t += 0.012;
        const floatY = Math.sin(t) * 3;
        const rot = Math.sin(t * 0.6) * 0.6;
        if (!heroShell || !heroShell.matches(':hover')) {
          heroStack.style.transform = `rotateX(${14 + rot}deg) rotateY(${-14 + Math.cos(t*0.5)*0.8}deg) translateY(${floatY}px)`;
        }
      }
      requestAnimationFrame(floatStack);
    }
    floatStack();
  }

  // ---------- Particle field (with hidden + reduced-motion handling + error guard) ----------
  const pCanvas = document.getElementById('particleCanvas');
  if (pCanvas && !prefersReducedMotion) {
    const ctx = pCanvas.getContext('2d');
    if (!ctx) {
      pCanvas.style.display = 'none';
    } else {
      let particles = [];
      let rafParticles;
      let isCanvasVisible = true;
      const DPR = Math.min(window.devicePixelRatio || 1, 1.6);

      function canvasRect() { return pCanvas.getBoundingClientRect(); }

      function resizeP() {
        const r = canvasRect();
        if (r.width === 0 || r.height === 0) return;
        pCanvas.width = Math.round(r.width * DPR);
        pCanvas.height = Math.round(r.height * DPR);
        ctx.setTransform(DPR, 0, 0, DPR, 0, 0);
      }

      function initP() {
        const r = canvasRect();
        if (r.width === 0 || r.height === 0) return;
        particles = Array.from({ length: 42 }, () => ({
          x: Math.random() * r.width,
          y: Math.random() * r.height,
          z: Math.random() * 0.8 + 0.2,
          vx: (Math.random() - 0.5) * 0.22,
          vy: (Math.random() - 0.5) * 0.18,
          r: Math.random() * 1.1 + 0.4
        }));
      }

      function drawP() {
        const r = canvasRect();
        if (r.width === 0 || r.height === 0) {
          rafParticles = requestAnimationFrame(drawP);
          return;
        }
        if (pageHidden || !isCanvasVisible) {
          rafParticles = requestAnimationFrame(drawP);
          return;
        }
        ctx.clearRect(0, 0, r.width, r.height);
        particles.forEach((p) => {
          p.x += p.vx * p.z;
          p.y += p.vy * p.z;
          if (p.x < 0) p.x = r.width;
          if (p.x > r.width) p.x = 0;
          if (p.y < 0) p.y = r.height;
          if (p.y > r.height) p.y = 0;
          const alpha = 0.18 * p.z;
          ctx.beginPath();
          ctx.arc(p.x, p.y, p.r * p.z, 0, Math.PI * 2);
          ctx.fillStyle = `rgba(168,160,255,${alpha})`;
          ctx.fill();
          ctx.beginPath();
          ctx.arc(p.x, p.y, p.r * p.z * 2.2, 0, Math.PI * 2);
          ctx.fillStyle = `rgba(124,58,237,${alpha * 0.22})`;
          ctx.fill();
        });
        for (let i = 0; i < particles.length; i++) {
          for (let j = i + 1; j < particles.length; j++) {
            const a = particles[i], b = particles[j];
            const dx = a.x - b.x, dy = a.y - b.y;
            const dist = Math.hypot(dx, dy);
            if (dist < 88) {
              const alpha = (1 - dist / 88) * 0.07 * Math.min(a.z, b.z);
              ctx.beginPath();
              ctx.moveTo(a.x, a.y);
              ctx.lineTo(b.x, b.y);
              ctx.strokeStyle = `rgba(139,92,246,${alpha})`;
              ctx.lineWidth = 0.6;
              ctx.stroke();
            }
          }
        }
        rafParticles = requestAnimationFrame(drawP);
      }

      resizeP(); initP(); drawP();
      let resizeTimer;
      window.addEventListener('resize', () => {
        clearTimeout(resizeTimer);
        resizeTimer = setTimeout(() => { resizeP(); initP(); }, 120);
      });
      // pause when hero offscreen
      if ('IntersectionObserver' in window) {
        const heroObs = new IntersectionObserver((entries) => {
          entries.forEach((en) => { isCanvasVisible = en.isIntersecting; });
        }, { threshold: 0 });
        const heroEl = document.getElementById('heroShell');
        if (heroEl) heroObs.observe(heroEl);
      }
      document.addEventListener('visibilitychange', () => {
        if (!document.hidden && !rafParticles) drawP();
      });
    }
  }
  // if reduced motion, hide canvas for perf (CSS also hides)
  if (prefersReducedMotion && pCanvas) pCanvas.style.display = 'none';

  // ---------- Coins auto float (5-coin arc) ----------
  const coinsRow = document.getElementById('coinsRow');
  if (coinsRow && !prefersReducedMotion) {
    let t = 0;
    let rafCoins;
    function floatCoins() {
      if (!pageHidden) {
        t += 0.015;
        coinsRow.querySelectorAll('.coin').forEach((c, i) => {
          if (c.matches(':hover')) return; // don't fight user hover
          const heroHover = heroShell && heroShell.matches(':hover');
          if (heroHover) return;
          const floatY = Math.sin(t + i * 0.68) * 2.6;
          const rotY = Math.sin(t * 0.5 + i) * 1.6;
          const baseY = [5, 1.5, 0, 1.5, 5][i] ?? 0;
          c.style.transform = `translateY(${baseY + floatY}px) rotateY(${rotY}deg)`;
        });
      }
      rafCoins = requestAnimationFrame(floatCoins);
    }
    floatCoins();
  }

  // ---------- Growth grid stagger ----------
  const grid = document.getElementById('growthGrid');
  if (grid && 'IntersectionObserver' in window) {
    const obs = new IntersectionObserver((entries) => {
      entries.forEach((entry) => {
        if (entry.isIntersecting) {
          const cards = entry.target.querySelectorAll('.g-card');
          cards.forEach((c, i) => {
            c.style.opacity = '0'; c.style.transform = 'translateY(12px)';
            setTimeout(() => {
              c.style.transition = 'all .6s cubic-bezier(.16,1,.3,1)';
              c.style.opacity = '1'; c.style.transform = 'translateY(0)';
            }, i * 70);
          });
          obs.unobserve(entry.target);
        }
      });
    }, { threshold: .2 });
    obs.observe(grid);
  }

  // ---------- Eco grid parallax (throttled) ----------
  const eco = document.getElementById('ecoGrid');
  if (eco && !prefersReducedMotion) {
    let tickingEco = false;
    window.addEventListener('scroll', () => {
      if (tickingEco || pageHidden) return;
      tickingEco = true;
      requestAnimationFrame(() => {
        const r = eco.getBoundingClientRect();
        if (r.top < window.innerHeight && r.bottom > 0) {
          const p = (window.innerHeight - r.top) / (window.innerHeight + r.height);
          eco.querySelectorAll('.eco-card').forEach((c, i) => {
            c.style.transform = `translateY(${Math.sin(p * Math.PI + i) * 6}px)`;
          });
        }
        tickingEco = false;
      });
    }, { passive: true });
  }

  // ---------- Connect stacks float ----------
  const cs1 = document.getElementById('coStack1');
  const cs2 = document.getElementById('coStack2');
  if (cs1 && cs2 && !prefersReducedMotion) {
    let tt = 0;
    function loop() {
      if (!pageHidden) {
        tt += 0.014;
        cs1.style.transform = `rotateX(${2 + Math.sin(tt) * 1.5}deg) rotateY(${Math.cos(tt) * 2}deg)`;
        cs2.style.transform = `rotateX(${2 + Math.cos(tt) * 1.5}deg) rotateY(${Math.sin(tt) * 2}deg)`;
      }
      requestAnimationFrame(loop);
    }
    loop();
  }

  // ---------- Global modern arrow cursor + floating trail (everywhere) ----------
  const customCursor = document.getElementById('customCursor');
  if (customCursor && !prefersReducedMotion) {
    // enable on hover-capable OR large screens, fallback to always on desktop preview (fixes invisible bug)
    const canHover = isHoverCapable || window.matchMedia('(pointer:fine)').matches;
    const isDesktop = window.innerWidth > 720;
    const enableCursor = (canHover || isDesktop) && window.innerWidth > 0;
    if (enableCursor) {
      document.body.classList.add('has-custom-cursor');
      customCursor.classList.add('ready');
      let cx = window.innerWidth / 2, cy = window.innerHeight / 2;
      let tx = cx, ty = cy;
      let rafCursor = 0;
      let lastEmit = 0;
      const lerp = (a,b,t)=> a + (b-a)*t;
      customCursor.style.opacity = '1';
      // init position
      customCursor.style.transform = `translate(-50%, -50%) translate3d(${cx}px, ${cy}px, 0)`;
      function updateCursor(){
        rafCursor = 0;
        cx = lerp(cx, tx, 0.28);
        cy = lerp(cy, ty, 0.28);
        customCursor.style.transform = `translate(-50%, -50%) translate3d(${cx}px, ${cy}px, 0)`;
        if (Math.hypot(tx - cx, ty - cy) > 0.4) rafCursor = requestAnimationFrame(updateCursor);
      }
      document.addEventListener('mousemove', (e) => {
        tx = e.clientX;
        ty = e.clientY;
        if (!rafCursor) rafCursor = requestAnimationFrame(updateCursor);
        const now = performance.now();
        // throttled small floating burst - reduced hug
        if (now - lastEmit > 38) {
          lastEmit = now;
          const dot = document.createElement('div');
          dot.className = 'cursor-dot';
          dot.style.left = e.clientX + 'px';
          dot.style.top = e.clientY + 'px';
          const ang = Math.random() * Math.PI * 2;
          const dist = 8 + Math.random() * 10; // was 12-32, now 8-18 hug fix
          dot.style.setProperty('--dx', (Math.cos(ang) * dist) + 'px');
          dot.style.setProperty('--dy', (Math.sin(ang) * dist) + 'px');
          const sz = 4 + Math.random()*2;
          dot.style.width = sz + 'px';
          dot.style.height = sz + 'px';
          dot.style.marginLeft = '-' + (sz/2) + 'px';
          dot.style.marginTop = '-' + (sz/2) + 'px';
          document.body.appendChild(dot);
          dot.addEventListener('animationend', () => dot.remove(), {once:true});
          setTimeout(()=> { if(dot.parentNode) dot.remove(); }, 900);
          if (Math.random() < 0.14) {
            const ring = document.createElement('div');
            ring.className = 'cursor-ring';
            ring.style.left = e.clientX + 'px';
            ring.style.top = e.clientY + 'px';
            document.body.appendChild(ring);
            ring.addEventListener('animationend', () => ring.remove(), {once:true});
            setTimeout(()=> { if(ring.parentNode) ring.remove(); }, 900);
          }
        }
      }, {passive:true});
      const hoverEls = document.querySelectorAll('a, button, .btn, [data-tilt], .nav-links a, .arch-tab, .faq-q, input');
      hoverEls.forEach(el => {
        el.addEventListener('mouseenter', () => customCursor.classList.add('hover'));
        el.addEventListener('mouseleave', () => customCursor.classList.remove('hover'));
      });
      document.addEventListener('mouseleave', () => { customCursor.style.opacity = '0'; });
      document.addEventListener('mouseenter', () => { customCursor.style.opacity = '1'; });
      window.addEventListener('resize', () => {
        if (window.innerWidth <= 720) {
          customCursor.style.display = 'none';
          document.body.classList.remove('has-custom-cursor');
        } else {
          customCursor.style.display = 'block';
          document.body.classList.add('has-custom-cursor');
        }
      });
    } else {
      customCursor.style.display = 'none';
      document.body.classList.remove('has-custom-cursor');
    }
  } else if (customCursor) {
    customCursor.style.display = 'none';
    document.body.classList.remove('has-custom-cursor');
  }

  // ---------- Smooth scroll polish + active nav ----------
  const navLinks = document.querySelectorAll('.nav-links a, .mobile-drawer a');
  const sections = ['proof', 'layers', 'eco', 'faq'].map((id) => document.getElementById(id)).filter(Boolean);
  if ('IntersectionObserver' in window && sections.length) {
    const navObs = new IntersectionObserver((entries) => {
      entries.forEach((en) => {
        if (en.isIntersecting) {
          const id = en.target.id;
          document.querySelectorAll('.nav-links a').forEach((a) => {
            a.classList.toggle('active', a.getAttribute('href') === '#' + id);
          });
        }
      });
    }, { threshold: 0.3, rootMargin: '-20% 0px -60% 0px' });
    sections.forEach((s) => navObs.observe(s));
  }

  // ---------- Keyboard: focus trap for coins ----------
  document.querySelectorAll('.coin').forEach((coin) => {
    coin.setAttribute('tabindex', '0');
    coin.setAttribute('role', 'button');
    coin.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); coin.click(); }
    });
  });


  // Aikido tabs & FAQ + VendorChain FAQ
  document.querySelectorAll('.ak-tab').forEach(btn => btn.addEventListener('click', () => {
    document.querySelectorAll('.ak-tab').forEach(b=>{b.classList.remove('active'); b.setAttribute('aria-selected','false');});
    btn.classList.add('active'); btn.setAttribute('aria-selected','true');
  }));
  document.querySelectorAll('.ak-faq-q').forEach(btn => btn.addEventListener('click', () => {
    const item = btn.parentElement;
    const open = item.classList.contains('open');
    document.querySelectorAll('.ak-faq-item').forEach(i=>i.classList.remove('open'));
    if(!open) item.classList.add('open');
  }));
  document.querySelectorAll('.vc-faq-q').forEach(btn => btn.addEventListener('click', () => {
    const item = btn.parentElement;
    const open = item.classList.contains('open');
    document.querySelectorAll('.vc-faq-item').forEach(i=>{
      i.classList.remove('open');
      const b = i.querySelector('.vc-faq-q');
      if(b) b.setAttribute('aria-expanded','false');
    });
    if(!open){
      item.classList.add('open');
      btn.setAttribute('aria-expanded','true');
    }
  }));

})();

// ===============================
// PREMIUM 3D MOTION SYSTEM - Entire page except hero
// ===============================
(() => {
  const prefersReduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  if (prefersReduced) return;
  const isMobile = window.innerWidth <= 860;
  const heroEl = document.getElementById('heroShell');
  const mainEl = document.getElementById('main');

  // 1. Card light follow + tilt enhancement (except hero)
  const cards = document.querySelectorAll('.vc-card, .vc-faq-item, .vc-cta, .vc-integrations-inner, .vc-footer-col');
  cards.forEach(card => {
    if (card.closest('#heroShell')) return;
    card.addEventListener('mousemove', (e) => {
      const rect = card.getBoundingClientRect();
      const x = ((e.clientX - rect.left) / rect.width) * 100;
      const y = ((e.clientY - rect.top) / rect.height) * 100;
      card.style.setProperty('--mx', x + '%');
      card.style.setProperty('--my', y + '%');
      card.style.setProperty('--bx', x + '%');
      card.style.setProperty('--by', y + '%');
    });
    card.addEventListener('mouseleave', () => {
      card.style.removeProperty('--mx');
      card.style.removeProperty('--my');
    });
  });

  // 2. Magnetic buttons - attract to cursor
  const magnetics = document.querySelectorAll('.vc-btn, .nav-cta, .ak-btn');
  magnetics.forEach(btn => {
    if (btn.closest('#heroShell')) return;
    let raf = 0;
    btn.addEventListener('mousemove', (e) => {
      const rect = btn.getBoundingClientRect();
      const cx = rect.left + rect.width / 2;
      const cy = rect.top + rect.height / 2;
      const dx = (e.clientX - cx) * 0.22;
      const dy = (e.clientY - cy) * 0.28;
      const ang = Math.atan2(dy, dx);
      const dist = Math.hypot(dx, dy);
      if (dist > 60) return;
      cancelAnimationFrame(raf);
      raf = requestAnimationFrame(() => {
        btn.style.transform = `translate3d(${dx}px, ${dy}px, 12px) scale(1.04)`;
        btn.classList.add('magnetic');
      });
    });
    btn.addEventListener('mouseleave', () => {
      cancelAnimationFrame(raf);
      btn.style.transform = '';
      btn.classList.remove('magnetic');
    });
  });

  // 3. Scroll reveal with 3D
  const revealEls = document.querySelectorAll('.vc-engine, .vc-storage, .vc-pipeline, .vc-defense, .vc-telemetry, .vc-remediation, .vc-trust, .vc-integrations, .vc-faq, .vc-cta');
  revealEls.forEach(el => {
    if (el.closest('#heroShell')) return;
    el.classList.add('reveal-section');
  });
  if ('IntersectionObserver' in window) {
    const io = new IntersectionObserver((entries) => {
      entries.forEach(entry => {
        if (entry.isIntersecting) {
          entry.target.classList.add('in');
          // stagger child cards
          const childCards = entry.target.querySelectorAll('.vc-card, .vc-faq-item, .vc-trust-step, .vc-risk-item');
          childCards.forEach((c, i) => {
            c.style.transitionDelay = (i * 0.06) + 's';
            c.style.opacity = '0';
            c.style.transform = 'translateY(18px) rotateX(8deg)';
            setTimeout(() => {
              c.style.transition = 'all .72s cubic-bezier(.16,1,.3,1)';
              c.style.opacity = '1';
              c.style.transform = '';
            }, i * 70 + 120);
          });
        }
      });
    }, { threshold: 0.12, rootMargin: '0px 0px -8% 0px' });
    revealEls.forEach(el => io.observe(el));
  } else {
    revealEls.forEach(el => el.classList.add('in'));
  }

  // 4. Global particles - low density across main
  const gCanvas = document.getElementById('globalParticles');
  if (gCanvas) {
    const ctx = gCanvas.getContext('2d');
    if (ctx) {
      let particles = [];
      const DPR = Math.min(window.devicePixelRatio || 1, 1.4);
      let rafId;
      let visible = true;

      function resize() {
        const rect = mainEl ? mainEl.getBoundingClientRect() : { width: window.innerWidth, height: document.documentElement.scrollHeight };
        const w = Math.max(window.innerWidth, rect.width);
        const h = Math.max(window.innerHeight, mainEl ? mainEl.scrollHeight : document.body.scrollHeight);
        gCanvas.width = Math.round(w * DPR);
        gCanvas.height = Math.round(h * DPR);
        gCanvas.style.width = w + 'px';
        gCanvas.style.height = h + 'px';
        ctx.setTransform(DPR, 0, 0, DPR, 0, 0);
      }

      function init() {
        const w = gCanvas.width / DPR;
        const h = gCanvas.height / DPR;
        particles = Array.from({ length: isMobile ? 18 : 42 }, () => ({
          x: Math.random() * w,
          y: Math.random() * h,
          z: Math.random() * 0.8 + 0.2,
          vx: (Math.random() - 0.5) * 0.14,
          vy: (Math.random() - 0.5) * 0.10,
          r: Math.random() * 1.2 + 0.3,
          hue: Math.random() > 0.5 ? 195 : 265
        }));
      }

      function draw() {
        if (document.hidden) { rafId = requestAnimationFrame(draw); return; }
        if (!visible) { rafId = requestAnimationFrame(draw); return; }
        const w = gCanvas.width / DPR;
        const h = gCanvas.height / DPR;
        ctx.clearRect(0, 0, w, h);
        particles.forEach(p => {
          p.x += p.vx * p.z;
          p.y += p.vy * p.z;
          if (p.x < 0) p.x = w;
          if (p.x > w) p.x = 0;
          if (p.y < 0) p.y = h;
          if (p.y > h) p.y = 0;
          const alpha = 0.08 * p.z;
          ctx.beginPath();
          ctx.arc(p.x, p.y, p.r * p.z, 0, Math.PI * 2);
          ctx.fillStyle = `hsla(${p.hue}, 84%, 66%, ${alpha})`;
          ctx.fill();
        });
        // connections
        for (let i = 0; i < particles.length; i++) {
          for (let j = i + 1; j < particles.length; j++) {
            const a = particles[i], b = particles[j];
            const dx = a.x - b.x, dy = a.y - b.y;
            const dist = Math.hypot(dx, dy);
            if (dist < 110) {
              const alpha = (1 - dist / 110) * 0.022 * Math.min(a.z, b.z);
              ctx.beginPath();
              ctx.moveTo(a.x, a.y);
              ctx.lineTo(b.x, b.y);
              ctx.strokeStyle = `hsla(265, 88%, 66%, ${alpha})`;
              ctx.lineWidth = 0.5;
              ctx.stroke();
            }
          }
        }
        rafId = requestAnimationFrame(draw);
      }

      resize(); init(); draw();
      window.addEventListener('resize', () => {
        resize(); init();
      }, { passive: true });

      if ('IntersectionObserver' in window && mainEl) {
        const obs = new IntersectionObserver((entries) => {
          entries.forEach(en => { visible = en.isIntersecting; });
        }, { threshold: 0 });
        obs.observe(mainEl);
      }
    }
  }

  // 5. Global orbs parallax on mouse + scroll
  const gOrbs = document.querySelectorAll('.g-orb');
  if (gOrbs.length && !isMobile) {
    let mouseX = 0, mouseY = 0, ticking = false;
    document.addEventListener('mousemove', (e) => {
      mouseX = (e.clientX / window.innerWidth - 0.5);
      mouseY = (e.clientY / window.innerHeight - 0.5);
      if (ticking) return;
      ticking = true;
      requestAnimationFrame(() => {
        gOrbs.forEach((orb, i) => {
          const depth = (i + 1) * 0.42;
          orb.style.transform = `translate3d(${mouseX * 18 * depth}px, ${mouseY * 12 * depth}px, 0) scale(${1 + Math.abs(mouseX) * 0.02})`;
        });
        ticking = false;
      });
    }, { passive: true });

    // scroll parallax
    let scrollTick = false;
    window.addEventListener('scroll', () => {
      if (scrollTick) return;
      scrollTick = true;
      requestAnimationFrame(() => {
        const scrolled = window.scrollY * 0.04;
        gOrbs.forEach((orb, i) => {
          const factor = (i % 2 === 0 ? 1 : -1) * (0.2 + i * 0.06);
          orb.style.translate = `0 ${scrolled * factor}px`;
        });
        scrollTick = false;
      });
    }, { passive: true });
  }

  // 6. Floating dots that rise over entire site (except hero)
  const main = document.getElementById('main');
  if (main && !isMobile) {
    let dotInterval;
    function spawnDot() {
      if (document.hidden) return;
      const dot = document.createElement('div');
      dot.className = 'floating-dot';
      const rect = main.getBoundingClientRect();
      const x = Math.random() * window.innerWidth;
      const y = window.scrollY + window.innerHeight * (0.6 + Math.random() * 0.4);
      dot.style.left = x + 'px';
      dot.style.top = y + 'px';
      const dx = (Math.random() - 0.5) * 80 + 'px';
      const dy = (-80 - Math.random() * 180) + 'px';
      dot.style.setProperty('--dx', dx);
      dot.style.setProperty('--dy', dy);
      dot.style.animationDuration = (6 + Math.random() * 8) + 's';
      dot.style.animationDelay = (Math.random() * 2) + 's';
      document.body.appendChild(dot);
      dot.addEventListener('animationend', () => dot.remove(), { once: true });
      setTimeout(() => { if (dot.parentNode) dot.remove(); }, 16000);
    }
    dotInterval = setInterval(spawnDot, 700);
    for (let i = 0; i < 8; i++) setTimeout(spawnDot, i * 280);
  }

  // 7. Marquee items index for float delay
  document.querySelectorAll('.vc-marquee-item').forEach((el, i) => {
    el.style.setProperty('--i', i);
  });

  // 8. CTA aurora follows cursor (except hero)
  const cta = document.getElementById('cta');
  if (cta) {
    cta.addEventListener('mousemove', (e) => {
      const rect = cta.getBoundingClientRect();
      const x = ((e.clientX - rect.left) / rect.width) * 100;
      const y = ((e.clientY - rect.top) / rect.height) * 100;
      cta.style.setProperty('--mx', x + '%');
      cta.style.setProperty('--my', y + '%');
    });
  }

  // 9. Hero enterprise: Tech pills 3D + quick verify
  const techPills = document.getElementById('techPills');
  const pills = document.querySelectorAll('.tech-pill');
  const quickInput = document.getElementById('quickVerifyInput');
  const quickBtn = document.getElementById('quickVerifyBtn');
  const quickWrap = document.getElementById('quickVerify');

  if (techPills && pills.length) {
    // floating + cursor follow
    pills.forEach((pill, i) => {
      const baseY = [4, 0, -2, 1, 3][i] || 0;
      pill.style.setProperty('--ty', baseY + 'px');
      pill.addEventListener('mousemove', (e) => {
        const rect = pill.getBoundingClientRect();
        const x = (e.clientX - rect.left - rect.width/2) * 0.18;
        const y = (e.clientY - rect.top - rect.height/2) * 0.22;
        pill.style.transform = `translate3d(${x}px, ${y + baseY}px, 14px) rotateY(${x*0.18}deg) rotateX(${-y*0.18}deg) scale(1.08)`;
      });
      pill.addEventListener('mouseleave', () => {
        pill.style.transform = `translateY(${baseY}px)`;
      });
    });

    // hero shell moves tech pills subtly
    const heroShellForPills = document.getElementById('heroShell');
    if (heroShellForPills && isHoverCapable) {
      heroShellForPills.addEventListener('mousemove', (e) => {
        const rect = heroShellForPills.getBoundingClientRect();
        const hx = (e.clientX - rect.left) / rect.width - 0.5;
        const hy = (e.clientY - rect.top) / rect.height - 0.5;
        pills.forEach((pill, i) => {
          if (pill.matches(':hover')) return;
          const depth = (i+1)*0.32;
          const baseY = [4,0,-2,1,3][i]||0;
          pill.style.transform = `translate3d(${hx*10*depth}px, ${hy*8*depth + baseY}px, 0)`;
        });
      });
      heroShellForPills.addEventListener('mouseleave', () => {
        pills.forEach((pill,i)=>{
          const baseY = [4,0,-2,1,3][i]||0;
          pill.style.transform = `translateY(${baseY}px)`;
        });
      });
    }
  }

  if (quickInput && quickBtn && quickWrap) {
    function doVerify() {
      const val = quickInput.value.trim();
      if (!val) {
        quickInput.focus();
        quickWrap.style.animation = 'none';
        quickWrap.offsetHeight;
        quickWrap.style.animation = 'shake 0.32s ease';
        setTimeout(()=> quickWrap.style.animation='', 400);
        return;
      }
      quickBtn.textContent = 'Verifying…';
      quickBtn.disabled = true;
      quickInput.disabled = true;
      setTimeout(() => {
        // find toast helper from previous scope? recreate
        const toast = document.getElementById('toast');
        if (toast) {
          toast.textContent = `✓ Verified on-chain: ${val.slice(0,18)}… | Risk 2/10 | Sealed | Hyperledger #${Math.floor(Math.random()*9000)+1000}`;
          toast.className = 'toast show success';
          setTimeout(()=> toast.classList.remove('show'), 4200);
        }
        quickBtn.textContent = 'Verify On-Chain ↵';
        quickBtn.disabled = false;
        quickInput.disabled = false;
        // scroll to ledger
        const ledger = document.getElementById('blockchain-ledger');
        if (ledger) ledger.scrollIntoView({ behavior: 'smooth' });
      }, 950);
    }
    quickBtn.addEventListener('click', doVerify);
    quickInput.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') doVerify();
    });

    // focus glow
    quickInput.addEventListener('focus', () => {
      quickWrap.querySelector('.quick-verify-inner').style.borderColor = 'rgba(0,229,255,.22)';
      quickWrap.querySelector('.quick-verify-inner').style.boxShadow = '0 0 0 3px rgba(0,229,255,.12), 0 22px 56px rgba(0,0,0,.52)';
    });
    quickInput.addEventListener('blur', () => {
      quickWrap.querySelector('.quick-verify-inner').style.borderColor = '';
      quickWrap.querySelector('.quick-verify-inner').style.boxShadow = '';
    });
  }

  // add shake keyframes dynamically
  const style = document.createElement('style');
  style.textContent = `@keyframes shake{0%,100%{transform:translateX(0)}20%,60%{transform:translateX(-4px)}40%,80%{transform:translateX(4px)}}`;
  document.head.appendChild(style);
})();
