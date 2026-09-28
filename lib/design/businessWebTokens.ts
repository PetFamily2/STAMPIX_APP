/**
 * StampAix Business Web extends the mobile brand without changing native UI.
 * New web surfaces use Lucide icons at 16/20/24px with a stroke width of 2.
 */
export const BUSINESS_WEB_TOKENS = {
  colors: {
    pageBackground: '#F6F8FC',
    elevatedSurface: '#FFFFFF',
    subtleSurface: '#F8FAFC',
    primary: '#1230A8',
    primaryHover: '#0E288F',
    primarySubtle: '#EEF3FF',
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
    sm: 8,
    md: 12,
    lg: 16,
    pill: 999,
  },
  typography: {
    pageTitle: { fontSize: 28, lineHeight: 36, fontWeight: '700' as const },
    sectionTitle: { fontSize: 18, lineHeight: 26, fontWeight: '700' as const },
    cardTitle: { fontSize: 15, lineHeight: 22, fontWeight: '600' as const },
    kpiValue: { fontSize: 30, lineHeight: 38, fontWeight: '700' as const },
    body: { fontSize: 16, lineHeight: 24, fontWeight: '400' as const },
    secondaryBody: {
      fontSize: 14,
      lineHeight: 21,
      fontWeight: '400' as const,
    },
    metadata: { fontSize: 13, lineHeight: 18, fontWeight: '500' as const },
    label: { fontSize: 14, lineHeight: 20, fontWeight: '600' as const },
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
    shadowOpacity: 0.04,
    shadowRadius: 10,
    shadowOffset: { width: 0, height: 3 },
    elevation: 1,
  },
} as const;
