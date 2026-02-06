import { Ionicons } from '@expo/vector-icons';
import { type Href, Link, type SitemapType, useSitemap } from 'expo-router';
import type { ComponentProps } from 'react';
import { useMemo } from 'react';
import { ScrollView, Text, TouchableOpacity, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { IS_DEV_MODE } from '@/config/appConfig';
import { tw } from '@/lib/rtl';

type IconName = ComponentProps<typeof Ionicons>['name'];

type FlowTone = 'primary' | 'info' | 'success' | 'accent' | 'neutral';

type FlowItem = {
  title: string;
  nameEn: string;
  subtitle?: string;
  href: string;
  icon: IconName;
  tone?: FlowTone;
};

type FlowSize = 'md' | 'sm' | 'xs';

type FlowNodeProps = {
  item: FlowItem;
  size?: FlowSize;
};

const TONE_STYLES: Record<
  FlowTone,
  { bg: string; border: string; icon: string }
> = {
  primary: {
    bg: 'bg-blue-50',
    border: 'border-blue-100',
    icon: '#2563eb',
  },
  info: {
    bg: 'bg-sky-50',
    border: 'border-sky-100',
    icon: '#0284c7',
  },
  success: {
    bg: 'bg-emerald-50',
    border: 'border-emerald-100',
    icon: '#059669',
  },
  accent: {
    bg: 'bg-amber-50',
    border: 'border-amber-100',
    icon: '#b45309',
  },
  neutral: {
    bg: 'bg-slate-100',
    border: 'border-slate-200',
    icon: '#475569',
  },
};

const ENTRY_FLOW: FlowItem[] = [
  {
    title: '\u05d3\u05e3 \u05db\u05e0\u05d9\u05e1\u05d4',
    nameEn: 'Auth Index',
    subtitle:
      '\u05de\u05e2\u05d1\u05d9\u05e8 \u05dc\u05de\u05e4\u05ea \u05d4\u05de\u05e1\u05db\u05d9\u05dd',
    href: '/(auth)',
    icon: 'map-outline',
    tone: 'neutral',
  },
  {
    title:
      '\u05d1\u05e8\u05d5\u05db\u05d9\u05dd \u05d4\u05d1\u05d0\u05d9\u05dd',
    nameEn: 'Welcome',
    subtitle: '\u05de\u05e1\u05da \u05e0\u05d7\u05d9\u05ea\u05d4',
    href: '/(auth)/sign-up',
    icon: 'sparkles-outline',
    tone: 'info',
  },
  {
    title: '\u05d4\u05ea\u05d7\u05d1\u05e8\u05d5\u05ea',
    nameEn: 'Sign In',
    subtitle:
      '\u05db\u05e0\u05d9\u05e1\u05d4 \u05dc\u05d7\u05e9\u05d1\u05d5\u05df',
    href: '/(auth)/sign-in',
    icon: 'log-in-outline',
    tone: 'neutral',
  },
  {
    title: '\u05d1\u05d7\u05d9\u05e8\u05ea \u05ea\u05e4\u05e7\u05d9\u05d3',
    nameEn: 'Role Selection',
    subtitle:
      '\u05e9\u05d9\u05d5\u05da \u05dc\u05e2\u05e0\u05e3 \u05d4\u05e8\u05dc\u05d5\u05d5\u05e0\u05d8\u05d9',
    href: '/(authenticated)/role',
    icon: 'person-circle-outline',
    tone: 'neutral',
  },
  {
    title: '\u05d4\u05e6\u05d8\u05e8\u05e4\u05d5\u05ea',
    nameEn: 'Join',
    subtitle:
      '\u05e7\u05d1\u05dc\u05ea \u05d4\u05d6\u05de\u05e0\u05d4 \u05d0\u05d5 \u05d7\u05d9\u05d1\u05d5\u05e8 \u05dc\u05e2\u05e1\u05e7',
    href: '/(authenticated)/join',
    icon: 'people-outline',
    tone: 'neutral',
  },
  {
    title: '\u05de\u05e1\u05da \u05e8\u05d0\u05e9\u05d9',
    nameEn: 'Home',
    subtitle:
      '\u05d1\u05d9\u05ea \u05d4\u05d0\u05e4\u05dc\u05d9\u05e7\u05e6\u05d9\u05d4',
    href: '/(authenticated)',
    icon: 'home-outline',
    tone: 'primary',
  },
];

const CLIENT_ONBOARDING: FlowItem[] = [
  {
    title: '\u05d1\u05d7\u05d9\u05e8\u05ea \u05ea\u05e4\u05e7\u05d9\u05d3',
    nameEn: 'Client Role',
    href: '/(auth)/onboarding-client-role',
    icon: 'person-outline',
    tone: 'info',
  },
  {
    title: '\u05d0\u05d6\u05d5\u05e8 \u05e9\u05d9\u05de\u05d5\u05e9',
    nameEn: 'Client Usage Area',
    href: '/(auth)/onboarding-client-usage-area',
    icon: 'map-outline',
    tone: 'info',
  },
  {
    title: '\u05ea\u05d7\u05d5\u05de\u05d9 \u05e2\u05e0\u05d9\u05d9\u05df',
    nameEn: 'Client Interests',
    href: '/(auth)/onboarding-client-interests',
    icon: 'heart-outline',
    tone: 'info',
  },
  {
    title:
      '\u05ea\u05d3\u05d9\u05e8\u05d5\u05ea \u05d1\u05d9\u05e7\u05d5\u05e8',
    nameEn: 'Visit Frequency',
    href: '/(auth)/onboarding-client-frequency',
    icon: 'time-outline',
    tone: 'info',
  },
  {
    title: '\u05e1\u05d9\u05d1\u05ea \u05d7\u05d6\u05e8\u05d4',
    nameEn: 'Return Motivation',
    href: '/(auth)/onboarding-client-return-motivation',
    icon: 'repeat-outline',
    tone: 'info',
  },
  {
    title: '\u05e4\u05e8\u05d8\u05d9 \u05dc\u05e7\u05d5\u05d7',
    nameEn: 'Client Details',
    href: '/(auth)/onboarding-client-details',
    icon: 'document-text-outline',
    tone: 'info',
  },
  {
    title: '\u05d0\u05d9\u05de\u05d5\u05ea OTP',
    nameEn: 'Client OTP',
    href: '/(auth)/onboarding-client-otp',
    icon: 'key-outline',
    tone: 'info',
  },
  {
    title: '\u05d4\u05ea\u05d0\u05de\u05d4',
    nameEn: 'Client Fit',
    href: '/(auth)/onboarding-client-fit',
    icon: 'checkmark-done-outline',
    tone: 'info',
  },
];

const BUSINESS_ONBOARDING: FlowItem[] = [
  {
    title: '\u05d1\u05d7\u05d9\u05e8\u05ea \u05ea\u05e4\u05e7\u05d9\u05d3',
    nameEn: 'Business Role',
    href: '/(auth)/onboarding-business-role',
    icon: 'briefcase-outline',
    tone: 'success',
  },
  {
    title:
      '\u05d0\u05d9\u05e4\u05d4 \u05e9\u05de\u05e2\u05ea \u05e2\u05dc\u05d9\u05e0\u05d5',
    nameEn: 'How Did You Hear About Us',
    href: '/(auth)/onboarding-business-discovery',
    icon: 'compass-outline',
    tone: 'success',
  },
  {
    title: '\u05e1\u05d9\u05d1\u05d4 \u05de\u05e8\u05db\u05d6\u05d9\u05ea',
    nameEn: 'Primary Reason',
    href: '/(auth)/onboarding-business-reason',
    icon: 'help-circle-outline',
    tone: 'success',
  },
  {
    title: '\u05e9\u05dd \u05d4\u05e2\u05e1\u05e7',
    nameEn: 'Business Name',
    href: '/(auth)/onboarding-business-name',
    icon: 'document-text-outline',
    tone: 'success',
  },
  {
    title: '\u05d0\u05d6\u05d5\u05e8 \u05e4\u05e2\u05d9\u05dc\u05d5\u05ea',
    nameEn: 'Business Usage Area',
    href: '/(auth)/onboarding-business-usage-area',
    icon: 'map-outline',
    tone: 'success',
  },
  {
    title: '\u05de\u05e1\u05da \u05ea\u05e9\u05dc\u05d5\u05dd',
    nameEn: 'Paywall',
    href: '/(auth)/paywall',
    icon: 'card-outline',
    tone: 'success',
  },
];

const CUSTOMER_MAIN: FlowItem[] = [
  {
    title: '\u05d2\u05d9\u05dc\u05d5\u05d9',
    nameEn: 'Discovery',
    href: '/(authenticated)/(customer)/discovery',
    icon: 'compass-outline',
    tone: 'info',
  },
  {
    title: '\u05d4\u05d8\u05d1\u05d5\u05ea',
    nameEn: 'Rewards',
    href: '/(authenticated)/(customer)/rewards',
    icon: 'gift-outline',
    tone: 'info',
  },
  {
    title: '\u05d0\u05e8\u05e0\u05e7',
    nameEn: 'Wallet',
    href: '/(authenticated)/(customer)/wallet',
    icon: 'wallet-outline',
    tone: 'info',
  },
  {
    title: '\u05db\u05e8\u05d8\u05d9\u05e1\u05d9\u05dd',
    nameEn: 'Cards',
    href: '/(authenticated)/card',
    icon: 'card-outline',
    tone: 'info',
  },
  {
    title: '\u05e4\u05e8\u05d8\u05d9 \u05db\u05e8\u05d8\u05d9\u05e1',
    nameEn: 'Membership Card',
    href: '/(authenticated)/card/[membershipId]',
    icon: 'card-outline',
    tone: 'info',
  },
  {
    title: '\u05d4\u05d2\u05d3\u05e8\u05d5\u05ea',
    nameEn: 'Settings',
    href: '/(authenticated)/(customer)/settings',
    icon: 'settings-outline',
    tone: 'info',
  },
];

const BUSINESS_MAIN: FlowItem[] = [
  {
    title: '\u05d3\u05e9\u05d1\u05d5\u05e8\u05d3',
    nameEn: 'Dashboard',
    href: '/(authenticated)/(business)/dashboard',
    icon: 'stats-chart-outline',
    tone: 'success',
  },
  {
    title: '\u05d0\u05e0\u05dc\u05d9\u05d8\u05d9\u05e7\u05e1',
    nameEn: 'Analytics',
    href: '/(authenticated)/(business)/analytics',
    icon: 'stats-chart-outline',
    tone: 'success',
  },
  {
    title: '\u05e1\u05d5\u05e8\u05e7',
    nameEn: 'Scanner',
    href: '/(authenticated)/(business)/scanner',
    icon: 'qr-code-outline',
    tone: 'success',
  },
  {
    title: 'QR',
    nameEn: 'Business QR',
    href: '/(authenticated)/(business)/qr',
    icon: 'qr-code-outline',
    tone: 'success',
  },
  {
    title: '\u05e6\u05d5\u05d5\u05ea',
    nameEn: 'Team',
    href: '/(authenticated)/(business)/team',
    icon: 'people-outline',
    tone: 'success',
  },
  {
    title: '\u05d4\u05d2\u05d3\u05e8\u05d5\u05ea',
    nameEn: 'Settings',
    href: '/(authenticated)/(business)/settings',
    icon: 'settings-outline',
    tone: 'success',
  },
];

const ADMIN_MAIN: FlowItem[] = [
  {
    title:
      '\u05d3\u05e9\u05d1\u05d5\u05e8\u05d3 \u05d0\u05d3\u05de\u05d9\u05df',
    nameEn: 'Admin Dashboard',
    href: '/(authenticated)/merchant',
    icon: 'shield-checkmark-outline',
    tone: 'accent',
  },
  {
    title: '\u05d0\u05e0\u05dc\u05d9\u05d8\u05d9\u05e7\u05e1',
    nameEn: 'Merchant Analytics',
    href: '/(authenticated)/merchant/analytics',
    icon: 'stats-chart-outline',
    tone: 'accent',
  },
  {
    title: '\u05d7\u05e0\u05d5\u05ea',
    nameEn: 'Store Settings',
    href: '/(authenticated)/merchant/store-settings',
    icon: 'storefront-outline',
    tone: 'accent',
  },
  {
    title: '\u05e4\u05e8\u05d5\u05e4\u05d9\u05dc',
    nameEn: 'Profile Settings',
    href: '/(authenticated)/merchant/profile-settings',
    icon: 'person-circle-outline',
    tone: 'accent',
  },
  {
    title: 'QR',
    nameEn: 'Merchant QR',
    href: '/(authenticated)/merchant/qr',
    icon: 'qr-code-outline',
    tone: 'accent',
  },
];

const ADMIN_ONBOARDING: FlowItem[] = [
  {
    title:
      '\u05d0\u05d5\u05e0\u05d1\u05d5\u05e8\u05d3\u05d9\u05e0\u05d2 \u05d0\u05d3\u05de\u05d9\u05df',
    nameEn: 'Merchant Onboarding',
    href: '/(authenticated)/merchant/onboarding',
    icon: 'sparkles-outline',
    tone: 'accent',
  },
  {
    title: '\u05d9\u05e6\u05d9\u05e8\u05ea \u05e2\u05e1\u05e7',
    nameEn: 'Create Business',
    href: '/(authenticated)/merchant/onboarding/create-business',
    icon: 'storefront-outline',
    tone: 'accent',
  },
  {
    title:
      '\u05d9\u05e6\u05d9\u05e8\u05ea \u05ea\u05d5\u05db\u05e0\u05d9\u05ea',
    nameEn: 'Create Program',
    href: '/(authenticated)/merchant/onboarding/create-program',
    icon: 'albums-outline',
    tone: 'accent',
  },
  {
    title: '\u05ea\u05e6\u05d5\u05d2\u05ea \u05db\u05e8\u05d8\u05d9\u05e1',
    nameEn: 'Preview Card',
    href: '/(authenticated)/merchant/onboarding/preview-card',
    icon: 'card-outline',
    tone: 'accent',
  },
];

const MAPPED_FLOW_HREFS = new Set(
  [
    ...ENTRY_FLOW,
    ...CLIENT_ONBOARDING,
    ...BUSINESS_ONBOARDING,
    ...CUSTOMER_MAIN,
    ...BUSINESS_MAIN,
    ...ADMIN_ONBOARDING,
    ...ADMIN_MAIN,
  ].map((item) => item.href)
);

function flattenSitemap(node: SitemapType | null): SitemapType[] {
  if (!node) {
    return [];
  }

  const queue: SitemapType[] = [node];
  const items: SitemapType[] = [];

  while (queue.length) {
    const current = queue.shift();
    if (!current) {
      continue;
    }
    items.push(current);
    queue.push(...current.children);
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
  if (href.includes('onboarding')) {
    return 'sparkles-outline';
  }
  if (href.includes('card')) {
    return 'card-outline';
  }
  if (href.includes('team') || href.includes('join')) {
    return 'people-outline';
  }
  if (href.includes('paywall')) {
    return 'card-outline';
  }
  return 'document-text-outline';
}

function resolveFlowLink(href: string): Href {
  if (!IS_DEV_MODE || !href.startsWith('/(authenticated)')) {
    return href as Href;
  }

  if (href.includes('preview=')) {
    return href as Href;
  }

  return (
    href.includes('?') ? `${href}&preview=true` : `${href}?preview=true`
  ) as Href;
}

function FlowNode({ item, size = 'md' }: FlowNodeProps) {
  const resolvedHref = resolveFlowLink(item.href);
  const tone = TONE_STYLES[item.tone ?? 'neutral'];
  const sizeClass =
    size === 'xs'
      ? 'w-full px-2.5 py-2.5'
      : size === 'sm'
        ? 'w-36 px-3 py-3'
        : 'w-44 px-4 py-4';
  const titleClass =
    size === 'xs' ? 'text-[10px]' : size === 'sm' ? 'text-[11px]' : 'text-sm';
  const subtitleClass =
    size === 'xs'
      ? 'text-[9px]'
      : size === 'sm'
        ? 'text-[10px]'
        : 'text-[11px]';
  const iconSize = size === 'xs' ? 14 : size === 'sm' ? 16 : 18;

  return (
    <Link href={resolvedHref} asChild={true}>
      <TouchableOpacity
        activeOpacity={0.85}
        accessibilityRole="button"
        accessibilityLabel={`\u05de\u05e2\u05d1\u05e8 \u05dc\u05de\u05e1\u05da ${item.title}`}
        className={`rounded-2xl border border-slate-200 bg-white shadow-sm shadow-slate-200/50 items-center ${sizeClass}`}
      >
        <View
          className={`h-9 w-9 rounded-xl items-center justify-center border ${tone.bg} ${tone.border}`}
        >
          <Ionicons name={item.icon} size={iconSize} color={tone.icon} />
        </View>
        <Text
          className={`mt-2 font-bold text-slate-900 ${titleClass} ${tw.textStart}`}
        >
          {item.title}
        </Text>
        <Text
          style={{ writingDirection: 'ltr' }}
          className={`mt-1 text-slate-700 font-semibold text-center ${subtitleClass}`}
        >
          {item.nameEn}
        </Text>
        {item.subtitle ? (
          <Text
            className={`mt-1 text-slate-500 ${subtitleClass} ${tw.textStart}`}
          >
            {item.subtitle}
          </Text>
        ) : null}
        <View className="mt-2 w-full rounded-lg border border-slate-200 bg-slate-50 px-2 py-1">
          <Text
            style={{ writingDirection: 'ltr' }}
            className="text-[9px] leading-3 text-slate-600 text-center font-mono"
          >
            {item.href}
          </Text>
        </View>
      </TouchableOpacity>
    </Link>
  );
}

function FlowArrow({ compact = false }: { compact?: boolean }) {
  const lineClass = compact ? 'h-2' : 'h-3';
  const marginClass = compact ? 'my-1' : 'my-2';
  const iconSize = compact ? 12 : 14;

  return (
    <View className={`items-center ${marginClass}`}>
      <View className={`w-0.5 ${lineClass} bg-slate-300`} />
      <Ionicons name="arrow-down-outline" size={iconSize} color="#94a3b8" />
      <View className={`w-0.5 ${lineClass} bg-slate-300`} />
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
    <View className="items-center">
      {items.map((item, index) => (
        <View key={item.href} className="items-center">
          <FlowNode item={item} size={size} />
          {index < items.length - 1 && <FlowArrow />}
        </View>
      ))}
    </View>
  );
}

function BranchLane({
  title,
  subtitle,
  onboardingItems,
  mainItems,
  tone,
}: {
  title: string;
  subtitle: string;
  onboardingItems: FlowItem[];
  mainItems: FlowItem[];
  tone: 'info' | 'success';
}) {
  const laneToneClass =
    tone === 'success'
      ? 'border-emerald-100 bg-emerald-50/50'
      : 'border-sky-100 bg-sky-50/50';
  const labelToneClass =
    tone === 'success'
      ? 'border-emerald-200 bg-emerald-100 text-emerald-800'
      : 'border-sky-200 bg-sky-100 text-sky-800';

  return (
    <View className={`flex-1 rounded-2xl border p-3 ${laneToneClass}`}>
      <Text className={`text-sm font-extrabold text-slate-900 ${tw.textStart}`}>
        {title}
      </Text>
      <Text className={`text-[11px] text-slate-600 mt-1 ${tw.textStart}`}>
        {subtitle}
      </Text>

      <View
        className={`mt-3 self-start rounded-full border px-2 py-1 ${labelToneClass}`}
      >
        <Text className="text-[10px] font-bold">
          {'\u05d0\u05d5\u05e0\u05d1\u05d5\u05e8\u05d3\u05d9\u05e0\u05d2'}
        </Text>
      </View>
      <View className="mt-2 items-center">
        {onboardingItems.map((item, index) => (
          <View key={item.href} className="w-full items-center">
            <FlowNode item={item} size="xs" />
            {index < onboardingItems.length - 1 && <FlowArrow compact={true} />}
          </View>
        ))}
      </View>

      <View className="items-center mt-2">
        <FlowArrow compact={true} />
      </View>

      <View
        className={`self-start rounded-full border px-2 py-1 ${labelToneClass}`}
      >
        <Text className="text-[10px] font-bold">
          {
            '\u05de\u05e1\u05db\u05d9\u05dd \u05e8\u05d0\u05e9\u05d9\u05d9\u05dd'
          }
        </Text>
      </View>
      <View className="mt-2 items-center">
        {mainItems.map((item, index) => (
          <View key={item.href} className="w-full items-center">
            <FlowNode item={item} size="xs" />
            {index < mainItems.length - 1 && <FlowArrow compact={true} />}
          </View>
        ))}
      </View>
    </View>
  );
}

function FlowGroup({
  title,
  items,
  fullWidth = false,
}: {
  title: string;
  items: FlowItem[];
  fullWidth?: boolean;
}) {
  const widthClass = fullWidth ? 'w-full' : 'min-w-[220px] flex-1';
  return (
    <View
      className={`${widthClass} rounded-2xl border border-slate-200 bg-white/90 p-3`}
    >
      <Text className={`text-sm font-bold text-slate-800 ${tw.textStart}`}>
        {title}
      </Text>
      <View className={`mt-3 ${tw.flexRow} flex-wrap justify-center gap-3`}>
        {items.map((item) => (
          <FlowNode key={item.href} item={item} size="sm" />
        ))}
      </View>
    </View>
  );
}

export default function FlowMapScreen() {
  const sitemap = useSitemap();
  const additionalScreens = useMemo(() => {
    const items: FlowItem[] = [];
    const seen = new Set<string>();

    for (const node of flattenSitemap(sitemap)) {
      if (
        node.isInternal ||
        node.isGenerated ||
        typeof node.href !== 'string'
      ) {
        continue;
      }

      const href = node.href;
      if (!href.startsWith('/(auth)') && !href.startsWith('/(authenticated)')) {
        continue;
      }
      if (href === '/(auth)/flow-map') {
        continue;
      }
      if (MAPPED_FLOW_HREFS.has(href) || seen.has(href)) {
        continue;
      }

      seen.add(href);
      items.push({
        title: '\u05de\u05e1\u05da \u05e0\u05d5\u05e1\u05e3',
        nameEn: getExtraScreenName(href),
        href,
        icon: getExtraScreenIcon(href),
        tone: 'neutral',
      });
    }

    return items.sort((a, b) => a.href.localeCompare(b.href));
  }, [sitemap]);

  const additionalByAudience = useMemo(() => {
    const customer: FlowItem[] = [];
    const business: FlowItem[] = [];
    const general: FlowItem[] = [];

    for (const item of additionalScreens) {
      if (item.href.includes('/(customer)')) {
        customer.push(item);
      } else if (item.href.includes('/(business)')) {
        business.push(item);
      } else {
        general.push(item);
      }
    }

    return { customer, business, general };
  }, [additionalScreens]);

  return (
    <SafeAreaView className="flex-1 bg-[#F6F8FC]">
      <ScrollView
        contentContainerStyle={{ paddingBottom: 28 }}
        className="flex-1"
      >
        <View className="px-5 pt-5 pb-3">
          <Text
            className={`text-2xl font-black text-slate-900 ${tw.textStart}`}
          >
            {
              '\u05de\u05e4\u05ea \u05d6\u05e8\u05d9\u05de\u05ea \u05de\u05e1\u05db\u05d9\u05dd'
            }
          </Text>
          <Text className={`text-sm text-slate-500 mt-1 ${tw.textStart}`}>
            {
              '\u05dc\u05d7\u05e6\u05d5 \u05e2\u05dc \u05db\u05dc \u05d0\u05d9\u05d9\u05e7\u05d5\u05df \u05db\u05d3\u05d9 \u05dc\u05e2\u05d1\u05d5\u05e8 \u05dc\u05de\u05e1\u05da \u05d4\u05e8\u05dc\u05d5\u05d5\u05e0\u05d8\u05d9.'
            }
          </Text>
        </View>

        <View className="px-4">
          <View className="relative rounded-[26px] border border-slate-200 bg-white px-4 py-5 overflow-hidden">
            <View className="absolute -top-16 -left-16 h-32 w-32 rounded-full bg-blue-100/60" />
            <View className="absolute top-24 -right-16 h-32 w-32 rounded-full bg-amber-100/50" />

            <View className="items-center">
              <FlowStack items={ENTRY_FLOW} />
            </View>

            <View className="items-center mt-3">
              <FlowArrow />
              <Text className="text-xs font-semibold text-slate-600">
                {
                  '\u05e4\u05d9\u05e6\u05d5\u05dc \u05dc\u05e9\u05e0\u05d9 \u05e2\u05e0\u05e4\u05d9\u05dd'
                }
              </Text>
            </View>

            <View className="mt-2 px-6">
              <View className="h-0.5 rounded-full bg-slate-300" />
              <View className={`${tw.flexRow} -mt-0.5 justify-between px-8`}>
                <View className="items-center">
                  <View className="h-3 w-0.5 bg-slate-300" />
                  <Ionicons
                    name="arrow-down-outline"
                    size={12}
                    color="#94a3b8"
                  />
                </View>
                <View className="items-center">
                  <View className="h-3 w-0.5 bg-slate-300" />
                  <Ionicons
                    name="arrow-down-outline"
                    size={12}
                    color="#94a3b8"
                  />
                </View>
              </View>
            </View>

            <View className={`mt-2 ${tw.flexRow} gap-3`}>
              <BranchLane
                title={'\u05e2\u05e0\u05e3 \u05e2\u05e1\u05e7'}
                subtitle={
                  '\u05de\u05e1\u05dc\u05d5\u05dc \u05dc\u05d1\u05e2\u05dc\u05d9 \u05e2\u05e1\u05e7\u05d9\u05dd'
                }
                onboardingItems={BUSINESS_ONBOARDING}
                mainItems={BUSINESS_MAIN}
                tone="success"
              />
              <BranchLane
                title={'\u05e2\u05e0\u05e3 \u05dc\u05e7\u05d5\u05d7'}
                subtitle={
                  '\u05de\u05e1\u05dc\u05d5\u05dc \u05dc\u05dc\u05e7\u05d5\u05d7\u05d5\u05ea'
                }
                onboardingItems={CLIENT_ONBOARDING}
                mainItems={CUSTOMER_MAIN}
                tone="info"
              />
            </View>

            <View className="items-center mt-5">
              <FlowArrow />
              <Text className="text-xs font-semibold text-slate-600">
                {'\u05e2\u05e0\u05e3 \u05d0\u05d3\u05de\u05d9\u05df'}
              </Text>
            </View>

            <View className="mt-3">
              <Text
                className={`text-xs font-bold text-slate-700 ${tw.textStart}`}
              >
                {
                  '\u05d0\u05d5\u05e0\u05d1\u05d5\u05e8\u05d3\u05d9\u05e0\u05d2 \u05d0\u05d3\u05de\u05d9\u05df'
                }
              </Text>
              <View className="mt-2 items-center">
                <FlowStack items={ADMIN_ONBOARDING} size="sm" />
              </View>
              <View className="items-center mt-2">
                <FlowArrow compact={true} />
              </View>
              <FlowGroup
                title={'\u05d0\u05d3\u05de\u05d9\u05df'}
                items={ADMIN_MAIN}
                fullWidth={true}
              />
            </View>

            {additionalScreens.length > 0 ? (
              <>
                <View className="items-center mt-5">
                  <FlowArrow />
                  <Text className="text-xs font-semibold text-slate-600">
                    {
                      '\u05de\u05e1\u05db\u05d9\u05dd \u05e0\u05d5\u05e1\u05e4\u05d9\u05dd \u05e9\u05d6\u05d5\u05d4\u05d5 \u05d1\u05e4\u05e8\u05d5\u05d9\u05e7\u05d8'
                    }
                  </Text>
                </View>
                <View className="mt-3">
                  <View className="space-y-3">
                    <FlowGroup
                      title={
                        '\u05dc\u05e7\u05d5\u05d7 - \u05de\u05e1\u05db\u05d9\u05dd \u05e9\u05dc\u05d0 \u05e9\u05d5\u05d1\u05e6\u05d5'
                      }
                      items={additionalByAudience.customer}
                      fullWidth={true}
                    />
                    <FlowGroup
                      title={
                        '\u05e2\u05e1\u05e7 - \u05de\u05e1\u05db\u05d9\u05dd \u05e9\u05dc\u05d0 \u05e9\u05d5\u05d1\u05e6\u05d5'
                      }
                      items={additionalByAudience.business}
                      fullWidth={true}
                    />
                    <FlowGroup
                      title={
                        '\u05db\u05dc\u05dc\u05d9 - \u05de\u05e1\u05db\u05d9\u05dd \u05e9\u05dc\u05d0 \u05e9\u05d5\u05d1\u05e6\u05d5'
                      }
                      items={additionalByAudience.general}
                      fullWidth={true}
                    />
                  </View>
                </View>
              </>
            ) : null}
          </View>
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}
