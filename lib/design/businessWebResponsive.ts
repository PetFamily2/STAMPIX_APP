export const BUSINESS_WEB_BREAKPOINTS = {
  narrowMobile: 360,
  mobile: 720,
  fullSidebar: 1080,
  wideDashboard: 1340,
} as const;

export type BusinessWebResponsiveLayout = {
  composition: 'narrow-mobile' | 'mobile' | 'tablet' | 'desktop';
  navigation: 'compact' | 'sidebar';
  kpiColumns: 1 | 2 | 4;
  detailColumns: 1 | 2;
  activityPresentation: 'feed' | 'table';
  pagePadding: 16 | 32;
  pageTopPadding: 16 | 24 | 32;
  popoverWidth: number;
};

export type BusinessWebShellOverlay =
  | 'navigation'
  | 'business'
  | 'account'
  | null;

export function getNextBusinessWebShellOverlay(
  activeOverlay: BusinessWebShellOverlay,
  requestedOverlay: Exclude<BusinessWebShellOverlay, null>
): BusinessWebShellOverlay {
  return activeOverlay === requestedOverlay ? null : requestedOverlay;
}

export function getBusinessWebResponsiveLayout(
  viewportWidth: number
): BusinessWebResponsiveLayout {
  const safeWidth = Math.max(0, viewportWidth);
  const isCompact = safeWidth < BUSINESS_WEB_BREAKPOINTS.fullSidebar;
  const kpiColumns =
    safeWidth < BUSINESS_WEB_BREAKPOINTS.narrowMobile
      ? 1
      : safeWidth < BUSINESS_WEB_BREAKPOINTS.wideDashboard
        ? 2
        : 4;
  const composition =
    safeWidth < BUSINESS_WEB_BREAKPOINTS.narrowMobile
      ? 'narrow-mobile'
      : safeWidth < BUSINESS_WEB_BREAKPOINTS.mobile
        ? 'mobile'
        : safeWidth < BUSINESS_WEB_BREAKPOINTS.fullSidebar
          ? 'tablet'
          : 'desktop';

  return {
    composition,
    navigation: isCompact ? 'compact' : 'sidebar',
    kpiColumns,
    detailColumns: safeWidth < BUSINESS_WEB_BREAKPOINTS.wideDashboard ? 1 : 2,
    activityPresentation:
      safeWidth < BUSINESS_WEB_BREAKPOINTS.mobile ? 'feed' : 'table',
    pagePadding: isCompact ? 16 : 32,
    pageTopPadding:
      safeWidth < BUSINESS_WEB_BREAKPOINTS.mobile ? 16 : isCompact ? 24 : 32,
    popoverWidth: Math.min(280, Math.max(0, safeWidth - 32)),
  };
}
