export const CUSTOMER_ROUTES = {
  wallet: '/(authenticated)/(customer)/wallet',
  rewards: '/(authenticated)/(customer)/rewards',
  discovery: '/(authenticated)/(customer)/discovery',
  showQr: '/(authenticated)/(customer)/show-qr',
  settings: '/(authenticated)/(customer)/settings',
  accountDetails: '/(authenticated)/(customer)/account-details',
  helpSupport: '/(authenticated)/(customer)/help-support',
  referrals: '/(authenticated)/(customer)/referrals',
  join: '/(authenticated)/join',
  acceptInvite: '/(authenticated)/accept-invite',
  settingsLegal: '/(authenticated)/settings-legal',
} as const;

export const CUSTOMER_BUSINESS_PATHNAME =
  '/(authenticated)/(customer)/business/[businessId]' as const;

export const CUSTOMER_CARD_PATHNAME =
  '/(authenticated)/(customer)/customer-card/[membershipId]' as const;

export const LEGACY_CUSTOMER_CARD_PATHNAME =
  '/(authenticated)/card/[membershipId]' as const;

export const CUSTOMER_PRIMARY_TABS = [
  'wallet',
  'rewards',
  'show-qr',
  'discovery',
  'settings',
] as const;

export const CUSTOMER_DETAIL_ROUTES = [
  'account-details',
  'help-support',
  'business/[businessId]',
  'customer-card/[membershipId]',
  'referrals',
] as const;

export const CUSTOMER_BACK_FALLBACKS = {
  referrals: CUSTOMER_ROUTES.wallet,
  accountDetails: CUSTOMER_ROUTES.settings,
  helpSupport: CUSTOMER_ROUTES.settings,
  settingsLegal: CUSTOMER_ROUTES.settings,
  businessDetail: CUSTOMER_ROUTES.wallet,
  cardDetail: CUSTOMER_ROUTES.wallet,
  join: CUSTOMER_ROUTES.wallet,
  acceptInvite: CUSTOMER_ROUTES.wallet,
  showQrClose: CUSTOMER_ROUTES.wallet,
} as const;

const STATIC_INBOX_ROUTES = new Set<string>([
  CUSTOMER_ROUTES.wallet,
  CUSTOMER_ROUTES.rewards,
  CUSTOMER_ROUTES.discovery,
  CUSTOMER_ROUTES.referrals,
]);

const REFERRAL_QUERY_KEYS = ['referralId', 'tab', 'rewardId'] as const;

const SAFE_ID_PATTERN = /^[A-Za-z0-9_-]+$/;

function encodeRouteId(id: string): string {
  return encodeURIComponent(id.trim());
}

function readRouteId(rawId: string): string | null {
  let decoded = rawId;
  try {
    decoded = decodeURIComponent(rawId);
  } catch {
    return null;
  }
  if (!SAFE_ID_PATTERN.test(decoded)) {
    return null;
  }
  return decoded;
}

export function customerBusinessRoute(businessId: string): string {
  return `/(authenticated)/(customer)/business/${encodeRouteId(businessId)}`;
}

export function customerCardRoute(membershipId: string): string {
  return `/(authenticated)/(customer)/customer-card/${encodeRouteId(membershipId)}`;
}

export function customerSettingsLegalRoute(document: string): string {
  return `${CUSTOMER_ROUTES.settingsLegal}?document=${encodeURIComponent(document)}`;
}

export function isCustomerDetailRoute(routeName: string): boolean {
  return (CUSTOMER_DETAIL_ROUTES as readonly string[]).includes(routeName);
}

export function isCustomerPrimaryTab(routeName: string): boolean {
  return (CUSTOMER_PRIMARY_TABS as readonly string[]).includes(routeName);
}

/**
 * Opens the membership shown in the wallet preview.
 * A missing id does not fall through to the business page.
 */
export function resolveWalletPreviewCardRoute(
  previewMembershipId: string | null | undefined
): string | null {
  const membershipId = previewMembershipId?.trim() ?? '';
  if (!SAFE_ID_PATTERN.test(membershipId)) {
    return null;
  }
  return customerCardRoute(membershipId);
}

function normalizePath(path: string): string {
  if (path.length > 1 && path.endsWith('/')) {
    return path.slice(0, -1);
  }
  return path;
}

function sanitizeQuery(
  query: string,
  allowedKeys: readonly string[]
): string | null {
  if (!query) {
    return '';
  }
  const params = new URLSearchParams(query);
  const kept = new URLSearchParams();
  for (const key of allowedKeys) {
    const value = params.get(key);
    if (value == null || value === '') {
      continue;
    }
    if (!SAFE_ID_PATTERN.test(value)) {
      return null;
    }
    kept.set(key, value);
  }
  return kept.toString();
}

function matchRouteId(
  path: string,
  patterns: readonly RegExp[]
): string | null {
  for (const pattern of patterns) {
    const match = path.match(pattern);
    if (!match?.[1]) {
      continue;
    }
    return readRouteId(match[1]);
  }
  return null;
}

/**
 * Accepts only customer destinations the product can open from an inbox item.
 * Legacy card links are normalized to the canonical customer card route.
 * Anything else, including business, staff, admin, and auth targets, is rejected.
 */
export function resolveCustomerInboxDestination(
  destinationHref: string | null | undefined
): string | null {
  if (typeof destinationHref !== 'string') {
    return null;
  }
  const trimmed = destinationHref.trim();
  if (!trimmed || trimmed.includes('#') || trimmed.includes('\\')) {
    return null;
  }
  if (trimmed.startsWith('//') || /^[a-z][a-z0-9+.-]*:/i.test(trimmed)) {
    return null;
  }
  if (trimmed.includes('..')) {
    return null;
  }

  const queryIndex = trimmed.indexOf('?');
  const rawPath = queryIndex >= 0 ? trimmed.slice(0, queryIndex) : trimmed;
  const rawQuery = queryIndex >= 0 ? trimmed.slice(queryIndex + 1) : '';
  const path = normalizePath(rawPath);
  if (
    path.includes('(business)') ||
    path.includes('(staff)') ||
    path.includes('(auth)') ||
    path.includes('/admin') ||
    path.includes('/merchant')
  ) {
    return null;
  }

  if (STATIC_INBOX_ROUTES.has(path)) {
    const allowedKeys =
      path === CUSTOMER_ROUTES.referrals ? REFERRAL_QUERY_KEYS : [];
    const query = sanitizeQuery(rawQuery, allowedKeys);
    if (query == null) {
      return null;
    }
    return query ? `${path}?${query}` : path;
  }

  const canonicalCardId = matchRouteId(path, [
    /^\/\(authenticated\)\/\(customer\)\/customer-card\/([^/]+)$/,
    /^\/customer-card\/([^/]+)$/,
  ]);
  if (canonicalCardId) {
    return customerCardRoute(canonicalCardId);
  }

  const legacyCardId = matchRouteId(path, [
    /^\/\(authenticated\)\/card\/([^/]+)$/,
    /^\/card\/([^/]+)$/,
  ]);
  if (legacyCardId && legacyCardId !== 'index') {
    return customerCardRoute(legacyCardId);
  }

  const businessId = matchRouteId(path, [
    /^\/\(authenticated\)\/\(customer\)\/business\/([^/]+)$/,
  ]);
  if (businessId) {
    return customerBusinessRoute(businessId);
  }

  return null;
}
