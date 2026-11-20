# H3 discovery rollout and migration safety

Existing businesses may not yet have `discoveryH3R5`. The read path includes active missing-cell records, applies the same Haversine distance and service filters, and deduplicates by business ID. This temporary compatibility read is unbounded and can hit Convex read limits if the missing-cell population is large, including businesses without valid locations. It prevents silent omission in the local regression; it is not a scale-safe final cutover or proof of production readiness.

For an isolated authorized environment, verify: (1) deploy the additive optional field, index, dual-writing location paths, and compatibility reader as a coordinated backend change; (2) wait for the index to become ready; (3) run the existing cursor-batched H3 migration to completion; (4) independently measure valid-location active businesses still missing or holding an incorrect cell and resolve them, including concurrent location changes; (5) test discovery across legacy/indexed records and geographic boundaries; (6) separately review an explicit readiness gate or retirement of the compatibility scan before production scale. A prior backend containing only the H3 reader must not be used before this sequence because it omits unbackfilled businesses.

No migration or deployment is authorized by this document. Do not run it against real data without explicit approval. This document cannot establish H3 radius coverage at poles, cell-density limits, database read capacity or zero missed businesses; those remain verification gates.

## Verification and safe transition

The compatibility index now reads only active businesses with a missing H3 cell and a stored latitude. After a successful backfill the index range is empty. An indexed probe remains active so that a later write from an older writer cannot silently remove a business from nearby results.

In an approved isolated environment, wait for both discovery indexes to be ready, run the existing cursor backfill, and then start the internal H3 verification. Check the same generation until it reports ready and zero mismatches. A newer verification invalidates older continuations. A finished verification describes the scan it completed; keep the compatibility probe because concurrent writes can occur between batches. Resolve malformed locations before accepting a failed verification as complete. Measure result parity, radius boundaries and dense-cell reads against the approved isolated dataset before authorizing any production backfill.

Local regression tests cover late unindexed records after readiness, exclusion of unlocated records from the compatibility range, and stale or failed verification batches. They do not measure Convex capacity or establish geographic parity on existing records.
