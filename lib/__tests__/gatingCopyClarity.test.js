import { describe, expect, test } from 'bun:test';

import { getLockedAreaCopy } from '../subscription/lockedAreaCopy';
import {
  buildComparisonRows,
  normalizePlanCatalog,
  PLAN_COMPARISON_CLARITY_NOTES,
} from '../subscription/planComparison';

describe('gating copy clarity', () => {
  test('plan comparison uses aligned smartAnalytics label', () => {
    const rows = buildComparisonRows(normalizePlanCatalog([]));
    const smartAnalyticsRow = rows.find(
      (row) => row.id === 'feature:smartAnalytics'
    );

    expect(smartAnalyticsRow?.label).toBe('תובנות לקוחות');
    expect(smartAnalyticsRow?.compactLabel).toBe('תובנות');
  });

  test('advancedReports row does not overpromise with checkmarks', () => {
    const rows = buildComparisonRows(normalizePlanCatalog([]));
    const advancedReportsRow = rows.find(
      (row) => row.id === 'feature:advancedReports'
    );

    expect(advancedReportsRow?.label).toContain('בקרוב');
    expect(advancedReportsRow?.cells.pro.value).toBe('בקרוב');
    expect(advancedReportsRow?.cells.starter.value).toBe('—');
  });

  test('plan comparison notes clarify customers, AI, and reports', () => {
    expect(PLAN_COMPARISON_CLARITY_NOTES.join(' ')).toContain('רשימת לקוחות');
    expect(PLAN_COMPARISON_CLARITY_NOTES.join(' ')).toContain('0 / 100 / 300');
    expect(PLAN_COMPARISON_CLARITY_NOTES.join(' ')).toContain('בקרוב');
  });

  test('locked-area copy matches plan comparison messaging', () => {
    const smartCopy = getLockedAreaCopy('smartAnalytics', 'starter');
    const aiCopy = getLockedAreaCopy('maxAiExecutionsPerMonth', 'pro');
    const reportsCopy = getLockedAreaCopy('advancedReports', 'pro');

    expect(smartCopy.sectionTitle).toBe('תובנות לקוחות');
    expect(smartCopy.benefits[0]).toContain('בכל המסלולים');
    expect(aiCopy.lockedSubtitle).toContain('0');
    expect(aiCopy.lockedSubtitle).toContain('100');
    expect(aiCopy.lockedSubtitle).toContain('300');
    expect(reportsCopy.lockedTitle).toContain('בקרוב');
  });
});
