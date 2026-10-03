/**
 * StampAix Business Web visual system.
 * Web surfaces extend the existing StampAix blue brand while keeping
 * green reserved for positive/success states and red for destructive states.
 */
export const BUSINESS_WEB_TOKENS = {
  colors: {
    pageBackground: '#F8FAFC',
    elevatedSurface: '#FFFFFF',
    subtleSurface: '#FAFCFF',
    primary: '#1230A8',
    primaryHover: '#0E288F',
    primarySubtle: '#EEF4FF',
    textPrimary: '#101936',
    textSecondary: '#475569',
    textMuted: '#64748B',
    border: '#E2E8F0',
    borderStrong: '#CBD5E1',
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
  },
  radii: {
    sm: 8,
    md: 12,
    lg: 16,
    pill: 999,
  },
  typography: {
    pageTitle: { fontSize: 26, lineHeight: 34, fontWeight: '700' as const },
    sectionTitle: { fontSize: 17, lineHeight: 24, fontWeight: '700' as const },
    cardTitle: { fontSize: 14, lineHeight: 20, fontWeight: '600' as const },
    kpiValue: { fontSize: 28, lineHeight: 34, fontWeight: '700' as const },
    body: { fontSize: 15, lineHeight: 23, fontWeight: '400' as const },
    secondaryBody: {
      fontSize: 13,
      lineHeight: 20,
      fontWeight: '400' as const,
    },
    metadata: { fontSize: 12, lineHeight: 17, fontWeight: '500' as const },
    label: { fontSize: 13, lineHeight: 19, fontWeight: '600' as const },
  },
  icons: {
    meta: 15,
    standard: 18,
    navigation: 19,
    prominent: 22,
    strokeWidth: 2,
    container: 36,
  },
  shadow: {
    shadowColor: '#0F172A',
    shadowOpacity: 0.035,
    shadowRadius: 12,
    shadowOffset: { width: 0, height: 4 },
    elevation: 1,
  },
} as const;
