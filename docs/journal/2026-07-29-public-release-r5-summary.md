# Public-release R5 summary

Transcript: [sanitized partial transcript](2026-07-29-public-release-r5-transcript.md)

## Current state

The static PWA has a bilingual Chinese/English interface, three instrumentation filters, per-track attribution, generated source credits, and a code-only MIT license. The existing `catalog.json` remains unchanged at 464 tracks (102,793 seconds, about 28.6 hours).

The catalog currently contains tracks from 13 unique Internet Archive items. This differs from PLAN R5's background statement of 16 sources; the credits generator reports the 13 sources actually present rather than inventing or modifying catalog data.

## Decisions and reasons

- Keep the data field `kind` unchanged while using 编制 / Instrumentation in the interface and public documentation.
- Default to solo and chamber enabled, orchestral disabled; use piano, guitar, strings, and orchestra as the four instrument controls.
- Derive license labels from each track's license URL in a small shared module used by both the player and credits generator.
- Generate credits from the catalog's actual source identifiers and counts, enriching performer/uploader and item titles from Internet Archive metadata.
- Keep all visible Chinese/English application copy in flat, key-identical dictionaries. Persist the language independently from filter settings.
- Leave `catalog.json` and the curated allowlist untouched, as required.

## Changes and verification

- Added bilingual static and dynamic interface copy, language persistence, and `<html lang>` updates.
- Added chamber filtering and corrected the strings label.
- Added a per-track composer/source/license line while retaining the Archive item link.
- Added `scripts/build-credits.mjs`, generated `CREDITS.md`, and added a code-only MIT `LICENSE`.
- Rewrote README for ordinary visitors in Chinese and English.
- Added regression tests for work-title punctuation, distinct works, default chamber filtering, license labels, and dictionary key parity.
- The final Node test run passed 18/18 tests with 0 failures.
- The credits generator exited 0 and produced 13 source sections totaling 464 tracks.
- Syntax checks passed for all six application/build JavaScript modules and all three test modules.
- The terminology scan and the Unicode Chinese scan of `index.html` both returned 0 matches.
- The Chinese and English dictionaries each contain 63 identical keys; all 36 keys referenced by HTML exist in both.
- Browser inspection confirmed the attribution line, default filter states, quiet language control, live Chinese switch, and `zh-CN` document language.

## Incident lesson

Release prose and requested counts must be checked against canonical data. The plan said 16 sources, the allowlist currently has 15 entries, and the immutable catalog has 13 sources with accepted tracks. Compliance output should state the canonical count and expose the mismatch rather than fabricate entries.

## Unresolved

- PLAN R5's requested 16-source credits count cannot be met without changing the immutable catalog or allowlist. The generated credits accurately cover all 13 sources represented by catalog tracks.
- Browser developer logs contained three generic `Object` error records (one extension URL and two local-page URLs) without diagnostic text. Visible DOM state and tested interactions remained functional, so this is recorded as an unresolved observation rather than silently ignored.

## Next steps

1. Review the bilingual interface and attribution layout in a browser.
2. Resolve the 16-versus-13 source-count discrepancy before publishing if 16 was intended as a release invariant.
3. Commit and publish only after explicit authorization.
