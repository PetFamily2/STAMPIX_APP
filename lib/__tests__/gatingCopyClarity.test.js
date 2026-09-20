import { describe, expect, test } from 'bun:test';

import { getLockedAreaCopy } from '../subscription/lockedAreaCopy';
import {
  buildComparisonRows,
  normalizePlanCatalog,
  PLAN_COMPARISON_CLARITY_NOTES,
} from '../subscription/planComparison';

describe('gating copy clarity', () => {
  test('plan comparison table keeps only launch limit rows', () => {
    const rows = buildComparisonRows(normalizePlanCatalog([]));
    expect(rows.map((row) => row.id)).toEqual([
      'limit:maxCards',
      'limit:maxCustomers',
      'limit:maxCampaigns',
      'limit:maxActiveRetentionActions',
      'limit:maxAiExecutionsPerMonth',
      'limit:maxTeamSeats',
    ]);
    expect(rows.some((row) => row.id.startsWith('feature:'))).toBe(false);
  });

  test('advancedReports is not advertised in launch comparison', () => {
    const rows = buildComparisonRows(normalizePlanCatalog([]));
    const advancedReportsRow = rows.find(
      (row) => row.id === 'feature:advancedReports'
    );

    expect(advancedReportsRow).toBeUndefined();
  });

  test('plan comparison notes clarify customers and AI without V2 copy', () => {
    expect(PLAN_COMPARISON_CLARITY_NOTES.join(' ')).toContain('שיגור');
    expect(PLAN_COMPARISON_CLARITY_NOTES.join(' ')).not.toContain('בקרוב');
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
    expect(reportsCopy.lockedTitle).not.toContain('בקרוב');
  });
});
