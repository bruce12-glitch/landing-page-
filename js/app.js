// VendorChain — High-performance 3D landing engine
// Single rAF loop, GPU transforms only, reduced-motion aware, CSP-safe

(() => {
  'use strict';

  const motionQuery = window.matchMedia('(prefers-reduced-motion: reduce)');
  const hoverQuery = window.matchMedia('(hover: hover) and (pointer: fine)');
  let prefersReducedMotion = motionQuery.matches;
  let isHoverCapable = hoverQuery.matches;
  let pageHidden = document.hidden;

  const onMotionChange = (e) => { prefersReducedMotion = e.matches; };
  const onHoverChange = (e) => { isHoverCapable = e.matches; };
  if (motionQuery.addEventListener) motionQuery.addEventListener('change', onMotionChange);
  else motionQuery.addListener(onMotionChange);
  if (hoverQuery.addEventListener) hoverQuery.addEventListener('change', onHoverChange);
  else hoverQuery.addListener(onHoverChange);

  document.addEventListener('visibilitychange', () => {
    pageHidden = document.hidden;
  });

  const lerp = (a, b, n) => (1 - n) * a + n * b;

  // ---------- 1. Reveal on scroll ----------
  const revealTargets = document.querySelectorAll(
    '.reveal, .vc-engine, .vc-storage, .vc-pipeline, .vc-defense, .vc-telemetry, .vc-remediation, .vc-trust, .vc-integrations, .vc-faq, .vc-cta'
  );

  if ('IntersectionObserver' in window) {
    const revealObserver = new IntersectionObserver((entries) => {
      entries.forEach((entry) => {
        if (!entry.isIntersecting) return;
        entry.target.classList.add('in');
        const childCards = entry.target.querySelectorAll('.vc-card, .vc-faq-item');
        childCards.forEach((card, idx) => {
          card.style.setProperty('--stagger', `${Math.min(idx * 55, 440)}ms`);
          card.classList.add('in', 'card-enter');
        });
        revealObserver.unobserve(entry.target);
      });
    }, { threshold: 0.08, rootMargin: '0px 0px -48px 0px' });

    revealTargets.forEach((el) => revealObserver.observe(el));
  } else {
    revealTargets.forEach((el) => el.classList.add('in'));
  }

  // ---------- 2. FAQ accordion ----------
  document.querySelectorAll('.vc-faq-q, .faq-q, .ak-faq-q').forEach((btn) => {
    btn.addEventListener('click', () => {
      const item = btn.closest('.vc-faq-item, .faq-item, .ak-faq-item');
      if (!item) return;
      const isOpen = item.classList.contains('open');
      const parentList = item.parentElement;

      if (parentList) {
        parentList.querySelectorAll('.vc-faq-item, .faq-item, .ak-faq-item').forEach((sibling) => {
          sibling.classList.remove('open');
          const siblingBtn = sibling.querySelector('.vc-faq-q, .faq-q, .ak-faq-q');
          if (siblingBtn) siblingBtn.setAttribute('aria-expanded', 'false');
        });
      }

      if (!isOpen) {
        item.classList.add('open');
        btn.setAttribute('aria-expanded', 'true');
      }
    });
  });

  // ---------- 3. Architecture tabs (legacy-safe) ----------
  document.querySelectorAll('.arch-tab, .ak-tab').forEach((tab) => {
    tab.addEventListener('click', () => {
      const parent = tab.parentElement;
      if (parent) {
        parent.querySelectorAll('.arch-tab, .ak-tab').forEach((t) => {
          t.classList.remove('active');
          t.setAttribute('aria-selected', 'false');
        });
      }
      tab.classList.add('active');
      tab.setAttribute('aria-selected', 'true');
    });
  });

  // ---------- 4. Mobile navigation ----------
  const hamburger = document.getElementById('hamburger');
  const mobileDrawer = document.getElementById('mobileDrawer');

  if (hamburger && mobileDrawer) {
    const drawerLinks = Array.from(mobileDrawer.querySelectorAll('a'));

    const toggleDrawer = (open) => {
      const willOpen = open ?? !mobileDrawer.classList.contains('open');
      mobileDrawer.classList.toggle('open', willOpen);
      hamburger.setAttribute('aria-expanded', String(willOpen));
      hamburger.setAttribute('aria-label', willOpen ? 'Close menu' : 'Open menu');
      mobileDrawer.setAttribute('aria-hidden', String(!willOpen));
      document.body.classList.toggle('drawer-open', willOpen);
      if (willOpen) drawerLinks[0]?.focus();
    };

    hamburger.addEventListener('click', () => toggleDrawer());
    drawerLinks.forEach((a) => a.addEventListener('click', () => toggleDrawer(false)));

    document.addEventListener('click', (e) => {
      if (
        mobileDrawer.classList.contains('open') &&
        !mobileDrawer.contains(e.target) &&
        !hamburger.contains(e.target)
      ) {
        toggleDrawer(false);
      }
    });

    document.addEventListener('keydown', (e) => {
      if (!mobileDrawer.classList.contains('open')) return;
      if (e.key === 'Escape') {
        toggleDrawer(false);
        hamburger.focus();
        return;
      }
      if (e.key !== 'Tab' || drawerLinks.length === 0) return;
      const focusable = [hamburger, ...drawerLinks];
      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      if (e.shiftKey && document.activeElement === first) {
        e.preventDefault();
        last.focus();
      } else if (!e.shiftKey && document.activeElement === last) {
        e.preventDefault();
        first.focus();
      }
    });
  }

  // ---------- 5. Toast ----------
  const toastEl = document.getElementById('toast');
  let toastTimer = null;
  function showToast(msg, type = '') {
    if (!toastEl) return;
    toastEl.textContent = msg;
    toastEl.className = 'toast show' + (type ? ' ' + type : '');
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => {
      toastEl.classList.remove('show');
    }, 4500);
  }

  // ---------- 6. Early access form ----------
  const FORM_ENDPOINT = '';
  const earlyAccessForm = document.getElementById('earlyAccessForm');
  const nameInput = document.getElementById('earlyAccessName');
  const emailInput = document.getElementById('earlyAccessEmail');
  const orgInput = document.getElementById('earlyAccessCompany');
  const honeypotInput = document.getElementById('honeypotField');
  const formErrorSummary = document.getElementById('formErrorSummary');
  const nameError = document.getElementById('nameError');
  const emailError = document.getElementById('emailError');
  const orgError = document.getElementById('companyError');
  const formStatusMsg = document.getElementById('formStatusMsg');
  const submitBtn = document.getElementById('earlyAccessSubmitBtn');

  const formInitTime = Date.now();
  let isSubmitting = false;

  const clearInputError = (input, errEl) => {
    if (input) input.setAttribute('aria-invalid', 'false');
    if (errEl) errEl.textContent = '';
    if (formErrorSummary && !formErrorSummary.hidden) {
      if (nameInput?.value.trim() && emailInput?.value.trim() && orgInput?.value.trim()) {
        formErrorSummary.hidden = true;
      }
    }
  };

  if (nameInput) nameInput.addEventListener('input', () => clearInputError(nameInput, nameError));
  if (emailInput) emailInput.addEventListener('input', () => clearInputError(emailInput, emailError));
  if (orgInput) orgInput.addEventListener('input', () => clearInputError(orgInput, orgError));

  if (earlyAccessForm && submitBtn) {
    earlyAccessForm.addEventListener('submit', async (e) => {
      e.preventDefault();

      if (honeypotInput && honeypotInput.value.trim() !== '') return;

      if (Date.now() - formInitTime < 3000) {
        if (formErrorSummary) {
          formErrorSummary.innerHTML = '<strong>Submitted too quickly — please review your details and try again.</strong>';
          formErrorSummary.hidden = false;
          formErrorSummary.focus();
        }
        return;
      }

      const nameVal = nameInput ? nameInput.value.trim() : '';
      const emailVal = emailInput ? emailInput.value.trim() : '';
      const orgVal = orgInput ? orgInput.value.trim() : '';
      const emailRegex = /^[^\s@]+@[^\s@]+\.[a-zA-Z]{2,}$/;
      const validationErrors = [];

      if (!nameVal) {
        validationErrors.push({ el: nameInput, msg: 'Full name is required.' });
        nameInput?.setAttribute('aria-invalid', 'true');
        if (nameError) nameError.textContent = 'Please enter your full name.';
      }

      if (!emailVal || !emailRegex.test(emailVal)) {
        validationErrors.push({ el: emailInput, msg: 'Please enter a valid work email.' });
        emailInput?.setAttribute('aria-invalid', 'true');
        if (emailError) emailError.textContent = 'Please enter a valid work email.';
      }

      if (!orgVal) {
        validationErrors.push({ el: orgInput, msg: 'Company / Organization is required.' });
        orgInput?.setAttribute('aria-invalid', 'true');
        if (orgError) orgError.textContent = 'Please enter your organization.';
      }

      if (validationErrors.length > 0) {
        if (formErrorSummary) {
          formErrorSummary.innerHTML = `<strong>Please correct the following errors:</strong><ul class="form-error-list">${validationErrors.map((it) => `<li>${it.msg}</li>`).join('')}</ul>`;
          formErrorSummary.hidden = false;
          formErrorSummary.focus();
        }
        validationErrors[0]?.el?.focus();
        return;
      }

      if (formErrorSummary) formErrorSummary.hidden = true;
      if (isSubmitting) return;
      isSubmitting = true;

      const btnText = submitBtn.querySelector('.btn-text');
      submitBtn.disabled = true;
      if (btnText) btnText.textContent = 'Verifying…';

      if (!FORM_ENDPOINT) {
        setTimeout(() => {
          if (formStatusMsg) {
            formStatusMsg.innerHTML = `
              <div class="form-offline-notice" role="status" tabindex="-1">
                <svg class="offline-icon" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#00E5FF" stroke-width="2" aria-hidden="true"><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/></svg>
                <div>
                  <strong>Early Access Registration</strong>
                  <p>Direct portal provisioning opens soon — reach out at <a href="mailto:hello@vendorchain.io">hello@vendorchain.io</a> for instant access.</p>
                </div>
              </div>
            `;
            formStatusMsg.querySelector('.form-offline-notice')?.focus();
          }
          submitBtn.disabled = false;
          if (btnText) btnText.textContent = 'Request Early Access →';
          isSubmitting = false;
        }, 400);
        return;
      }

      try {
        const res = await fetch(FORM_ENDPOINT, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ name: nameVal, email: emailVal, organization: orgVal }),
        });

        if (res.ok) {
          earlyAccessForm.innerHTML = `
            <div class="form-confirmation" role="status" tabindex="-1">
              <div class="confirmation-icon" aria-hidden="true">✓</div>
              <h4>Registration Received</h4>
              <p>Your organization has been placed in the early-access verification queue.</p>
            </div>
          `;
          earlyAccessForm.querySelector('.form-confirmation')?.focus();
        } else {
          throw new Error(`HTTP ${res.status}`);
        }
      } catch {
        if (formStatusMsg) {
          formStatusMsg.innerHTML = `
            <div class="form-offline-notice error-banner" role="alert" tabindex="-1">
              <div>
                <strong>Submission Notice</strong>
                <p>Unable to connect directly. Please email <a href="mailto:hello@vendorchain.io">hello@vendorchain.io</a>.</p>
              </div>
            </div>
          `;
          formStatusMsg.querySelector('.form-offline-notice')?.focus();
        }
        submitBtn.disabled = false;
        if (btnText) btnText.textContent = 'Request Early Access →';
        isSubmitting = false;
      }
    });
  }

  // ---------- 7. In-page navigation (native smooth scroll — no click lock) ----------
  document.querySelectorAll('a[href^="#"]').forEach((link) => {
    const href = link.getAttribute('href');
    if (!href || href === '#') return;
    const id = href.slice(1);
    if (!document.getElementById(id)) return;

    link.addEventListener('click', () => {
      if (mobileDrawer?.classList.contains('open')) {
        mobileDrawer.classList.remove('open');
        hamburger?.setAttribute('aria-expanded', 'false');
        hamburger?.setAttribute('aria-label', 'Open menu');
        mobileDrawer.setAttribute('aria-hidden', 'true');
        document.body.classList.remove('drawer-open');
      }
      if (id === 'cta') {
        setTimeout(() => nameInput?.focus({ preventScroll: true }), 450);
      } else if (id === 'quickVerify') {
        setTimeout(() => document.getElementById('quickVerifyInput')?.focus({ preventScroll: true }), 450);
      }
    });
  });

  // ---------- 10. Unified motion loop (hero + cursor + scroll + particles) ----------
  const heroShell = document.getElementById('heroShell');
  const heroGlow = document.getElementById('heroCursorGlow');
  const heroStage = document.getElementById('heroStage');
  const horizon = document.querySelector('.horizon');
  const orbs = Array.from(document.querySelectorAll('.orb-3d'));
  const badge = document.querySelector('.hero .badge');
  const h1 = document.querySelector('.h1');
  const customCursor = document.getElementById('customCursor');
  const scrollProgress = document.getElementById('scrollProgress');
  const navLinks = Array.from(document.querySelectorAll('.nav-links a[data-nav]'));
  const spySections = navLinks
    .map((link) => document.getElementById(link.dataset.nav))
    .filter(Boolean);

  const pointer = { x: window.innerWidth / 2, y: window.innerHeight / 2, active: false };
  const cursor = { x: pointer.x, y: pointer.y };
  const heroPointer = { x: 0, y: 0, mx: 50, my: 38, inside: false };
  let heroBounds = null;
  let scrollY = window.scrollY || 0;
  let ticking = false;
  if (customCursor) customCursor.remove();

  window.addEventListener('mousemove', (e) => {
    pointer.x = e.clientX;
    pointer.y = e.clientY;
    pointer.active = true;

    if (heroShell && isHoverCapable && !prefersReducedMotion) {
      if (!heroBounds) heroBounds = heroShell.getBoundingClientRect();
      const inside =
        e.clientX >= heroBounds.left &&
        e.clientX <= heroBounds.right &&
        e.clientY >= heroBounds.top &&
        e.clientY <= heroBounds.bottom;
      heroPointer.inside = inside;
      if (inside) {
        heroPointer.x = (e.clientX - heroBounds.left) / heroBounds.width - 0.5;
        heroPointer.y = (e.clientY - heroBounds.top) / heroBounds.height - 0.5;
        heroPointer.mx = ((e.clientX - heroBounds.left) / heroBounds.width) * 100;
        heroPointer.my = ((e.clientY - heroBounds.top) / heroBounds.height) * 100;
        heroGlow?.classList.add('active');
      }
    }
  }, { passive: true });

  document.addEventListener('mouseleave', () => {
    pointer.active = false;
    heroPointer.inside = false;
    heroGlow?.classList.remove('active');
  });

  window.addEventListener('scroll', () => {
    scrollY = window.scrollY || window.pageYOffset;
  }, { passive: true });

  window.addEventListener('resize', () => {
    heroBounds = null;
  }, { passive: true });

  const updateNavSpy = () => {
    if (!spySections.length) return;
    const marker = 120;
    let current = spySections[0];
    spySections.forEach((section) => {
      if (section.getBoundingClientRect().top - marker <= 0) current = section;
    });
    navLinks.forEach((link) => {
      const active = link.dataset.nav === current.id;
      link.classList.toggle('active', active);
      if (active) link.setAttribute('aria-current', 'page');
      else link.removeAttribute('aria-current');
    });
  };

  const updateScrollProgress = () => {
    if (!scrollProgress) return;
    const max = Math.max(document.documentElement.scrollHeight - window.innerHeight, 1);
    const pct = Math.min(Math.max(scrollY / max, 0), 1);
    scrollProgress.style.transform = `scaleX(${pct})`;
    scrollProgress.dataset.progress = String(Math.round(pct * 100));
  };

  const heroEase = { x: 0, y: 0, mx: 50, my: 38 };
  const applyHeroParallax = () => {
    if (!heroShell || prefersReducedMotion || !isHoverCapable) return;
    const tx = heroPointer.inside ? heroPointer.x : 0;
    const ty = heroPointer.inside ? heroPointer.y : 0;
    heroEase.x = lerp(heroEase.x, tx, 0.08);
    heroEase.y = lerp(heroEase.y, ty, 0.08);
    heroEase.mx = lerp(heroEase.mx, heroPointer.inside ? heroPointer.mx : 50, 0.1);
    heroEase.my = lerp(heroEase.my, heroPointer.inside ? heroPointer.my : 38, 0.1);
    heroShell.style.setProperty('--hx', heroEase.x.toFixed(3));
    heroShell.style.setProperty('--hy', heroEase.y.toFixed(3));
    heroShell.style.setProperty('--mx', `${heroEase.mx.toFixed(1)}%`);
    heroShell.style.setProperty('--my', `${heroEase.my.toFixed(1)}%`);
  };

  // Hero particles
  const pCanvas = document.getElementById('particleCanvas');
  const gCanvas = document.getElementById('globalParticles');
  const particleState = { hero: null, global: null };

  const initParticles = (canvas, count, speed) => {
    if (!canvas || prefersReducedMotion) return null;
    const ctx = canvas.getContext('2d', { alpha: true });
    if (!ctx) return null;
    const dpr = Math.min(window.devicePixelRatio || 1, 1.5);
    const state = {
      ctx,
      canvas,
      dpr,
      w: 0,
      h: 0,
      visible: true,
      particles: [],
      count,
      speed,
    };

    const resize = () => {
      const rect = canvas.getBoundingClientRect();
      if (!rect.width || !rect.height) return;
      state.w = rect.width;
      state.h = rect.height;
      canvas.width = Math.round(rect.width * dpr);
      canvas.height = Math.round(rect.height * dpr);
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      state.particles = Array.from({ length: state.count }, () => ({
        x: Math.random() * state.w,
        y: Math.random() * state.h,
        z: Math.random() * 0.7 + 0.3,
        vx: (Math.random() - 0.5) * state.speed,
        vy: (Math.random() - 0.5) * state.speed * 0.8,
        r: Math.random() * 1.3 + 0.35,
      }));
    };

    resize();
    window.addEventListener('resize', resize, { passive: true });

    if ('IntersectionObserver' in window) {
      const obs = new IntersectionObserver((entries) => {
        entries.forEach((en) => { state.visible = en.isIntersecting; });
      }, { threshold: 0 });
      obs.observe(canvas);
    }

    return state;
  };

  particleState.hero = initParticles(pCanvas, 28, 0.18);
  particleState.global = initParticles(gCanvas, 20, 0.08);

  const drawParticles = (state, linkColor, dotColor) => {
    if (!state || !state.visible || pageHidden) return;
    const { ctx, w, h, particles } = state;
    ctx.clearRect(0, 0, w, h);
    for (let i = 0; i < particles.length; i++) {
      const p = particles[i];
      p.x += p.vx * p.z;
      p.y += p.vy * p.z;
      if (p.x < 0) p.x = w;
      if (p.x > w) p.x = 0;
      if (p.y < 0) p.y = h;
      if (p.y > h) p.y = 0;
      ctx.beginPath();
      ctx.arc(p.x, p.y, p.r * p.z, 0, Math.PI * 2);
      ctx.fillStyle = `rgba(${dotColor}, ${0.18 * p.z})`;
      ctx.fill();
    }
    for (let i = 0; i < particles.length; i++) {
      for (let j = i + 1; j < particles.length; j++) {
        const a = particles[i];
        const b = particles[j];
        const dx = a.x - b.x;
        const dy = a.y - b.y;
        const dist = Math.hypot(dx, dy);
        if (dist < 80) {
          ctx.beginPath();
          ctx.moveTo(a.x, a.y);
          ctx.lineTo(b.x, b.y);
          ctx.strokeStyle = `rgba(${linkColor}, ${(1 - dist / 80) * 0.055 * Math.min(a.z, b.z)})`;
          ctx.lineWidth = 0.6;
          ctx.stroke();
        }
      }
    }
  };

  // ---------- 10b. Seamless JS ticker (pixel-perfect loop, hover slowdown) ----------
  const tickers = [];
  const initTicker = (root) => {
    if (!root) return;
    const rows = root.querySelectorAll('.vc-ticker-row');
    rows.forEach((row) => {
      const track = row.querySelector('.js-ticker-track');
      const set = track?.querySelector('.vc-track-set');
      if (!track || !set) return;
      const state = {
        track,
        set,
        dir: Number(row.dataset.dir || -1),
        offset: 0,
        width: 0,
        speed: 0.42,
        targetSpeed: 0.42,
        hovering: false,
        dragging: false,
        visible: true,
      };
      const measure = () => {
        const next = set.getBoundingClientRect().width;
        if (next > 0) {
          if (state.dir > 0 && (state.width === 0 || state.offset === 0)) {
            state.offset = -next;
          }
          state.width = next;
        }
      };
      measure();
      const host = row.closest('[data-ticker]') || row;
      host.addEventListener('mouseenter', () => { state.hovering = true; }, { passive: true });
      host.addEventListener('mouseleave', () => { state.hovering = false; }, { passive: true });

      let drag = null;
      row.style.touchAction = 'pan-y';
      row.addEventListener('pointerdown', (e) => {
        if (e.pointerType === 'mouse' && e.button !== 0) return;
        drag = { id: e.pointerId, x: e.clientX, last: e.clientX, t: performance.now() };
        state.dragging = true;
        state.hovering = true;
        try { row.setPointerCapture(e.pointerId); } catch { /* noop */ }
      });
      row.addEventListener('pointermove', (e) => {
        if (!drag || e.pointerId !== drag.id) return;
        const dx = e.clientX - drag.last;
        drag.last = e.clientX;
        state.offset += dx;
        if (state.width) {
          while (state.offset <= -state.width) state.offset += state.width;
          while (state.offset > 0) state.offset -= state.width;
        }
        state.track.style.transform = `translate3d(${state.offset.toFixed(2)}px,0,0)`;
      });
      const endDrag = (e) => {
        if (!drag || (e && e.pointerId !== drag.id)) return;
        drag = null;
        state.dragging = false;
        state.hovering = false;
      };
      row.addEventListener('pointerup', endDrag);
      row.addEventListener('pointercancel', endDrag);

      window.addEventListener('resize', measure, { passive: true });
      if ('IntersectionObserver' in window) {
        const obs = new IntersectionObserver((entries) => {
          entries.forEach((en) => {
            state.visible = en.isIntersecting;
            if (en.isIntersecting) measure();
          });
        }, { threshold: 0 });
        obs.observe(row);
      }
      tickers.push(state);
    });
  };
  initTicker(document.getElementById('ecoTicker'));

  const stepTickers = () => {
    if (prefersReducedMotion) return;
    tickers.forEach((t) => {
      if (!t.visible || pageHidden || t.dragging) return;
      if (!t.width) t.width = t.set.getBoundingClientRect().width;
      if (!t.width) return;
      t.targetSpeed = t.hovering ? 0.08 : 0.42;
      t.speed = lerp(t.speed, t.targetSpeed, 0.06);
      t.offset += t.speed * t.dir;
      if (t.dir < 0 && t.offset <= -t.width) t.offset += t.width;
      if (t.dir > 0 && t.offset >= 0) t.offset -= t.width;
      t.track.style.transform = `translate3d(${t.offset.toFixed(2)}px,0,0)`;
    });
  };

  // ---------- 10c. Pointer-drag swipe decks (spring snap, no native-scroll fight) ----------
  const decks = [];
  const swipeMq = window.matchMedia('(max-width: 1100px)');

  const initSwipeDecks = () => {
    document.querySelectorAll('.vc-grid').forEach((grid) => {
      if (grid.closest('.vc-carousel')) return;
      const cards = Array.from(grid.querySelectorAll('.vc-card'));
      if (cards.length < 2) return;

      const wrap = document.createElement('div');
      wrap.className = 'vc-carousel';
      wrap.setAttribute('tabindex', '0');
      wrap.setAttribute('aria-roledescription', 'carousel');
      grid.parentNode.insertBefore(wrap, grid);
      wrap.appendChild(grid);
      grid.classList.add('vc-carousel-track');

      const nav = document.createElement('div');
      nav.className = 'vc-carousel-nav';
      nav.innerHTML = `
        <button type="button" class="vc-carousel-btn" data-dir="-1" aria-label="Previous slide">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" aria-hidden="true"><path d="M15 18l-6-6 6-6"/></svg>
        </button>
        <div class="vc-carousel-dots" role="tablist" aria-label="Slides"></div>
        <button type="button" class="vc-carousel-btn" data-dir="1" aria-label="Next slide">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" aria-hidden="true"><path d="M9 18l6-6-6-6"/></svg>
        </button>
      `;
      wrap.appendChild(nav);
      const dotsBox = nav.querySelector('.vc-carousel-dots');
      const prevBtn = nav.querySelector('[data-dir="-1"]');
      const nextBtn = nav.querySelector('[data-dir="1"]');

      cards.forEach((_, i) => {
        const dot = document.createElement('button');
        dot.type = 'button';
        dot.className = 'vc-carousel-dot' + (i === 0 ? ' is-active' : '');
        dot.setAttribute('aria-label', `Go to slide ${i + 1}`);
        dotsBox.appendChild(dot);
      });
      const dots = Array.from(dotsBox.querySelectorAll('.vc-carousel-dot'));

      const deck = {
        wrap,
        grid,
        cards,
        dots,
        prevBtn,
        nextBtn,
        index: 0,
        x: 0,
        target: 0,
        vx: 0,
        dragging: false,
        moved: false,
        gap: 16,
        enabled: false,
      };

      const stepW = () => {
        const w = cards[0].getBoundingClientRect().width;
        const styles = getComputedStyle(grid);
        const g = parseFloat(styles.columnGap || styles.gap || '16') || 16;
        deck.gap = g;
        return w + g;
      };
      const minX = () => -(cards.length - 1) * stepW();
      const apply = () => {
        grid.style.transform = deck.enabled ? `translate3d(${deck.x.toFixed(2)}px,0,0)` : '';
      };
      const paintDots = () => {
        dots.forEach((dot, i) => dot.classList.toggle('is-active', i === deck.index));
        if (prevBtn) prevBtn.disabled = deck.index <= 0;
        if (nextBtn) nextBtn.disabled = deck.index >= cards.length - 1;
      };
      const goTo = (i) => {
        deck.index = Math.max(0, Math.min(cards.length - 1, i));
        deck.target = -deck.index * stepW();
        if (prefersReducedMotion) {
          deck.x = deck.target;
          deck.vx = 0;
          apply();
        }
        paintDots();
      };
      const enable = (on) => {
        deck.enabled = on;
        wrap.classList.toggle('is-ready', on);
        if (!on) {
          deck.x = 0;
          deck.target = 0;
          deck.vx = 0;
          deck.index = 0;
          grid.style.transform = '';
          paintDots();
        } else {
          goTo(deck.index);
          apply();
        }
      };

      let pid = 0;
      let sx = 0;
      let sy = 0;
      let lx = 0;
      let lt = 0;
      let ox = 0;
      let axis = '';

      const onDown = (e) => {
        if (!deck.enabled) return;
        if (e.pointerType === 'mouse' && e.button !== 0) return;
        if (e.target.closest('a, button')) return;
        deck.dragging = true;
        deck.moved = false;
        deck.vx = 0;
        pid = e.pointerId;
        sx = lx = e.clientX;
        sy = e.clientY;
        lt = performance.now();
        ox = deck.x;
        axis = '';
        wrap.classList.add('is-dragging');
        try { grid.setPointerCapture(pid); } catch { /* noop */ }
      };
      const onMove = (e) => {
        if (!deck.dragging || e.pointerId !== pid) return;
        const dx = e.clientX - sx;
        const dy = e.clientY - sy;
        if (!axis) {
          if (Math.abs(dx) < 6 && Math.abs(dy) < 6) return;
          axis = Math.abs(dx) > Math.abs(dy) ? 'x' : 'y';
          if (axis === 'y') {
            deck.dragging = false;
            wrap.classList.remove('is-dragging');
            return;
          }
        }
        if (axis !== 'x') return;
        e.preventDefault();
        deck.moved = Math.abs(dx) > 8;
        const now = performance.now();
        const dt = Math.max(8, now - lt);
        deck.vx = (e.clientX - lx) / dt;
        lx = e.clientX;
        lt = now;
        let next = ox + dx;
        const lo = minX();
        if (next > 0) next *= 0.35;
        if (next < lo) next = lo + (next - lo) * 0.35;
        deck.x = next;
        apply();
      };
      const onUp = (e) => {
        if (!deck.dragging || (e && e.pointerId !== pid)) {
          wrap.classList.remove('is-dragging');
          return;
        }
        deck.dragging = false;
        wrap.classList.remove('is-dragging');
        const w = stepW();
        let next = Math.round(-deck.x / w);
        if (deck.vx < -0.35) next += 1;
        else if (deck.vx > 0.35) next -= 1;
        goTo(next);
      };

      grid.addEventListener('pointerdown', onDown);
      grid.addEventListener('pointermove', onMove, { passive: false });
      grid.addEventListener('pointerup', onUp);
      grid.addEventListener('pointercancel', onUp);
      grid.addEventListener('click', (e) => {
        if (deck.moved) {
          e.preventDefault();
          e.stopPropagation();
          deck.moved = false;
        }
      }, true);

      prevBtn.addEventListener('click', () => goTo(deck.index - 1));
      nextBtn.addEventListener('click', () => goTo(deck.index + 1));
      dots.forEach((dot, i) => dot.addEventListener('click', () => goTo(i)));
      wrap.addEventListener('keydown', (e) => {
        if (!deck.enabled) return;
        if (e.key === 'ArrowRight') { e.preventDefault(); goTo(deck.index + 1); }
        if (e.key === 'ArrowLeft') { e.preventDefault(); goTo(deck.index - 1); }
      });

      deck.step = () => {
        if (!deck.enabled || deck.dragging || prefersReducedMotion) return;
        const dist = deck.target - deck.x;
        if (Math.abs(dist) < 0.2 && Math.abs(deck.vx) < 0.02) {
          if (deck.x !== deck.target) {
            deck.x = deck.target;
            apply();
          }
          return;
        }
        deck.vx = deck.vx * 0.78 + dist * 0.16;
        deck.x += deck.vx;
        apply();
      };

      const syncMode = () => enable(swipeMq.matches && !prefersReducedMotion);
      if (swipeMq.addEventListener) swipeMq.addEventListener('change', syncMode);
      else swipeMq.addListener(syncMode);
      window.addEventListener('resize', () => {
        if (deck.enabled) goTo(deck.index);
      }, { passive: true });
      syncMode();
      decks.push(deck);
    });
  };
  initSwipeDecks();

  let lastSpy = 0;
  const motionLoop = (now) => {
    if (!pageHidden && !prefersReducedMotion) {
      applyHeroParallax();
      stepTickers();
      decks.forEach((d) => d.step && d.step());
      drawParticles(particleState.hero, '139, 92, 246', '0, 229, 255');
      drawParticles(particleState.global, '0, 229, 255', '138, 43, 226');
    }

    if (!ticking) {
      ticking = true;
      updateScrollProgress();
      if (!lastSpy || now - lastSpy > 140) {
        updateNavSpy();
        lastSpy = now;
      }
      ticking = false;
    }

    requestAnimationFrame(motionLoop);
  };
  requestAnimationFrame(motionLoop);

  // ---------- 11. Demo verifier (local, no leaked credentials) ----------
  const SAMPLE_ARTIFACT_HASH = 'e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855';
  const SHA256_RE = /^[a-fA-F0-9]{64}$/;
  const quickInput = document.getElementById('quickVerifyInput');
  const quickBtn = document.getElementById('quickVerifyBtn');
  const quickWrap = document.getElementById('quickVerify');
  const useSampleBtn = document.getElementById('useSampleBtn');
  const verifyResult = document.getElementById('verifyResult');

  const renderVerifyResult = (state, payload) => {
    if (!verifyResult) return;
    verifyResult.hidden = false;
    verifyResult.className = `verify-result is-${state}`;
    if (state === 'success') {
      verifyResult.innerHTML = `
        <div class="verify-result-top">
          <span class="verify-chip ok">VERIFIED</span>
          <span class="verify-chip">Polygon L2 · #4812</span>
        </div>
        <p class="verify-hash"><code>${payload.hash}</code></p>
        <ul class="verify-meta">
          <li>CycloneDX · ${payload.packages} packages</li>
          <li>Cosign · sealed</li>
          <li>AI risk · 0 / 100</li>
        </ul>
        <a class="verify-ledger-link" href="#blockchain-ledger">View immutable ledger →</a>
      `;
    } else if (state === 'invalid') {
      verifyResult.innerHTML = `
        <div class="verify-result-top">
          <span class="verify-chip warn">INVALID FORMAT</span>
        </div>
        <p>Enter a 64-character SHA-256 hex digest, or use the sample artifact.</p>
      `;
    } else {
      verifyResult.innerHTML = `
        <div class="verify-result-top">
          <span class="verify-chip miss">NOT IN DEMO LEDGER</span>
        </div>
        <p>This sandbox only resolves the published sample hash. Click <strong>Use sample artifact</strong> to run a successful proof.</p>
      `;
    }
  };

  if (useSampleBtn && quickInput) {
    useSampleBtn.addEventListener('click', () => {
      quickInput.value = SAMPLE_ARTIFACT_HASH;
      quickInput.focus();
      if (verifyResult) {
        verifyResult.hidden = true;
        verifyResult.className = 'verify-result';
      }
    });
  }

  if (quickInput && quickBtn && quickWrap) {
    const doVerify = async () => {
      const val = quickInput.value.trim();
      if (!val) {
        quickInput.focus();
        quickWrap.classList.remove('shake-anim');
        void quickWrap.offsetWidth;
        quickWrap.classList.add('shake-anim');
        setTimeout(() => quickWrap.classList.remove('shake-anim'), 400);
        return;
      }

      quickBtn.textContent = 'Verifying…';
      quickBtn.disabled = true;
      quickInput.disabled = true;

      await new Promise((resolve) => setTimeout(resolve, 420));

      if (!SHA256_RE.test(val)) {
        renderVerifyResult('invalid');
        showToast('Hash must be a 64-character SHA-256 hex digest.', 'error');
      } else if (val.toLowerCase() === SAMPLE_ARTIFACT_HASH) {
        renderVerifyResult('success', { hash: val, packages: 6 });
        showToast('Cryptographic record verified against the demo ledger.', 'success');
        const ledger = document.getElementById('blockchain-ledger');
        if (ledger) {
          ledger.classList.add('ledger-pulse');
          setTimeout(() => ledger.classList.remove('ledger-pulse'), 2200);
        }
      } else {
        renderVerifyResult('missing');
        showToast('Hash not present in the public demo ledger.', 'error');
      }

      quickBtn.textContent = 'Verify On-Chain ↵';
      quickBtn.disabled = false;
      quickInput.disabled = false;
    };

    quickBtn.addEventListener('click', doVerify);
    quickInput.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') {
        e.preventDefault();
        doVerify();
      }
    });
  }
})();
