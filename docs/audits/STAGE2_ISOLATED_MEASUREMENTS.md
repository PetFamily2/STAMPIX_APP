# Isolated performance measurement gate

No real server benchmark was run in this follow-up. There is no verified, existing, authorized isolated Convex endpoint and test dataset available in this session. Production and original user data must not be used as a substitute. No deployment, environment write or seed was performed.

Prepared runner: `node scripts/measure-stage2-isolated.mjs <targets.json>`.

Required process-only inputs:
- `STAGE2_ISOLATED_CONVEX_URL`: the existing authorized isolated endpoint.
- `STAGE2_APPROVED_ISOLATED_HOST`: its exact hostname (or localhost).
- `STAGE2_ALLOW_ISOLATED_READS=yes`: explicit isolated-read opt-in.
- `STAGE2_ISOLATED_AUTH_TOKEN`: session for the isolated business, when required. Never store this in the targets or report.

Targets are an array of `{ "query": "dashboard:getBusinessDashboardSummary", "args": { "businessId": "<existing isolated fixture business>" } }`. Use the same dataset and targets for baseline and candidate. Record fixture event/member counts, source SHA, deployment SHA, client machine and warm/cold state alongside each report. The runner executes queries only and does not create fixtures or modify data. Ten samples per query report client request wall time including network, not server execution time. Actual backend execution/read counts need the existing Convex dashboard or authorized query logs separately.

Run baseline and candidate only after separate approval for the appropriate isolated backend versions. Keep raw samples. A local mocked read count or React renderer result must never be labelled server latency, FPS, Long Tasks, browser input latency or physical-device acceptance.

## Release candidate acceptance (current stage-2 contract)

Run on an owner-approved isolated Convex deployment with a test-only identity provider, separate disposable fixture business and no live payment or push credentials. The owner identifies the deployment and grants the test role. The release engineer compares its deployed SHA and schema to PR #18 and confirms the campaign, message and H3 indexes are ready. Expected results and owners:

| Gate | Environment and check | Responsible |
| --- | --- | --- |
| Campaign scale and recovery | Isolated Convex. Build 10,001 memberships, including multi-card customers, inactive members, marketing opt-outs and a second business. Exercise manual, scheduled one-time and recurring delivery. Interrupt a worker after a committed page and replay a prior page. Check final message and unique-recipient counts, no cross-tenant or duplicate records, and read/write limits in execution logs. Check older management clients show deferred metrics rather than partial counts. | Backend/release engineer |
| Admin transition | Isolated Convex and admin/non-admin sessions. For every type, compare exhaustive paged results with a reference set that includes sparse matches and tied timestamps. Compare bounded legacy answers when exhaustive; verify that an inconclusive legacy request asks for pagination rather than returning partial data. Confirm the minimum client release or continued support for the bounded legacy path before retiring it. | Release engineer and product owner |
| Concurrent edits | Two independent browser sessions on the isolated candidate. Save a profile name, campaign draft, business settings and card from one session; confirm the other session retains the draft and rejects any stale write. Test business switching, back navigation, manual refresh and PWA update while a draft is open. | QA lead |
| H3 | Isolated Convex. Stage indexes, dual writes and the guarded backfill. Run verification to zero mismatches, compare indexed and reference results at radii 0.1 to 50 km and at the antimeridian, poles, cell boundaries and dense cells. Check a newly missing cell remains visible through the compatibility path and record real read counts. | Backend/release engineer |
| Push and PWA | Isolated candidate on an authorized iOS device and Android device, using test Expo and VAPID identities. Test enrollment, consent withdrawal between enqueue and claim, duplicate recovery, closure/referral routing, provider outcomes and device receipt. Confirm legacy Web Push work is drained before cutover. | Device QA and release engineer |
| SUMIT | Authorized SUMIT TEST account and sandbox instruments. Verify all six price/interval pairs, checkout, idempotent payment evidence, renewal, failure/recovery, cancellation and full refund reconciliation without affecting newer periods. Review Production credentials and gate separately. The user or authorized billing operator handles any provider approval. | Billing owner and release engineer |

The current shell exposes neither the isolated URL nor the opt-in described above. The available Convex connector cannot list or verify deployments. Local mock results and JavaScript exports do not close these gates.

## RC toolchain, compatibility and rollback

**Convex release tool.** Pin CLI **1.49.0** for the next isolated acceptance dry-run while keeping the application SDK and production configuration unchanged. On the exact #16 source, 1.49.0 succeeded and [1.31.5 exited 1](https://github.com/PetFamily2/STAMPIX_APP/actions/runs/43626848151/job/132545532243). The sanitized diagnostic reports an invalid-code error and does not establish its underlying cause. Local invocations confirmed both binary versions and that both accept the dry-run, typecheck and codegen flags. The checkout's SDK is still 1.31.5. Keep the two-version diagnostic, preserve the 1.31.5 failure and require a successful 1.49.0 dry-run on the exact assembled SHA and the explicitly authorized target. CLI help is not hosted schema validation. See [Convex dry-run reference](https://docs.convex.dev/cli/reference/deploy).

**Proposed minimum supported client for full workflows.** Web/PWA: the first accepted immutable Web artifact containing the paged wallet/inbox and version-aware editors. Record its source SHA and service-worker build identifier. Support the previous deployed artifact for **30 days after general availability**, including cached sessions with open drafts. Native: the first accepted signed build of that same release line on each platform, identified by iOS build number and Android versionCode. Support the previous Native build for **90 days after both stores make the replacement available**. The marketing version `1.0.0` is not unique and EAS supplies remote build numbers. No exact signed build number exists in the local evidence. Enforcement remains off. Count legacy requests and affected accounts in aggregate before approval, without logging identity, query text, message contents or drafts. A time window alone is insufficient if legacy clients that need complete results are still active.

**One product decision before rollout.** Approve the scoped handoff from the legacy full-array inbox to paged clients, with the 30/90-day overlap above. The old contract returns its complete array up to 500 messages and explicitly asks for pagination above that budget. An old client cannot represent a cursor, so do not send it a shortened list. Verify active legacy clients over the budget can update to the paged build before enabling this server revision for them. Referral admin uses a similarly bounded legacy contract and requires a compatible client when the result cannot be proven complete. Neither path sets a minimum-version switch.

**Rollback checkpoints.**

1. Record approved source SHA, exact Web artifact/cache revision, signed Native build identifiers, backend revision and index state before the candidate is enabled. Run the owner-approved backup/recovery check in isolation first.
2. Roll back Web/PWA to the last known-good artifact if login, drafts, inbox or role-based access regress. Keep the additive backend available for newer Native builds that still call it. On Native, halt rollout and provide a fixed replacement build through the release channel; do not assume devices downgrade.
3. If backend behavior is unsafe, stop admission of affected campaign runs and capture checkpoint IDs, queued state and verified provider receipts before any separately authorized backend rollback. Do not replay ambiguous Push deliveries or duplicate billing events. Keep additive indexes and fields during rollback; keep H3 fallback enabled. Back up and reconcile persisted runs before authorizing a backend release that cannot understand them.
4. Resume only after smoke checks cover sign-in, consent, wallet paging, owner/admin access, saved-draft conflicts, H3 old/new result parity and sandbox payment reconciliation. A client artifact rollback does not undo already committed writes, notifications or payments.

**Execution after access approval.** Obtain an existing isolated deployment slug/URL, least-privilege staff and admin test identities, approved disposable fixtures, and separate test Push/SUMIT credentials from the relevant owners. Confirm both stack bases and the merged candidate SHA; dry-run with 1.49.0, validate indexes, then run the 10,001-membership campaign recovery and 1,205-message inbox tests against server limits. Run two-session stale onboarding, business switch and reload flows on the accepted client, followed by H3 parity, device Push and SUMIT TEST. Do not run against Production or inherit its records or credentials.
