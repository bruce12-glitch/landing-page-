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

  // ---------- Hero motion: horizon + coins + orbs ----------
  const heroShell = document.getElementById('heroShell');
  const horizon = document.querySelector('.horizon');
  const halo = document.querySelector('.halo');
  const orbs = document.querySelectorAll('.orb-3d');
  if (heroShell && isHoverCapable && !prefersReducedMotion) {
    let heroRaf = 0;
    let heroX = 0, heroY = 0;
    let heroTicking = false;
    heroShell.addEventListener('mousemove', (e) => {
      heroX = (e.clientX - heroShell.getBoundingClientRect().left) / heroShell.getBoundingClientRect().width - 0.5;
      heroY = (e.clientY - heroShell.getBoundingClientRect().top) / heroShell.getBoundingClientRect().height - 0.5;
      if (heroTicking) return;
      heroTicking = true;
      heroRaf = requestAnimationFrame(() => {
        if (horizon) horizon.style.transform = `translateX(-50%) perspective(1000px) rotateX(${heroY * 2}deg) rotateY(${heroX * 3}deg)`;
        if (halo) halo.style.transform = `translateX(-50%) translateY(${heroY * 6}px)`;
        // coins: slight parallax, but respect auto float not to fight if user hovers coin itself
        document.querySelectorAll('.coin').forEach((c, i) => {
          if (c.matches(':hover')) return;
          const offset = (i - 2.5) * 0.8;
          // keep baseY via data attr or array fallback
          const baseY = [6, 2, 0, 1, 3, 6][i] || 0;
          c.style.transform = `translateY(${baseY - heroY * 4}px) translateX(${heroX * 4 + offset}px) rotateY(${heroX * 6}deg)`;
        });
        orbs.forEach((orb, i) => {
          const depth = (i + 1) * 0.6;
          orb.style.transform = `translate3d(${heroX * 14 * depth}px, ${heroY * 10 * depth}px, ${depth * 8}px)`;
        });
        const pCanvasEl = document.getElementById('particleCanvas');
        if (pCanvasEl) pCanvasEl.style.transform = `translate3d(${heroX * 8}px, ${heroY * 6}px, 0)`;
        heroTicking = false;
      });
    });
    heroShell.addEventListener('mouseleave', () => {
      cancelAnimationFrame(heroRaf);
      heroTicking = false;
      if (horizon) horizon.style.transform = 'translateX(-50%)';
      if (halo) halo.style.transform = 'translateX(-50%)';
      document.querySelectorAll('.coin').forEach((c, i) => {
        const baseY = [6, 2, 0, 1, 3, 6][i] || 0;
        c.style.transform = `translateY(${baseY}px)`;
      });
      orbs.forEach((orb) => { orb.style.transform = ''; });
      const pCanvasEl = document.getElementById('particleCanvas');
      if (pCanvasEl) pCanvasEl.style.transform = '';
    });
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

  // ---------- Coins auto float ----------
  const coinsRow = document.getElementById('coinsRow');
  if (coinsRow && !prefersReducedMotion) {
    let t = 0;
    let rafCoins;
    function floatCoins() {
      if (!pageHidden) {
        t += 0.015;
        coinsRow.querySelectorAll('.coin').forEach((c, i) => {
          if (c.matches(':hover')) return; // don't fight user hover
          // if hero mousemove is active, coins are already controlled there — skip to avoid jitter
          // check if heroShell is being hovered
          const heroHover = heroShell && heroShell.matches(':hover');
          if (heroHover) return;
          const floatY = Math.sin(t + i * 0.7) * 2.5;
          const rotY = Math.sin(t * 0.5 + i) * 1.5;
          const baseY = [6, 2, 0, 1, 3, 6][i] || 0;
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

})();
