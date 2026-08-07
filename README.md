# VendorChain - 3D Premium Landing (Frontend)

**Zero-Trust B2B Vendor Verification** — premium dark landing for the VendorChain Trust Network. Every vendor, every build, every deploy — proven, not presumed.

> **Live server:** `npm run dev` → http://localhost:5173 (Vite, HMR, host `0.0.0.0` for preview). Also works with `python3 -m http.server 5173`.

### Folder structure (modular — fixed 07 Aug 2026)
```
landing-page-/                # repo root = site root
├── index.html                # landing (links to css/js, no inline style/script)
├── css/
│   └── style.css             # dark premium tokens + all components (30 KB)
├── js/
│   └── app.js                # reveal, FAQ, tilt, particles, form, nav (18 KB, type=module)
├── assets/
│   ├── logo.png              # 1x mark (used everywhere)
│   └── logo@2x.png           # 2x via srcset
├── docs/
│   └── plan.html             # full 3D motion implementation plan (spec)
├── plan.html                 # same spec at root (kept for backward compat)
├── vite.config.js            # Vite 5 — host 0.0.0.0 + allowedHosts + CORS for preview
└── package.json              # vite ^5 only
```

### Design system (live)
- **Tokens:** `--bg #050507`, `--card #0F1116/#12141C`, `--border #1D222E`, `--blue #3B5BFF`, `--purple #7C3AED`, `--radius 22/28`, `Plus Jakarta Sans + JetBrains Mono`
- **Hero:** `hero-shell` with horizon arc (184% disc + edgeGlow + bloom), 3 blurred orbs, 42-particle canvas, 6 metallic coins with 3D float + tilt
- **Sections:** bento growth grid, testimonials, 6 layers, ecosystem (3 cards), connect (2 stacks), CTA + FAQ + footer
- **Motion:** CSS `preserve-3d` + `perspective` + canvas 2D — no heavy WebGL; respects `prefers-reduced-motion`, pauses when tab hidden/offscreen, rAF-throttled tilts

### Fixes shipped 07 Aug 2026 (all 22 audit issues)
- ✅ Extracted inline `<style>`/`<script>` → `css/style.css` + `js/app.js` and wired via `<link>`/`<script type=module>`
- ✅ `vite.config.js` with `host 0.0.0.0`, `allowedHosts: true`, `cors` — preview works on `*.e2b.app`
- ✅ `package.json` `serve` fixed → `vite preview`
- ✅ `preconnect` for Google Fonts (2 hints) + `display=swap`
- ✅ `prefers-reduced-motion` media query + JS guard (particles/hovers/pauses hidden)
- ✅ Removed inline `onsubmit` → CSP-safe form with validation, toast, `aria-invalid`
- ✅ `logo@2x` now used via `srcset` (`1x, 2x`)
- ✅ Mobile nav: hamburger + drawer (`#mobileDrawer`) with focus trap, ESC to close, CTA visible
- ✅ Scroll/mousemove throttled via `requestAnimationFrame`; particles paused when offscreen/hidden
- ✅ `loading="lazy"` + `decoding="async"` on all below-fold images, `referrerpolicy` on unsplash, proper `alt`
- ✅ Canvas `getContext` null guard, `skip-link`, `aria` on FAQ/tabs/coins, `role` on nav/dialog
- ✅ `docs/plan.html` copy + root `plan.html` kept; README now truthful

### Run locally
```bash
npm install
npm run dev      # Vite dev — http://localhost:5173 (HMR)
npm run preview  # Vite preview of built site — http://localhost:4173
# or zero-install:
python3 -m http.server 5173 --bind 0.0.0.0
```

### Edit
- `index.html` → copy/content, sections, IDs
- `css/style.css` → tokens, layout, responsive, reduced-motion
- `js/app.js` → interactions (all modules in one file, split if it grows)

To add real 3D: drop Spline `.splinecode` into `assets/` and replace `.stage-inner` or coin visuals with `<canvas>` / `<spline-viewer>`.

### Deploy
Static — works on Vercel / Netlify / Cloudflare Pages. Just upload this folder. `vite preview` and `vite build` (if you add a build step) both serve the same static output.

---
(c) 2026 VendorChain Labs — Built from Billow design system. Analysis at `ANALYSIS.md`.
