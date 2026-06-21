import { describe, expect, test } from 'bun:test';

import {
  DASHBOARD_CUSTOMER_NAV_LABELS,
  resolveDashboardCustomerInsightsNavLabel,
} from '../dashboard/navigationCopy';

describe('dashboard customer insights navigation copy', () => {
  test('maps analytics navigation to תובנות לקוחות', () => {
    expect(
      resolveDashboardCustomerInsightsNavLabel({
        kind: 'view_analytics',
        label: 'צפייה בתובנות',
      })
    ).toBe(DASHBOARD_CUSTOMER_NAV_LABELS.insights);
  });

  test('maps generic customer navigation to לקוחות', () => {
    expect(
      resolveDashboardCustomerInsightsNavLabel({
        kind: 'view_customers',
        label: 'צפה בלקוחות',
        customerFilter: 'near_reward',
      })
    ).toBe(DASHBOARD_CUSTOMER_NAV_LABELS.customers);
  });

  test('maps at-risk navigation to לקוחות בסיכון', () => {
    expect(
      resolveDashboardCustomerInsightsNavLabel(
        {
          kind: 'view_customers',
          label: 'פתח לקוחות',
        },
        { key: 'at_risk_task', title: 'לקוחות בסיכון' }
      )
    ).toBe(DASHBOARD_CUSTOMER_NAV_LABELS.atRisk);
  });

  test('does not use דוחות מתקדמים for customer insights links', () => {
    const label = resolveDashboardCustomerInsightsNavLabel({
      kind: 'view_analytics',
      label: 'דוחות מתקדמים',
    });

    expect(label).toBe(DASHBOARD_CUSTOMER_NAV_LABELS.insights);
    expect(label).not.toContain('דוחות מתקדמים');
  });
});
