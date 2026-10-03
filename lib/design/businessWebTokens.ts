/**
 * StampAix Business Web visual system.
 * These tokens are isolated to web business/admin surfaces and do not alter native UI.
 */
export const BUSINESS_WEB_TOKENS = {
  colors: {
    pageBackground: '#F6F9F7',
    elevatedSurface: '#FFFFFF',
    subtleSurface: '#F8FBF9',
    primary: '#176B46',
    primaryHover: '#12583A',
    primarySubtle: '#EAF6EF',
    textPrimary: '#16231D',
    textSecondary: '#475A50',
    textMuted: '#6B7C73',
    border: '#DFE8E2',
    borderStrong: '#C9D7CE',
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
    pageTitle: { fontSize: 30, lineHeight: 38, fontWeight: '800' as const },
    sectionTitle: { fontSize: 19, lineHeight: 27, fontWeight: '800' as const },
    cardTitle: { fontSize: 15, lineHeight: 22, fontWeight: '700' as const },
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
    shadowColor: '#102A1E',
    shadowOpacity: 0.055,
    shadowRadius: 18,
    shadowOffset: { width: 0, height: 7 },
    elevation: 2,
  },
} as const;
