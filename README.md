# VendorChain - 3D Premium Landing (Frontend)

**Zero-Trust B2B Vendor Verification** - premium landing built on Billow's design system, with no devops dumps.

> Live preview runs from this folder via the live server (see below).

### Folder structure
```
vendorchain-frontend/
 index.html # Premium 3D landing (modular, links to css/js)
 plan.html # Full 3D motion + implementation plan
 css/
 style.css # Extracted Billow tokens + 3D stage styles
 js/
 app.js # Reveal, FAQ, 3D tilt + parallax
 assets/ # Put images / Spline exports / Lottie here
```

### Design
- **System:** Billow tokens preserved (`#fcfcfd`, `#0a6cff -> #3b5bff`, `Inter + Geist + Instrument Serif`, `22px/28px` radii, soft shadows, blurred pill nav)
- **Premium 3D:** CSS `preserve-3d` hero stage with orbiting rings, floating glass shield + 4 minis, depth-hover on 6 layer cards - no heavy WebGL required
- **Content:** 6 layers rewritten benefit-first (no Syft/Cosign/Rego blocks on surface)

### Run locally
```bash
# Option 1 - Python (zero install)
python3 -m http.server 3000 --directory vendorchain-frontend
# then open http://localhost:3000

# Option 2 - Node serve
npx serve vendorchain-frontend -l 3000
```

### Edit
- `index.html` -> copy/content
- `css/style.css` -> tokens, 3D stage, cards
- `js/app.js` -> interactions

To add real 3D: drop Spline `.splinecode` into `assets/` and replace `.stage-inner` with `<canvas>` or `<spline-viewer>`.

### Deploy
Static - works on Vercel / Netlify / Cloudflare Pages. Just upload this folder.

---
(c) 2026 VendorChain Labs Built from Billow design system `vendorchain.html` is the single-file alternative at repo root.
