import { BUSINESS_WEB_BREAKPOINTS } from '@/lib/design/businessWebResponsive';

/**
 * Business shell form factor.
 * A touch tablet stays on the app shell even when its viewport is wide.
 * A computer stays on the management shell even when its window is narrow.
 * User-Agent is intentionally not an input.
 */
export type NavigationFormFactor = 'phone-tablet' | 'desktop';

export type BusinessNavigationMode = 'bottom' | 'compact' | 'sidebar';

export type NavigationInputProfile = {
  viewportWidth: number;
  viewportHeight: number;
  /** `(pointer: coarse)` — the primary pointing device is touch. */
  primaryPointerCoarse: boolean;
  /** `(hover: hover)` — the primary pointing device can hover. */
  primaryHover: boolean;
  /** `(any-pointer: coarse)` — a touch digitizer exists, even on a mouse laptop. */
  anyPointerCoarse: boolean;
  maxTouchPoints: number;
};

export type NavigationMediaSource = {
  matchMedia?: (query: string) => { matches: boolean };
  maxTouchPoints?: number;
};

export function resolveNavigationFormFactor(
  profile: NavigationInputProfile
): NavigationFormFactor {
  const mousePrimary = profile.primaryHover && !profile.primaryPointerCoarse;
  if (mousePrimary) {
    return 'desktop';
  }
  return 'phone-tablet';
}

export function resolveBusinessNavigationMode(
  profile: NavigationInputProfile
): BusinessNavigationMode {
  if (resolveNavigationFormFactor(profile) === 'phone-tablet') {
    return 'bottom';
  }
  if (profile.viewportWidth < BUSINESS_WEB_BREAKPOINTS.fullSidebar) {
    return 'compact';
  }
  return 'sidebar';
}

export function readNavigationInputProfile(
  viewportWidth: number,
  viewportHeight: number,
  source?: NavigationMediaSource
): NavigationInputProfile {
  const hasMedia = typeof source?.matchMedia === 'function';
  const matches = (query: string) =>
    hasMedia ? source.matchMedia?.(query).matches === true : false;

  return {
    viewportWidth,
    viewportHeight,
    primaryPointerCoarse: matches('(pointer: coarse)'),
    primaryHover: hasMedia ? matches('(hover: hover)') : true,
    anyPointerCoarse: matches('(any-pointer: coarse)'),
    maxTouchPoints: source?.maxTouchPoints ?? 0,
  };
}

export function readWebNavigationSource(): NavigationMediaSource | undefined {
  if (
    typeof window === 'undefined' ||
    typeof window.matchMedia !== 'function'
  ) {
    return undefined;
  }
  try {
    window.matchMedia('(hover: hover)');
  } catch {
    return undefined;
  }
  return {
    matchMedia: (query: string) => window.matchMedia(query),
    maxTouchPoints:
      typeof navigator === 'undefined' ? 0 : (navigator.maxTouchPoints ?? 0),
  };
}
