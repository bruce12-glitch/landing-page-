# VendorChain — Zero-Trust OS (Frontend)

**Zero-Trust B2B Vendor Verification Platform** — premium dark landing page for the VendorChain Trust Network. *"Every vendor, every build, every deploy — proven, not presumed."*

> **Live Dev Server:** `npm run dev` → http://localhost:5173 (Vite 5, host `0.0.0.0` for preview proxy).  
> **Production Preview:** `npm run build && npm run preview` → http://localhost:4173.

---

## 1. Project Architecture
```
landing-page-/                # Repo root / site root
├── index.html                # Landing page (zero inline styles/scripts, CSP enabled)
├── 404.html                  # Branded Zero-Trust error page (uses shared CSS tokens)
├── robots.txt                # Search crawler instructions + sitemap reference
├── sitemap.xml               # Canonical XML sitemap
├── css/
│   └── style.css             # Dark premium tokens, bento grids, accessible components
├── js/
│   └── app.js                # Interactions, verifier demo, early-access capture pipeline
├── assets/
│   ├── logo.png              # 1x brand mark (168×169)
│   ├── logo@2x.png           # True 2x retina brand mark (336×338)
│   └── og-card.png           # 1200×630 OpenGraph / Twitter social card
├── CHANGELOG.md              # Detailed phase changelog with verification proofs
├── SECURITY.md               # Security policy, CSP documentation, and host header guide
├── vite.config.js            # Vite 5 configuration with host 0.0.0.0 & CORS for preview
└── package.json              # Scripts: dev, build, preview, serve
```

---

## 2. Core Interactive Systems

### A. Artifact Verifier (`#quickVerify`)
- **Truth Rule**: Never fakes verification results or generates random block IDs.
- **Labeled DEMO**: Always-visible cyan `DEMO` badge with indicator pulse.
- **Published Sample Artifact**: Clicking **"Use sample artifact"** fills the canonical SHA-256 hash (`e3b0c442...b855`) and renders a hardcoded demo verification record (`✓ Sample verification record — demo data...`).
- **Honest Fallback**: Any other input displays an honest demo explanation toast explaining that live validation is limited to the published sample artifact.

### B. Early Access Capture Pipeline (`#cta`)
- **Accessible Form**: Full Name, Work Email, and Company fields with real `<label>`s, autocomplete tokens (`name`, `email`, `organization`), `aria-invalid`, `aria-describedby`, and a focusable `role="alert"` error summary.
- **Bot & Spam Protection**: Hidden honeypot field (`tabindex="-1"`, `aria-hidden="true"`, CSS off-screen) plus a 3-second minimum submit guard.
- **Submission Pipeline**:
  - `FORM_ENDPOINT = ''`: Operates in an honest offline state displaying a direct `mailto:hello@vendorchain.io` recovery path. Never fakes success.
  - `FORM_ENDPOINT = 'https://...'`: Issues a JSON `POST` request with an 8-second `AbortController` timeout and renders a focused confirmation state on 2xx.
- **Zero PII Storage**: Never writes personal data to `localStorage`, `sessionStorage`, cookies, or browser storage.

---

## 3. Phase History

- **Phase 1 (Trust & Integrity Pass)**:
  - Eliminated fake proof generators and randomized block numbers.
  - Resolved all dead `/portal` and `/docs/*` 404 links.
  - Generated true 2x retina logo and 1200×630 OpenGraph social card.
  - Replaced hotlinked third-party images with local CSS monograms and inline SVGs.
- **Phase 2 (Conversion Core)**:
  - Built accessible Early Access capture form in `#cta`.
  - Implemented honest `FORM_ENDPOINT` pipeline and CTA focus discipline.
  - Added trust microcopy pledge.
- **Phase 3 (Launch Hardening)**:
  - Implemented 3-second fast submit control with error summary focus.
  - Swept all inline `style="..."` attributes to 0 in markup and scripts.
  - Enforced strict meta Content Security Policy (CSP).
  - Created branded `404.html`, `robots.txt`, `sitemap.xml`, `CHANGELOG.md`, and `SECURITY.md`.

---

## 4. Local Development & QA
```bash
npm install
npm run dev        # Vite dev server on http://localhost:5173
npm run build      # Vite production build to dist/
npm run preview    # Preview built production site on http://localhost:4173
```

---
© 2026 VendorChain Labs — Zero-Trust B2B Vendor Verification Platform.
