# Unified Campaign/Intelligence Cutover Runbook

This runbook is for production rollout only.  
Do not run these steps from development preview environments.

## 1) Migration execution order

Run manual segment retirement in this strict order:

1. Baseline dependency audit (read-only):
```bash
bunx convex run migrations/auditManualSegmentDependencies
```
2. Dry run manual segment cleanup:
```bash
bunx convex run migrations/removeManualSegments '{"dryRun":true}'
```
3. Execute manual segment cleanup:
```bash
bunx convex run migrations/removeManualSegments
```
4. Final post-cleanup snapshot:
```bash
bunx convex run migrations/postCutoverValidation
```

## 2) Post-cutover checks (hard gates)

After step 4, all checks below must pass:
- `legacy.legacyRetentionActionsActive === 0`
- `legacy.campaignsWithPreparedAudienceSegmentRefs === 0`
- `legacy.campaignsRequiringManualSegmentCleanup === 0`
- `legacy.campaignRunsWithAdvancedSegmentAudienceSource === 0`
- `totals.segments === 0`
- `readyForCleanup === true`

If any check fails, run business-scoped diagnostics:
```bash
bunx convex run migrations/postCutoverValidation '{"businessId":"<businessId>"}'
```

Then re-run cleanup only for that business:
```bash
bunx convex run migrations/auditManualSegmentDependencies '{"businessId":"<businessId>"}'
bunx convex run migrations/removeManualSegments '{"businessId":"<businessId>","dryRun":true}'
bunx convex run migrations/removeManualSegments '{"businessId":"<businessId>"}'
bunx convex run migrations/postCutoverValidation '{"businessId":"<businessId>"}'
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

## 5) Manual segment retirement validation

Validate manual segment removal quality:
- No `preparedAudience` payload should contain `advanced_segment`, `saved_segment`, or `segmentId`.
- No campaign should keep `rules.targetType='saved_segment'`.
- No campaign or campaign run should keep `audienceSource='advanced_segment'`.
- No `segments` rows should remain.
- Customer intelligence screens continue to show deterministic state/tier data only.
- Campaign UI continues to work with deterministic audiences only.

## 6) Analytics validation

Validate analytics integrity after cutover:
- Dashboard summary cards show expected customer counts.
- `reports/statistics` trends remain continuous across cutover window.
- `reports/customers` values for close-to-reward and needs-winback remain stable.
- Weak/strong day/hour deterministic outputs unchanged except for natural data drift.
- AI insight explanations still render and do not affect deterministic analytics values.
- `convex/analytics.ts` remains independent from manual segment artifacts.

## 7) Monitoring window after release

Monitor for at least one full business cycle:
- campaign send volume anomalies
- recurring campaign scheduling anomalies
- any residual manual segment cleanup anomalies reported by validation
- analytics discontinuities

## 8) Historical migration note

`migrations/migrateLegacySegmentCustomerStatus` is retained as a historical artifact only.
Do not use it for the manual segment retirement rollout.
