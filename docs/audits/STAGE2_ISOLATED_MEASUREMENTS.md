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
