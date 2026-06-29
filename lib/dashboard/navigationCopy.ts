export const DASHBOARD_CUSTOMER_NAV_LABELS = {
  customers: 'לקוחות',
  insights: 'תובנות לקוחות',
  atRisk: 'לקוחות בסיכון',
} as const;

type CustomerRouteFilter = 'near_reward' | 'at_risk' | 'new_customers';

type DashboardNavPrimaryCta = {
  kind: string;
  label: string;
  customerFilter?: CustomerRouteFilter | null;
};

type DashboardNavCardHint = {
  key?: string;
  title?: string;
};

function isAtRiskNavigation(
  primaryCta: DashboardNavPrimaryCta,
  cardHint?: DashboardNavCardHint
) {
  if (primaryCta.customerFilter === 'at_risk') {
    return true;
  }

  const key = cardHint?.key?.toLowerCase() ?? '';
  const title = cardHint?.title ?? '';
  return (
    key.includes('at_risk') ||
    title.includes('בסיכון') ||
    title.includes('התרחקו')
  );
}

function inferInsightsLabelFromText(label: string) {
  const normalized = label.trim().toLowerCase();
  return (
    normalized.includes('analytics') ||
    normalized.includes('תובנות') ||
    normalized.includes('דוחות מתקדמים')
  );
}

function inferCustomersLabelFromText(label: string) {
  const normalized = label.trim().toLowerCase();
  return (
    normalized.includes('customer') ||
    normalized.includes('לקוחות') ||
    normalized === 'view customers' ||
    normalized === 'open customers'
  );
}

export function localizeDashboardCtaLabel(label: string) {
  const normalized = label.trim().toLowerCase();
  if (normalized === 'view subscription') {
    return 'צפו במנוי';
  }
  if (normalized === 'open campaigns') {
    return 'פתחו מבצעים';
  }
  if (normalized === 'open cards') {
    return 'פתחו כרטיסיות נאמנות';
  }
  if (normalized === 'finish setup') {
    return 'השלימו את ההגדרה';
  }
  return label;
}

export function resolveDashboardCustomerInsightsNavLabel(
  primaryCta: DashboardNavPrimaryCta | null | undefined,
  cardHint?: DashboardNavCardHint
): string | null {
  if (!primaryCta) {
    return null;
  }

  if (primaryCta.kind === 'view_analytics') {
    return DASHBOARD_CUSTOMER_NAV_LABELS.insights;
  }

  if (primaryCta.kind === 'view_customers') {
    if (isAtRiskNavigation(primaryCta, cardHint)) {
      return DASHBOARD_CUSTOMER_NAV_LABELS.atRisk;
    }
    return DASHBOARD_CUSTOMER_NAV_LABELS.customers;
  }

  if (inferInsightsLabelFromText(primaryCta.label)) {
    return DASHBOARD_CUSTOMER_NAV_LABELS.insights;
  }

  if (
    inferCustomersLabelFromText(primaryCta.label) &&
    isAtRiskNavigation(primaryCta, cardHint)
  ) {
    return DASHBOARD_CUSTOMER_NAV_LABELS.atRisk;
  }

  if (inferCustomersLabelFromText(primaryCta.label)) {
    return DASHBOARD_CUSTOMER_NAV_LABELS.customers;
  }

  return localizeDashboardCtaLabel(primaryCta.label);
}
