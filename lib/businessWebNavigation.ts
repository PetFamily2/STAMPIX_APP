import type { BusinessNavigationMode } from '@/lib/design/navigationFormFactor';
import type {
  BusinessCapability,
  StaffRole,
} from '@/lib/domain/businessPermissions';
import { getRoleCapabilities } from '@/lib/domain/businessPermissions';
import { scannerCommandsEnabled } from '@/lib/web-scanner/previewGate';
import { getConvexUrl } from '@/utils/convexConfig';

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

export type BusinessWebNavKey =
  | 'dashboard'
  | 'customers'
  | 'loyalty'
  | 'team'
  | 'analytics'
  | 'billing'
  | 'campaigns'
  | 'referrals'
  | 'inbox'
  | 'scanner'
  | 'settings';

type BusinessWebNavAccess =
  | { type: 'capability'; capability: BusinessCapability }
  | { type: 'management' };

export type BusinessWebNavItem = {
  key: BusinessWebNavKey;
  label: string;
  shortLabel: string;
  href: (typeof BUSINESS_WEB_ROUTES)[keyof typeof BUSINESS_WEB_ROUTES];
  access: BusinessWebNavAccess;
};

const LINKED_ROUTE_PREFIXES: Partial<
  Record<
    (typeof BUSINESS_WEB_ROUTES)[keyof typeof BUSINESS_WEB_ROUTES],
    readonly string[]
  >
> = {
  [BUSINESS_WEB_ROUTES.loyalty]: ['/business/cards'],
  [BUSINESS_WEB_ROUTES.campaigns]: ['/business/campaign/'],
  [BUSINESS_WEB_ROUTES.settings]: ['/business/qr'],
};

function matchesPath(pathname: string, href: string) {
  return pathname === href || pathname.startsWith(`${href}/`);
}

function matchesPrefix(pathname: string, prefix: string) {
  if (prefix.endsWith('/')) {
    return pathname.startsWith(prefix);
  }
  return pathname === prefix || pathname.startsWith(`${prefix}/`);
}

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
  if (matchesPath(pathname, href)) {
    return true;
  }
  const linked =
    LINKED_ROUTE_PREFIXES[href as keyof typeof LINKED_ROUTE_PREFIXES] ?? [];
  return linked.some((prefix) => matchesPrefix(pathname, prefix));
}

export const BUSINESS_WEB_NAV_CATALOG: readonly BusinessWebNavItem[] = [
  {
    key: 'dashboard',
    label: 'היום',
    shortLabel: 'היום',
    href: BUSINESS_WEB_ROUTES.dashboard,
    access: { type: 'capability', capability: 'access_dashboard' },
  },
  {
    key: 'customers',
    label: 'לקוחות',
    shortLabel: 'לקוחות',
    href: BUSINESS_WEB_ROUTES.customers,
    access: { type: 'capability', capability: 'access_customers' },
  },
  {
    key: 'loyalty',
    label: 'מועדון',
    shortLabel: 'מועדון',
    href: BUSINESS_WEB_ROUTES.loyalty,
    access: { type: 'capability', capability: 'edit_loyalty_cards' },
  },
  {
    key: 'team',
    label: 'צוות',
    shortLabel: 'צוות',
    href: BUSINESS_WEB_ROUTES.team,
    access: { type: 'capability', capability: 'manage_team' },
  },
  {
    key: 'analytics',
    label: 'ניתוחים',
    shortLabel: 'ניתוח',
    href: BUSINESS_WEB_ROUTES.analytics,
    access: { type: 'capability', capability: 'access_analytics' },
  },
  {
    key: 'billing',
    label: 'חיוב וחשבוניות',
    shortLabel: 'חיוב',
    href: BUSINESS_WEB_ROUTES.billing,
    access: { type: 'capability', capability: 'view_billing_state' },
  },
  {
    key: 'campaigns',
    label: 'קמפיינים',
    shortLabel: 'קמפיין',
    href: BUSINESS_WEB_ROUTES.campaigns,
    access: { type: 'capability', capability: 'access_campaigns' },
  },
  {
    key: 'referrals',
    label: 'הזמנת חברים',
    shortLabel: 'חברים',
    href: BUSINESS_WEB_ROUTES.referrals,
    access: { type: 'capability', capability: 'invite_businesses' },
  },
  {
    key: 'inbox',
    label: 'תיבת הודעות',
    shortLabel: 'הודעות',
    href: BUSINESS_WEB_ROUTES.inbox,
    access: { type: 'management' },
  },
  {
    key: 'scanner',
    label: 'סריקה',
    shortLabel: 'סריקה',
    href: BUSINESS_WEB_ROUTES.scanner,
    access: { type: 'capability', capability: 'scanner_access' },
  },
  {
    key: 'settings',
    label: 'הגדרות העסק',
    shortLabel: 'הגדרות',
    href: BUSINESS_WEB_ROUTES.settings,
    access: { type: 'capability', capability: 'view_settings' },
  },
];

const SIDEBAR_ORDER: readonly BusinessWebNavKey[] = [
  'dashboard',
  'customers',
  'scanner',
  'loyalty',
  'campaigns',
  'referrals',
  'team',
  'inbox',
  'billing',
  'settings',
];

const BOTTOM_PRIORITY: readonly BusinessWebNavKey[] = [
  'dashboard',
  'customers',
  'scanner',
  'loyalty',
  'campaigns',
  'referrals',
  'inbox',
  'settings',
  'team',
  'billing',
];

const STAFF_BOTTOM_PRIMARY: readonly BusinessWebNavKey[] = [
  'scanner',
  'customers',
];

const MAX_BOTTOM_SLOTS = 5;

function orderItems(
  order: readonly BusinessWebNavKey[],
  items: readonly BusinessWebNavItem[]
) {
  return order.flatMap((key) => {
    const item = items.find((entry) => entry.key === key);
    return item ? [item] : [];
  });
}

function canSeeBusinessNavItem(
  item: BusinessWebNavItem,
  role: StaffRole | null,
  _mode: BusinessNavigationMode,
  scannerEnabled: boolean
) {
  if (item.key === 'scanner' && !scannerEnabled) {
    return false;
  }
  if (item.key === 'analytics') {
    return false;
  }
  if (!role) {
    return item.key === 'dashboard' || item.key === 'settings';
  }
  if (item.access.type === 'management') {
    return role === 'owner' || role === 'manager';
  }
  return getRoleCapabilities(role)[item.access.capability];
}

export function selectBusinessWebNav(input: {
  role: StaffRole | null;
  mode: BusinessNavigationMode;
  scannerEnabled: boolean;
}) {
  const visible = BUSINESS_WEB_NAV_CATALOG.filter((item) =>
    canSeeBusinessNavItem(item, input.role, input.mode, input.scannerEnabled)
  );

  if (input.mode !== 'bottom') {
    return {
      menu: orderItems(SIDEBAR_ORDER, visible),
      primary: [] as BusinessWebNavItem[],
      overflow: [] as BusinessWebNavItem[],
    };
  }

  if (input.role === 'staff') {
    const ranked = orderItems(BOTTOM_PRIORITY, visible);
    const primary = orderItems(STAFF_BOTTOM_PRIMARY, ranked);
    const primaryKeys = new Set(primary.map((item) => item.key));
    return {
      menu: [] as BusinessWebNavItem[],
      primary,
      overflow: ranked.filter((item) => !primaryKeys.has(item.key)),
    };
  }

  const ranked = orderItems(BOTTOM_PRIORITY, visible);
  const primaryLimit =
    ranked.length > MAX_BOTTOM_SLOTS ? MAX_BOTTOM_SLOTS - 1 : ranked.length;
  const primary = ranked.slice(0, primaryLimit);
  const primaryKeys = new Set(primary.map((item) => item.key));
  return {
    menu: [] as BusinessWebNavItem[],
    primary,
    overflow: ranked.filter((item) => !primaryKeys.has(item.key)),
  };
}

export function countBusinessBottomTabs(selection: {
  primary: readonly unknown[];
  overflow: readonly unknown[];
}) {
  return selection.primary.length + (selection.overflow.length > 0 ? 1 : 0);
}

export function isBusinessWebScannerAvailable(input: {
  userId?: string | null;
  businessId?: string | null;
}) {
  let url = '';
  try {
    url = getConvexUrl();
  } catch {
    return false;
  }
  const preview = process.env.EXPO_PUBLIC_APP_ENV === 'preview';
  return scannerCommandsEnabled({
    platform: 'web',
    environment: process.env.EXPO_PUBLIC_APP_ENV,
    flag: process.env.EXPO_PUBLIC_WEB_SCANNER_COMMANDS,
    productPreview: process.env.EXPO_PUBLIC_WEB_SCANNER_PRODUCT_PREVIEW,
    sharedBackend: process.env.EXPO_PUBLIC_STAMPAIX_SHARED_BACKEND,
    releaseGate: process.env.EXPO_PUBLIC_PWA_RELEASE_GATE,
    actors: preview
      ? process.env.EXPO_PUBLIC_WEB_SCANNER_TEST_ACTORS
      : process.env.EXPO_PUBLIC_WEB_SCANNER_PILOT_ACTORS,
    businesses: preview
      ? process.env.EXPO_PUBLIC_WEB_SCANNER_TEST_BUSINESSES
      : process.env.EXPO_PUBLIC_WEB_SCANNER_PILOT_BUSINESSES,
    backend: process.env.EXPO_PUBLIC_WEB_SCANNER_BACKEND,
    actorId: input.userId ?? undefined,
    businessId: input.businessId ?? undefined,
    url,
    previewUrl: process.env.EXPO_PUBLIC_WEB_SCANNER_PREVIEW_URL,
    prodUrl: process.env.EXPO_PUBLIC_CONVEX_URL_PROD,
  });
}
