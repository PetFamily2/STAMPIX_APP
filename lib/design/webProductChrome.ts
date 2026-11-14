import { Platform, type TextStyle, type ViewStyle } from 'react-native';

import { BUSINESS_WEB_TOKENS as T } from '@/lib/design/businessWebTokens';

type ChromeStyle = ViewStyle & TextStyle;

/**
 * Empty type so style objects can keep their native keys and still
 * accept a web override spread without a duplicate-property error.
 * On native the spread is empty. On web it carries the dashboard tokens.
 */
type WebOverride = Record<never, never>;

/**
 * Web-only style fragments. On native these are empty, so existing
 * screen styles stay exactly as they are.
 */
export function webOnly(style: ChromeStyle): WebOverride {
  return (Platform.OS === 'web' ? style : {}) as WebOverride;
}

export const webPage = webOnly({
  backgroundColor: T.colors.pageBackground,
});

export const webTitle = webOnly({
  fontSize: T.typography.pageTitle.fontSize,
  lineHeight: T.typography.pageTitle.lineHeight,
  fontWeight: T.typography.pageTitle.fontWeight,
  color: T.colors.textPrimary,
});

export const webBody = webOnly({
  fontSize: T.typography.body.fontSize,
  lineHeight: T.typography.body.lineHeight,
  fontWeight: '400',
  color: T.colors.textSecondary,
});

export const webSectionTitle = webOnly({
  fontSize: T.typography.sectionTitle.fontSize,
  lineHeight: T.typography.sectionTitle.lineHeight,
  fontWeight: T.typography.sectionTitle.fontWeight,
  color: T.colors.textPrimary,
});

export const webLabel = webOnly({
  fontSize: T.typography.label.fontSize,
  lineHeight: T.typography.label.lineHeight,
  fontWeight: '600',
  color: T.colors.textSecondary,
});

export const webField = webOnly({
  borderRadius: T.radii.md,
  borderColor: T.colors.borderStrong,
  backgroundColor: T.colors.elevatedSurface,
  color: T.colors.textPrimary,
  fontWeight: '400',
});

export const webAccentFill = webOnly({
  backgroundColor: T.colors.primary,
  borderColor: T.colors.primary,
  shadowOpacity: 0,
  elevation: 0,
});

export const webAccentSoft = webOnly({
  backgroundColor: T.colors.primarySubtle,
  borderColor: T.colors.primary,
});

export const webAccentText = webOnly({
  color: T.colors.primary,
});

export const webAccentBackground = webOnly({
  backgroundColor: T.colors.primary,
});

export const webAccentBorder = webOnly({
  borderColor: T.colors.primary,
});

/** Historical native accent. Web uses the approved dashboard navy. */
export const productAccent =
  Platform.OS === 'web' ? T.colors.primary : '#2563EB';

/** Customer/business wash used before the web product surface. */
export const productPageBackground =
  Platform.OS === 'web' ? T.colors.pageBackground : '#E9F0FF';

/** Native primary blue. Web uses the approved dashboard navy. */
export const productPrimary =
  Platform.OS === 'web' ? T.colors.primary : '#2F6BFF';

const WEB_CLASS_SWAPS: Record<string, string> = {
  'bg-[#E9F0FF]': 'bg-[#F3F5F9]',
  'bg-[#2F6BFF]': 'bg-[#1230A8]',
  'bg-[#2563EB]': 'bg-[#1230A8]',
  'bg-[#2563eb]': 'bg-[#1230A8]',
  'text-[#2F6BFF]': 'text-[#1230A8]',
  'text-[#2563EB]': 'text-[#1230A8]',
  'text-[#2563eb]': 'text-[#1230A8]',
  'text-[#1D4ED8]': 'text-[#1230A8]',
  'border-[#2F6BFF]': 'border-[#1230A8]',
  'border-[#2563EB]': 'border-[#1230A8]',
};

/**
 * Complete class literals so NativeWind generates the web surface utilities.
 * `webClassName` swaps tokens at runtime; these strings keep the CSS present.
 */
export const WEB_SURFACE_CLASS_LITERALS = [
  'bg-[#F3F5F9]',
  'bg-[#1230A8]',
  'text-[#1230A8]',
  'border-[#1230A8]',
  'bg-[#EEF4FF]',
] as const;

export function webClassName(className: string): string {
  if (Platform.OS !== 'web') return className;
  return className
    .split(/\s+/)
    .map((token) => WEB_CLASS_SWAPS[token] ?? token)
    .join(' ');
}
