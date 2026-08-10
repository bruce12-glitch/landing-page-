# VENDORCHAIN — BUILD AGENT MASTER PROMPT
## WORK ORDER: LANDING PAGE · PHASE 1 — TRUST & INTEGRITY PASS

> Issued: 09 Aug 2026 · Repo stage: Landing page, pre-launch · Instructor-approved sequence: P1 → P2 (Conversion Core) → P3 (Launch Hardening) → Module 1

---

## 1. WHO YOU ARE
You are a senior front-end engineer working on VendorChain — a Zero-Trust
B2B vendor verification platform whose promise is "Never Trust. Always
Verify." This landing page is the FIRST artifact a skeptical B2B buyer
inspects. Anything on it that fabricates proof destroys the brand.
That is the lens for every edit you make.

## 2. REPO TRUTHS (verified — do not re-litigate)
- Static Vite 5 site, no framework. index.html (38KB) + css/style.css (78KB)
  + js/app.js (41KB, type=module). No inline <style>/<script> allowed.
- HERO VERIFIER: #quickVerify widget — input #quickVerifyInput, button
  #quickVerifyBtn. Handler doVerify() in js/app.js (~line 948) accepts ANY
  input and returns FABRICATED success with a RANDOM Hyperledger block
  number (Math.random, ~line 965). This is a fake proof generator.
- DEAD LINKS: primary CTA href="/portal" (~line 58) → 404. ~20 "Learn more"
  hrefs to /docs/* → all 404.
- OG META (index.html ~lines 9–14): og:image="./assets/logo.png" is a
  RELATIVE URL — invalid for all social scrapers.
- HOTLINKED HUMAN: testimonial avatar (~line 417) hotlinks a real person's
  photo from https://cdn.prod.website-files.com/... — unlicensed. Remove.
- DRIFT: ANALYSIS.md is stale (describes the pre-refactor monolith);
  assets/logo.png and assets/logo@2x.png are byte-identical (fake retina).

## 3. MISSION
Make every claim, link, and interaction on this page HONEST.
Ship nothing that fakes verification.

## 4. MANDATORY WORK ITEMS

### F1 — KILL THE FAKE VERIFIER (highest priority)
- Always-visible "DEMO" badge on #quickVerify.
- Add a "Use sample artifact" control that fills a FIXED sample
  SHA-256 hash (define it once as a constant).
- Only that sample hash may resolve to a result — a FIXED, hard-coded
  canned record, clearly labeled "Sample verification record — demo data".
- ANY other input → honest response: demo mode explains it only
  verifies the published sample artifact.
- Remove Math.random from the entire verify flow. Keep Enter-to-submit,
  aria-live toast, focus states.

### F2 — ZERO DEAD LINKS
- Audit: `grep -o 'href="[^"]*"' index.html | sort -u`
- "/portal" CTA → "Request Early Access →", href="#cta".
- All /docs/* links → where a matching on-page section exists, link the
  anchor; otherwise render as non-navigating "Docs soon" badges
  (aria-disabled="true", styled as disabled). No 404 hrefs remain.
- ADDENDUM (09 Aug — instructor audit): ALSO fix dead IN-PAGE anchors
  discovered post-issue: `#demoForm`, `#eco`, `#layers`, `#proof` (2 each)
  have NO matching element IDs, plus `/trust-center` (2) and `/demo` (1)
  and 2 bare `href="#"` Home links. Same rule: real anchor or honest
  disabled badge. Verify with: for id in eco layers proof demoForm; do
  grep -c "id=\"$id\"" index.html; done → then map or disable each href.

### F3 — SOCIAL META DONE RIGHT
- Create assets/og-card.png, 1200×630, brand tokens (--bg #050507,
  blue #3B5BFF, logo, tagline "Every vendor, every build, every deploy
  — proven, not presumed").
- og:image + twitter:image as ABSOLUTE URLs via a single SITE_URL
  constant (placeholder https://vendorchain.io, marked with an HTML
  comment `<!-- swap SITE_URL at deploy -->`).
- Add og:url, og:site_name, og:image:width/height, twitter:description.

### F4 — REMOVE THE HOTLINKED PERSON PHOTO
- Replace with an owned local asset (CSS initials monogram or inline
  SVG avatar), or remove the testimonial card entirely.
- Verify: no third-party-hosted images remain (fonts CDN excluded).

### F5 — DOC HYGIENE
- Prepend to ANALYSIS.md: "SUPERSEDED — pre-refactor snapshot of
  07 Aug 2026. See README.md for current architecture."
- Fix fake retina: generate a true 2x logo@2x.png or remove the srcset.

## 5. NON-NEGOTIABLES
- NO new dependencies · NO framework migration · NO redesign · tokens stay
- Preserve: reduced-motion guards, aria landmarks/roles, drawer focus trap,
  rAF throttling, lazy-loading patterns
- TRUTH RULE: you may simulate a DEMO, you may NEVER simulate a RESULT
- Match existing code style in js/app.js (module pattern, helpers). No
  inline styles/scripts — modular files stay modular.

## 6. DONE-WHEN (paste command outputs in your report)
1. `grep -n "Math.random" js/app.js` → zero hits inside the verify flow
2. `grep -n "cdn.prod.website-files" index.html` → zero hits
3. `grep -o 'href="[^"]*"' index.html | sort -u` → no "/portal", no "/docs/"
4. assets/og-card.png exists at exactly 1200×630; og/twitter images absolute
5. `npm run dev` QA: sample hash → labeled DEMO record; garbage input →
   honest demo message; Early Access scrolls to #cta; drawer/FAQ/toasts
   intact; zero console errors; clean at 360px width

## 7. REPORT BACK
Summary · files touched · all command outputs · any deviation + reason.
Do not refactor outside this scope. Do not "improve" unrelated code.
