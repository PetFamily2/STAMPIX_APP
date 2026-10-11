/**
 * StampAix Business Web visual system.
 * Web surfaces extend the existing StampAix blue brand while keeping
 * green reserved for positive/success states and red for destructive states.
 */
export const BUSINESS_WEB_TOKENS = {
  colors: {
    pageBackground: '#F3F5F9',
    elevatedSurface: '#FFFFFF',
    subtleSurface: '#F7F8FA',
    primary: '#1230A8',
    primaryHover: '#0E288F',
    primarySubtle: '#EEF4FF',
    textPrimary: '#101936',
    textSecondary: '#475569',
    textMuted: '#64748B',
    border: '#E6EAF2',
    borderStrong: '#D5DBE6',
    success: '#047857',
    successSubtle: '#ECFDF5',
    warning: '#B45309',
    warningSubtle: '#FFF7ED',
    danger: '#B91C1C',
    dangerSubtle: '#FEF2F2',
  },
  space: {
    xs: 4,
    sm: 8,
    md: 12,
    lg: 16,
    xl: 20,
    xxl: 24,
    xxxl: 32,
    huge: 48,
  },
  radii: {
    sm: 8,
    md: 12,
    lg: 16,
    art: 20,
    pill: 999,
  },
  control: {
    height: 48,
    quietHeight: 44,
  },
  typography: {
    pageTitle: { fontSize: 22, lineHeight: 28, fontWeight: '600' as const },
    sectionTitle: { fontSize: 16, lineHeight: 22, fontWeight: '600' as const },
    cardTitle: { fontSize: 15, lineHeight: 21, fontWeight: '600' as const },
    kpiValue: { fontSize: 28, lineHeight: 34, fontWeight: '600' as const },
    body: { fontSize: 14, lineHeight: 21, fontWeight: '400' as const },
    secondaryBody: {
      fontSize: 12,
      lineHeight: 18,
      fontWeight: '400' as const,
    },
    metadata: { fontSize: 11, lineHeight: 16, fontWeight: '500' as const },
    label: { fontSize: 12, lineHeight: 18, fontWeight: '600' as const },
  },
  icons: {
    meta: 14,
    standard: 16,
    navigation: 17,
    prominent: 20,
    strokeWidth: 1.8,
    container: 32,
  },
  shadow: {
    shadowColor: '#0F172A',
    shadowOpacity: 0.018,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 2 },
    elevation: 0,
  },
} as const;
