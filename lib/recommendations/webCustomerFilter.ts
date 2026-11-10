export const WEB_CUSTOMER_ROUTE_FILTERS = [
  'at_risk',
  'near_reward',
  'new_customers',
] as const;

export type WebCustomerRouteFilter =
  (typeof WEB_CUSTOMER_ROUTE_FILTERS)[number];

export function parseWebCustomerRouteFilter(
  value: string | string[] | undefined
): WebCustomerRouteFilter | null {
  const raw = Array.isArray(value) ? value[0] : value;
  if (raw === 'at_risk' || raw === 'near_reward' || raw === 'new_customers') {
    return raw;
  }
  return null;
}

export function webCustomerRouteFilterLabel(filter: WebCustomerRouteFilter) {
  if (filter === 'near_reward') {
    return 'מסונן: קרובים להטבה';
  }
  if (filter === 'at_risk') {
    return 'מסונן: לקוחות בסיכון';
  }
  return 'מסונן: לקוחות חדשים';
}

export function customerMatchesWebRouteFilter(
  customer: { customerState?: string | null },
  filter: WebCustomerRouteFilter | null
) {
  if (!filter) {
    return true;
  }
  const state = customer.customerState;
  if (filter === 'near_reward') {
    return state === 'CLOSE_TO_REWARD';
  }
  if (filter === 'at_risk') {
    return state === 'NEEDS_NURTURE' || state === 'NEEDS_WINBACK';
  }
  return state === 'NEW';
}
