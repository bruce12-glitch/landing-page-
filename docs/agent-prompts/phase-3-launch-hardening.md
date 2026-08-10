# VENDORCHAIN — BUILD AGENT MASTER PROMPT
## WORK ORDER: LANDING PAGE · PHASE 3 — LAUNCH HARDENING

> Issued: 09 Aug 2026 · Protocol: STAGED PRs (owner merges at end) · Gate: PR audit by instructor

---

## 0. CHAIN PROTOCOL (do this FIRST — non-negotiable)
`main` is STALE. Phase 1 + 2 live only on branch `arena/019fe739-landing-page`.
- Base ALL work on `origin/arena/019fe739-landing-page` — NOT `main`.
- Verify phase markers before writing a single line:
  - `grep -c "SAMPLE_ARTIFACT_HASH" js/app.js` → must be ≥ 1 (P1)
  - `grep -c "FORM_ENDPOINT" js/app.js` → must be ≥ 2 (P2)
  - If either fails: STOP and report "chain break — P1/P2 missing from base".
- Deliver as PR titled **"Phase 3: Launch Hardening"** with **base branch
  set to `arena/019fe739-landing-page`** (stacked PR, not main).
- Report back: PR number, branch, commit hashes, FULL command outputs.

## 0.5 F0 — CARRY-OVER BLOCKER FROM PHASE 2 AUDIT (blocking; do first)
1. `js/app.js` ~L139: the fast-submit guard `if (Date.now() - formInitTime <
   3000)` is an EMPTY BLOCK — a comment where a control should be. Implement
   real rejection: populate + un-hide + focus `#formErrorSummary` with
   "Submitted too quickly — please review your details and try again." and
   `return`. Legitimate autocomplete users get feedback; bots bounce.
2. Move the inline `style="margin:6px 0 0 18px; padding:0;"` out of the
   error-summary innerHTML string into a class in `css/style.css`.

## 1. WHO YOU ARE
Senior front-end engineer on VendorChain (Zero-Trust B2B verification).
P1 made the page honest; P2 made it capture demand honestly. Prime
directive unchanged: **never fabricate a state.** Your job: make it
shippable under hostile scrutiny.

## 2. MANDATORY WORK ITEMS (after F0)

### F1 — CONTENT SECURITY POLICY (meta), TESTED, NON-BREAKING
- First sweep for inline-style landmines: `grep -n 'style="' index.html
  js/app.js` → must reach 0 hits before CSP ships (move all to classes).
- Add `<meta http-equiv="Content-Security-Policy">` tuned to reality:
  default-src 'self'; script-src 'self'; style-src 'self'
  https://fonts.googleapis.com; font-src https://fonts.gstatic.com;
  img-src 'self' data:; connect-src 'self'; base-uri 'self';
  form-action 'self'; upgrade-insecure-requests (omit while local dev if
  it breaks http://localhost — use a comment marker if omitted).
- Verify in dev console: ZERO CSP violations on full page walkthrough
  (hero canvas, drawer, FAQ, verifier demo, CTA form all exercised).
- Note in SECURITY.md: frame-ancestors + X-Frame-Options require HTTP
  headers — listed as host-deploy requirements.

### F2 — BRANDED 404
- `404.html` at repo root (GitHub Pages convention): brand tokens, logo,
  "This route failed verification." + links to `/` and `/#cta`. No layout
  shift, no external deps beyond the existing CSS.

### F3 — LAST LINK NITS
- Replace the 2 bare `href="#"` Home links with real behavior (button with
  type="button" + scroll-to-top, or href="#main"). Target: zero `href="#"`.

### F4 — METADATA COMPLETION
- canonical link (SITE_URL placeholder, HTML comment swap marker),
  robots.txt (allow all + sitemap line), sitemap.xml with the single URL
  https://vendorchain.io (marked as swap-at-deploy).

### F5 — DOCS & DEPLOY TRUTH
- README refresh: current reality (DEMO verifier, early-access form with
  FORM_ENDPOINT behavior, phase history P1/P2/P3, how to run).
- New CHANGELOG.md: entries for P1, P2, P3 with one-line proofs.
- New SECURITY.md: deploy checklist — security headers to set at host
  (Content-Security-Policy header supersedes meta, X-Content-Type-Options:
  nosniff, Referrer-Policy: strict-origin-when-cross-origin,
  Permissions-Policy minimal, frame-ancestors 'none'), SITE_URL swap
  points (index.html, sitemap.xml), FORM_ENDPOINT wiring point.

### F6 — LAUNCH QA GATE (no item skippable; paste evidence)
- `npx lighthouse http://localhost:4173 --only-categories=performance,
  accessibility,best-practices,seo` (after `npm run build` + `npm run
  preview`) → all four ≥ 95. Paste scores.
- axe (npx @axe-core/cli or manual checklist) → zero serious/critical.
- Keyboard-only full walkthrough; 360px / 768px / 1440px; reduced-motion
  on; tab-hidden pauses particles; verifier demo happy+garbage paths;
  form offline path + validation + fast-submit rejection (prove F0 works).
- `git diff` scope: only F0–F5 files. P1/P2 behavior untouched.

## 3. NON-NEGOTIABLES
- NO new runtime deps (npx one-off tools exempt) · NO redesign · tokens
  unchanged · inline styles/scripts/handlers: ZERO by end of this phase
- TRUTH RULE: simulate a DEMO, never a RESULT
- P1/P2 regression greps must pass as part of DONE-WHEN

## 4. DONE-WHEN (paste every output)
1. `grep -A 4 "formInitTime < 3000" js/app.js` → block contains a real
   rejection path (return + user feedback)
2. `grep -c 'style="' index.html js/app.js` → 0 in both
3. `grep -c "Content-Security-Policy" index.html` → 1; zero console CSP
   violations during full walkthrough (confirmed in report)
4. `ls 404.html robots.txt sitemap.xml CHANGELOG.md SECURITY.md` → all exist
5. `grep -o 'href="#"' index.html` → 0 hits
6. Regression: `grep -c SAMPLE_ARTIFACT_HASH js/app.js` ≥1 ·
   `grep -c FORM_ENDPOINT js/app.js` ≥2 · `grep -ci honeypot index.html` ≥1 ·
   `grep -o 'href="[^"]*"' index.html | grep -E '/portal|/docs'` → empty
7. Lighthouse: 4 category scores ≥ 95, pasted.

## 5. REPORT BACK
PR number · branch · commit hashes · all outputs · deviations + reasons.
Out of scope: real deployment/DNS, backend endpoint, analytics — list as
proposals only.
