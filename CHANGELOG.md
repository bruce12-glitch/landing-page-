# VendorChain Landing — Changelog

All notable changes across the hardening phases of the VendorChain Zero-Trust landing page.

## [Phase 5: Fluid carousels] - 2026-08-13
- Rebuilt the integrations ticker as two equal track-sets driven in JS (`translate3d` + wrap at measured width) so the loop no longer jumps on the flex-gap `-50%` seam. Hover eases speed instead of hard-pausing.
- Card grids become snap carousels under 720px with prev/next, dots, and touch swipe.
- Hero parallax now lerps CSS variables on wrappers so orb float animations are no longer overwritten each frame. In-page scroll uses a single cubic ease.

## [Phase 4: Frontend Debug + 3D Motion] - 2026-08-13
- **Bugs fixed**: Hero cursor glow now follows the pointer (`--mx`/`--my` inheritance). Removed leaked `x-admin-key` from the demo verifier. Initialized the unused `#globalParticles` canvas. Made the integrations marquee loop seamlessly. Stopped perpetual card-float animations that fought hover tilt and burned GPU. Restored native text cursors inside form fields. FAQ answers animate instead of `display:none` and expose `aria-controls`.
- **Interactions**: Nav scroll-spy, focus-visible rings, mobile drawer focus trap + Escape/outside click, magnetic primary CTAs, honest local SHA-256 verifier with inline result panel, and section links that actually land on content grids.
- **3D motion**: Perspective floor + orbital rings in the hero, unified rAF loop (cursor, parallax, particles, scroll progress), staggered card entrance, specular card tilt. All respect `prefers-reduced-motion` and pause when the tab is hidden.

## [Phase 3: Launch Hardening] - 2026-08-09
- **F0 Carry-over Control**: Implemented 3-second minimum submit guard with active focus on `#formErrorSummary` and moved error list styling into CSS.
  - *Proof*: `grep -A 4 "formInitTime < 3000" js/app.js`
- **F1 Content Security Policy**: Added strict `<meta http-equiv="Content-Security-Policy">` with `default-src 'self'`, `style-src 'self' https://fonts.googleapis.com`, `font-src https://fonts.gstatic.com`, `img-src 'self' data:`, `connect-src 'self'`, `base-uri 'self'`, `form-action 'self'`. Swept all inline styles in markup and scripts to zero.
  - *Proof*: `grep -c 'style="' index.html js/app.js` → `0`
- **F2 Branded 404 Page**: Added `404.html` with Zero-Trust error branding ("This route failed verification.") and quick recovery CTAs.
  - *Proof*: `ls 404.html`
- **F3 Link Sanitization**: Replaced all bare `href="#"` links with valid `#main` scroll targets.
  - *Proof*: `grep -o 'href="#"' index.html` → `0`
- **F4 Discovery Metadata**: Added canonical URL tag, `robots.txt`, and `sitemap.xml` with placeholder swap markers.
  - *Proof*: `ls robots.txt sitemap.xml`
- **F5 Security & Architecture Docs**: Published `SECURITY.md`, `CHANGELOG.md`, and refreshed `README.md`.
  - *Proof*: `ls SECURITY.md CHANGELOG.md`

## [Phase 2: Conversion Core] - 2026-08-09
- **F1 Accessible Early Access Form**: Built 3-field form (Name, Email, Company) in `#cta` with real `<label>` elements, `autocomplete` attributes, and `aria-invalid` / `aria-describedby` validation states.
  - *Proof*: `grep -c "aria-invalid\|aria-describedby" index.html` → `6`
- **F2 Honest Submit Pipeline**: Implemented `FORM_ENDPOINT` handler with honeypot spam guard, double-submission lock, offline fallback (`mailto:hello@vendorchain.io`), and 8s timeout with focusable states. Zero PII storage in browser storage.
  - *Proof*: `grep -c "FORM_ENDPOINT" js/app.js` → `3`
- **F3 CTA Discipline**: Routed all primary CTAs across nav, drawer, hero, and footer to scroll to `#cta` and auto-focus `#earlyAccessName`.
  - *Proof*: `grep -c 'href="#cta"' index.html`
- **F4 Trust Microcopy**: Added privacy pledge: *"No spam. One email when the Vendor Portal opens. We never share your details — verification is kind of our thing."*

## [Phase 1: Trust & Integrity Pass] - 2026-08-09
- **F1 Truth-First Verifier**: Replaced randomized verification simulation with explicit `DEMO` badge and fixed SHA-256 sample artifact validation.
  - *Proof*: `grep -c "SAMPLE_ARTIFACT_HASH" js/app.js` → `4`
- **F2 Zero Dead Links**: Eliminated all `/portal` and `/docs/*` 404 routes, converting unmapped links into accessible `Docs soon` badges.
  - *Proof*: `grep -o 'href="[^"]*"' index.html | sort -u` (zero dead links)
- **F3 OpenGraph Card**: Generated 1200×630 branded `assets/og-card.png` and absolute social metadata tags.
- **F4 Local Asset Sovereignty**: Removed hotlinked third-party images, replacing them with local CSS monogram avatar and inline SVG icon.
- **F5 Doc Hygiene**: Generated true 2x retina logo `assets/logo@2x.png` and prepended supersession notice to `ANALYSIS.md`.
