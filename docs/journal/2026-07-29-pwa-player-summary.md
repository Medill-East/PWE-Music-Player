# PWA player curated-catalog and filters summary

Transcript: [sanitized partial transcript](2026-07-29-pwa-player-transcript.md)

## Current state

The static PWA player now uses a fixed 12-item, human-verified Internet Archive whitelist instead of metadata search. A live rebuild on 2026-07-29 generated 553 licensed tracks from all 12 sources.

The player filters by texture, instrument, and historical-recording status. Defaults favor background listening: solo enabled, orchestral disabled, all instruments enabled, and 78 rpm historical recordings disabled.

## Decisions and reasons

- Treat the whitelist as the content-quality boundary. Archive metadata heuristics repeatedly admitted field recordings, audiobooks, stock music, and misleading titles.
- Keep the license, `VBR MP3`, and 60-second-to-25-minute checks as upstream-change safeguards.
- Keep `Unknown` composer tracks because every included item has already received content review.
- Apply filters before played-history and bad-track exclusions. Played history remains global across filter changes.
- Do not interrupt the current track when filters change. Clear any preloaded next track so the next selection respects the new filters.
- Distinguish a filter with zero matching tracks from a matching catalog whose tracks have all been played or marked bad.
- Persist filter choices in `localStorage`; keep playback functional if storage is unavailable.

## Changes and verification

- Replaced composer searches, caps, seed expansion, and identifier-prefix blocking with the exact 12-item `CURATED` whitelist.
- Added `kind`, `instrument`, and `historical` to every generated track and a dynamically counted top-level `facets` object.
- Changed the warning target to 500 while preserving a successful write and exit below target.
- Added accessible native checkbox groups using `fieldset` and `legend`.
- Added pure, exported `matchesFilter` and `getPoolStatus` functions plus filtered next-track selection.
- Added seven player-filter tests and updated catalog tests for the whitelist behavior.
- RED verification failed on the missing new exports. The final test run passed 13/13.
- `node scripts/build-catalog.mjs` exited 0 and generated 553 tracks.
- Catalog validation found 12/12 sources, zero invalid tracks, and these facets:
  - kind: solo 523, orchestral 30
  - instrument: piano 464, guitar 34, lute 25, orchestra 30
  - historical: false 529, true 24
- `node --check` passed for `app.js`, `scripts/build-catalog.mjs`, and `sw.js`.

## Incident lesson

The expected sandbox network failure did not occur in this run. The builder reached all 12 Archive items and generated only data returned by Archive; no catalog rows or facet counts were synthesized.

## Unresolved

- None within PLAN R4. The user still needs to review and publish outside this session; no commit or push was performed.

## Next steps

1. Review the generated 553-track catalog and UI in a browser.
2. Before release, update the service-worker cache name if required by the release process.
3. Commit and publish only after explicit authorization.
