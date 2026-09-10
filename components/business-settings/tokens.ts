import { DASHBOARD_TOKENS } from '@/lib/design/dashboardTokens';

export const SETTINGS_TOKENS = {
  pageBackground: '#F5F7FB',
  surface: '#FFFFFF',
  surfaceMuted: '#F8FAFC',
  border: '#E6EAF2',
  borderStrong: '#D7DEEA',
  textPrimary: '#12203A',
  textSecondary: '#64748B',
  textTertiary: '#94A3B8',
  accent: '#2F6BFF',
  accentSoft: '#EEF3FF',
  accentText: '#1D4ED8',
  warningBg: '#FFF8EE',
  warningBorder: '#F1D7A8',
  warningTitle: '#8A5A12',
  warningBody: '#9A6B24',
  destructive: '#B91C1C',
  destructiveSoft: '#FEF2F2',
  radius: 16,
  radiusLg: 20,
  rowMinHeight: 52,
  touchTarget: 44,
  pagePad: 20,
  sectionGap: 16,
  maxWidth: 560,
  mainMaxWidth: 760,
} as const;

export const SETTINGS_SHADOW = {
  shadowColor: '#0F172A',
  shadowOpacity: 0.04,
  shadowRadius: 10,
  shadowOffset: { width: 0, height: 3 },
  elevation: 1,
} as const;

export const SETTINGS_TITLE_STYLE = {
  fontSize: 22,
  lineHeight: 28,
  fontWeight: '700' as const,
  color: SETTINGS_TOKENS.textPrimary,
  textAlign: 'right' as const,
  writingDirection: 'rtl' as const,
};

export const SETTINGS_SUBTITLE_STYLE = {
  fontSize: 13,
  lineHeight: 18,
  fontWeight: '500' as const,
  color: SETTINGS_TOKENS.textSecondary,
  textAlign: 'right' as const,
  writingDirection: 'rtl' as const,
};

export { DASHBOARD_TOKENS };
