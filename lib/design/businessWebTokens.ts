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
    xl: 24,
    xxl: 32,
    xxxl: 40,
  },
  radii: {
    sm: 10,
    md: 14,
    lg: 20,
    pill: 999,
  },
  typography: {
    pageTitle: { fontSize: 29, lineHeight: 38, fontWeight: '700' as const },
    sectionTitle: { fontSize: 19, lineHeight: 27, fontWeight: '700' as const },
    cardTitle: { fontSize: 15, lineHeight: 22, fontWeight: '600' as const },
    kpiValue: { fontSize: 32, lineHeight: 40, fontWeight: '800' as const },
    body: { fontSize: 16, lineHeight: 25, fontWeight: '400' as const },
    secondaryBody: {
      fontSize: 14,
      lineHeight: 22,
      fontWeight: '400' as const,
    },
    metadata: { fontSize: 13, lineHeight: 18, fontWeight: '500' as const },
    label: { fontSize: 14, lineHeight: 20, fontWeight: '700' as const },
  },
  icons: {
    meta: 16,
    standard: 20,
    navigation: 21,
    prominent: 24,
    strokeWidth: 2,
    container: 40,
  },
  shadow: {
    shadowColor: '#0F172A',
    shadowOpacity: 0.055,
    shadowRadius: 18,
    shadowOffset: { width: 0, height: 7 },
    elevation: 2,
  },
} as const;
