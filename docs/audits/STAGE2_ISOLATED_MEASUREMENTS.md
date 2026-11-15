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
