import { Ionicons } from '@expo/vector-icons';
import { type Href, Link, type SitemapType, useSitemap } from 'expo-router';
import type { ComponentProps } from 'react';
import { useMemo } from 'react';
import {
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { IS_DEV_MODE } from '@/config/appConfig';

type IconName = ComponentProps<typeof Ionicons>['name'];
type FlowTone = 'entry' | 'client' | 'business' | 'admin' | 'neutral';
type FlowSize = 'md' | 'sm';

type FlowItem = {
  title: string;
  href: string;
  icon: IconName;
  tone: FlowTone;
};

const TONE_STYLES: Record<
  FlowTone,
  {
    cardBg: string;
    cardBorder: string;
    iconBg: string;
    iconBorder: string;
    icon: string;
  }
> = {
  entry: {
    cardBg: '#eef4ff',
    cardBorder: '#bfdbfe',
    iconBg: '#dbeafe',
    iconBorder: '#93c5fd',
    icon: '#1d4ed8',
  },
  client: {
    cardBg: '#effcff',
    cardBorder: '#bae6fd',
    iconBg: '#e0f2fe',
    iconBorder: '#7dd3fc',
    icon: '#0369a1',
  },
  business: {
    cardBg: '#ecfdf3',
    cardBorder: '#a7f3d0',
    iconBg: '#d1fae5',
    iconBorder: '#6ee7b7',
    icon: '#047857',
  },
  admin: {
    cardBg: '#fff7ed',
    cardBorder: '#fed7aa',
    iconBg: '#ffedd5',
    iconBorder: '#fdba74',
    icon: '#c2410c',
  },
  neutral: {
    cardBg: '#f8fafc',
    cardBorder: '#e2e8f0',
    iconBg: '#f1f5f9',
    iconBorder: '#cbd5e1',
    icon: '#475569',
  },
};

const START_CORE_FLOW: FlowItem[] = [
  {
    title: 'Auth Index',
    href: '/(auth)',
    icon: 'home-outline',
    tone: 'entry',
  },
  {
    title: 'Welcome',
    href: '/(auth)/welcome',
    icon: 'sparkles-outline',
    tone: 'entry',
  },
  {
    title: 'Role Selection',
    href: '/(auth)/onboarding-client-role',
    icon: 'git-branch-outline',
    tone: 'entry',
  },
  {
    title: 'Sign Up',
    href: '/(auth)/sign-up',
    icon: 'person-add-outline',
    tone: 'entry',
  },
];

const EMAIL_ENTRY_FLOW: FlowItem[] = [
  {
    title: 'Sign Up Email',
    href: '/(auth)/sign-up-email',
    icon: 'mail-outline',
    tone: 'neutral',
  },
  {
    title: 'Client OTP',
    href: '/(auth)/onboarding-client-otp',
    icon: 'key-outline',
    tone: 'neutral',
  },
];

const EMAIL_LEGACY_FLOW: FlowItem[] = [
  {
    title: 'Client Details',
    href: '/(auth)/onboarding-client-details',
    icon: 'person-outline',
    tone: 'neutral',
  },
  {
    title: 'Client OTP',
    href: '/(auth)/onboarding-client-otp',
    icon: 'key-outline',
    tone: 'neutral',
  },
];

const CUSTOMER_SIGNUP_FLOW: FlowItem[] = [
  {
    title: 'Client Interests',
    href: '/(auth)/onboarding-client-interests',
    icon: 'heart-outline',
    tone: 'client',
  },
  {
    title: 'Usage Area',
    href: '/(auth)/onboarding-client-usage-area',
    icon: 'map-outline',
    tone: 'client',
  },
  {
    title: 'Client Fit',
    href: '/(auth)/onboarding-client-fit',
    icon: 'checkmark-circle-outline',
    tone: 'client',
  },
  {
    title: 'Visit Frequency',
    href: '/(auth)/onboarding-client-frequency',
    icon: 'time-outline',
    tone: 'client',
  },
  {
    title: 'Return Motivation',
    href: '/(auth)/onboarding-client-return-motivation',
    icon: 'repeat-outline',
    tone: 'client',
  },
  {
    title: 'Auth Method',
    href: '/(auth)/sign-up',
    icon: 'log-in-outline',
    tone: 'client',
  },
  {
    title: 'Wallet',
    href: '/(authenticated)/(customer)/wallet',
    icon: 'wallet-outline',
    tone: 'client',
  },
];

const BUSINESS_SIGNUP_FLOW: FlowItem[] = [
  {
    title: 'Business Role',
    href: '/(auth)/onboarding-business-role',
    icon: 'briefcase-outline',
    tone: 'business',
  },
  {
    title: 'Business Discovery',
    href: '/(auth)/onboarding-business-discovery',
    icon: 'search-outline',
    tone: 'business',
  },
  {
    title: 'Primary Reason',
    href: '/(auth)/onboarding-business-reason',
    icon: 'help-circle-outline',
    tone: 'business',
  },
  {
    title: 'Business Name',
    href: '/(auth)/onboarding-business-name',
    icon: 'storefront-outline',
    tone: 'business',
  },
  {
    title: 'Business Usage Area',
    href: '/(auth)/onboarding-business-usage-area',
    icon: 'map-outline',
    tone: 'business',
  },
  {
    title: 'Paywall',
    href: '/(auth)/paywall',
    icon: 'card-outline',
    tone: 'business',
  },
  {
    title: 'Auth Method',
    href: '/(auth)/sign-up',
    icon: 'log-in-outline',
    tone: 'business',
  },
  {
    title: 'Business Dashboard',
    href: '/(authenticated)/(business)/dashboard',
    icon: 'stats-chart-outline',
    tone: 'business',
  },
];

const OAUTH_CUSTOMER_FLOW: FlowItem[] = [
  {
    title: 'Sign Up (Google/Apple)',
    href: '/(auth)/sign-up',
    icon: 'flash-outline',
    tone: 'entry',
  },
  {
    title: 'Wallet',
    href: '/(authenticated)/(customer)/wallet',
    icon: 'wallet-outline',
    tone: 'client',
  },
];

const OAUTH_BUSINESS_FLOW: FlowItem[] = [
  {
    title: 'Sign Up (Google/Apple)',
    href: '/(auth)/sign-up',
    icon: 'flash-outline',
    tone: 'entry',
  },
  {
    title: 'Business Dashboard',
    href: '/(authenticated)/(business)/dashboard',
    icon: 'stats-chart-outline',
    tone: 'business',
  },
];

const MAIN_CUSTOMER_FLOW: FlowItem[] = [
  {
    title: 'Wallet',
    href: '/(authenticated)/(customer)/wallet',
    icon: 'wallet-outline',
    tone: 'client',
  },
  {
    title: 'Rewards',
    href: '/(authenticated)/(customer)/rewards',
    icon: 'gift-outline',
    tone: 'client',
  },
  {
    title: 'Discovery',
    href: '/(authenticated)/(customer)/discovery',
    icon: 'compass-outline',
    tone: 'client',
  },
  {
    title: 'Settings',
    href: '/(authenticated)/(customer)/settings',
    icon: 'settings-outline',
    tone: 'client',
  },
];

const MAIN_BUSINESS_FLOW: FlowItem[] = [
  {
    title: 'Dashboard',
    href: '/(authenticated)/(business)/dashboard',
    icon: 'stats-chart-outline',
    tone: 'business',
  },
  {
    title: 'Scanner',
    href: '/(authenticated)/(business)/scanner',
    icon: 'qr-code-outline',
    tone: 'business',
  },
  {
    title: 'Team',
    href: '/(authenticated)/(business)/team',
    icon: 'people-outline',
    tone: 'business',
  },
  {
    title: 'Analytics',
    href: '/(authenticated)/(business)/analytics',
    icon: 'bar-chart-outline',
    tone: 'business',
  },
  {
    title: 'Settings',
    href: '/(authenticated)/(business)/settings',
    icon: 'settings-outline',
    tone: 'business',
  },
  {
    title: 'Business QR',
    href: '/(authenticated)/(business)/qr',
    icon: 'qr-code-outline',
    tone: 'business',
  },
];

const MAIN_ADMIN_FLOW: FlowItem[] = [
  {
    title: 'Merchant Home',
    href: '/(authenticated)/merchant',
    icon: 'shield-checkmark-outline',
    tone: 'admin',
  },
  {
    title: 'Merchant Analytics',
    href: '/(authenticated)/merchant/analytics',
    icon: 'stats-chart-outline',
    tone: 'admin',
  },
  {
    title: 'Store Settings',
    href: '/(authenticated)/merchant/store-settings',
    icon: 'storefront-outline',
    tone: 'admin',
  },
  {
    title: 'Profile Settings',
    href: '/(authenticated)/merchant/profile-settings',
    icon: 'person-circle-outline',
    tone: 'admin',
  },
  {
    title: 'Merchant QR',
    href: '/(authenticated)/merchant/qr',
    icon: 'qr-code-outline',
    tone: 'admin',
  },
  {
    title: 'Merchant Onboarding',
    href: '/(authenticated)/merchant/onboarding',
    icon: 'layers-outline',
    tone: 'admin',
  },
  {
    title: 'Create Business',
    href: '/(authenticated)/merchant/onboarding/create-business',
    icon: 'business-outline',
    tone: 'admin',
  },
  {
    title: 'Create Program',
    href: '/(authenticated)/merchant/onboarding/create-program',
    icon: 'construct-outline',
    tone: 'admin',
  },
  {
    title: 'Preview Card',
    href: '/(authenticated)/merchant/onboarding/preview-card',
    icon: 'eye-outline',
    tone: 'admin',
  },
];

const SUPPORT_FLOW: FlowItem[] = [
  {
    title: 'Legal',
    href: '/(auth)/legal',
    icon: 'document-text-outline',
    tone: 'neutral',
  },
  {
    title: 'Join',
    href: '/(authenticated)/join',
    icon: 'link-outline',
    tone: 'neutral',
  },
  {
    title: 'Card List',
    href: '/(authenticated)/card',
    icon: 'card-outline',
    tone: 'neutral',
  },
  {
    title: 'Card Details',
    href: '/(authenticated)/card/[membershipId]',
    icon: 'card-outline',
    tone: 'neutral',
  },
];

const KNOWN_APP_ROUTE_HINTS = [
  '/(auth)',
  '/(auth)/flow-map',
  '/(auth)/legal',
  '/(auth)/name-capture',
  '/(auth)/onboarding-business-discovery',
  '/(auth)/onboarding-business-name',
  '/(auth)/onboarding-business-reason',
  '/(auth)/onboarding-business-role',
  '/(auth)/onboarding-business-usage-area',
  '/(auth)/onboarding-client-details',
  '/(auth)/onboarding-client-fit',
  '/(auth)/onboarding-client-frequency',
  '/(auth)/onboarding-client-interests',
  '/(auth)/onboarding-client-otp',
  '/(auth)/onboarding-client-return-motivation',
  '/(auth)/onboarding-client-role',
  '/(auth)/onboarding-client-usage-area',
  '/(auth)/sign-up',
  '/(auth)/sign-up-email',
  '/(auth)/sign-up',
  '/(auth)/welcome',
  '/(auth)/paywall',
  '/(auth)/paywall/index',
  '/(authenticated)/join',
  '/(authenticated)/(business)/analytics',
  '/(authenticated)/(business)/dashboard',
  '/(authenticated)/(business)/qr',
  '/(authenticated)/(business)/scanner',
  '/(authenticated)/(business)/settings',
  '/(authenticated)/(business)/team',
  '/(authenticated)/(customer)/discovery',
  '/(authenticated)/(customer)/rewards',
  '/(authenticated)/(customer)/settings',
  '/(authenticated)/(customer)/wallet',
  '/(authenticated)/card',
  '/(authenticated)/card/index',
  '/(authenticated)/card/[membershipId]',
  '/(authenticated)/merchant',
  '/(authenticated)/merchant/analytics',
  '/(authenticated)/merchant/profile-settings',
  '/(authenticated)/merchant/qr',
  '/(authenticated)/merchant/store-settings',
  '/(authenticated)/merchant/onboarding',
  '/(authenticated)/merchant/onboarding/index',
  '/(authenticated)/merchant/onboarding/create-business',
  '/(authenticated)/merchant/onboarding/create-program',
  '/(authenticated)/merchant/onboarding/preview-card',
];

const MAPPED_FLOW_HREFS = new Set(
  [
    ...START_CORE_FLOW,
    ...EMAIL_ENTRY_FLOW,
    ...EMAIL_LEGACY_FLOW,
    ...CUSTOMER_SIGNUP_FLOW,
    ...BUSINESS_SIGNUP_FLOW,
    ...OAUTH_CUSTOMER_FLOW,
    ...OAUTH_BUSINESS_FLOW,
    ...MAIN_CUSTOMER_FLOW,
    ...MAIN_BUSINESS_FLOW,
    ...MAIN_ADMIN_FLOW,
    ...SUPPORT_FLOW,
  ].map((item) => normalizeRouteHref(item.href))
);

function normalizeRouteHref(href: string): string {
  const trimmed = href.trim();
  const noTrailingSlash =
    trimmed.endsWith('/') && trimmed !== '/' ? trimmed.slice(0, -1) : trimmed;

  if (noTrailingSlash.endsWith('/index')) {
    const withoutIndex = noTrailingSlash.slice(0, -'/index'.length);
    return withoutIndex || '/';
  }

  return noTrailingSlash;
}

function resolveFlowLink(href: string): Href {
  const normalized = normalizeRouteHref(href);
  const params: string[] = [];

  if (!normalized.includes('map=')) {
    params.push('map=true');
  }
  if (
    IS_DEV_MODE &&
    normalized.startsWith('/(authenticated)') &&
    !normalized.includes('preview=')
  ) {
    params.push('preview=true');
  }

  if (params.length === 0) {
    return normalized as Href;
  }

  return `${normalized}${normalized.includes('?') ? '&' : '?'}${params.join('&')}` as Href;
}

function flattenSitemap(node: SitemapType | null): SitemapType[] {
  if (!node) {
    return [];
  }

  const queue: SitemapType[] = [node];
  const seen = new Set<SitemapType>();
  const items: SitemapType[] = [];

  while (queue.length > 0) {
    const current = queue.shift();
    if (!current || seen.has(current)) {
      continue;
    }

    seen.add(current);
    items.push(current);

    const maybeChildren = (current as { children?: SitemapType[] }).children;
    const children = Array.isArray(maybeChildren) ? maybeChildren : [];
    queue.push(...children);
  }

  return items;
}

function getExtraScreenName(href: string): string {
  const segment = href
    .split('/')
    .filter(Boolean)
    .reverse()
    .find((part) => !part.startsWith('(') && part !== 'index');

  if (!segment) {
    return 'Additional Screen';
  }

  const cleaned = segment
    .replace('[', '')
    .replace(']', '')
    .replaceAll('-', ' ')
    .trim();

  if (!cleaned) {
    return 'Additional Screen';
  }

  return cleaned
    .split(' ')
    .map((word) => `${word.charAt(0).toUpperCase()}${word.slice(1)}`)
    .join(' ');
}

function getExtraScreenIcon(href: string): IconName {
  if (href.includes('analytics')) {
    return 'stats-chart-outline';
  }
  if (href.includes('scanner') || href.includes('qr')) {
    return 'qr-code-outline';
  }
  if (href.includes('settings')) {
    return 'settings-outline';
  }
  if (href.includes('card')) {
    return 'card-outline';
  }
  if (href.includes('onboarding')) {
    return 'layers-outline';
  }
  if (href.includes('name')) {
    return 'person-outline';
  }
  if (href.includes('team')) {
    return 'people-outline';
  }
  return 'document-text-outline';
}

function FlowCard({ item, size = 'md' }: { item: FlowItem; size?: FlowSize }) {
  const tone = TONE_STYLES[item.tone];
  const compact = size === 'sm';

  return (
    <Link href={resolveFlowLink(item.href)} asChild={true}>
      <TouchableOpacity
        activeOpacity={0.86}
        accessibilityRole="button"
        style={[
          styles.card,
          compact && styles.cardCompact,
          { backgroundColor: tone.cardBg, borderColor: tone.cardBorder },
        ]}
      >
        <View
          style={[
            styles.cardIconWrap,
            compact && styles.cardIconWrapCompact,
            { backgroundColor: tone.iconBg, borderColor: tone.iconBorder },
          ]}
        >
          <Ionicons
            name={item.icon}
            size={compact ? 14 : 16}
            color={tone.icon}
          />
        </View>
        <Text
          numberOfLines={1}
          style={[styles.cardTitle, compact && styles.cardTitleCompact]}
        >
          {item.title}
        </Text>
        <Text
          numberOfLines={1}
          style={[styles.cardRoute, compact && styles.cardRouteCompact]}
        >
          {normalizeRouteHref(item.href)}
        </Text>
      </TouchableOpacity>
    </Link>
  );
}

function FlowArrow({ compact = false }: { compact?: boolean }) {
  return (
    <View style={[styles.arrowWrap, compact && styles.arrowWrapCompact]}>
      <View style={[styles.arrowLine, compact && styles.arrowLineCompact]} />
      <Ionicons
        name="arrow-down-outline"
        size={compact ? 12 : 14}
        color="#94a3b8"
      />
      <View style={[styles.arrowLine, compact && styles.arrowLineCompact]} />
    </View>
  );
}

function FlowStack({
  items,
  size = 'md',
}: {
  items: FlowItem[];
  size?: FlowSize;
}) {
  return (
    <View style={styles.stack}>
      {items.map((item, index) => (
        <View key={`${item.href}-${item.title}`} style={styles.stackItem}>
          <FlowCard item={item} size={size} />
          {index < items.length - 1 ? (
            <FlowArrow compact={size === 'sm'} />
          ) : null}
        </View>
      ))}
    </View>
  );
}

function FlowGrid({ items }: { items: FlowItem[] }) {
  return (
    <View style={styles.grid}>
      {items.map((item) => (
        <View key={`${item.href}-${item.title}`} style={styles.gridItem}>
          <FlowCard item={item} size="sm" />
        </View>
      ))}
    </View>
  );
}

function BranchLane({
  title,
  subtitle,
  items,
  tone,
}: {
  title: string;
  subtitle: string;
  items: FlowItem[];
  tone: 'client' | 'business';
}) {
  return (
    <View
      style={[
        styles.branchLane,
        tone === 'business'
          ? styles.branchLaneBusiness
          : styles.branchLaneClient,
      ]}
    >
      <Text style={styles.branchTitle}>{title}</Text>
      <Text style={styles.branchSubtitle}>{subtitle}</Text>
      <FlowStack items={items} size="sm" />
    </View>
  );
}

export default function FlowMapScreen() {
  const sitemap = useSitemap();

  const additionalScreens = useMemo(() => {
    const hrefSet = new Set<string>();

    for (const node of flattenSitemap(sitemap)) {
      if (
        node.isInternal ||
        node.isGenerated ||
        typeof node.href !== 'string'
      ) {
        continue;
      }

      hrefSet.add(normalizeRouteHref(node.href));
    }

    for (const hint of KNOWN_APP_ROUTE_HINTS) {
      hrefSet.add(normalizeRouteHref(hint));
    }

    const items: FlowItem[] = [];

    for (const href of hrefSet) {
      if (!href.startsWith('/(auth)') && !href.startsWith('/(authenticated)')) {
        continue;
      }
      if (href === '/(auth)/flow-map') {
        continue;
      }
      if (MAPPED_FLOW_HREFS.has(href)) {
        continue;
      }

      items.push({
        title: getExtraScreenName(href),
        href,
        icon: getExtraScreenIcon(href),
        tone: 'neutral',
      });
    }

    return items.sort((a, b) => a.href.localeCompare(b.href));
  }, [sitemap]);

  return (
    <SafeAreaView style={styles.screen}>
      <ScrollView contentContainerStyle={styles.content}>
        <View style={styles.header}>
          <Text style={styles.title}>מפת זרימת מסכים</Text>
          <Text style={styles.subtitle}>
            זרימת התחלה והרשמה מוצגת למטה שלב-אחר-שלב. מסכים לא ממופים מופיעים
            בסוף.
          </Text>
        </View>

        <View style={styles.panel}>
          <Text style={styles.sectionTitle}>התחלה והרשמה - ציר ראשי</Text>
          <FlowStack items={START_CORE_FLOW} />

          <Text style={styles.helperText}>
            מתוך Sign Up יש שני נתיבים עיקריים: Email או OAuth.
          </Text>

          <Text style={styles.sectionTitle}>נתיב Email (חדש)</Text>
          <FlowStack items={EMAIL_ENTRY_FLOW} size="sm" />

          <Text style={styles.sectionTitle}>נתיב Email חלופי (Legacy)</Text>
          <FlowStack items={EMAIL_LEGACY_FLOW} size="sm" />

          <View style={styles.splitHintWrap}>
            <FlowArrow compact={true} />
            <Text style={styles.splitHint}>מ-OTP מתפצלים לפי תפקיד</Text>
          </View>

          <ScrollView
            horizontal={true}
            showsHorizontalScrollIndicator={false}
            contentContainerStyle={styles.branchScrollContent}
          >
            <BranchLane
              title="מסלול עסק"
              subtitle="מ-OTP עד Business Dashboard"
              items={BUSINESS_SIGNUP_FLOW}
              tone="business"
            />
            <BranchLane
              title="מסלול לקוח"
              subtitle="מ-OTP עד Wallet"
              items={CUSTOMER_SIGNUP_FLOW}
              tone="client"
            />
          </ScrollView>

          <Text style={styles.sectionTitle}>נתיב OAuth מהיר</Text>
          <View style={styles.oauthWrap}>
            <View style={styles.oauthColumn}>
              <Text style={styles.oauthTitle}>לקוח</Text>
              <FlowStack items={OAUTH_CUSTOMER_FLOW} size="sm" />
            </View>
            <View style={styles.oauthColumn}>
              <Text style={styles.oauthTitle}>עסק</Text>
              <FlowStack items={OAUTH_BUSINESS_FLOW} size="sm" />
            </View>
          </View>

          <Text style={styles.sectionTitle}>מסכים ראשיים</Text>
          <Text style={styles.groupTitle}>לקוח</Text>
          <FlowGrid items={MAIN_CUSTOMER_FLOW} />
          <Text style={styles.groupTitle}>עסק</Text>
          <FlowGrid items={MAIN_BUSINESS_FLOW} />
          <Text style={styles.groupTitle}>Merchant/Admin</Text>
          <FlowGrid items={MAIN_ADMIN_FLOW} />

          <Text style={styles.sectionTitle}>מסכים כלליים</Text>
          <FlowGrid items={SUPPORT_FLOW} />

          <Text style={styles.sectionTitle}>
            מסכים שלא ממופים ({additionalScreens.length})
          </Text>
          {additionalScreens.length > 0 ? (
            <FlowGrid items={additionalScreens} />
          ) : (
            <Text style={styles.emptyText}>אין כרגע מסכים לא ממופים.</Text>
          )}
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: '#f3f6fb',
  },
  content: {
    paddingHorizontal: 12,
    paddingTop: 10,
    paddingBottom: 28,
  },
  header: {
    paddingHorizontal: 8,
    paddingBottom: 10,
    gap: 4,
  },
  title: {
    fontSize: 24,
    fontWeight: '900',
    color: '#0f172a',
    textAlign: 'right',
  },
  subtitle: {
    fontSize: 13,
    lineHeight: 18,
    color: '#64748b',
    textAlign: 'right',
  },
  panel: {
    borderRadius: 22,
    borderWidth: 1,
    borderColor: '#d7e1ef',
    backgroundColor: '#ffffff',
    padding: 12,
    gap: 10,
  },
  sectionTitle: {
    fontSize: 14,
    fontWeight: '900',
    color: '#334155',
    textAlign: 'right',
    marginTop: 2,
  },
  helperText: {
    fontSize: 12,
    color: '#64748b',
    textAlign: 'right',
  },
  groupTitle: {
    fontSize: 12,
    fontWeight: '800',
    color: '#475569',
    textAlign: 'right',
    marginTop: 2,
  },
  stack: {
    alignItems: 'center',
  },
  stackItem: {
    alignItems: 'center',
  },
  card: {
    width: 230,
    minHeight: 76,
    borderRadius: 14,
    borderWidth: 1,
    paddingHorizontal: 10,
    paddingVertical: 8,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 4,
  },
  cardCompact: {
    width: '100%',
    minHeight: 68,
    borderRadius: 12,
    paddingHorizontal: 8,
    paddingVertical: 7,
    gap: 3,
  },
  cardIconWrap: {
    width: 30,
    height: 30,
    borderRadius: 9,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  cardIconWrapCompact: {
    width: 26,
    height: 26,
  },
  cardTitle: {
    fontSize: 13,
    fontWeight: '800',
    color: '#0f172a',
    textAlign: 'center',
  },
  cardTitleCompact: {
    fontSize: 12,
  },
  cardRoute: {
    fontSize: 10,
    fontWeight: '700',
    color: '#64748b',
    textAlign: 'center',
    writingDirection: 'ltr',
  },
  cardRouteCompact: {
    fontSize: 9,
  },
  arrowWrap: {
    alignItems: 'center',
    marginVertical: 5,
  },
  arrowWrapCompact: {
    marginVertical: 4,
  },
  arrowLine: {
    width: 2,
    height: 9,
    borderRadius: 1,
    backgroundColor: '#cbd5e1',
  },
  arrowLineCompact: {
    height: 7,
  },
  splitHintWrap: {
    alignItems: 'center',
    paddingTop: 2,
  },
  splitHint: {
    fontSize: 12,
    fontWeight: '700',
    color: '#64748b',
    textAlign: 'center',
  },
  branchScrollContent: {
    gap: 10,
    paddingVertical: 2,
  },
  branchLane: {
    width: 262,
    borderRadius: 16,
    borderWidth: 1,
    padding: 10,
  },
  branchLaneClient: {
    backgroundColor: '#f0f9ff',
    borderColor: '#bae6fd',
  },
  branchLaneBusiness: {
    backgroundColor: '#ecfdf5',
    borderColor: '#a7f3d0',
  },
  branchTitle: {
    fontSize: 14,
    fontWeight: '900',
    color: '#0f172a',
    textAlign: 'right',
  },
  branchSubtitle: {
    marginTop: 2,
    marginBottom: 8,
    fontSize: 11,
    color: '#64748b',
    textAlign: 'right',
  },
  oauthWrap: {
    flexDirection: 'row-reverse',
    gap: 8,
  },
  oauthColumn: {
    flex: 1,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: '#dbe4f0',
    backgroundColor: '#f8fafc',
    padding: 8,
  },
  oauthTitle: {
    fontSize: 12,
    fontWeight: '800',
    color: '#334155',
    textAlign: 'right',
    marginBottom: 4,
  },
  grid: {
    flexDirection: 'row-reverse',
    flexWrap: 'wrap',
    justifyContent: 'space-between',
    rowGap: 8,
    columnGap: 8,
  },
  gridItem: {
    width: '48.5%',
  },
  emptyText: {
    fontSize: 12,
    color: '#64748b',
    textAlign: 'right',
  },
});
