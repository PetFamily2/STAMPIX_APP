import { Ionicons } from '@expo/vector-icons';
import { type Href, Link, type SitemapType, useSitemap } from 'expo-router';
import type { ComponentProps, ReactNode } from 'react';
import { useCallback, useMemo, useRef, useState } from 'react';
import {
  type NativeSyntheticEvent,
  type NativeTouchEvent,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import Svg, { G, Path, Rect, Text as SvgText } from 'react-native-svg';

import { IS_DEV_MODE } from '@/config/appConfig';

type IconName = ComponentProps<typeof Ionicons>['name'];
type FlowTone = 'info' | 'success' | 'accent' | 'neutral';
type EdgeKind = 'primary' | 'secondary' | 'back' | 'system';
type Anchor = 'left' | 'right' | 'top' | 'bottom';

type PreviewKind =
  | 'entry'
  | 'welcome'
  | 'sign-up'
  | 'sign-in'
  | 'role'
  | 'form'
  | 'otp'
  | 'selection'
  | 'paywall'
  | 'legal'
  | 'main'
  | 'generic'
  | 'settings'
  | 'join'
  | 'card-detail'
  | 'dashboard'
  | 'scanner'
  | 'team'
  | 'analytics'
  | 'merchant-onboarding'
  | 'qr';

type FlowItem = {
  title: string;
  nameEn: string;
  href: string;
  icon: IconName;
  tone: FlowTone;
};

type DiagramNode = {
  id: string;
  col: number;
  row: number;
  preview: PreviewKind;
  item: FlowItem;
};

type DiagramEdge = {
  from: string;
  to: string;
  label: string;
  kind: EdgeKind;
  fromAnchor?: Anchor;
  toAnchor?: Anchor;
};

const NODE_WIDTH = 152;
const NODE_HEIGHT = 262;
const COL_GAP = 48;
const ROW_GAP = 44;
const DIAGRAM_PADDING = 28;
const ROUTE_LABEL_MAX = 18;
const PREVIEW_OTP_KEYS = ['otp-1', 'otp-2', 'otp-3', 'otp-4'] as const;
const PREVIEW_TAB_KEYS = ['tab-1', 'tab-2', 'tab-3', 'tab-4'] as const;
const PREVIEW_STAMP_KEYS = [
  'stamp-1',
  'stamp-2',
  'stamp-3',
  'stamp-4',
  'stamp-5',
] as const;
const PREVIEW_DASH_KEYS = ['dash-1', 'dash-2', 'dash-3'] as const;

const TONE_STYLES: Record<
  FlowTone,
  { icon: string; border: string; bg: string }
> = {
  info: { icon: '#1d4ed8', border: '#bfdbfe', bg: '#eff6ff' },
  success: { icon: '#047857', border: '#a7f3d0', bg: '#ecfdf5' },
  accent: { icon: '#b45309', border: '#fde68a', bg: '#fffbeb' },
  neutral: { icon: '#475569', border: '#e2e8f0', bg: '#f8fafc' },
};

const EDGE_STYLES: Record<
  EdgeKind,
  { stroke: string; dash?: string; labelText: string; labelBg: string }
> = {
  primary: { stroke: '#0ea5e9', labelText: '#075985', labelBg: '#e0f2fe' },
  secondary: {
    stroke: '#0284c7',
    dash: '5 4',
    labelText: '#155e75',
    labelBg: '#ecfeff',
  },
  back: {
    stroke: '#64748b',
    dash: '2 5',
    labelText: '#334155',
    labelBg: '#f1f5f9',
  },
  system: {
    stroke: '#94a3b8',
    dash: '1 5',
    labelText: '#475569',
    labelBg: '#f8fafc',
  },
};
const DIAGRAM_NODES: DiagramNode[] = [
  {
    id: 'auth-index',
    col: 0,
    row: 0,
    preview: 'entry',
    item: {
      title: '׳³ג€׳³ֲ£ ׳³ג€÷׳³ֲ ׳³ג„¢׳³ֲ¡׳³ג€',
      nameEn: 'Auth Index',
      href: '/(auth)',
      icon: 'map-outline',
      tone: 'neutral',
    },
  },
  {
    id: 'welcome',
    col: 1,
    row: 0,
    preview: 'welcome',
    item: {
      title: 'WELCOME',
      nameEn: 'Welcome',
      href: '/(auth)/welcome',
      icon: 'sparkles-outline',
      tone: 'info',
    },
  },
  {
    id: 'sign-up',
    col: 2,
    row: 0,
    preview: 'sign-up',
    item: {
      title: 'SIGN UP',
      nameEn: 'Sign Up',
      href: '/(auth)/sign-up',
      icon: 'person-add-outline',
      tone: 'info',
    },
  },
  {
    id: 'legal',
    col: 2,
    row: 1,
    preview: 'legal',
    item: {
      title: '׳³ֲ׳³ֲ¡׳³ֲ׳³ֲ ׳³ֲ׳³ֲ©׳³ג‚×׳³ֻ׳³ג„¢',
      nameEn: 'Legal',
      href: '/(auth)/legal',
      icon: 'document-text-outline',
      tone: 'neutral',
    },
  },
  {
    id: 'role',
    col: 3,
    row: 0,
    preview: 'role',
    item: {
      title: '׳³ג€˜׳³ג€”׳³ג„¢׳³ֲ¨׳³ֳ— ׳³ֳ—׳³ג‚×׳³ֲ§׳³ג„¢׳³ג€',
      nameEn: 'Onboarding Role',
      href: '/(auth)/onboarding-client-role',
      icon: 'people-outline',
      tone: 'neutral',
    },
  },
  {
    id: 'client-details',
    col: 4,
    row: 0,
    preview: 'form',
    item: {
      title: '׳³ג‚×׳³ֲ¨׳³ֻ׳³ג„¢ ׳³ֲ׳³ֲ§׳³ג€¢׳³ג€”',
      nameEn: 'Client Details',
      href: '/(auth)/onboarding-client-details',
      icon: 'person-outline',
      tone: 'info',
    },
  },
  {
    id: 'client-otp',
    col: 5,
    row: 0,
    preview: 'otp',
    item: {
      title: '׳³ֲ׳³ג„¢׳³ֲ׳³ג€¢׳³ֳ— OTP',
      nameEn: 'Client OTP',
      href: '/(auth)/onboarding-client-otp',
      icon: 'key-outline',
      tone: 'info',
    },
  },
  {
    id: 'client-interests',
    col: 6,
    row: 0,
    preview: 'selection',
    item: {
      title: '׳³ֳ—׳³ג€”׳³ג€¢׳³ֲ׳³ג„¢ ׳³ֲ¢׳³ֲ ׳³ג„¢׳³ג„¢׳³ֲ',
      nameEn: 'Client Interests',
      href: '/(auth)/onboarding-client-interests',
      icon: 'heart-outline',
      tone: 'info',
    },
  },
  {
    id: 'client-usage',
    col: 7,
    row: 0,
    preview: 'selection',
    item: {
      title: '׳³ֲ׳³ג€“׳³ג€¢׳³ֲ¨ ׳³ֲ©׳³ג„¢׳³ֲ׳³ג€¢׳³ֲ© ׳³ֲ׳³ֲ§׳³ג€¢׳³ג€”',
      nameEn: 'Client Usage Area',
      href: '/(auth)/onboarding-client-usage-area',
      icon: 'map-outline',
      tone: 'info',
    },
  },
  {
    id: 'client-fit',
    col: 8,
    row: 0,
    preview: 'selection',
    item: {
      title: '׳³ג€׳³ֳ—׳³ֲ׳³ֲ׳³ג€',
      nameEn: 'Client Fit',
      href: '/(auth)/onboarding-client-fit',
      icon: 'checkmark-circle-outline',
      tone: 'info',
    },
  },
  {
    id: 'client-frequency',
    col: 9,
    row: 0,
    preview: 'selection',
    item: {
      title: '׳³ֳ—׳³ג€׳³ג„¢׳³ֲ¨׳³ג€¢׳³ֳ— ׳³ג€˜׳³ג„¢׳³ֲ§׳³ג€¢׳³ֲ¨',
      nameEn: 'Client Frequency',
      href: '/(auth)/onboarding-client-frequency',
      icon: 'time-outline',
      tone: 'info',
    },
  },
  {
    id: 'client-return',
    col: 10,
    row: 0,
    preview: 'selection',
    item: {
      title: '׳³ֲ¡׳³ג„¢׳³ג€˜׳³ֳ— ׳³ג€”׳³ג€“׳³ֲ¨׳³ג€',
      nameEn: 'Client Return Motivation',
      href: '/(auth)/onboarding-client-return-motivation',
      icon: 'repeat-outline',
      tone: 'info',
    },
  },
  {
    id: 'sign-in',
    col: 11,
    row: 0,
    preview: 'sign-in',
    item: {
      title: 'SIGN IN',
      nameEn: 'Sign In',
      href: '/(auth)/sign-in',
      icon: 'log-in-outline',
      tone: 'neutral',
    },
  },
  {
    id: 'customer-wallet',
    col: 12,
    row: 0,
    preview: 'main',
    item: {
      title: '׳³ֲ׳³ֲ¨׳³ֲ ׳³ֲ§ ׳³ֲ׳³ֲ§׳³ג€¢׳³ג€”',
      nameEn: 'Customer Wallet',
      href: '/(authenticated)/(customer)/wallet',
      icon: 'wallet-outline',
      tone: 'info',
    },
  },
  {
    id: 'customer-discovery',
    col: 13,
    row: 0,
    preview: 'main',
    item: {
      title: '׳³ג€™׳³ג„¢׳³ֲ׳³ג€¢׳³ג„¢',
      nameEn: 'Customer Discovery',
      href: '/(authenticated)/(customer)/discovery',
      icon: 'compass-outline',
      tone: 'info',
    },
  },
  {
    id: 'customer-rewards',
    col: 14,
    row: 0,
    preview: 'main',
    item: {
      title: '׳³ג€׳³ֻ׳³ג€˜׳³ג€¢׳³ֳ—',
      nameEn: 'Customer Rewards',
      href: '/(authenticated)/(customer)/rewards',
      icon: 'gift-outline',
      tone: 'info',
    },
  },
  {
    id: 'business-role',
    col: 4,
    row: 2,
    preview: 'selection',
    item: {
      title: '׳³ֳ—׳³ג‚×׳³ֲ§׳³ג„¢׳³ג€ ׳³ֲ¢׳³ֲ¡׳³ֲ§',
      nameEn: 'Business Role',
      href: '/(auth)/onboarding-business-role',
      icon: 'briefcase-outline',
      tone: 'success',
    },
  },
  {
    id: 'business-discovery',
    col: 5,
    row: 2,
    preview: 'selection',
    item: {
      title: '׳³ג€™׳³ג„¢׳³ֲ׳³ג€¢׳³ג„¢ ׳³ֲ¢׳³ֲ¡׳³ֲ§',
      nameEn: 'Business Discovery',
      href: '/(auth)/onboarding-business-discovery',
      icon: 'compass-outline',
      tone: 'success',
    },
  },
  {
    id: 'business-reason',
    col: 6,
    row: 2,
    preview: 'selection',
    item: {
      title: '׳³ֲ¡׳³ג„¢׳³ג€˜׳³ג€ ׳³ֲ׳³ֲ¨׳³ג€÷׳³ג€“׳³ג„¢׳³ֳ—',
      nameEn: 'Business Reason',
      href: '/(auth)/onboarding-business-reason',
      icon: 'help-circle-outline',
      tone: 'success',
    },
  },
  {
    id: 'business-name',
    col: 7,
    row: 2,
    preview: 'form',
    item: {
      title: '׳³ֲ©׳³ֲ ׳³ג€׳³ֲ¢׳³ֲ¡׳³ֲ§',
      nameEn: 'Business Name',
      href: '/(auth)/onboarding-business-name',
      icon: 'document-text-outline',
      tone: 'success',
    },
  },
  {
    id: 'business-usage',
    col: 8,
    row: 2,
    preview: 'selection',
    item: {
      title: '׳³ֲ׳³ג€“׳³ג€¢׳³ֲ¨ ׳³ג‚×׳³ֲ¢׳³ג„¢׳³ֲ׳³ג€¢׳³ֳ— ׳³ֲ¢׳³ֲ¡׳³ֲ§',
      nameEn: 'Business Usage Area',
      href: '/(auth)/onboarding-business-usage-area',
      icon: 'map-outline',
      tone: 'success',
    },
  },
  {
    id: 'paywall',
    col: 9,
    row: 2,
    preview: 'paywall',
    item: {
      title: 'PAYWALL',
      nameEn: 'Paywall',
      href: '/(auth)/paywall',
      icon: 'card-outline',
      tone: 'success',
    },
  },
  {
    id: 'business-dashboard',
    col: 12,
    row: 2,
    preview: 'dashboard',
    item: {
      title: '׳³ג€׳³ֲ©׳³ג€˜׳³ג€¢׳³ֲ¨׳³ג€ ׳³ֲ¢׳³ֲ¡׳³ֲ§',
      nameEn: 'Business Dashboard',
      href: '/(authenticated)/(business)/dashboard',
      icon: 'stats-chart-outline',
      tone: 'success',
    },
  },
  {
    id: 'business-scanner',
    col: 13,
    row: 2,
    preview: 'scanner',
    item: {
      title: '׳³ֲ¡׳³ג€¢׳³ֲ¨׳³ֲ§ ׳³ֲ¢׳³ֲ¡׳³ֲ§',
      nameEn: 'Business Scanner',
      href: '/(authenticated)/(business)/scanner',
      icon: 'qr-code-outline',
      tone: 'success',
    },
  },
  {
    id: 'business-analytics',
    col: 14,
    row: 2,
    preview: 'analytics',
    item: {
      title: '׳³ֲ׳³ֲ ׳³ֲ׳³ג„¢׳³ֻ׳³ג„¢׳³ֲ§׳³ֲ¡ ׳³ֲ¢׳³ֲ¡׳³ֲ§',
      nameEn: 'Business Analytics',
      href: '/(authenticated)/(business)/analytics',
      icon: 'analytics-outline',
      tone: 'success',
    },
  },
  {
    id: 'admin-dashboard',
    col: 12,
    row: 3,
    preview: 'main',
    item: {
      title: '׳³ג€׳³ֲ©׳³ג€˜׳³ג€¢׳³ֲ¨׳³ג€ ׳³ֲ׳³ג€׳³ֲ׳³ג„¢׳³ֲ',
      nameEn: 'Admin Dashboard',
      href: '/(authenticated)/merchant',
      icon: 'shield-checkmark-outline',
      tone: 'accent',
    },
  },
  {
    id: 'admin-analytics',
    col: 13,
    row: 3,
    preview: 'main',
    item: {
      title: '׳³ֲ׳³ֲ ׳³ֲ׳³ג„¢׳³ֻ׳³ג„¢׳³ֲ§׳³ֲ¡ ׳³ֲ׳³ג€׳³ֲ׳³ג„¢׳³ֲ',
      nameEn: 'Admin Analytics',
      href: '/(authenticated)/merchant/analytics',
      icon: 'bar-chart-outline',
      tone: 'accent',
    },
  },
  {
    id: 'admin-store',
    col: 14,
    row: 3,
    preview: 'main',
    item: {
      title: '׳³ג€׳³ג€™׳³ג€׳³ֲ¨׳³ג€¢׳³ֳ— ׳³ג€”׳³ֲ ׳³ג€¢׳³ֳ—',
      nameEn: 'Admin Store Settings',
      href: '/(authenticated)/merchant/store-settings',
      icon: 'storefront-outline',
      tone: 'accent',
    },
  },
  {
    id: 'customer-settings',
    col: 15,
    row: 0,
    preview: 'settings',
    item: {
      title: '׳³ג€׳³ג€™׳³ג€׳³ֲ¨׳³ג€¢׳³ֳ— ׳³ֲ׳³ֲ§׳³ג€¢׳³ג€”',
      nameEn: 'Customer Settings',
      href: '/(authenticated)/(customer)/settings',
      icon: 'settings-outline',
      tone: 'info',
    },
  },
  {
    id: 'join',
    col: 16,
    row: 0,
    preview: 'join',
    item: {
      title: '׳³ג€׳³ֲ¦׳³ֻ׳³ֲ¨׳³ג‚×׳³ג€¢׳³ֳ—',
      nameEn: 'Join',
      href: '/(authenticated)/join',
      icon: 'person-add-outline',
      tone: 'info',
    },
  },
  {
    id: 'card-detail',
    col: 17,
    row: 0,
    preview: 'card-detail',
    item: {
      title: '׳³ג€÷׳³ֲ¨׳³ֻ׳³ג„¢׳³ֲ¡ ׳³ֲ ׳³ֲ׳³ֲ׳³ֲ ׳³ג€¢׳³ֳ—',
      nameEn: 'Card Detail',
      href: '/(authenticated)/card/map-preview',
      icon: 'card-outline',
      tone: 'info',
    },
  },
  {
    id: 'business-team',
    col: 15,
    row: 2,
    preview: 'team',
    item: {
      title: '׳³ֲ¦׳³ג€¢׳³ג€¢׳³ֳ— ׳³ֲ¢׳³ֲ¡׳³ֲ§',
      nameEn: 'Business Team',
      href: '/(authenticated)/(business)/team',
      icon: 'people-outline',
      tone: 'success',
    },
  },
  {
    id: 'business-settings',
    col: 16,
    row: 2,
    preview: 'settings',
    item: {
      title: '׳³ג€׳³ג€™׳³ג€׳³ֲ¨׳³ג€¢׳³ֳ— ׳³ֲ¢׳³ֲ¡׳³ֲ§',
      nameEn: 'Business Settings',
      href: '/(authenticated)/(business)/settings',
      icon: 'settings-outline',
      tone: 'success',
    },
  },
  {
    id: 'business-qr',
    col: 17,
    row: 2,
    preview: 'qr',
    item: {
      title: 'QR ׳³ֲ¡׳³ג€¢׳³ֲ¨׳³ֲ§ ׳³ֲ¢׳³ג€¢׳³ג€˜׳³ג€׳³ג„¢׳³ֲ',
      nameEn: 'Business QR',
      href: '/(authenticated)/(business)/qr',
      icon: 'qr-code-outline',
      tone: 'success',
    },
  },
  {
    id: 'merchant-profile-settings',
    col: 15,
    row: 3,
    preview: 'settings',
    item: {
      title: '׳³ג€׳³ג€™׳³ג€׳³ֲ¨׳³ג€¢׳³ֳ— ׳³ג‚×׳³ֲ¨׳³ג€¢׳³ג‚×׳³ג„¢׳³ֲ',
      nameEn: 'Merchant Profile',
      href: '/(authenticated)/merchant/profile-settings',
      icon: 'person-outline',
      tone: 'accent',
    },
  },
  {
    id: 'merchant-qr',
    col: 16,
    row: 3,
    preview: 'qr',
    item: {
      title: 'QR ׳³ֲ¢׳³ֲ¡׳³ֲ§',
      nameEn: 'Merchant QR',
      href: '/(authenticated)/merchant/qr',
      icon: 'qr-code-outline',
      tone: 'accent',
    },
  },
  {
    id: 'merchant-create-business',
    col: 12,
    row: 4,
    preview: 'merchant-onboarding',
    item: {
      title: '׳³ג„¢׳³ֲ¦׳³ג„¢׳³ֲ¨׳³ֳ— ׳³ֲ¢׳³ֲ¡׳³ֲ§',
      nameEn: 'Create Business',
      href: '/(authenticated)/merchant/onboarding/create-business',
      icon: 'business-outline',
      tone: 'accent',
    },
  },
  {
    id: 'merchant-create-program',
    col: 13,
    row: 4,
    preview: 'merchant-onboarding',
    item: {
      title: '׳³ג„¢׳³ֲ¦׳³ג„¢׳³ֲ¨׳³ֳ— ׳³ֳ—׳³ג€÷׳³ֲ ׳³ג„¢׳³ֳ—',
      nameEn: 'Create Program',
      href: '/(authenticated)/merchant/onboarding/create-program',
      icon: 'list-outline',
      tone: 'accent',
    },
  },
  {
    id: 'merchant-preview-card',
    col: 14,
    row: 4,
    preview: 'card-detail',
    item: {
      title: '׳³ֳ—׳³ֲ¦׳³ג€¢׳³ג€™׳³ג€ ׳³ֲ׳³ֲ§׳³ג€׳³ג„¢׳³ֲ׳³ג€',
      nameEn: 'Preview Card',
      href: '/(authenticated)/merchant/onboarding/preview-card',
      icon: 'eye-outline',
      tone: 'accent',
    },
  },
];

const DIAGRAM_EDGES: DiagramEdge[] = [
  { from: 'auth-index', to: 'welcome', label: 'redirect', kind: 'system' },
  {
    from: 'welcome',
    to: 'sign-up',
    label: '׳³ג€÷׳³ג‚×׳³ֳ—׳³ג€¢׳³ֲ¨ "׳³ג€˜׳³ג€¢׳³ֲ׳³ג€¢ ׳³ֲ ׳³ֳ—׳³ג€”׳³ג„¢׳³ֲ"',
    kind: 'primary',
  },
  {
    from: 'welcome',
    to: 'sign-in',
    label: '"׳³ג€׳³ֳ—׳³ג€”׳³ג€˜׳³ֲ¨׳³ג€¢ ׳³ג€÷׳³ֲ׳³ֲ"',
    kind: 'secondary',
    fromAnchor: 'bottom',
    toAnchor: 'top',
  },
  {
    from: 'sign-up',
    to: 'welcome',
    label: '׳³ג€÷׳³ג‚×׳³ֳ—׳³ג€¢׳³ֲ¨ ׳³ג€”׳³ג€“׳³ג€¢׳³ֲ¨',
    kind: 'back',
  },
  {
    from: 'sign-up',
    to: 'role',
    label: '׳³ג€÷׳³ג‚×׳³ֳ—׳³ג€¢׳³ֲ¨ ׳³ג€׳³ֲ׳³ֲ©׳³ֲ',
    kind: 'primary',
  },
  {
    from: 'sign-up',
    to: 'legal',
    label: '"׳³ֲ׳³ֲ¡׳³ֲ׳³ֲ ׳³ֲ׳³ֲ©׳³ג‚×׳³ֻ׳³ג„¢"',
    kind: 'secondary',
    fromAnchor: 'bottom',
    toAnchor: 'top',
  },
  {
    from: 'legal',
    to: 'sign-up',
    label: '׳³ג€÷׳³ג‚×׳³ֳ—׳³ג€¢׳³ֲ¨ ׳³ג€”׳³ג€“׳³ג€¢׳³ֲ¨',
    kind: 'back',
    fromAnchor: 'top',
    toAnchor: 'bottom',
  },
  {
    from: 'role',
    to: 'sign-up',
    label: '׳³ג€÷׳³ג‚×׳³ֳ—׳³ג€¢׳³ֲ¨ ׳³ג€”׳³ג€“׳³ג€¢׳³ֲ¨',
    kind: 'back',
  },
  {
    from: 'role',
    to: 'client-details',
    label: '׳³ג€˜׳³ג€”׳³ג„¢׳³ֲ¨׳³ֳ— ׳³ֲ׳³ֲ§׳³ג€¢׳³ג€” + ׳³ג€׳³ֲ׳³ֲ©׳³ֲ',
    kind: 'primary',
  },
  {
    from: 'role',
    to: 'business-role',
    label: '׳³ג€˜׳³ג€”׳³ג„¢׳³ֲ¨׳³ֳ— ׳³ֲ¢׳³ֲ¡׳³ֲ§ + ׳³ג€׳³ֲ׳³ֲ©׳³ֲ',
    kind: 'primary',
    fromAnchor: 'bottom',
    toAnchor: 'top',
  },
  {
    from: 'client-details',
    to: 'role',
    label: '׳³ג€÷׳³ג‚×׳³ֳ—׳³ג€¢׳³ֲ¨ ׳³ג€”׳³ג€“׳³ג€¢׳³ֲ¨',
    kind: 'back',
  },
  {
    from: 'client-details',
    to: 'client-otp',
    label: '"׳³ג€׳³ֲ׳³ֲ©׳³ֲ ׳³ֲ׳³ֲ§׳³ג€¢׳³ג€ ׳³ֲ׳³ג„¢׳³ֲ׳³ג€¢׳³ֳ—"',
    kind: 'primary',
  },
  {
    from: 'client-otp',
    to: 'client-details',
    label: '׳³ג€÷׳³ג‚×׳³ֳ—׳³ג€¢׳³ֲ¨ ׳³ג€”׳³ג€“׳³ג€¢׳³ֲ¨',
    kind: 'back',
  },
  {
    from: 'client-otp',
    to: 'client-details',
    label: '"׳³ֲ¢׳³ֲ¨׳³ג€¢׳³ֲ ׳³ג‚×׳³ֲ¨׳³ֻ׳³ג„¢׳³ֲ"',
    kind: 'secondary',
    fromAnchor: 'bottom',
    toAnchor: 'top',
  },
  {
    from: 'client-otp',
    to: 'client-interests',
    label: '׳³ג€÷׳³ג‚×׳³ֳ—׳³ג€¢׳³ֲ¨ ׳³ג€׳³ֲ׳³ֲ©׳³ֲ',
    kind: 'primary',
  },
  {
    from: 'client-interests',
    to: 'client-otp',
    label: '׳³ג€÷׳³ג‚×׳³ֳ—׳³ג€¢׳³ֲ¨ ׳³ג€”׳³ג€“׳³ג€¢׳³ֲ¨',
    kind: 'back',
  },
  {
    from: 'client-interests',
    to: 'client-usage',
    label: '׳³ג€÷׳³ג‚×׳³ֳ—׳³ג€¢׳³ֲ¨ ׳³ג€׳³ֲ׳³ֲ©׳³ֲ',
    kind: 'primary',
  },
  {
    from: 'client-usage',
    to: 'client-interests',
    label: '׳³ג€÷׳³ג‚×׳³ֳ—׳³ג€¢׳³ֲ¨ ׳³ג€”׳³ג€“׳³ג€¢׳³ֲ¨',
    kind: 'back',
  },
  {
    from: 'client-usage',
    to: 'client-fit',
    label: '׳³ג€÷׳³ג‚×׳³ֳ—׳³ג€¢׳³ֲ¨ ׳³ג€׳³ֲ׳³ֲ©׳³ֲ',
    kind: 'primary',
  },
  {
    from: 'client-fit',
    to: 'client-usage',
    label: '׳³ג€÷׳³ג‚×׳³ֳ—׳³ג€¢׳³ֲ¨ ׳³ג€”׳³ג€“׳³ג€¢׳³ֲ¨',
    kind: 'back',
  },
  {
    from: 'client-fit',
    to: 'client-frequency',
    label: '׳³ג€÷׳³ג‚×׳³ֳ—׳³ג€¢׳³ֲ¨ ׳³ג€׳³ֲ׳³ֲ©׳³ֲ',
    kind: 'primary',
  },
  {
    from: 'client-frequency',
    to: 'client-fit',
    label: '׳³ג€÷׳³ג‚×׳³ֳ—׳³ג€¢׳³ֲ¨ ׳³ג€”׳³ג€“׳³ג€¢׳³ֲ¨',
    kind: 'back',
  },
  {
    from: 'client-frequency',
    to: 'client-return',
    label: '׳³ג€÷׳³ג‚×׳³ֳ—׳³ג€¢׳³ֲ¨ ׳³ג€׳³ֲ׳³ֲ©׳³ֲ',
    kind: 'primary',
  },
  {
    from: 'client-return',
    to: 'client-frequency',
    label: '׳³ג€÷׳³ג‚×׳³ֳ—׳³ג€¢׳³ֲ¨ ׳³ג€”׳³ג€“׳³ג€¢׳³ֲ¨',
    kind: 'back',
  },
  {
    from: 'client-return',
    to: 'sign-in',
    label: '׳³ג€÷׳³ג‚×׳³ֳ—׳³ג€¢׳³ֲ¨ ׳³ג€׳³ֲ׳³ֲ©׳³ֲ',
    kind: 'primary',
    fromAnchor: 'right',
    toAnchor: 'left',
  },
  {
    from: 'business-role',
    to: 'role',
    label: '׳³ג€÷׳³ג‚×׳³ֳ—׳³ג€¢׳³ֲ¨ ׳³ג€”׳³ג€“׳³ג€¢׳³ֲ¨',
    kind: 'back',
    fromAnchor: 'top',
    toAnchor: 'bottom',
  },
  {
    from: 'business-role',
    to: 'business-discovery',
    label: '׳³ג€÷׳³ג‚×׳³ֳ—׳³ג€¢׳³ֲ¨ ׳³ג€׳³ֲ׳³ֲ©׳³ֲ',
    kind: 'primary',
  },
  {
    from: 'business-discovery',
    to: 'business-role',
    label: '׳³ג€÷׳³ג‚×׳³ֳ—׳³ג€¢׳³ֲ¨ ׳³ג€”׳³ג€“׳³ג€¢׳³ֲ¨',
    kind: 'back',
  },
  {
    from: 'business-discovery',
    to: 'business-reason',
    label: '׳³ג€÷׳³ג‚×׳³ֳ—׳³ג€¢׳³ֲ¨ ׳³ג€׳³ֲ׳³ֲ©׳³ֲ',
    kind: 'primary',
  },
  {
    from: 'business-reason',
    to: 'business-discovery',
    label: '׳³ג€÷׳³ג‚×׳³ֳ—׳³ג€¢׳³ֲ¨ ׳³ג€”׳³ג€“׳³ג€¢׳³ֲ¨',
    kind: 'back',
  },
  {
    from: 'business-reason',
    to: 'business-name',
    label: '׳³ג€÷׳³ג‚×׳³ֳ—׳³ג€¢׳³ֲ¨ ׳³ג€׳³ֲ׳³ֲ©׳³ֲ',
    kind: 'primary',
  },
  {
    from: 'business-name',
    to: 'business-reason',
    label: '׳³ג€÷׳³ג‚×׳³ֳ—׳³ג€¢׳³ֲ¨ ׳³ג€”׳³ג€“׳³ג€¢׳³ֲ¨',
    kind: 'back',
  },
  {
    from: 'business-name',
    to: 'business-usage',
    label: '׳³ג€÷׳³ג‚×׳³ֳ—׳³ג€¢׳³ֲ¨ ׳³ג€׳³ֲ׳³ֲ©׳³ֲ',
    kind: 'primary',
  },
  {
    from: 'business-usage',
    to: 'business-name',
    label: '׳³ג€÷׳³ג‚×׳³ֳ—׳³ג€¢׳³ֲ¨ ׳³ג€”׳³ג€“׳³ג€¢׳³ֲ¨',
    kind: 'back',
  },
  {
    from: 'business-usage',
    to: 'paywall',
    label: '׳³ג€÷׳³ג‚×׳³ֳ—׳³ג€¢׳³ֲ¨ ׳³ג€׳³ֲ׳³ֲ©׳³ֲ',
    kind: 'primary',
  },
  {
    from: 'paywall',
    to: 'sign-in',
    label: '׳³ֲ¡׳³ג€™׳³ג„¢׳³ֲ¨׳³ג€ (X)',
    kind: 'back',
    fromAnchor: 'top',
    toAnchor: 'bottom',
  },
  {
    from: 'paywall',
    to: 'sign-in',
    label: '׳³ֲ¨׳³ג€÷׳³ג„¢׳³ֲ©׳³ג€ ׳³ג€׳³ֲ¦׳³ֲ׳³ג„¢׳³ג€”׳³ג€',
    kind: 'primary',
    fromAnchor: 'right',
    toAnchor: 'bottom',
  },
  {
    from: 'paywall',
    to: 'sign-in',
    label: '"׳³ֲ©׳³ג€”׳³ג€“׳³ג€¢׳³ֲ¨"',
    kind: 'secondary',
    fromAnchor: 'top',
    toAnchor: 'bottom',
  },
  {
    from: 'paywall',
    to: 'legal',
    label: '"׳³ֲ׳³ֲ¡׳³ֲ׳³ֲ ׳³ֲ׳³ֲ©׳³ג‚×׳³ֻ׳³ג„¢"',
    kind: 'secondary',
    fromAnchor: 'top',
    toAnchor: 'right',
  },
  {
    from: 'sign-in',
    to: 'sign-up',
    label: '׳³ג€÷׳³ג‚×׳³ֳ—׳³ג€¢׳³ֲ¨ ׳³ג€”׳³ג€“׳³ג€¢׳³ֲ¨',
    kind: 'back',
    fromAnchor: 'left',
    toAnchor: 'right',
  },
  {
    from: 'sign-in',
    to: 'sign-up',
    label: '׳³ֲ§׳³ג„¢׳³ֲ©׳³ג€¢׳³ֲ¨ "׳³ג€׳³ג„¢׳³ֲ¨׳³ֲ©׳³ֲ ׳³ג€÷׳³ֲ׳³ֲ"',
    kind: 'secondary',
    fromAnchor: 'top',
    toAnchor: 'bottom',
  },
  {
    from: 'sign-in',
    to: 'customer-wallet',
    label: '׳³ג€׳³ֳ—׳³ג€”׳³ג€˜׳³ֲ¨׳³ג€¢׳³ֳ— ׳³ג€׳³ֲ¦׳³ֲ׳³ג„¢׳³ג€”׳³ג€',
    kind: 'primary',
  },
  {
    from: 'sign-in',
    to: 'business-dashboard',
    label: '׳³ֲ׳³ֲ ׳³ֲ׳³ֲ¦׳³ג€˜ ׳³ֲ¢׳³ֲ¡׳³ֲ§',
    kind: 'secondary',
    fromAnchor: 'bottom',
    toAnchor: 'left',
  },
  {
    from: 'sign-in',
    to: 'admin-dashboard',
    label: '׳³ֲ׳³ֲ ׳³ֲ׳³ֲ¦׳³ג€˜ ׳³ֲ׳³ג€׳³ֲ׳³ג„¢׳³ֲ',
    kind: 'secondary',
    fromAnchor: 'bottom',
    toAnchor: 'left',
  },
  {
    from: 'customer-wallet',
    to: 'customer-discovery',
    label: '׳³ֻ׳³ֲ׳³ג€˜ ׳³ֳ—׳³ג€”׳³ֳ—׳³ג€¢׳³ֲ',
    kind: 'secondary',
  },
  {
    from: 'customer-wallet',
    to: 'customer-rewards',
    label: '׳³ֻ׳³ֲ׳³ג€˜ ׳³ֳ—׳³ג€”׳³ֳ—׳³ג€¢׳³ֲ',
    kind: 'secondary',
  },
  {
    from: 'business-dashboard',
    to: 'business-scanner',
    label: '׳³ֻ׳³ֲ׳³ג€˜ ׳³ֳ—׳³ג€”׳³ֳ—׳³ג€¢׳³ֲ',
    kind: 'secondary',
  },
  {
    from: 'business-dashboard',
    to: 'business-analytics',
    label: '׳³ֻ׳³ֲ׳³ג€˜ ׳³ֳ—׳³ג€”׳³ֳ—׳³ג€¢׳³ֲ',
    kind: 'secondary',
  },
  {
    from: 'admin-dashboard',
    to: 'admin-analytics',
    label: '׳³ֲ ׳³ג„¢׳³ג€¢׳³ג€¢׳³ֻ ׳³ג‚×׳³ֲ ׳³ג„¢׳³ֲ׳³ג„¢',
    kind: 'secondary',
  },
  {
    from: 'admin-dashboard',
    to: 'admin-store',
    label: '׳³ֲ ׳³ג„¢׳³ג€¢׳³ג€¢׳³ֻ ׳³ג‚×׳³ֲ ׳³ג„¢׳³ֲ׳³ג„¢',
    kind: 'secondary',
  },
  {
    from: 'customer-wallet',
    to: 'join',
    label: '׳³ֲ§׳³ג„¢׳³ֲ©׳³ג€¢׳³ֲ¨ ׳³ֲ¢׳³ֲ׳³ג€¢׳³ֲ§',
    kind: 'secondary',
    fromAnchor: 'bottom',
    toAnchor: 'top',
  },
  {
    from: 'customer-wallet',
    to: 'card-detail',
    label: '׳³ֲ׳³ג€”׳³ג„¢׳³ֲ¦׳³ג€ ׳³ֲ¢׳³ֲ ׳³ג€÷׳³ֲ¨׳³ֻ׳³ג„¢׳³ֲ¡',
    kind: 'primary',
    fromAnchor: 'right',
    toAnchor: 'left',
  },
  {
    from: 'join',
    to: 'card-detail',
    label: '׳³ג€׳³ֲ¦׳³ֻ׳³ֲ¨׳³ג‚×׳³ג€¢׳³ֳ— + membershipId',
    kind: 'primary',
    fromAnchor: 'right',
    toAnchor: 'left',
  },
  {
    from: 'join',
    to: 'customer-wallet',
    label: '׳³ג€÷׳³ג‚×׳³ֳ—׳³ג€¢׳³ֲ¨ ׳³ג€”׳³ג€“׳³ג€¢׳³ֲ¨',
    kind: 'back',
    fromAnchor: 'left',
    toAnchor: 'right',
  },
  {
    from: 'card-detail',
    to: 'customer-wallet',
    label: '׳³ג€÷׳³ג‚×׳³ֳ—׳³ג€¢׳³ֲ¨ ׳³ג€”׳³ג€“׳³ג€¢׳³ֲ¨',
    kind: 'back',
    fromAnchor: 'left',
    toAnchor: 'right',
  },
  {
    from: 'customer-wallet',
    to: 'customer-settings',
    label: '׳³ֻ׳³ֲ׳³ג€˜ ׳³ֳ—׳³ג€”׳³ֳ—׳³ג€¢׳³ֲ',
    kind: 'secondary',
  },
  {
    from: 'customer-discovery',
    to: 'customer-wallet',
    label: '׳³ֻ׳³ֲ׳³ג€˜ ׳³ֳ—׳³ג€”׳³ֳ—׳³ג€¢׳³ֲ',
    kind: 'secondary',
    fromAnchor: 'left',
    toAnchor: 'right',
  },
  {
    from: 'customer-discovery',
    to: 'customer-rewards',
    label: '׳³ֻ׳³ֲ׳³ג€˜ ׳³ֳ—׳³ג€”׳³ֳ—׳³ג€¢׳³ֲ',
    kind: 'secondary',
  },
  {
    from: 'customer-rewards',
    to: 'customer-discovery',
    label: '׳³ֻ׳³ֲ׳³ג€˜ ׳³ֳ—׳³ג€”׳³ֳ—׳³ג€¢׳³ֲ',
    kind: 'secondary',
    fromAnchor: 'right',
    toAnchor: 'left',
  },
  {
    from: 'customer-rewards',
    to: 'customer-wallet',
    label: '׳³ֻ׳³ֲ׳³ג€˜ ׳³ֳ—׳³ג€”׳³ֳ—׳³ג€¢׳³ֲ',
    kind: 'secondary',
    fromAnchor: 'left',
    toAnchor: 'right',
  },
  {
    from: 'customer-settings',
    to: 'customer-wallet',
    label: '׳³ג€÷׳³ג‚×׳³ֳ—׳³ג€¢׳³ֲ¨ ׳³ג€”׳³ג€“׳³ג€¢׳³ֲ¨',
    kind: 'back',
    fromAnchor: 'left',
    toAnchor: 'right',
  },
  {
    from: 'customer-settings',
    to: 'sign-up',
    label: '"׳³ג„¢׳³ֲ¦׳³ג„¢׳³ֲ׳³ג€ ׳³ֲ׳³ג€׳³ג€”׳³ֲ©׳³ג€˜׳³ג€¢׳³ֲ"',
    kind: 'secondary',
    fromAnchor: 'bottom',
    toAnchor: 'top',
  },
  {
    from: 'customer-settings',
    to: 'business-dashboard',
    label: '"׳³ֲ׳³ֲ¦׳³ג€˜ ׳³ֲ¢׳³ֲ¡׳³ֲ§" (DEV)',
    kind: 'secondary',
    fromAnchor: 'bottom',
    toAnchor: 'top',
  },
  {
    from: 'business-dashboard',
    to: 'merchant-create-business',
    label: '"׳³ג‚×׳³ֳ—׳³ג€” ׳³ֲ׳³ג€¢׳³ֲ ׳³ג€˜׳³ג€¢׳³ֲ¨׳³ג€׳³ג„¢׳³ֲ ׳³ג€™"',
    kind: 'primary',
    fromAnchor: 'bottom',
    toAnchor: 'top',
  },
  {
    from: 'business-dashboard',
    to: 'paywall',
    label: '"׳³ֲ©׳³ג€׳³ֲ¨׳³ג€™ ׳³ֲ-Pro"',
    kind: 'secondary',
    fromAnchor: 'bottom',
    toAnchor: 'top',
  },
  {
    from: 'business-dashboard',
    to: 'admin-store',
    label: '"׳³ג€׳³ג€™׳³ג€׳³ֲ¨׳³ג€¢׳³ֳ— ׳³ג€”׳³ֲ ׳³ג€¢׳³ֳ—"',
    kind: 'secondary',
    fromAnchor: 'bottom',
    toAnchor: 'top',
  },
  {
    from: 'business-dashboard',
    to: 'merchant-profile-settings',
    label: '"׳³ג€׳³ג€™׳³ג€׳³ֲ¨׳³ג€¢׳³ֳ— ׳³ג‚×׳³ֲ¨׳³ג€¢׳³ג‚×׳³ג„¢׳³ֲ"',
    kind: 'secondary',
    fromAnchor: 'bottom',
    toAnchor: 'top',
  },
  {
    from: 'business-dashboard',
    to: 'merchant-qr',
    label: '"QR ׳³ֲ¢׳³ֲ¡׳³ֲ§"',
    kind: 'secondary',
    fromAnchor: 'bottom',
    toAnchor: 'top',
  },
  {
    from: 'business-dashboard',
    to: 'business-qr',
    label: '"QR ׳³ֲ¡׳³ג€¢׳³ֲ¨׳³ֲ§ ׳³ֲ¢׳³ג€¢׳³ג€˜׳³ג€׳³ג„¢׳³ֲ"',
    kind: 'secondary',
    fromAnchor: 'right',
    toAnchor: 'left',
  },
  {
    from: 'business-dashboard',
    to: 'business-team',
    label: '"׳³ֲ ׳³ג„¢׳³ג€׳³ג€¢׳³ֲ ׳³ֲ¦׳³ג€¢׳³ג€¢׳³ֳ— ׳³ֲ¢׳³ג€¢׳³ג€˜׳³ג€׳³ג„¢׳³ֲ"',
    kind: 'secondary',
  },
  {
    from: 'business-scanner',
    to: 'business-dashboard',
    label: '׳³ֻ׳³ֲ׳³ג€˜ ׳³ֳ—׳³ג€”׳³ֳ—׳³ג€¢׳³ֲ',
    kind: 'secondary',
    fromAnchor: 'left',
    toAnchor: 'right',
  },
  {
    from: 'business-team',
    to: 'business-dashboard',
    label: '׳³ֻ׳³ֲ׳³ג€˜ ׳³ֳ—׳³ג€”׳³ֳ—׳³ג€¢׳³ֲ',
    kind: 'secondary',
    fromAnchor: 'left',
    toAnchor: 'right',
  },
  {
    from: 'business-analytics',
    to: 'business-dashboard',
    label: '׳³ֻ׳³ֲ׳³ג€˜ ׳³ֳ—׳³ג€”׳³ֳ—׳³ג€¢׳³ֲ',
    kind: 'secondary',
    fromAnchor: 'left',
    toAnchor: 'right',
  },
  {
    from: 'business-dashboard',
    to: 'business-settings',
    label: '׳³ֻ׳³ֲ׳³ג€˜ ׳³ֳ—׳³ג€”׳³ֳ—׳³ג€¢׳³ֲ',
    kind: 'secondary',
  },
  {
    from: 'business-settings',
    to: 'business-dashboard',
    label: '׳³ג€÷׳³ג‚×׳³ֳ—׳³ג€¢׳³ֲ¨ ׳³ג€”׳³ג€“׳³ג€¢׳³ֲ¨',
    kind: 'back',
    fromAnchor: 'left',
    toAnchor: 'right',
  },
  {
    from: 'business-settings',
    to: 'sign-up',
    label: '"׳³ג„¢׳³ֲ¦׳³ג„¢׳³ֲ׳³ג€ ׳³ֲ׳³ג€׳³ג€”׳³ֲ©׳³ג€˜׳³ג€¢׳³ֲ"',
    kind: 'secondary',
    fromAnchor: 'bottom',
    toAnchor: 'top',
  },
  {
    from: 'business-settings',
    to: 'customer-wallet',
    label: '"׳³ֲ׳³ֲ¦׳³ג€˜ ׳³ֲ׳³ֲ§׳³ג€¢׳³ג€”"',
    kind: 'secondary',
    fromAnchor: 'bottom',
    toAnchor: 'top',
  },
  {
    from: 'business-qr',
    to: 'business-dashboard',
    label: '׳³ג€÷׳³ג‚×׳³ֳ—׳³ג€¢׳³ֲ¨ ׳³ג€”׳³ג€“׳³ג€¢׳³ֲ¨',
    kind: 'back',
    fromAnchor: 'left',
    toAnchor: 'right',
  },
  {
    from: 'merchant-profile-settings',
    to: 'business-dashboard',
    label: '׳³ג€÷׳³ג‚×׳³ֳ—׳³ג€¢׳³ֲ¨ ׳³ג€”׳³ג€“׳³ג€¢׳³ֲ¨',
    kind: 'back',
    fromAnchor: 'left',
    toAnchor: 'right',
  },
  {
    from: 'merchant-qr',
    to: 'business-dashboard',
    label: '׳³ג€÷׳³ג‚×׳³ֳ—׳³ג€¢׳³ֲ¨ ׳³ג€”׳³ג€“׳³ג€¢׳³ֲ¨',
    kind: 'back',
    fromAnchor: 'left',
    toAnchor: 'right',
  },
  {
    from: 'merchant-create-business',
    to: 'business-dashboard',
    label: '׳³ג€÷׳³ג‚×׳³ֳ—׳³ג€¢׳³ֲ¨ ׳³ג€”׳³ג€“׳³ג€¢׳³ֲ¨',
    kind: 'back',
    fromAnchor: 'left',
    toAnchor: 'right',
  },
  {
    from: 'merchant-create-business',
    to: 'merchant-create-program',
    label: '"׳³ֲ©׳³ֲ׳³ג€¢׳³ֲ¨ ׳³ג€¢׳³ֲ¢׳³ג€˜׳³ג€¢׳³ֲ¨ ׳³ֲ׳³ֲ©׳³ֲ׳³ג€˜ ׳³ג€׳³ג€˜׳³ֲ"',
    kind: 'primary',
  },
  {
    from: 'merchant-create-program',
    to: 'merchant-create-business',
    label: '׳³ג€÷׳³ג‚×׳³ֳ—׳³ג€¢׳³ֲ¨ ׳³ג€”׳³ג€“׳³ג€¢׳³ֲ¨',
    kind: 'back',
    fromAnchor: 'left',
    toAnchor: 'right',
  },
  {
    from: 'merchant-create-program',
    to: 'merchant-preview-card',
    label: '"׳³ֲ©׳³ֲ׳³ג€¢׳³ֲ¨ ׳³ֳ—׳³ג€÷׳³ֲ ׳³ג„¢׳³ֳ— ׳³ג€¢׳³ג€׳³ֲ׳³ֲ©׳³ֲ"',
    kind: 'primary',
  },
  {
    from: 'merchant-preview-card',
    to: 'merchant-create-program',
    label: '׳³ג€÷׳³ג‚×׳³ֳ—׳³ג€¢׳³ֲ¨ ׳³ג€”׳³ג€“׳³ג€¢׳³ֲ¨',
    kind: 'back',
    fromAnchor: 'left',
    toAnchor: 'right',
  },
  {
    from: 'merchant-preview-card',
    to: 'business-scanner',
    label: '"׳³ג‚×׳³ֳ—׳³ג€” ׳³ֲ¡׳³ג€¢׳³ֲ¨׳³ֲ§"',
    kind: 'primary',
    fromAnchor: 'right',
    toAnchor: 'left',
  },
];

const KNOWN_HREFS = new Set(DIAGRAM_NODES.map((node) => node.item.href));
const GIBBERISH_PATTERN = /׳³|ג€|ײ²|ײ³|ײ»|ֲ/;

function cleanMapText(value: string): string | null {
  const normalized = value.trim().replace(/^"+|"+$/g, '');
  if (!normalized) {
    return null;
  }
  if (GIBBERISH_PATTERN.test(normalized)) {
    return null;
  }
  return normalized;
}

function getFallbackEdgeLabel(kind: EdgeKind): string {
  if (kind === 'primary') {
    return 'Continue';
  }
  if (kind === 'secondary') {
    return 'Alternate path';
  }
  if (kind === 'back') {
    return 'Back';
  }
  return 'Redirect';
}

function resolveFlowLink(href: string): Href {
  const params: string[] = [];
  const shouldAddPreview = IS_DEV_MODE && href.startsWith('/(authenticated)');

  if (shouldAddPreview && !href.includes('preview=')) {
    params.push('preview=true');
  }
  if (!href.includes('map=')) {
    params.push('map=true');
  }

  if (params.length === 0) {
    return href as Href;
  }

  return `${href}${href.includes('?') ? '&' : '?'}${params.join('&')}` as Href;
}

function flattenSitemap(node: SitemapType | null): SitemapType[] {
  if (!node) {
    return [];
  }

  const queue: SitemapType[] = [node];
  const out: SitemapType[] = [];

  while (queue.length > 0) {
    const current = queue.shift();
    if (!current) {
      continue;
    }
    out.push(current);
    queue.push(...current.children);
  }

  return out;
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
    return 'sparkles-outline';
  }
  if (href.includes('team')) {
    return 'people-outline';
  }
  return 'document-text-outline';
}

function getNodePosition(node: DiagramNode) {
  return {
    x: DIAGRAM_PADDING + node.col * (NODE_WIDTH + COL_GAP),
    y: DIAGRAM_PADDING + node.row * (NODE_HEIGHT + ROW_GAP),
  };
}
function getAnchorVector(anchor: Anchor) {
  if (anchor === 'left') {
    return { x: -1, y: 0 };
  }
  if (anchor === 'right') {
    return { x: 1, y: 0 };
  }
  if (anchor === 'top') {
    return { x: 0, y: -1 };
  }
  return { x: 0, y: 1 };
}

function getAnchorPoint(position: { x: number; y: number }, anchor: Anchor) {
  if (anchor === 'left') {
    return { x: position.x, y: position.y + NODE_HEIGHT / 2 };
  }
  if (anchor === 'right') {
    return { x: position.x + NODE_WIDTH, y: position.y + NODE_HEIGHT / 2 };
  }
  if (anchor === 'top') {
    return { x: position.x + NODE_WIDTH / 2, y: position.y };
  }
  return { x: position.x + NODE_WIDTH / 2, y: position.y + NODE_HEIGHT };
}

function shiftPoint(
  point: { x: number; y: number },
  anchor: Anchor,
  distance: number
) {
  const v = getAnchorVector(anchor);
  return { x: point.x + v.x * distance, y: point.y + v.y * distance };
}

function getArrowPath(end: { x: number; y: number }, toAnchor: Anchor) {
  const size = 6;
  if (toAnchor === 'left') {
    return `M${end.x} ${end.y} L${end.x - size} ${end.y - 4} L${end.x - size} ${end.y + 4} Z`;
  }
  if (toAnchor === 'right') {
    return `M${end.x} ${end.y} L${end.x + size} ${end.y - 4} L${end.x + size} ${end.y + 4} Z`;
  }
  if (toAnchor === 'top') {
    return `M${end.x} ${end.y} L${end.x - 4} ${end.y - size} L${end.x + 4} ${end.y - size} Z`;
  }
  return `M${end.x} ${end.y} L${end.x - 4} ${end.y + size} L${end.x + 4} ${end.y + size} Z`;
}

function getConnectorData(
  fromPos: { x: number; y: number },
  toPos: { x: number; y: number },
  fromAnchor: Anchor,
  toAnchor: Anchor
) {
  const start = getAnchorPoint(fromPos, fromAnchor);
  const end = getAnchorPoint(toPos, toAnchor);
  const startOut = shiftPoint(start, fromAnchor, 18);
  const endOut = shiftPoint(end, toAnchor, 18);

  const points: Array<{ x: number; y: number }> = [start, startOut];

  if (Math.abs(startOut.x - endOut.x) >= Math.abs(startOut.y - endOut.y)) {
    const midX = (startOut.x + endOut.x) / 2;
    points.push({ x: midX, y: startOut.y }, { x: midX, y: endOut.y });
  } else {
    const midY = (startOut.y + endOut.y) / 2;
    points.push({ x: startOut.x, y: midY }, { x: endOut.x, y: midY });
  }

  points.push(endOut, end);

  const path = points
    .map(
      (point, index) =>
        `${index === 0 ? 'M' : 'L'}${point.x.toFixed(1)} ${point.y.toFixed(1)}`
    )
    .join(' ');

  return {
    path,
    arrowPath: getArrowPath(end, toAnchor),
    labelX: (startOut.x + endOut.x) / 2,
    labelY: (startOut.y + endOut.y) / 2 - 7,
  };
}

function getDefaultAnchors(kind: EdgeKind): { from: Anchor; to: Anchor } {
  if (kind === 'back') {
    return { from: 'left', to: 'right' };
  }
  if (kind === 'primary') {
    return { from: 'right', to: 'left' };
  }
  if (kind === 'secondary') {
    return { from: 'bottom', to: 'top' };
  }
  return { from: 'right', to: 'left' };
}
function PreviewAction({
  label,
  active = false,
}: {
  label: string;
  active?: boolean;
}) {
  return (
    <View style={[styles.previewAction, active && styles.previewActionActive]}>
      <Text
        style={[
          styles.previewActionText,
          active && styles.previewActionTextActive,
        ]}
        numberOfLines={1}
      >
        {label}
      </Text>
    </View>
  );
}

function renderPreview(kind: PreviewKind): ReactNode {
  switch (kind) {
    case 'entry':
      return (
        <View style={styles.previewCenter}>
          <View style={styles.previewHeroCircleOuter}>
            <View style={styles.previewHeroCircleInner} />
          </View>
          <Text style={styles.previewSubtext}>Auth redirect hub</Text>
        </View>
      );
    case 'welcome':
      return (
        <>
          <Text style={styles.previewTitle}>Welcome</Text>
          <View style={styles.previewHeroCircleOuter}>
            <View style={styles.previewHeroCircleInner} />
          </View>
          <PreviewAction label="Create Account" active={true} />
          <PreviewAction label="Sign In" />
          <Text style={styles.previewLink}>Terms / Privacy</Text>
        </>
      );
    case 'sign-up':
      return (
        <>
          <Text style={styles.previewTitle}>Sign Up</Text>
          <View style={styles.previewInput} />
          <View style={styles.previewInput} />
          <View style={styles.previewInput} />
          <PreviewAction label="Continue" active={true} />
          <Text style={styles.previewLink}>Already have an account?</Text>
        </>
      );
    case 'sign-in':
      return (
        <>
          <Text style={styles.previewTitle}>Sign In</Text>
          <View style={styles.previewInput} />
          <View style={styles.previewInput} />
          <View style={styles.previewRememberRow}>
            <View style={styles.previewRememberBox} />
            <Text style={styles.previewRememberText}>Remember me</Text>
          </View>
          <PreviewAction label="Log In" active={true} />
          <Text style={styles.previewLinkMuted}>Forgot password?</Text>
        </>
      );
    case 'role':
      return (
        <>
          <Text style={styles.previewTitle}>Choose Role</Text>
          <PreviewAction label="Customer" active={true} />
          <PreviewAction label="Business" />
          <View style={styles.previewSpacer} />
          <Text style={styles.previewSubtext}>Role based onboarding</Text>
        </>
      );
    case 'form':
      return (
        <>
          <Text style={styles.previewTitle}>Details Form</Text>
          <View style={styles.previewInput} />
          <View style={styles.previewInput} />
          <View style={styles.previewInput} />
          <PreviewAction label="Save & Next" active={true} />
        </>
      );
    case 'otp':
      return (
        <>
          <Text style={styles.previewTitle}>OTP Verification</Text>
          <View style={styles.previewOtpRow}>
            {PREVIEW_OTP_KEYS.map((key) => (
              <View key={key} style={styles.previewOtpCell} />
            ))}
          </View>
          <PreviewAction label="Verify" active={true} />
          <Text style={styles.previewLinkMuted}>Resend code</Text>
        </>
      );
    case 'selection':
      return (
        <>
          <Text style={styles.previewTitle}>Selection</Text>
          <PreviewAction label="Option A" active={true} />
          <PreviewAction label="Option B" />
          <PreviewAction label="Option C" />
        </>
      );
    case 'paywall':
      return (
        <View style={styles.paywallPreview}>
          <View style={styles.paywallHeader} />
          <View style={styles.paywallOption} />
          <View style={[styles.paywallOption, { borderColor: '#38bdf8' }]} />
          <View style={styles.paywallOption} />
          <View style={styles.paywallSpacer} />
          <View style={styles.paywallButton}>
            <Text style={styles.paywallButtonText}>Continue</Text>
          </View>
          <View style={styles.paywallLinksRow}>
            <Text style={styles.paywallLinkText}>Restore</Text>
            <Text style={styles.paywallLinkText}>Terms</Text>
          </View>
        </View>
      );
    case 'legal':
      return (
        <>
          <Text style={styles.previewTitle}>Legal</Text>
          <View style={styles.previewTextLine} />
          <View style={styles.previewTextLine} />
          <View style={styles.previewTextLine} />
          <PreviewAction label="Accept" active={true} />
        </>
      );
    case 'main':
      return (
        <>
          <View style={styles.previewHeaderBar} />
          <View style={styles.previewMainCard} />
          <View style={styles.previewMainCard} />
          <View style={styles.previewTabBar}>
            {PREVIEW_TAB_KEYS.map((key) => (
              <View key={key} style={styles.previewTabDot} />
            ))}
          </View>
        </>
      );
    case 'settings':
      return (
        <>
          <Text style={styles.previewTitle}>Settings</Text>
          <PreviewAction label="Profile" />
          <PreviewAction label="Notifications" />
          <PreviewAction label="Security" />
          <PreviewAction label="Sign Out" />
        </>
      );
    case 'join':
      return (
        <>
          <Text style={styles.previewTitle}>Join Business</Text>
          <View style={styles.previewQrFrame} />
          <PreviewAction label="Scan / Paste code" active={true} />
          <Text style={styles.previewLinkMuted}>Paste invite link</Text>
        </>
      );
    case 'card-detail':
      return (
        <>
          <View style={styles.previewCardDetailHeader} />
          <View style={styles.previewStampRow}>
            {PREVIEW_STAMP_KEYS.map((key) => (
              <View key={key} style={styles.previewStamp} />
            ))}
          </View>
          <View style={styles.previewQrFrame} />
          <Text style={styles.previewLinkMuted}>Customer card preview</Text>
        </>
      );
    case 'dashboard':
      return (
        <>
          <View style={styles.previewHeaderBar} />
          <View style={styles.previewMainCard} />
          <View style={styles.previewChartBar} />
          <View style={styles.previewChartBar} />
          <View style={styles.previewTabBar}>
            {PREVIEW_DASH_KEYS.map((key) => (
              <View key={key} style={styles.previewTabDot} />
            ))}
          </View>
        </>
      );
    case 'scanner':
      return (
        <>
          <Text style={styles.previewTitle}>Scanner</Text>
          <View style={styles.previewScannerFrame} />
          <PreviewAction label="Scan QR" active={true} />
          <Text style={styles.previewLinkMuted}>Ready for camera</Text>
        </>
      );
    case 'team':
      return (
        <>
          <Text style={styles.previewTitle}>Team</Text>
          <PreviewAction label="Invite member" active={true} />
          <PreviewAction label="Permissions" />
          <PreviewAction label="Activity" />
        </>
      );
    case 'analytics':
      return (
        <>
          <Text style={styles.previewTitle}>Analytics</Text>
          <View style={styles.previewChartBar} />
          <View style={styles.previewChartBar} />
          <View style={styles.previewChartBar} />
          <View style={styles.previewMainCard} />
        </>
      );
    case 'merchant-onboarding':
      return (
        <>
          <Text style={styles.previewTitle}>Merchant Setup</Text>
          <View style={styles.previewInput} />
          <View style={styles.previewInput} />
          <PreviewAction label="Save step" active={true} />
          <Text style={styles.previewLinkMuted}>Step by step flow</Text>
        </>
      );
    case 'qr':
      return (
        <>
          <Text style={styles.previewTitle}>QR Screen</Text>
          <View style={styles.previewQrCode} />
          <Text style={styles.previewLink}>Share / Scan</Text>
          <View style={styles.previewSpacer} />
        </>
      );
    default:
      return (
        <>
          <Text style={styles.previewTitle}>Screen</Text>
          <View style={styles.previewTextLine} />
          <View style={styles.previewTextLine} />
          <View style={styles.previewTextLine} />
        </>
      );
  }
}

function DiagramPhonePreview({ kind }: { kind: PreviewKind }) {
  return (
    <View style={styles.phoneFrame}>
      <View style={styles.phoneNotch} />
      <View style={styles.phoneScreen}>{renderPreview(kind)}</View>
    </View>
  );
}

function DiagramNodeCard({
  node,
  position,
}: {
  node: DiagramNode;
  position: { x: number; y: number };
}) {
  const tone = TONE_STYLES[node.item.tone];
  const href = resolveFlowLink(node.item.href);
  const safeTitle = cleanMapText(node.item.title) ?? node.item.nameEn;
  const routeLabel =
    node.item.href.length > ROUTE_LABEL_MAX
      ? `${node.item.href.slice(0, ROUTE_LABEL_MAX)}...`
      : node.item.href;

  return (
    <View style={[styles.nodeContainer, { left: position.x, top: position.y }]}>
      <Link href={href} asChild={true}>
        <TouchableOpacity
          activeOpacity={0.85}
          style={[
            styles.flowCard,
            { borderColor: tone.border, backgroundColor: tone.bg },
          ]}
          accessibilityRole="button"
        >
          <View style={styles.flowCardHeader}>
            <View
              style={[
                styles.nodeIconWrap,
                { borderColor: tone.border, backgroundColor: '#ffffff' },
              ]}
            >
              <Ionicons name={node.item.icon} size={12} color={tone.icon} />
            </View>
            <Text style={styles.nodeTitle} numberOfLines={1}>
              {safeTitle}
            </Text>
          </View>
          <DiagramPhonePreview kind={node.preview} />
          <Text style={styles.flowCardName} numberOfLines={1}>
            {node.item.nameEn}
          </Text>
          <Text style={styles.nodeRoute} numberOfLines={1}>
            {routeLabel}
          </Text>
        </TouchableOpacity>
      </Link>
    </View>
  );
}

function DiagramLegend() {
  return (
    <View style={styles.legendRow}>
      <View style={styles.legendItem}>
        <View
          style={[
            styles.legendLine,
            { backgroundColor: EDGE_STYLES.primary.stroke },
          ]}
        />
        <Text style={styles.legendText}>Primary flow (next step)</Text>
      </View>
      <View style={styles.legendItem}>
        <View
          style={[
            styles.legendLine,
            {
              backgroundColor: EDGE_STYLES.secondary.stroke,
              borderWidth: 1,
              borderColor: EDGE_STYLES.secondary.stroke,
              borderStyle: 'dashed',
            },
          ]}
        />
        <Text style={styles.legendText}>Secondary flow (optional path)</Text>
      </View>
      <View style={styles.legendItem}>
        <View
          style={[
            styles.legendLine,
            {
              backgroundColor: EDGE_STYLES.back.stroke,
              borderWidth: 1,
              borderColor: EDGE_STYLES.back.stroke,
              borderStyle: 'dashed',
            },
          ]}
        />
        <Text style={styles.legendText}>Back navigation</Text>
      </View>
    </View>
  );
}

const PINCH_ZOOM_MIN = 0.55;
const PINCH_ZOOM_MAX = 2.4;

function getPinchDistance(
  a: NativeTouchEvent['touches'][number],
  b: NativeTouchEvent['touches'][number]
) {
  const dx = a.pageX - b.pageX;
  const dy = a.pageY - b.pageY;
  return Math.sqrt(dx * dx + dy * dy);
}

function clampZoom(value: number) {
  return Math.max(PINCH_ZOOM_MIN, Math.min(PINCH_ZOOM_MAX, value));
}

function FlowDiagram() {
  const [zoom, setZoom] = useState(1);
  const [isPinching, setIsPinching] = useState(false);
  const pinchStartDistanceRef = useRef(0);
  const pinchStartZoomRef = useRef(1);

  const { width, height, positions } = useMemo(() => {
    const positionsMap: Record<string, { x: number; y: number }> = {};
    DIAGRAM_NODES.forEach((node) => {
      positionsMap[node.id] = getNodePosition(node);
    });

    const maxCol = Math.max(...DIAGRAM_NODES.map((node) => node.col));
    const maxRow = Math.max(...DIAGRAM_NODES.map((node) => node.row));

    const computedWidth =
      DIAGRAM_PADDING * 2 + (maxCol + 1) * NODE_WIDTH + maxCol * COL_GAP;
    const computedHeight =
      DIAGRAM_PADDING * 2 + (maxRow + 1) * NODE_HEIGHT + maxRow * ROW_GAP;

    return {
      width: computedWidth,
      height: computedHeight,
      positions: positionsMap,
    };
  }, []);

  const handleTouchStart = useCallback(
    (event: NativeSyntheticEvent<NativeTouchEvent>) => {
      const touches = event.nativeEvent.touches;
      if (touches.length < 2) {
        return;
      }

      const distance = getPinchDistance(touches[0], touches[1]);
      if (distance <= 0) {
        return;
      }

      pinchStartDistanceRef.current = distance;
      pinchStartZoomRef.current = zoom;
      setIsPinching(true);
    },
    [zoom]
  );

  const handleTouchMove = useCallback(
    (event: NativeSyntheticEvent<NativeTouchEvent>) => {
      const touches = event.nativeEvent.touches;
      if (touches.length < 2 || pinchStartDistanceRef.current <= 0) {
        return;
      }

      const distance = getPinchDistance(touches[0], touches[1]);
      if (distance <= 0) {
        return;
      }

      const ratio = distance / pinchStartDistanceRef.current;
      const nextZoom = clampZoom(pinchStartZoomRef.current * ratio);
      setZoom(nextZoom);
    },
    []
  );

  const handleTouchEnd = useCallback(
    (event: NativeSyntheticEvent<NativeTouchEvent>) => {
      if (event.nativeEvent.touches.length >= 2) {
        return;
      }

      pinchStartDistanceRef.current = 0;
      pinchStartZoomRef.current = zoom;
      setIsPinching(false);
    },
    [zoom]
  );

  const translatedX = ((zoom - 1) * width) / 2;
  const translatedY = ((zoom - 1) * height) / 2;

  return (
    <View>
      <View style={styles.zoomMetaRow}>
        <Text style={styles.zoomMetaText}>
          Pinch with two fingers to zoom in or out
        </Text>
        <Text style={styles.zoomMetaValue}>{`${Math.round(zoom * 100)}%`}</Text>
      </View>

      <ScrollView
        horizontal={true}
        showsHorizontalScrollIndicator={true}
        scrollEnabled={!isPinching}
        contentContainerStyle={styles.diagramScrollContent}
      >
        <View
          style={{ width: width * zoom, height: height * zoom }}
          onTouchStart={handleTouchStart}
          onTouchMove={handleTouchMove}
          onTouchEnd={handleTouchEnd}
          onTouchCancel={handleTouchEnd}
        >
          <View
            style={{
              width,
              height,
              transform: [
                { scale: zoom },
                { translateX: translatedX },
                { translateY: translatedY },
              ],
            }}
          >
            <Svg
              width={width}
              height={height}
              style={StyleSheet.absoluteFill}
              pointerEvents="none"
            >
              {DIAGRAM_EDGES.map((edge) => {
                const fromPos = positions[edge.from];
                const toPos = positions[edge.to];
                if (!fromPos || !toPos) {
                  return null;
                }

                const defaults = getDefaultAnchors(edge.kind);
                const fromAnchor = edge.fromAnchor ?? defaults.from;
                const toAnchor = edge.toAnchor ?? defaults.to;
                const connector = getConnectorData(
                  fromPos,
                  toPos,
                  fromAnchor,
                  toAnchor
                );
                const style = EDGE_STYLES[edge.kind];
                const edgeLabel =
                  cleanMapText(edge.label) ?? getFallbackEdgeLabel(edge.kind);
                const labelWidth = Math.max(58, edgeLabel.length * 6.4);

                return (
                  <G key={`${edge.from}-${edge.to}-${edge.label}-${edge.kind}`}>
                    <Path
                      d={connector.path}
                      stroke={style.stroke}
                      strokeWidth={2}
                      strokeDasharray={style.dash}
                      fill="none"
                    />
                    <Path d={connector.arrowPath} fill={style.stroke} />
                    <Rect
                      x={connector.labelX - labelWidth / 2}
                      y={connector.labelY - 11}
                      width={labelWidth}
                      height={15}
                      rx={6}
                      fill={style.labelBg}
                      opacity={0.95}
                    />
                    <SvgText
                      x={connector.labelX}
                      y={connector.labelY}
                      fill={style.labelText}
                      fontSize="8"
                      fontWeight="700"
                      textAnchor="middle"
                    >
                      {edgeLabel}
                    </SvgText>
                  </G>
                );
              })}
            </Svg>

            {DIAGRAM_NODES.map((node) => (
              <DiagramNodeCard
                key={node.id}
                node={node}
                position={positions[node.id]}
              />
            ))}
          </View>
        </View>
      </ScrollView>
    </View>
  );
}

function AdditionalScreenCard({ item }: { item: FlowItem }) {
  const href = resolveFlowLink(item.href);
  const tone = TONE_STYLES[item.tone];
  return (
    <Link href={href} asChild={true}>
      <TouchableOpacity activeOpacity={0.85} style={styles.additionalCard}>
        <View
          style={[
            styles.additionalIconWrap,
            { borderColor: tone.border, backgroundColor: tone.bg },
          ]}
        >
          <Ionicons name={item.icon} size={16} color={tone.icon} />
        </View>
        <View style={styles.additionalTextWrap}>
          <Text style={styles.additionalTitle} numberOfLines={1}>
            {item.nameEn}
          </Text>
          <Text style={styles.additionalRoute} numberOfLines={1}>
            {item.href}
          </Text>
        </View>
      </TouchableOpacity>
    </Link>
  );
}

function AdditionalGroup({
  title,
  items,
}: {
  title: string;
  items: FlowItem[];
}) {
  if (items.length === 0) {
    return null;
  }

  return (
    <View style={styles.additionalGroup}>
      <Text style={styles.additionalGroupTitle}>{title}</Text>
      <View style={styles.additionalGrid}>
        {items.map((item) => (
          <AdditionalScreenCard key={item.href} item={item} />
        ))}
      </View>
    </View>
  );
}

export default function FlowMapScreen() {
  const sitemap = useSitemap();

  const additionalScreens = useMemo(() => {
    const seen = new Set<string>();
    const extras: FlowItem[] = [];

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
      if (KNOWN_HREFS.has(href) || seen.has(href)) {
        continue;
      }

      seen.add(href);
      extras.push({
        title: 'Additional Screen',
        nameEn: getExtraScreenName(href),
        href,
        icon: getExtraScreenIcon(href),
        tone: 'neutral',
      });
    }

    return extras.sort((a, b) => a.href.localeCompare(b.href));
  }, [sitemap]);

  const additionalByAudience = useMemo(() => {
    const customer: FlowItem[] = [];
    const business: FlowItem[] = [];
    const general: FlowItem[] = [];

    additionalScreens.forEach((item) => {
      if (item.href.includes('/(customer)')) {
        customer.push(item);
        return;
      }
      if (item.href.includes('/(business)')) {
        business.push(item);
        return;
      }
      general.push(item);
    });

    return { customer, business, general };
  }, [additionalScreens]);

  return (
    <SafeAreaView style={styles.screen}>
      <ScrollView contentContainerStyle={styles.scrollContent}>
        <View style={styles.headerBlock}>
          <Text style={styles.headerTitle}>Flow Map (Lite)</Text>
          <Text style={styles.headerSubtitle}>
            Lightweight flowchart view: each node is a simple screen box and all
            navigation links remain connected.
          </Text>
        </View>

        <View style={styles.diagramPanel}>
          <DiagramLegend />
          <FlowDiagram />
        </View>

        <View style={styles.noteBox}>
          <Text style={styles.noteText}>
            Tip: tap a node to open that route directly with `map=true` (and
            authenticated routes also get `preview=true`).
          </Text>
        </View>

        {additionalScreens.length > 0 ? (
          <View style={styles.additionalPanel}>
            <Text style={styles.additionalPanelTitle}>
              Additional routes found in sitemap (not shown on main map)
            </Text>
            <AdditionalGroup
              title="Customer"
              items={additionalByAudience.customer}
            />
            <AdditionalGroup
              title="Business"
              items={additionalByAudience.business}
            />
            <AdditionalGroup
              title="General"
              items={additionalByAudience.general}
            />
          </View>
        ) : null}
      </ScrollView>
    </SafeAreaView>
  );
}
const styles = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: '#f5f7fb',
  },
  scrollContent: {
    paddingBottom: 30,
  },
  headerBlock: {
    paddingHorizontal: 18,
    paddingTop: 16,
    paddingBottom: 8,
  },
  headerTitle: {
    fontSize: 22,
    fontWeight: '900',
    color: '#0f172a',
    textAlign: 'right',
  },
  headerSubtitle: {
    marginTop: 6,
    fontSize: 13,
    lineHeight: 18,
    color: '#64748b',
    textAlign: 'right',
  },
  diagramPanel: {
    marginHorizontal: 12,
    borderRadius: 22,
    borderWidth: 1,
    borderColor: '#dbe4f0',
    backgroundColor: '#ffffff',
    paddingVertical: 12,
    overflow: 'hidden',
  },
  diagramScrollContent: {
    paddingBottom: 8,
  },
  zoomMetaRow: {
    paddingHorizontal: 14,
    paddingBottom: 8,
    flexDirection: 'row-reverse',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  zoomMetaText: {
    fontSize: 11,
    fontWeight: '700',
    color: '#64748b',
    textAlign: 'right',
  },
  zoomMetaValue: {
    fontSize: 11,
    fontWeight: '900',
    color: '#0f172a',
    textAlign: 'right',
  },
  legendRow: {
    paddingHorizontal: 14,
    marginBottom: 10,
    gap: 8,
  },
  legendItem: {
    flexDirection: 'row-reverse',
    alignItems: 'center',
    gap: 8,
  },
  legendLine: {
    width: 34,
    height: 3,
    borderRadius: 2,
  },
  legendText: {
    fontSize: 11,
    fontWeight: '700',
    color: '#334155',
    textAlign: 'right',
  },
  nodeContainer: {
    position: 'absolute',
    width: NODE_WIDTH,
  },
  flowCard: {
    borderRadius: 12,
    borderWidth: 1,
    paddingHorizontal: 8,
    paddingVertical: 8,
    height: NODE_HEIGHT,
    justifyContent: 'space-between',
  },
  flowCardHeader: {
    flexDirection: 'row-reverse',
    alignItems: 'center',
    gap: 6,
  },
  flowCardName: {
    marginTop: 4,
    fontSize: 9,
    color: '#334155',
    fontWeight: '700',
    textAlign: 'right',
  },
  nodeTitleRow: {
    flexDirection: 'row-reverse',
    alignItems: 'center',
    gap: 6,
    marginBottom: 6,
    minHeight: 18,
  },
  nodeIconWrap: {
    width: 18,
    height: 18,
    borderRadius: 9,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  nodeTitle: {
    flex: 1,
    fontSize: 11,
    color: '#1e293b',
    fontWeight: '800',
    textAlign: 'right',
  },
  phoneFrame: {
    borderRadius: 14,
    borderWidth: 1.5,
    borderColor: '#cbd5e1',
    backgroundColor: '#ffffff',
    paddingHorizontal: 7,
    paddingTop: 6,
    paddingBottom: 6,
    marginTop: 6,
  },
  phoneNotch: {
    alignSelf: 'center',
    width: 32,
    height: 4,
    borderRadius: 3,
    backgroundColor: '#cbd5e1',
    marginBottom: 6,
  },
  phoneScreen: {
    height: 146,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: '#e2e8f0',
    backgroundColor: '#f8fafc',
    paddingHorizontal: 8,
    paddingTop: 8,
    paddingBottom: 6,
  },
  nodeName: {
    marginTop: 6,
    fontSize: 9,
    color: '#334155',
    fontWeight: '700',
    textAlign: 'center',
  },
  nodeRoute: {
    marginTop: 1,
    fontSize: 8,
    color: '#64748b',
    fontWeight: '600',
    textAlign: 'right',
  },
  previewTitle: {
    fontSize: 10,
    fontWeight: '900',
    color: '#0f172a',
    textAlign: 'right',
    marginBottom: 4,
  },
  previewSubtext: {
    fontSize: 8,
    lineHeight: 11,
    color: '#64748b',
    textAlign: 'right',
  },
  previewAction: {
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#dbe3ee',
    backgroundColor: '#ffffff',
    paddingVertical: 5,
    paddingHorizontal: 6,
    marginBottom: 5,
  },
  previewActionActive: {
    backgroundColor: '#dbeafe',
    borderColor: '#93c5fd',
  },
  previewActionText: {
    fontSize: 8,
    fontWeight: '800',
    color: '#0f172a',
    textAlign: 'center',
  },
  previewActionTextActive: {
    color: '#1d4ed8',
  },
  previewDivider: {
    height: 1,
    backgroundColor: '#e2e8f0',
    marginVertical: 2,
  },
  previewLink: {
    marginTop: 1,
    fontSize: 8,
    color: '#2563eb',
    fontWeight: '700',
    textAlign: 'center',
  },
  previewLinkMuted: {
    marginTop: 2,
    fontSize: 8,
    color: '#94a3b8',
    fontWeight: '700',
    textAlign: 'center',
  },
  previewInput: {
    borderRadius: 7,
    borderWidth: 1,
    borderColor: '#dbe3ee',
    backgroundColor: '#ffffff',
    height: 16,
    marginBottom: 5,
  },
  previewRememberRow: {
    flexDirection: 'row-reverse',
    justifyContent: 'center',
    alignItems: 'center',
    gap: 4,
    marginBottom: 5,
  },
  previewRememberBox: {
    width: 8,
    height: 8,
    borderRadius: 2,
    borderWidth: 1,
    borderColor: '#94a3b8',
    backgroundColor: '#ffffff',
  },
  previewRememberText: {
    fontSize: 7,
    color: '#64748b',
    fontWeight: '700',
  },
  previewTextLine: {
    height: 5,
    borderRadius: 3,
    backgroundColor: '#dbe3ee',
    marginBottom: 5,
  },
  previewOtpRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: 6,
    marginTop: 2,
  },
  previewOtpCell: {
    width: 14,
    height: 14,
    borderRadius: 5,
    borderWidth: 1,
    borderColor: '#bfdbfe',
    backgroundColor: '#eff6ff',
  },
  previewMainCard: {
    borderRadius: 8,
    height: 22,
    backgroundColor: '#e2e8f0',
    marginBottom: 5,
  },
  previewHeaderBar: {
    borderRadius: 8,
    height: 10,
    backgroundColor: '#cbd5e1',
    marginBottom: 7,
  },
  previewTabBar: {
    marginTop: 'auto',
    borderTopWidth: 1,
    borderTopColor: '#dbe3ee',
    paddingTop: 5,
    flexDirection: 'row',
    justifyContent: 'space-around',
  },
  previewTabDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: '#94a3b8',
  },
  previewCenter: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
  },
  previewSpacer: {
    flex: 1,
    minHeight: 2,
  },
  previewHeroCircleOuter: {
    alignSelf: 'center',
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: '#dbeafe',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 6,
  },
  previewHeroCircleInner: {
    width: 22,
    height: 22,
    borderRadius: 11,
    backgroundColor: '#60a5fa',
  },
  paywallPreview: {
    flex: 1,
    borderRadius: 8,
    backgroundColor: '#0f172a',
    padding: 8,
  },
  paywallHeader: {
    height: 10,
    borderRadius: 6,
    backgroundColor: '#1e293b',
    marginBottom: 7,
  },
  paywallOption: {
    height: 20,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#334155',
    backgroundColor: '#111827',
    marginBottom: 5,
  },
  paywallSpacer: {
    flex: 1,
  },
  paywallButton: {
    borderRadius: 8,
    backgroundColor: '#4fc3f7',
    height: 20,
    alignItems: 'center',
    justifyContent: 'center',
  },
  paywallButtonText: {
    fontSize: 9,
    fontWeight: '900',
    color: '#0a0a0a',
  },
  paywallLinksRow: {
    marginTop: 6,
    flexDirection: 'row-reverse',
    justifyContent: 'space-between',
  },
  paywallLinkText: {
    fontSize: 7,
    color: '#94a3b8',
    fontWeight: '700',
  },
  previewQrFrame: {
    alignSelf: 'center',
    width: 50,
    height: 50,
    borderRadius: 8,
    borderWidth: 2,
    borderColor: '#94a3b8',
    borderStyle: 'dashed',
    marginBottom: 4,
  },
  previewCardDetailHeader: {
    borderRadius: 8,
    height: 28,
    backgroundColor: '#e2e8f0',
    marginBottom: 6,
  },
  previewStampRow: {
    flexDirection: 'row',
    justifyContent: 'space-around',
    marginBottom: 4,
  },
  previewStamp: {
    width: 12,
    height: 12,
    borderRadius: 6,
    borderWidth: 1,
    borderColor: '#bfdbfe',
    backgroundColor: '#eff6ff',
  },
  previewScannerFrame: {
    alignSelf: 'center',
    width: 80,
    height: 60,
    borderRadius: 8,
    borderWidth: 2,
    borderColor: '#94a3b8',
    backgroundColor: '#1e293b',
    marginBottom: 4,
  },
  previewChartBar: {
    height: 16,
    borderRadius: 4,
    backgroundColor: '#cbd5e1',
    marginBottom: 4,
  },
  previewQrCode: {
    alignSelf: 'center',
    width: 40,
    height: 40,
    borderRadius: 6,
    backgroundColor: '#0f172a',
    marginBottom: 6,
  },
  noteBox: {
    marginHorizontal: 12,
    marginTop: 10,
    paddingHorizontal: 12,
    paddingVertical: 10,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: '#dbe4f0',
    backgroundColor: '#ffffff',
  },
  noteText: {
    fontSize: 12,
    lineHeight: 18,
    color: '#334155',
    textAlign: 'right',
  },
  additionalPanel: {
    marginHorizontal: 12,
    marginTop: 10,
    borderRadius: 18,
    borderWidth: 1,
    borderColor: '#dbe4f0',
    backgroundColor: '#ffffff',
    padding: 12,
    gap: 12,
  },
  additionalPanelTitle: {
    fontSize: 14,
    fontWeight: '900',
    color: '#0f172a',
    textAlign: 'right',
  },
  additionalGroup: {
    gap: 8,
  },
  additionalGroupTitle: {
    fontSize: 12,
    fontWeight: '800',
    color: '#475569',
    textAlign: 'right',
  },
  additionalGrid: {
    gap: 8,
  },
  additionalCard: {
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#e2e8f0',
    backgroundColor: '#f8fafc',
    paddingHorizontal: 10,
    paddingVertical: 9,
    flexDirection: 'row-reverse',
    alignItems: 'center',
    gap: 8,
  },
  additionalIconWrap: {
    width: 28,
    height: 28,
    borderRadius: 14,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  additionalTextWrap: {
    flex: 1,
  },
  additionalTitle: {
    fontSize: 11,
    fontWeight: '800',
    color: '#0f172a',
    textAlign: 'right',
  },
  additionalRoute: {
    marginTop: 2,
    fontSize: 10,
    color: '#64748b',
    textAlign: 'right',
  },
});
