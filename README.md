# VendorChain — The Trust Network for Zero-Trust Supply Chains

**Never trust. Always verify. Continuously monitor.**

VendorChain eliminates assumed, static trust in B2B vendor relationships: vendors are continuously authenticated, software builds are validated via CycloneDX SBOMs and Cosign signatures, and tamper-proof audit trails are anchored to Polygon L2.

> **Stack:** Vite 5 · CSS3 3D Hardware Accelerated · TypeScript/ESM · Zero-Dependency Runtime · 100% Strict Content Security Policy

---

## 🚀 Overview & Structure

This repository contains the standalone, high-performance **VendorChain Enterprise Marketing & Discovery Portal**.

```
landing-page-/
├── index.html        # High-tech dark UI (12 interactive sections, WCAG 2.1 AA)
├── 404.html          # Branded Zero-Trust error page
├── css/
│   └── style.css     # Design tokens, GPU-accelerated 3D perspective transforms, aurora glows
├── js/
│   └── app.js        # 60fps rAF motion engine, interactive 3D card tilts, demo verifier
├── assets/
│   ├── logo.png      # 1x brand mark
│   ├── logo@2x.png   # 2x high-DPI retina mark
│   └── og-card.png   # 1200×630 OpenGraph / Twitter social card
├── robots.txt        # Search engine discovery configuration
├── sitemap.xml       # Canonical XML sitemap
├── vite.config.js    # Optimized production bundler with strict headers
├── SECURITY.md       # Security policy and vulnerability disclosure protocol
└── CHANGELOG.md      # Version history and release notes
```

---

## ⚡ Performance & Zero-Trust Invariants

1. **60FPS Hardware Acceleration:**
   - Single-pass, throttled `requestAnimationFrame` motion engine with cached geometry bounds.
   - GPU-composited 3D perspective tilt (`--rx`, `--ry`) and dynamic specular lighting aura (`--mx`, `--my`).
   - Zero layout thrashing, zero memory leaks.
2. **Strict Content Security Policy:**
   - 100% compliant with `<meta http-equiv="Content-Security-Policy">`.
   - Exactly **0 inline styles** (`grep -c 'style="' index.html js/app.js` → `0`).
3. **Honest Conversion & Verifier:**
   - 3-second anti-bot minimum submission threshold + honeypot spam protection.
   - Zero plaintext PII persisted to browser storage.
   - Transparent, explicitly labeled demo verifier against authentic SHA-256 artifacts.
4. **Full Accessibility (WCAG 2.1 AA):**
   - Skip-to-content link, ARIA attributes (`aria-expanded`, `aria-selected`, `aria-invalid`), reduced-motion mode (`prefers-reduced-motion: reduce`).

---

## 🛠️ Local Development & Production Build

### Run Development Server
```bash
npm install
npm run dev
# Live preview starts on http://localhost:5173 (0.0.0.0 host for sandbox proxy)
```

### Production Build
```bash
npm run build
# Compiles minified bundle into dist/ in < 200ms
```

### Production Preview
```bash
npm run preview
# Serves dist/ on http://localhost:4173
```
