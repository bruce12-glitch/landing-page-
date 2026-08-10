# VENDORCHAIN — M1-S3 · CLOSURE PROMPT (end-of-day fix pass)
> Issued: 09 Aug 2026, evening · Scope: close the M1-S3 audit findings. NO new features.

---

## CONTEXT (verdict: FIX REQUIRED — commit/worktree drift)
Instructor audit of `c3ba63b`: `platform/src/lib/storage/` is UNTRACKED
in git — 4 tracked files import it (`bytes/route.ts`, `documents/route.ts`,
`worker.ts`, `storage-bytes.test.ts`), so clean clones fail 5 test suites
and the production build. All TRACKED code passed review. This prompt
closes exactly that + one hygiene decision. NOTHING else changes.

## WORK (in order — no reordering)
1. COMMIT THE MISSING LAYER
   `git add platform/src/lib/storage/` (entire directory) →
   commit: "fix(m1-s3): commit untracked storage driver layer (audit drift)"
2. DRIFT SWEEP
   `git status --porcelain` MUST print empty before you finish.
   - Source files untracked → add them (evaluate each).
   - Secrets (/\.env), generated encrypted-doc output (platform/storage/),
     node_modules, dist, .next → DO NOT add; instead ensure .gitignore
     covers them (add the platform/storage/ + .env ignore rules and
     commit those rule changes if missing).
   State every sweep decision in the report.
3. TESSERACT DECISION — pick ONE, implement it, state it in report:
   (a) WIRE IT: use tesseract.js in extractor.ts image branch for real
       image OCR → regenerate + commit package-lock.json; OR
   (b) REMOVE IT: `npm uninstall tesseract.js`, commit lockfile, and add an
       explicit README section: "Image documents: no OCR in Slice 3 —
       they route to FLAGGED for manual review. Real image OCR lands in
       Slice 4. PDF text-layer extraction is the primary path." (Honesty
       requirement: no silent gaps.)
4. CLEAN-REF REPRODUCTION (this makes your evidence admissible):
   ```
   rm -rf /tmp/vc-clean && mkdir -p /tmp/vc-clean
   git archive HEAD | tar -x -C /tmp/vc-clean
   cd /tmp/vc-clean/platform
   npm ci
   cp .env.example .env
   npm test
   npm run build
   git ls-tree -r HEAD --name-only platform/src/lib/storage/
   ```
   Run tests/build ONLY in /tmp/vc-clean — never your working tree.
5. REGRESSION GUARD
   Zero carets in platform/package.json runtime deps (keep closed);
   landing root files untouched; all prior invariants intact.

## DONE-WHEN (paste every output — all from the CLEAN extracted ref)
A. `git status --porcelain` → empty output pasted (proves no lint drift)
B. `git ls-tree -r HEAD platform/src/lib/storage/` → every storage file
   listed (factory, interface, drivers)
C. `npm test` (clean ref) → ALL suites green, ≥44 tests — paste counts
D. `npm run build` (clean ref) → "✓ Compiled successfully", exit 0
E. Tesseract decision: (a) wired — new image-OCR test passes — or
   (b) removed — README section text pasted + lockfile committed
F. New commit hash

## HARD RULES
No scope additions · no new deps · no landing-file edits · TRUTH RULE ·
if clean-ref tests fail for anything OTHER than the storage import,
STOP and report the failure verbatim — do not "fix" silently.

## REPORT BACK
Commit hash · porcelain · ls-tree · clean-ref test+build tails ·
tesseract decision + evidence. This is the final gate of Module 1's
feature work — make it boring.
