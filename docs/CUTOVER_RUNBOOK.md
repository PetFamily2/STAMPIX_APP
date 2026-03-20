# Unified Campaign/Intelligence Cutover Runbook

This runbook is for production rollout only.  
Do not run these steps from development preview environments.

## 1) Migration execution order

Run migrations in this strict order:

1. Baseline snapshot (read-only):
```bash
bunx convex run migrations/postCutoverValidation
```
2. Dry run legacy campaign cutover:
```bash
bunx convex run migrations/cutoverLegacyRetentionActions '{"dryRun":true,"pauseActive":true}'
```
3. Dry run legacy segment conversion:
```bash
bunx convex run migrations/migrateLegacySegmentCustomerStatus '{"dryRun":true}'
```
4. Execute legacy campaign cutover:
```bash
bunx convex run migrations/cutoverLegacyRetentionActions '{"pauseActive":true}'
```
5. Execute legacy segment conversion:
```bash
bunx convex run migrations/migrateLegacySegmentCustomerStatus
```
6. Final post-cutover snapshot:
```bash
bunx convex run migrations/postCutoverValidation
```

## 2) Post-cutover checks (hard gates)

After step 6, all checks below must pass:
- `legacy.legacyRetentionActionsActive === 0`
- `legacy.legacySegmentRules === 0`
- `readyForCleanup === true`

If any check fails, run business-scoped diagnostics:
```bash
bunx convex run migrations/postCutoverValidation '{"businessId":"<businessId>"}'
```

Then re-run only for that business:
```bash
bunx convex run migrations/cutoverLegacyRetentionActions '{"businessId":"<businessId>","pauseActive":true}'
bunx convex run migrations/migrateLegacySegmentCustomerStatus '{"businessId":"<businessId>"}'
```

## 3) Duplicate-send prevention validation

Validate that rollout did not create duplicate campaign deliveries:
- Compare `messageLog` send counts per campaign before/after cutover window.
- Verify no spike of repeated sends with same campaign and user pair.
- Verify legacy recurring automations are paused/disabled by cutover migration.
- Verify cron behavior for old legacy sweep does not activate paused legacy campaigns.

Operational query checklist:
- spot check `campaigns` where `type='retention_action'`
- confirm `sourceContext.legacyAutomationDisabled === true`
- confirm previously active legacy recurring campaigns are now `paused` when `pauseActive=true`

## 4) New campaign engine validation

Validate new campaign flow is authoritative after cutover:
- Create draft campaign.
- Activate one-time campaign and verify single run appears in `campaignRuns`.
- Activate recurring campaign and verify next run scheduling and run logging.
- Confirm entitlements still enforce `maxCampaigns` and recurring campaigns limit.
- Confirm no auto-send occurs without explicit activation action.

## 5) Segment migration validation

Validate segment conversion quality:
- No saved segment should keep `customerStatus` in effective rules after migration.
- Sample migrated segments should evaluate correctly against `customerState` / `customerValueTier`.
- Segment builder UI exposes only `customerState` and `customerValueTier` for state/tier rules.
- Saved segment preview and list remain functional post-migration.

## 6) Analytics validation

Validate analytics integrity after cutover:
- Dashboard summary cards show expected customer counts.
- `reports/statistics` trends remain continuous across cutover window.
- `reports/customers` values for close-to-reward and needs-winback remain stable.
- Weak/strong day/hour deterministic outputs unchanged except for natural data drift.
- AI insight explanations still render and do not affect deterministic analytics values.

## 7) Monitoring window after release

Monitor for at least one full business cycle:
- campaign send volume anomalies
- recurring campaign scheduling anomalies
- segment preview mismatches
- analytics discontinuities

Keep compatibility paths enabled until monitoring window passes and all checks are clean.
