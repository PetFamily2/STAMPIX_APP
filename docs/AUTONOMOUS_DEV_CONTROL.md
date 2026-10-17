# StampAix autonomous development control

This document defines the control plane for bounded cloud-assisted development.
It does not authorize a deployment or any Production operation.

## Sources of truth

1. The exact GitHub branch and commit SHA.
2. Pull request checks and logs.
3. Code and server contracts on that SHA.
4. Manual browser/device acceptance evidence.
5. Product decisions recorded by the operator.

A green CI run proves only the checks that ran. It does not prove ordinary sign-in,
physical scanning, provider delivery, payment acceptance, or Production readiness.

## Work item lifecycle

```text
backlog -> planned -> approved-dev -> in-progress -> draft-pr
        -> ci-pass -> needs-qa -> preview-approved -> accepted
        -> merge-approved -> release-candidate
```

Every development batch must have one bounded work item with:

- objective and launch priority;
- files or product areas in scope;
- acceptance criteria;
- required automated and manual tests;
- forbidden operations;
- rollback notes;
- approvals still required.

Branches use `agent/<task-id>-<slug>`. Agent work targets
`pwa/phase-3-scanner-commands-20261005` through a Draft PR. The safe verification
workflow has read-only repository permission, does not receive secrets, and performs
no deployment.

## Approval gates

Approvals are scoped and do not imply later gates.

- `PLAN-<id>`: read-only investigation and a proposed change plan.
- `DEV-<id>`: edit, test, commit, push to the named task branch, and open/update a Draft PR.
- `PREVIEW-<sha>`: deploy only the exact approved SHA to the existing shared non-Production environment.
- `MERGE-<pr>`: merge only the named PR into its approved base.
- `PROD-<sha>`: deploy only the exact release SHA to Production.
- `BILLING-TEST-<case>`: execute only the described provider test flow.
- `BILLING-LIVE-<case>`: execute only the described real-charge operation.
- `DESTRUCTIVE-<action>`: execute only the named destructive operation.

The following always require a separate explicit approval: shared Convex deployment,
schema or data migration, data reset/deletion, secret rotation, campaign or push delivery,
real payment, merge, force-push, Production deployment, and store submission.

## Required reports

Each task report records:

- task ID, branch, base, and exact SHA;
- changed files and behavior;
- tests run and exact results;
- CI run and job conclusions;
- deployment state and environment;
- manual QA evidence by role and device;
- data, schema, provider, secret, and billing impact;
- remaining risks and approvals needed;
- the next recommended bounded action.

Monitors remain silent when nothing meaningful changes. Immediate alerts are reserved
for failed CI, an unexpected deployment, changes to protected branches, billing or
entitlement contract changes, secret/schema/data operations, and blocked release gates.

## Permanent StampAix boundaries

- Use the existing Convex deployment; do not create or reset a database.
- Customer limits are 250 / 3000 / 10000 as enforced by the current code.
- Identity continuity is closed by operator report and remains a regression check.
- No merge, Production deployment, real charge, or destructive action without its own gate.
- Do not treat synthetic fixtures or CI as ordinary-user acceptance.
