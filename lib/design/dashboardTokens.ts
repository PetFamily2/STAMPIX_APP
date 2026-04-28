export const DASHBOARD_TOKENS = {
  colors: {
    brandBlue: '#1230A8',
    brandIndigo: '#4F46E5',
    teal: '#06B6D4',
    emerald: '#10B981',
    violet: '#8B5CF6',
    amber: '#F59E0B',
    red: '#EF4444',
    textPrimary: '#101936',
    textMuted: '#64748B',
    pageBackground: '#F8FAFC',
    sectionBackground: '#FFFFFF',
    sectionBackgroundMuted: '#FAFCFF',
    divider: '#E2E8F0',
    dividerStrong: '#CBD5E1',
    border: '#E2E8F0',
    borderStrong: '#CBD5E1',
  },
  gradients: {
    hero: ['#1E4ED8', '#3B82F6'] as const,
    insight: ['#EEF4FF', '#F5F3FF'] as const,
    iconBlue: ['#DBEAFE', '#DCE7FF'] as const,
    iconTeal: ['#CCFBF1', '#CFFAFE'] as const,
    iconViolet: ['#EDE9FE', '#F3E8FF'] as const,
    iconEmerald: ['#DCFCE7', '#ECFDF3'] as const,
  },
  cardRadius: 14,
  cardRadiusLarge: 16,
  cardRadiusHero: 18,
  cardBorderColor: '#E2E8F0',
  cardBorderStrongColor: '#CBD5E1',
  cardShadow: {
    shadowColor: '#0F172A',
    shadowOpacity: 0.06,
    shadowRadius: 14,
    shadowOffset: { width: 0, height: 4 },
    elevation: 2,
  },
  cardShadowSoft: {
    shadowColor: '#0F172A',
    shadowOpacity: 0.04,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 2 },
    elevation: 1,
  },
  sectionBackground: '#FFFFFF',
  sectionBackgroundMuted: '#FAFCFF',
  pageBackground: '#F8FAFC',
  chartHeightSm: 160,
  chartHeightMd: 190,
  chartHeightLg: 220,
  iconSizeSm: 16,
  iconSizeMd: 20,
  iconSizeLg: 24,
  dividerColor: '#E2E8F0',
  dividerStrongColor: '#CBD5E1',
  spacingPageHorizontal: 18,
  spacingSectionVertical: 20,
  spacingGridGap: 12,
  spacingCardInner: 16,
  sectionTitleSize: 18,
  sectionSubtitleSize: 13,
  space: {
    1: 4,
    2: 8,
    3: 12,
    4: 16,
    6: 20,
    8: 28,
    10: 36,
  },
  typography: {
    pageTitle: { fontSize: 26, fontWeight: '700' as const, lineHeight: 32 },
    sectionTitle: { fontSize: 18, fontWeight: '600' as const, lineHeight: 24 },
    metricLg: { fontSize: 28, fontWeight: '700' as const, lineHeight: 34 },
    cardLabel: { fontSize: 12, fontWeight: '500' as const, lineHeight: 16 },
    supporting: { fontSize: 12, fontWeight: '400' as const, lineHeight: 16 },
    caption: { fontSize: 11, fontWeight: '400' as const, lineHeight: 14 },
  },
} as const;

export type DashboardLayoutMode = 'compact' | 'phone' | 'tablet';

export function getDashboardLayoutMode(
  viewportWidth: number
): DashboardLayoutMode {
  if (viewportWidth < 390) {
    return 'compact';
  }
  if (viewportWidth >= 768) {
    return 'tablet';
  }
  return 'phone';
}

export const DASHBOARD_LAYOUT = {
  compact: {
    pageHorizontalPadding: 12,
    sectionGap: 16,
    sectionTitleSize: 16,
    sectionTitleLineHeight: 20,
    headerBrandSize: 32,
    headerGreetingSize: 20,
    headerBusinessSize: 17,
    quickShortcutWidth: 46,
    quickShortcutMinHeight: 82,
    quickShortcutGap: 3,
    segmentedHeight: 38,
    segmentedRadius: 10,
    cardRadius: 13,
    kpiValueSize: 28,
    recommendationCardWidthPrimary: 160,
    recommendationCardWidthSecondary: 160,
  },
  phone: {
    pageHorizontalPadding: 14,
    sectionGap: 18,
    sectionTitleSize: 16,
    sectionTitleLineHeight: 20,
    headerBrandSize: 34,
    headerGreetingSize: 22,
    headerBusinessSize: 18,
    quickShortcutWidth: 48,
    quickShortcutMinHeight: 84,
    quickShortcutGap: 4,
    segmentedHeight: 40,
    segmentedRadius: 11,
    cardRadius: 14,
    kpiValueSize: 30,
    recommendationCardWidthPrimary: 175,
    recommendationCardWidthSecondary: 175,
  },
  tablet: {
    pageHorizontalPadding: 24,
    sectionGap: 22,
    sectionTitleSize: 17,
    sectionTitleLineHeight: 21,
    headerBrandSize: 36,
    headerGreetingSize: 23,
    headerBusinessSize: 19,
    quickShortcutWidth: 58,
    quickShortcutMinHeight: 90,
    quickShortcutGap: 6,
    segmentedHeight: 42,
    segmentedRadius: 12,
    cardRadius: 15,
    kpiValueSize: 32,
    recommendationCardWidthPrimary: 200,
    recommendationCardWidthSecondary: 200,
  },
} as const;

export function getDashboardLayout(mode: DashboardLayoutMode) {
  return DASHBOARD_LAYOUT[mode];
}

export const DASHBOARD_CARD_STATES = {
  default: {
    backgroundColor: '#FFFFFF',
    borderColor: '#E3E9F4',
  },
  hover: {
    backgroundColor: '#FFFFFF',
    borderColor: '#CFE0FF',
  },
  active: {
    backgroundColor: '#EEF4FF',
    borderColor: '#A9C7FF',
  },
  alert: {
    backgroundColor: '#FFF7ED',
    borderColor: '#FED7AA',
  },
  locked: {
    backgroundColor: '#F8FAFC',
    borderColor: '#CBD5E1',
  },
} as const;

export const BUSINESS_UI_TOKENS = DASHBOARD_TOKENS;
