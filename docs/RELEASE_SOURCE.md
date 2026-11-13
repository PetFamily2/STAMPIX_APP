# One launch source

Canonical branch: `integration/release-hardening-20261111`, [Draft PR #16](https://github.com/PetFamily2/STAMPIX_APP/pull/16).

Canonical worktree: `C:/Users/Barak Perez/.codex/.chatgpt-projects/g-p-6915fa700f2881919d81d988ba93806d/STAMPIX_UI`.

The integration must contain launch hardening `715594c2ed5731ff490ccb57457ed33da0a289a0` AND Cursor scanner QA `2579919eca6073de6825aebbdeabbd89594a73b2` (runtime tip `76893ad`). Their ancestry is pinned in `config/release-source.json`. Original QA source was 15 commits ahead of the common launch base; the prior review deployment did not include them. Old QA URLs remain historical evidence, not the integrated candidate.

## Workflow

1. Work on the canonical branch/worktree above. Inspect status before edits; preserve all local changes. Do not switch/reset the original Cursor worktree.
2. Commit the reviewed integration, then run `node scripts/verify-release-source.mjs`. The guard rejects another branch, missing history, an unfinished merge, tracked changes and untracked source. CI validates its exact PR head, including detached checkouts.
3. Require focused regression, types, the required complete CI and export checks for that exact SHA. The standard Cloudflare Preview exporter runs the same guard and emits `pwa/source.json` with the branch, SHA and required ancestors.
4. Update only the existing review Preview from the verified artifact; record immutable deployment URL, source SHA and acceptance evidence. An old tab or mutable alias is not source verification. No Production is authorized by this process.

This guard controls the repository's canonical exporter and integration CI; it cannot stop a person invoking an unrelated external upload tool. All collaborators must use this source and reviewed artifact. Read-only access subsequently succeeded: original Cursor contains 35 modified tracked UI/test files plus a new referrals component, captured without mutation. See [pending UI inventory](audits/CURSOR_PENDING_UI_20261112.md). They were freshly reverified unchanged and reviewed/adapted on 13 November after the user confirmed Cursor finished; see [integration dispositions](audits/CURSOR_UI_INTEGRATION_20261113.md). Original dirty files remain preserved. Original game changes remain unpublished and untouched.

GAME-01/02 and other unpublished game work remain separate and Post-launch. Do not merge/cherry-pick or overwrite `agent/game-album-001`. Future shared-file work requires conflict review before integration.

Known unreviewed source must be listed in `config/release-source.json`; Preview export fails with `RELEASE_PENDING_SOURCE_REVIEW` until resolved. The 36-file Cursor UI review is now resolved, with its fresh snapshot hash and review inventory recorded in reviewedSourceSnapshots. Tests continue to verify that future pending reviews block export. Remove pending items only with integration evidence or explicit scope decisions. Passing ancestry checks alone is insufficient. A canonical-source guidance note was also appended to the original Cursor worktree's AGENTS.md; no original application/game file was changed.

## Remaining acceptance

Integration is not payment or device acceptance. User deferred SUMIT TEST checkout and physical-phone Push tests; keep both open. Production readiness still requires schema compatibility review (33-table live schema versus 82-table candidate, including legacy segments and campaign validators), deliberate provider/environment configuration, backup/restore acceptance, essential product/device checks and explicit release approval. Production was not modified.
