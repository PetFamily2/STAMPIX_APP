export const BUSINESS_WEB_ROUTES = {
  dashboard: '/business',
  customers: '/business/customers',
  loyalty: '/business/loyalty',
  analytics: '/business/analytics',
  team: '/business/team',
  billing: '/business/billing',
  settings: '/business/settings',
  campaigns: '/business/campaigns',
  referrals: '/business/referrals',
  inbox: '/business/inbox',
  scanner: '/business/scanner-preview',
} as const;

export function isBusinessWebRouteActive(
  pathname: string,
  href?: string | null
) {
  if (!href) {
    return false;
  }
  if (href === BUSINESS_WEB_ROUTES.dashboard) {
    return pathname === href || pathname === `${href}/`;
  }
  return pathname === href || pathname.startsWith(`${href}/`);
}
