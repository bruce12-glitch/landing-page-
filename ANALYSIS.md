SUPERSEDED — pre-refactor snapshot of 07 Aug 2026. See README.md for current architecture.

# VendorChain Landing — End-to-End Codebase Analysis
> Branch: `arena/019fdc8b-landing-page` · Base: `0d42a7c` (main) · Date: 2026-08-07 · Folder: `/home/user/landing-page-`

---

## 0. TL;DR Executive Summary

| Area | Verdict | Detail |
|------|---------|--------|
| **What it is** | Dark premium 3D landing for **VendorChain — Zero-Trust OS**. Single-file heavy landing (`index.html` 57 KB) with inline CSS + inline JS, plus two **dead** external files (`css/style.css`, `js/app.js`) that are never loaded. `plan.html` is a 1,129-line spec document, not runtime. |
| **Design system** | Two competing systems coexist: **(a)** inline dark system — `Plus Jakarta Sans + JetBrains Mono`, `--bg #050507`, `--blue #3B5BFF / #7C3AED`, **(b)** external light Billow system — `Inter/Geist/Instrument Serif`, `--bg #fcfcfd`, `--blue #0a6cff→#3b5bff`. Only (a) is live. (b) is orphaned. |
| **3D strategy** | “CSS 3D without WebGL” — `preserve-3d`, `perspective`, blurred orbs, canvas particle field (42 particles), horizon arc with glow, coin floats. Zero heavy `Three.js`/`Spline` despite plan promising it. Works without GPU. |
| **Health** | **Functional but fragile.** Renders fine as static hosting. For *development* you are starting from a **single-file monolith** — hard to componentize, test, or theme. Orphan files = drift risk. No build pipeline config (`vite.config.js` missing, no Tailwind, no TS). |
| **Ready for landing dev?** | Yes, with refactors. See §8 Roadmap. Recommended: extract inline CSS/JS → `css/style.css` + `js/app.js`, reconcile tokens, and choose light vs dark as canonical. |

---

## 1. Repository Map (every file, line count, role)

```
landing-page-/                ← repo root (served as site root)
├── index.html        777 lines  57,925 B  ★ ACTIVE — entire landing lives here (inline <style> + <script>)
├── css/style.css     241 lines  26,391 B  ✗ DEAD — Billow light tokens, never linked (grep for style.css = 0 hits in index.html)
├── js/app.js          47 lines   2,127 B  ✗ DEAD — tilt/shield logic for an older layout, never <script src>'d
├── assets/
│   ├── logo.png      16,592 B        ← used everywhere (nav, coins-mini, connect stacks, footer)
│   └── logo@2x.png   16,592 B        ← identical bytes to logo.png (duplicate, not referenced anywhere)
├── plan.html         664 lines  48,694 B  📄 SPEC — "3D Landing Implementation Plan" (9 chapters, 7-asset 3D spec, 6-week roadmap). Not linked from index (only from plan itself).
├── package.json       15 lines     361 B  vite ^5 only, 3 scripts (dev/preview/serve)
└── README.md          46 lines   1,649 B  describes the *intended* modular structure but is currently inaccurate
```

**Vite:** `package.json` declares `vite` but **no `vite.config.js`/`ts`** exists. `vite --host 0.0.0.0 --port 5173` will serve the folder as-is (fine for `index.html`), but no path aliases, no plugin, no HMR config. The README's `python3 -m http.server 3000` works equally well.

**Git:** single commit `0d42a7c feat: VendorChain 3D premium landing — Plus Jakarta Sans, dark bento, horizon arc, 3D orbs, particle field`. Working tree clean. Branch `arena/019fdc8b-landing-page` is up-to-date.

---

## 2. Runtime Architecture — What Actually Executes

### 2.1 `index.html` is 100% inline

```html
<head>
  <style> /*  ~240 rules, 26 KB inline — defines entire dark system */ </style>
  <!-- NO <link rel="stylesheet" href="css/style.css"> -->
</head>
<body>
  <!-- all sections as plain HTML (see §3) -->
  <script> /* ~320 lines inline — all interactivity */ </script>
  <!-- NO <script src="js/app.js"> -->
</body>
```

That means **editing `css/style.css` or `js/app.js` does nothing until you wire them up.** The README claiming “`index.html` modular, links to `css/js`” is aspirational, not true today.

### 2.2 External files content (for reference)

- **`css/style.css`** — *Billow Light Design System* (lovely, but unused):
  - Tokens: `--bg #fcfcfd`, `--ink #0a0f1c`, `--blue #0a6cff→#3b5bff`, `--navy #06142a`, radii `22/32/9999`, shadows `shadow/shadow-blue/shadow-float`.
  - Components: sticky pill nav (blur 16px), `.stage` with `.ring`s / `.shield` / `.mini` cards, `.steps`, `.features` (called `.feat`), `.flow` on navy, `.compare`, `.insight`, `.cta` (aurora), `FAQ`, `cap-grid`, `footer`. Completely different layout from inline dark system.
  - Layout helpers: `perspective:1400px`, `float` / `orbit` / `pulse` keyframes.
- **`js/app.js`** — *Old tilt/parallax* (also unused):
  - `IntersectionObserver` reveal (`threshold .12`), FAQ toggle, shield tilt on `stage#stage > #shield` (selectors that **don’t exist** in current `index.html`), ring parallax on scroll, `tilt` cards. All superseded by the richer inline script.

### 2.3 `plan.html` — Spec, not code

`plan.html` is a **standalone Notion-like planning doc** (Billow-style with navy TOC card). Sections: 01 Strategy/KPIs, 02 IA (10-section sitemap), 03 Page Narrative (table mapping Billow analog → VendorChain content → 3D asset → interaction), 04 “7 Assets” deep dive (Orbital Trust Ring, ID Prism, Dependency Constellation, Seal Stamp, Risk Orb, Gate, Ledger Chain — each with Concept/Motion/Tech), 05 Design System (Billow tokens), 06 Tech Architecture (Next.js 15 + R3F + Spline plan), 07 Build Plan (5 phases/6 weeks), 08 Perf/Fallback/A11y budgets, 09 Team/Tools/Handoff. **No code dependency** — safe to delete or keep as `docs/plan.html`.

---

## 3. Page Structure — 8 Sections in Render Order

Parsed from DOM (`grep -n "<section|id="`):

```
1. .hero-shell #heroShell
   ├── nav.nav (mark + VendorChain + Zero-Trust OS + 5 links + spacer)
   ├── section.hero
   │   ├── .badge  "BUILT WITH CRYPTO LED BY PROOF"
   │   ├── h1.h1   "The Premier Trust Network / for Zero-Trust Supply Chains."
   │   ├── #coinsRow .coins (6× .coin.magnet[data-tilt] with .coin-inner SVG — 6 layers)
   │   ├── .coin-label "6 LAYERS - IDENTITY - INVENTORY - SEALING - RISK - POLICY - LEDGER"
   │   ├── .horizon (+ ::before edgeGlow + ::after bloomPulse)
   │   ├── .orbs (3× .orb-3d with float 9/11/13s)
   │   ├── canvas#particleCanvas (42 particles + connecting lines)
   │   └── .ctas  →  [Start Verifying → #demo]
   └── .trusted — currently ABSENT commentary: there is a <div style="height:72px;background:#000"> spacer then next section
2. section.section (unnamed "transformational")
   ├── h2 "Vendor Verification With VendorChain Is Not Transactional. It Is Transformational."
   ├── p.sub
   └── #hStack.h-stack → #hStackInner.h-stack-inner → 6× .h-layer (horizontal metallic stack, scroll parallax)
3. section#proof.growth "Driving Growth. Delivering Care."
   ├── h3.growth-head
   ├── #growthGrid.growth-grid (5× .g-card.magnet[data-tilt] — 2.1s / <20s / 4.2k+ SBOMs large with .coins-mini 5× .c2 / 6 layers / 98%)
   ├── [Start Verifying]
   └── .quote (quote + avatar from pravatar.cc)
4. section.arch-head + div#testis.testis "We Are Architecting the Trust Layer"
   ├── .arch-tabs (Vendor View active / Auditor View)
   └── 6× .t-card.magnet[data-tilt] (one .hl blue→purple)
5. section#layers.layers (6× .l-card.magnet[data-tilt] — Identity/Inventory/Sealing/Risk/Policy/Ledger)
   Each: .l-icon (gradient) + h4 + p + ul.l-list (2× li with check) + .l-foot (Layer 01 — Continuous etc.)
6. section#eco.ecosystem "Embedded in the Ecosystem"
   ├── .eco-head
   └── #ecoGrid.eco-grid (3× .eco-card.magnet — Onboarding / Live Verification mid / Proof Ready — unsplash images + gradient overlays)
7. section.connect "Where Verified Vendors and Trusted Enterprises Connect"
   ├── #connectGrid → 2× .co-card.magnet (For Vendors / For Enterprises, each with .co-stack 3× .co-layer)
8. section.wrap (CTA + FAQ + footer)
   ├── .cta (h3 "Stop trusting. Start proving." + form#demo with inline onsubmit)
   ├── #faq.faq (4× .faq-item with button.faq-q; first .open)
   └── footer (mark + VendorChain ©2026 + Privacy/Security/Docs + big VENDORCHAIN wordmark)
```

**Responsive breakpoints:** `860px` (nav-links hide), `960px`/`640px` (layers/testis grid collapses 3→2→1), `760px` (connect 2→1), `860px` (growth-grid 3-col→2-col). Mobile nav has **no hamburger** — links simply vanish.

---

## 4. Design System — Two Systems, One Live

### 4.1 Live (inline) tokens — `index.html :root`

```
--font-primary: 'Plus Jakarta Sans'    --font-mono: 'JetBrains Mono'
--bg: #050507   --card #0F1116 / #12141C / #16181E
--border #1D222E / #242A36
--text #F6F7FA  --muted #8B93A7 / #6B728E
--blue #3B5BFF  --purple #7C3AED
--radius 22px / 28px
page: radial purple wash + linear #02010A→#000
hero-shell: linear #0A0A1A→#07080F + border --border + inset highlight
horizon: black disc (184% width) + ultra-bright white/purple edge + purple bloom blur
coins: metallic gradient #F0F3F8→#F8F9FB with inset highlight + 34px dark inner
```

### 4.2 Dead (external) tokens — `css/style.css :root`

```
--bg #fcfcfd / #f8f9fb --card #fff --ink #0a0f1c --muted #6b7280/#9aa0ae
--blue #0a6cff → #3b5bff --navy #06142a
--radius 22/32/9999 --shadow / shadow-blue / shadow-float
Font: var(--font-primary) → Inter fallback (not loaded) + Instrument Serif italic accent
```

**Implication:** If you start landing development and import `css/style.css`, you will **instantly break the dark aesthetic** unless you reconcile. Decision required: keep dark premium (current) vs. migrate to Billow light.

### 4.3 Component styling highlights

- **Coins (6):** each `width 50 height 50` circle, staggered `translateY(6/2/0/1/3/6)` for wave, `::before` highlight, `::after` inset ring, `hover: translateY(-6px) rotateY(10deg) scale(1.05)`. JS float overrides via `requestAnimationFrame`.
- **Horizon:** absolute disc covering 184% width, `::before` 1.4px bright gradient line (`#F5E6FF→#FFF`) with `edgeGlow 3s`, `::after` 52px blur bloom `bloomPulse 4s`, `box-shadow inset 1px purple`.
- **Orbs:** three blurred blobs (`280/220/160px`) with `orbFloat1/2/3 9/11/13s`, `backdrop-filter` not used (filter blur 18px).
- **Bento cards:** `g-card`, `l-card`, `t-card`, `eco-card`, `co-card` all share `border 1px var(--border)`, `radius 14-18px`, `transition transform .3-.4s cubic-bezier(.16,1,.3,1)`, `hover translateY(-3/-4px) rotateX/Y 1-2deg`.
- **No utility framework:** pure vanilla CSS, BEM-ish but not strict, heavy use of IDs for JS hooks.

---

## 5. Interactivity & Motion — Full Inventory

All implemented **inline** in `<script>` (bottom of `index.html`, ~320 lines, 11 `addEventListener` calls). Nothing from `js/app.js` runs.

| Feature | Selector | Mechanism | Detail |
|---------|----------|-----------|--------|
| **Reveal on scroll** | `.reveal` (12 occurrences) | `IntersectionObserver threshold .14` → `.in` (opacity 0→1, Y 14→0, `.7s cb(.16,1,.3,1)`) | Applied to H1, coins, H2, h-stack, growth, quote, arch-head, testis, layers, ecosystem, connect, cta/faq. |
| **FAQ accordion** | `.faq-q` (4) | click → close all → toggle `parent .open` (single-open) | CSS: `.faq-a display none→block`, `.faq-q i rotate 45deg + blue`. |
| **Arch tabs** | `.arch-tab` (2) | click → remove `.active` → add | No content switch yet — visual only. |
| **H-stack scroll parallax** | `#hStackInner > .h-layer` (6) | `scroll` passive → compute `progress=(vh - top)/(vh+height)` → each layer `translateZ(i*10) translateY(off+progress*10)` | Subtle depth on metrics strip. |
| **Coins-mini float** | `#coinsMini` | `requestAnimationFrame 60fps` → `rotate(-7deg) translateY(sin(t)*4)` | Large bento card only. |
| **Magnet tilt** | `[data-tilt]` (~22 cards: g-card/t-card/l-card/eco/co) | `mousemove` → `perspective(1000) rotateX(-y*10) rotateY(x*14) translateY(-7) translateZ(18)` | Generic, overwrites inline transform. Disabled on touch via none (always active). |
| **Coins 3D tilt + float** | `.coin` (6) inside `#heroShell` mousemove + `#coinsRow` rAF | Combined: hero mousemove drives `translateY(-y*8+sin)*, translateX(x*6+offset), rotateY(x*8), rotateX(-y*4)` + auto-float `sin(t+i*0.7)*3`. Leaves on hover check. | Most complex — two loops fighting; mousemove wins when hovering. |
| **Horizon parallax** | `.horizon` + `.halo` | hero mousemove → `translateX(-50%) perspective(1000) rotateX(y*2) rotateY(x*3)` + halo `translateY(y*6)` | Minimal, tasteful. |
| **Orbs parallax** | `.orb-3d` (3) | mousemove → `translate3d(x*14*depth, y*10*depth, depth*8)` | Depth illusion. |
| **Particle field** | `canvas#particleCanvas` 42 particles | `DPR min(1.6)`, `rAF` update `x+=vx*z, y+=vy*z`, wrap edges, dual fill (core + outer glow), pairwise line if `dist<88` (`stroke alpha 0.07`, `lw 0.6`), canvas `translate3d(x*8, y*6)` on mousemove | Most expensive — O(n²) line checks (861 pairs/frame) but small n=42, okay. Resize handling present. |
| **Growth grid stagger** | `#growthGrid .g-card` | `IntersectionObserver .2` → on enter sequential `opacity 0→1` `translateY 12→0` staggered `i*70ms` then `unobserve` | Entrance choreography. |
| **Eco parallax** | `#ecoGrid .eco-card` | `scroll` passive → `translateY(sin(p*PI+i)*6)` | Gentle. |
| **Connect stacks float** | `#coStack1` / `#coStack2` | `rAF` → `rotateX(2+sin*1.5) rotateY(cos*2)` | Opposite phases. |
| **Magnet (general)** | `.magnet` | `.magnet{transition:transform .18s cb}` + JS above | Class only. |
| **Form submit** | `form#demo` | inline `onsubmit="event.preventDefault(); this.innerHTML='...You are on the list...'"` | No validation beyond `type="email" required`, no fetch. |
| **Smooth scroll** | `html{scroll-behavior:smooth}` | CSS + nav anchor hrefs (`#layers #proof #eco #faq`) | No JS needed. |

**Keyframes defined:** `orbFloat1/2/3`, `edgeGlow` (horizon), `bloomPulse`, plus implicitly via JS `requestAnimationFrame` floats. External CSS defines `pulse`/`orbit`/`float`/`float2`/`beam` but none run live.

---

## 6. Performance, Bundle & Runtime Cost

| Metric | Value | Notes |
|--------|-------|-------|
| **Total shipped bytes (live)** | `index.html` 57,925 + `logo.png` 16,592 = **~74.5 KB** (2 requests) + Google Fonts (Jakarta + JetBrains, 2 families, 400-800 weights, ~60-100 KB extra) + 3 Unsplash images (eco) + pravatar (quote) — **no self-hosting fallback** |
| **Inline CSS weight** | ~26 KB (`<style>` 778 lines extracted) |
| **Inline JS weight** | ~8 KB (script) |
| **External dead weight** | `css/style.css` 26 KB + `js/app.js` 2.1 KB not downloaded currently (good), but repo noise |
| **Fonts blocking?** | Google Fonts `<link>` in `<head>` (not `preconnect`/`preload`) — will block first paint slightly. Billow external file would add `Inter/Geist/Instrument Serif` (not loaded live). |
| **Images** | 1× logo (PNG 16 KB, not WebP/AVIF), 3× Unsplash `w=800&q=80` (heavy, remote, no `loading="lazy"`, no `srcset`), pravatar |
| **Particle cost** | 42 particles + 861 distance checks/frame + 2 fills/particle + line strokes — tested cheap on desktop, but **no `prefers-reduced-motion` check**, no `visibilitychange` pause, no DPR adaptation beyond 1.6. Will burn battery on mobile. |
| **Tilt cost** | ~22 `data-tilt` elements each with `mousemove` listener → ~22 listeners + horizon/hero listeners (3 mousemoves on `#heroShell`). Okay, but `mousemove` fires 60-120×/s — should be throttled via `rAF`. Currently not throttled (except h-stack scroll uses `requestAnimationFrame` indirectly). |
| **rAF loops** | 4 concurrent `requestAnimationFrame` loops (coinsMini, coinsRow, particle draw, connect stacks) + 1 scroll handler — all run forever, even offscreen. `IntersectionObserver` not used to pause offscreen canvases. |
| **LCP relevant** | Hero `h1` (text) + coins (CSS) + horizon (CSS) — LCP is fast (no hero image). Fonts are bottleneck. |
| **No code splitting** | Monolith — cannot lazy-load 3D or eco images without manual refactor. |

---

## 7. Issues, Tech Debt & Gaps (honest audit)

### Critical (fix before feature work)

1. **Monolith + dead files drift** — `css/style.css` and `js/app.js` describe a *different landing* (light Billow). New dev editing them will wonder why changes don’t appear. **Fix:** either delete them or (preferred) extract live inline CSS/JS into them so repo is truthful.
2. **Duplicate logo** — `logo.png` and `logo@2x.png` byte-identical but only `logo.png` is ever used. Waste + confusion. `logo@2x` not referenced via `srcset`.
3. **No build config** — `vite` installed but no `vite.config.js`, no `eslint`, no `prettier`, no `tsconfig`, no `tailwind.config`. `"serve": "npx serve . -l 3000"` is not a valid npm script (`npx` inside npm script is anti-pattern, should be `serve . -l 3000` with `serve` dep — which isn’t in deps). So `npm run serve` will fail.
4. **Missing `preconnect` for Google Fonts** — should add `<link rel="preconnect" href="https://fonts.googleapis.com">`.
5. **No reduced-motion respect** — `prefers-reduced-motion: reduce` media query absent, yet 7 motion systems run regardless. Accessibility fail (WCAG 2.3.3).
6. **Inline `onsubmit` handler** — `form#demo` uses HTML `on*` attribute (CSP unsafe, hard to test). Should move to `addEventListener` + real validation/fetch.
7. **`logo.png` is PNG — not optimized** — 16 KB for a simple mark; WebP would be ~4 KB. Also no `alt` consistency (some `alt="V"`, some `alt="VendorChain"`).

### High

8. **Orphan `plan.html` at root** — served at `https://…/plan.html` publicly exposing internal spec (with file paths like `/home/user/vendorchain.html` that are local). Either move to `docs/` or `noindex`.
9. **Unsplash hotlinks** — eco cards load `images.unsplash.com` directly; no control over cache, no fallback if rate-limited. Should be downloaded to `assets/`.
10. **Scroll listeners not throttled** — `h-stack`, `eco` scroll handlers are cheap but still run on every scroll. Particle + tilt mousemove even heavier.
11. **Mobile nav incomplete** — `.nav-links{display:none}` under 860px leaves only logo + spacer; no hamburger, no CTA. Hero `min-height:680px` is tall on small screens; coins `gap:-7px` overlaps cramped.
12. **`#demo` is a form with no `action` or `method`** — only JS swap; no progressive enhancement, no analytics event.

### Medium

13. **CSS specificity soup** — inline styles (`style="..."`) override tokens (e.g., nav mark `background:transparent`, coin label `transition-delay`), making theming via CSS variables harder.
14. **Z-index jungle** — `.hero-shell:before: z1`, `.horizon z1`, `.orbs z1`, `.nav z3`, coins z4, ctas z2/z3 — overlapping 1s, fragile.
15. **No `aria` on motion** — `canvas#particleCanvas` has no `role="img" aria-hidden="true"` (particles are decorative), coins have no labels.
16. **Mixed naming** — `.g-card` / `.l-card` / `.t-card` / `.eco-card` / `.co-card` (5 card families) with different radii/paddings — design token drift.
17. **`package.json` `type: module` but no `js` uses imports** — harmless but misleading (might break CJS if added).
18. **README inaccuracy** — claims folder structure with `vendorchain-frontend/`, `css/style.css` linked, `assets/Spline exports` — none true.

### Low / Future-proofing

19. No SEO structured data (`SoftwareApplication` + `FAQPage`), no `og:image`, no `twitter:card`, no `sitemap.xml`, no `robots.txt`.
20. No error boundary for canvas (`getContext('2d')` may return null on old browsers — script will throw).
21. No `loading="lazy"` on below-fold images (eco + avatar) — though unsplash images are large.
22. `plan.html` references `vendorchain.html` absolute path `/home/user/vendorchain.html` — broken link in deployed context.

---

## 8. Roadmap for Landing Page Development (what to do next)

You asked “I need to make some landing page development in this folder” — here’s a **pragmatic 3-lane roadmap** so you can pick what fits.

### Lane A — “Ship fast, keep dark premium” (1–2 days, recommended as starting point)

1. **Extract monolith → real files** (half day)
   ```bash
   # Create canonical files from inline blocks
   # 1. Copy <style> … </style> from index.html → css/style.css (overwrite)
   # 2. Copy <script> … </script> → js/app.js (overwrite)
   # 3. In index.html, replace <style> block with <link rel="stylesheet" href="./css/style.css">
   #    and bottom <script> with <script type="module" src="./js/app.js"></script>
   # Result: README becomes truthful, edits become modular.
   ```
2. **Fix dead-code drift** — reconcile `README`, `plan.html` links, duplicate logo:
   - `rm assets/logo@2x.png` or add `srcset`; move `plan.html → docs/plan.html`.
   - Add `vite.config.js`:
     ```js
     import { defineConfig } from 'vite';
     export default defineConfig({ server:{host:'0.0.0.0',port:5173}, preview:{host:'0.0.0.0',port:4173} });
     ```
   - Fix `package.json` → `"serve": "serve . -l 3000"` and add `serve` to devDeps or drop it.
   - Add `preconnect` for fonts + `display=swap` already implicit.
3. **A11y & perf pass** (half day)
   - Wrap all `rAF` + tilt in `if (!matchMedia('(prefers-reduced-motion: reduce)').matches)`.
   - Pause particle `rAF` on `document.hidden` / `IntersectionObserver` for `#particleCanvas`.
   - Add `loading="lazy"` to eco images + avatar; download unsplash to `assets/`.
   - Convert `form#demo onsubmit=` to `js/app.js` listener with `fetch` placeholder + success state.
   - Duplicate large `VENDORCHAIN` wordmark currently `color:#0F1116` on black — invisible by design (footer ghost text). Decide if intentional.
4. **Mobile nav** — add hamburger that toggles `.nav-links` drawer (or keep minimal but add CTA button visible on mobile).
5. **Deploy check** — `npm run dev` (Vite) + `python3 -m http.server 3000` both work; test at 360/768/1120/1440. Lighthouse goal 95+ perf (currently likely 85–90 due to fonts+unsplash).

### Lane B — “Add real features without full rewrite” (1 week)

- **Componentize sections** — optionally split `index.html` into partials via Vite `vite-plugin-handlebars` or just keep comments `<!-- SECTION: … -->` but organize `js/app.js` into modules (`reveal.js`, `tilt.js`, `particles.js`, `faq.js`).
- **Theme switcher** — introduce `[data-theme="light|dark"]` on `html`, keep both token sets, add toggle (useful for A/B — Billow light vs dark premium).
- **CMS-ready copy** — extract hard-coded text (hero h1, 6 layers, bento numbers) to `data/content.json` and render via small JS template so non-devs can edit copy without touching HTML.
- **Analytics** — wire `data-analytics` attributes + PostHog/GA4 events (`hero_view`, `layer_view_L1..L6`, `faq_open`, `waitlist_submit`).
- **Sections you likely want next:** pricing, partners logo marquee, integration logos (GST/PAN/bank, Syft, Cosign…), security/compliance badges, footer sitemap (Privacy/Security/Docs → real pages).

### Lane C — “Plan’s full 3D vision” (3–6 weeks, see `plan.html` §07)

Follows the spec literally: migrate to **Next.js 15 + `@react-three/fiber` + `drei` + `rapier` + `Spline`** (see plan’s 7 assets). Only do this if zero-trust storytelling *needs* depth — otherwise Lane A/B gives 80% of premium feel with 10% of cost. If you go Lane C, start from `index.html` static parity (Phase 1 in plan: 11–15 Aug) and gate 3D behind `?3d=1`.

---

## 9. How to Run / Edit Locally (today, before refactors)

```bash
# zero-install
python3 -m http.server 3000 --directory .   # open http://localhost:3000

# with Vite (already in package.json)
npm install         # installs vite ^5
npm run dev         # → http://localhost:5173 (host 0.0.0.0, preview-friendly)
npm run preview     # → http://localhost:4173 (prod preview)

# Preview deployed branch (this session)
# Arena shows LIVE PREVIEW once you start vite with --host 0.0.0.0
```

**Where to edit:**
- `index.html` line 11–239 → design tokens + layout (until extraction)
- `index.html` line ~540–775 → all JS behavior
- `assets/logo.png` → replace + re-export at 1×/2×; update all `.mark img` sizes if you change
- `plan.html` → read-only spec; don’t depend on it at runtime

---

## 10. Dependency & Supply-Chain Notes

- **Only production dep is Google Fonts** (runtime). `vite` is dev only. No `Three.js`, no `Spline`, no `Lottie` despite being mentioned in README/plan.
- **External images are runtime deps** — `images.unsplash.com` and `i.pravatar.cc` (both incur third-party cookie/CSP considerations). Consider self-hosting before launch.
- **No security-sensitive code** — `form#demo` does not POST anywhere; no `eval`, no `innerHTML` XSS beyond the success swap (which is innerHTML but static string, safe).

---

## 11. Checklist — Pick Your Next Actions

Reply with the letters you want, and I’ll execute them in this branch:

- **[A] Extract inline CSS/JS → `css/style.css` + `js/app.js`** and wire `index.html` (makes README truthful).
- **[B] Fix a11y & perf** — reduced-motion, rAF pausing, lazy images, preconnect, CSP-safe form.
- **[C] Mobile nav + CTA polish** — hamburger + responsive coin sizing.
- **[D] Componentize / add content.json** — make copy editable without touching HTML.
- **[E] Theme reconciliation** — keep dark vs. add light toggle.
- **[F] Start a new landing section** — tell me which (pricing / integrations / partners / security / blog teaser) and I’ll build it in the live dark system.

Default recommendation: **A → B → C**, then pick D/E/F for your product roadmap. Tell me “do A” (or “do A+B”, etc.) and I’ll push the commits to `arena/019fdc8b-landing-page`.

---
*Generated by deep static analysis (no runtime executed). All line numbers refer to current HEAD `0d42a7c` on `arena/019fdc8b-landing-page`.*
