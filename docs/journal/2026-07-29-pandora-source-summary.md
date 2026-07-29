# Pandora Records source integration summary

Transcript: [sanitized partial transcript](2026-07-29-pandora-source-transcript.md)

## Current state

The generated catalog contains 1,778 unique tracks. Of those, 384 retained tracks come from Pandora Records after the existing cross-source work deduplication. The catalog builder still reads the unchanged `CURATED` Archive allowlist, then appends Pandora tracks and performs one shared `dedupeByWork()` pass.

## Decisions and reasons

- Keep Pandora crawling, MP3 probing, duration parsing, and track mapping in `scripts/pandora-source.mjs` so the Archive builder remains focused.
- Pass the existing `cleanTitle()` and `resolveComposer()` helpers into `pandoraTracks()` to reuse canonical behavior without creating a circular module dependency.
- Discover directories before probing audio and use exactly six audio workers. Each worker performs HEAD then Range GET sequentially, so ibiblio sees no more than six concurrent requests.
- Treat missing content length, invalid MPEG1 Layer III headers, and failed requests as skipped files. No duration is inferred or fabricated.
- Model each actual Pandora leaf directory as a credits source and link it directly to ibiblio; do not request Archive metadata for `pandora/` identifiers.

## Changes and verification

- Added the exact 25-entry `PANDORA` source list and recursive HTML directory parsing with case-insensitive `<A HREF>` matching and `..` exclusion.
- Added ID3v2 skipping, MPEG1 Layer III frame validation, bitrate lookup, and byte-length duration calculation.
- Added the EFF Open Audio License label and Pandora credits output.
- Full catalog build exited 0: 440 Pandora MP3s discovered, 437 accepted before work deduplication, 0 duration-parse failures, 3 duration-filtered files, 193 total duplicate works removed, 1,778 final tracks.
- The known Bach traverso sample calculated as 1,162 seconds and passed the required 1,150–1,175 assertion.
- Five randomly selected Pandora tracks returned HTTP 200 with `audio/mpeg` through `curl -sIL`.
- The forbidden-id audit found zero matches for `contrib`, `uw_archive`, `/voice`, `Casals_Festival`, and `voice_clarinet`.
- The catalog invariant audit confirmed 1,778 tracks, 1,778 unique IDs, 384 retained Pandora tracks, accepted durations only, and the required EFF license URL on every Pandora track.
- `node scripts/build-credits.mjs` exited 0 and generated 120 actual source sections for 1,778 tracks; Pandora sections show the EFF Open Audio License.
- The pre-journal test run passed 22/22 tests. Final verification is recorded in the linked transcript.

## Incident lessons

- Jina Reader returned a 401 IP-reputation error. Direct ibiblio access still worked, so the failed intermediary response was discarded and not used as evidence.
- The plan's expected 450 Pandora files was approximate. The live directory crawl found 440; the builder reported the observed count instead of filling the gap.
- The builder appended 437 valid Pandora tracks, while shared work deduplication retained 384. Both numbers are material and should be reported separately.

## Unresolved

- None in the requested implementation. Network-derived counts remain a snapshot of the live sources at build time.

## Next steps

1. Review the generated catalog and credits diff.
2. Commit or publish only after explicit authorization.
