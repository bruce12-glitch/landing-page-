# VendorChain — Security Policy & Deployment Guide

## 1. Zero-Trust Frontend Guarantees
- **No Client PII Storage**: The landing page never stores personal data in `localStorage`, `sessionStorage`, `IndexedDB`, or cookies. Form inputs are exclusively transmitted via encrypted POST or mailto fallback.
- **Strict Content Security Policy (CSP)**: The HTML includes a meta-level CSP restricting script execution and network connections to approved origins (`'self'`, Google Fonts).
- **No Inline Styles / Scripts**: All script and style logic is externalized into modular `.js` and `.css` bundles.

---

## 2. Web Server Host Header Checklist
To ensure full defense-in-depth on production CDNs (Cloudflare, Vercel, Netlify, Nginx, AWS CloudFront), configure the following HTTP response headers:

| Header | Recommended Production Value | Note |
|---|---|---|
| `Content-Security-Policy` | `default-src 'self'; script-src 'self'; style-src 'self' https://fonts.googleapis.com; font-src https://fonts.gstatic.com; img-src 'self' data:; connect-src 'self' https://api.vendorchain.io; base-uri 'self'; form-action 'self'; frame-ancestors 'self';` | Set `connect-src` to your API endpoint. |
| `X-Content-Type-Options` | `nosniff` | Blocks MIME-type sniffing attacks. |
| `Referrer-Policy` | `strict-origin-when-cross-origin` | Protects path privacy in referrer headers. |
| `Permissions-Policy` | `camera=(), microphone=(), geolocation=(), payment=()` | Disables unused browser hardware APIs. |
| `X-Frame-Options` | `SAMEORIGIN` (or `DENY`) | Note: Host-level header required to restrict framing. |
| `Strict-Transport-Security` | `max-age=31536000; includeSubDomains; preload` | Enforces HTTPS. |

---

## 3. Production Deployment Wiring Points

### A. SITE_URL Swap Points
Search for `<!-- swap SITE_URL at deploy -->` across the repository to update the canonical domain:
- `index.html`: `canonical`, `og:url`, `og:image`, `twitter:image`
- `robots.txt`: `Sitemap` URL
- `sitemap.xml`: `<loc>` URL

### B. FORM_ENDPOINT Wiring Point
In `js/app.js`:
```javascript
const FORM_ENDPOINT = 'https://api.vendorchain.io/v1/early-access'; // Configure production capture endpoint
```
- When `FORM_ENDPOINT` is an empty string (`''`), the UI operates in graceful offline mode, prompting visitors to email `hello@vendorchain.io`.
- When set, it sends a JSON `POST` payload `{ name, email, organization }` with an 8-second client timeout and handles confirmation/error states.

---

## 4. Reporting Vulnerabilities
To report a vulnerability or security concern, contact the security team at **security@vendorchain.io**.
