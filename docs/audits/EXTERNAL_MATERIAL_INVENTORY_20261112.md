# External material inventory — 12 November 2026

Read-only inventory. No synced source, Drive document, artwork, external worktree or credential file was moved, edited or deleted. Duplicate content does not imply duplicate purpose or authorize removal.

| Material | Evidence / classification | Decision |
|---|---|---|
| `sources/` in the project mirror | Synced reference material, explicitly read-only | Retain; never use as editable source |
| `C:/STAMPIX_FOLDER/STAMPIX_APP` and related integration/readiness worktrees | Existing source/history and developer environments; not treated as duplicate backups | Retain; no reset or dependency installation there |
| `STAMPIX_GAME_ALBUM`, branch `agent/game-album-001` | Latest read-only status still contains unpublished wallet/navigation, memberships, album/character work | Cursor-owned, protected, Post-launch; no integration or edits |
| `STAMPIX_ART_CONCEPTS` | 176 non-generated files, including original art and local preview tooling; three byte-identical duplicate groups (three additional copies) | Required design/product material; preserve all copies |
| `מסכים` | 335 files covering screenshots, product/development notes and private business/credential material; one byte-identical duplicate pair | Mixed current evidence and history; keep private documents/credentials outside Git and hosting; no bulk archive |
| `STAMPIX_SEAL_PREVIEW_SHOTS` | Six PNGs, no byte-identical duplicates | Design evidence owned by the game track; retain |
| `STAMPIX_SHARE` | 606 non-generated files, including source snapshots and signed/build archives; nine identical-content groups, 13 extra copies | Mixed historical delivery snapshot and build material; not a canonical development checkout; retain pending provenance review |
| Four root `.patch` files | `BATCH2_PASSA_REVIEW.patch`, `SUMIT_FOUNDATION_FINAL_REVIEW.patch`, `SUMIT_FOUNDATION_REVIEW.patch`, `SUMIT_FOUNDATION_REVIEW_FULL.patch`; SHA-256 values all distinct | Historical development/review material; do not apply automatically or claim exact duplicates |
| [StampAix 2.0 live master](https://docs.google.com/document/d/1ZkKS8Ag3PQEDmI4A36FOlM1um56f1ohHMspMQTMg_I4/edit) | Retrieved 73 paragraphs; reviewed headings and launch/roadmap boundaries. Current reference explicitly separates core launch from future game work | Active product reference; retrieved text is not new execution authorization |
| [Untitled Drive document](https://docs.google.com/document/d/1gHrOoobrpUrnrzIEkUTxgpo9kXCKsmVUTpSSDuvHAGk/edit) | Retrieved a 475-paragraph product/navigation draft; reviewed its structure and customer/business referral passages | Product/design draft with overlapping topics; not a verified duplicate or current release gate; do not rename/archive without checking its owner's ongoing use |

Local scans excluded generated dependency/build directories and symlinks, bounded each directory at 10,000 files and hashed files up to 50 MiB. No inventory hit the file-count bound. Counts describe the scanned material, not a complete disk or Drive-wide inventory. Only the two search-discovered Drive documents were inspected.

Six repository development documents were already archived through PR #14, integrated as `497e465`; this external inventory adds no removals or moves. Current execution remains the release-hardening ledger and current launch plans, not archived runbooks or old patch instructions.
