export const DEFAULT_CARD_THEME_ID = 'midnight-luxe';

export type CardTheme = {
  id: string;
  name: string;
  surface: string;
  surfaceAlt: string;
  accent: string;
  onAccent: string;
  onSurface: string;
  onSurfaceMuted: string;
  keyline: string;
  stampEmpty: string;
  stampEarned: string;
  isLight: boolean;
  gradient: [string, string, string];
  glow: string;
  titleColor: string;
  subtitleColor: string;
};

/**
 * The canonical loyalty identity catalog. Keep this list at exactly ten themes:
 * it mirrors the largest supported card entitlement and is shared by every UI.
 */
export const CARD_THEMES: readonly CardTheme[] = [
  {
    id: 'midnight-luxe',
    name: 'כחול לילה',
    surface: '#0F172A',
    surfaceAlt: '#1E3A8A',
    accent: '#93C5FD',
    onAccent: '#0F172A',
    onSurface: '#F8FAFC',
    onSurfaceMuted: '#DBEAFE',
    keyline: 'rgba(219,234,254,0.34)',
    stampEmpty: '#BFDBFE',
    stampEarned: '#93C5FD',
    isLight: false,
    gradient: ['#0F172A', '#1D4ED8', '#312E81'],
    glow: 'rgba(147,197,253,0.32)',
    titleColor: '#F8FAFC',
    subtitleColor: '#DBEAFE',
  },
  {
    id: 'sunset-pop',
    name: 'כתום שקיעה',
    surface: '#7C2D12',
    surfaceAlt: '#C2410C',
    accent: '#FED7AA',
    onAccent: '#431407',
    onSurface: '#FFF7ED',
    onSurfaceMuted: '#FFEDD5',
    keyline: 'rgba(255,237,213,0.34)',
    stampEmpty: '#FED7AA',
    stampEarned: '#FDBA74',
    isLight: false,
    gradient: ['#7C2D12', '#EA580C', '#FDBA74'],
    glow: 'rgba(255,237,213,0.4)',
    titleColor: '#FFF7ED',
    subtitleColor: '#FFEDD5',
  },
  {
    id: 'forest-club',
    name: 'ירוק יער',
    surface: '#052E16',
    surfaceAlt: '#166534',
    accent: '#BBF7D0',
    onAccent: '#052E16',
    onSurface: '#F0FDF4',
    onSurfaceMuted: '#DCFCE7',
    keyline: 'rgba(220,252,231,0.32)',
    stampEmpty: '#BBF7D0',
    stampEarned: '#86EFAC',
    isLight: false,
    gradient: ['#052E16', '#15803D', '#86EFAC'],
    glow: 'rgba(220,252,231,0.35)',
    titleColor: '#F0FDF4',
    subtitleColor: '#DCFCE7',
  },
  {
    id: 'champagne-blush',
    name: 'ורוד שמפניה',
    surface: '#FFF7ED',
    surfaceAlt: '#FCE7F3',
    accent: '#9D174D',
    onAccent: '#FFFFFF',
    onSurface: '#431407',
    onSurfaceMuted: '#7C2D12',
    keyline: 'rgba(157,23,77,0.3)',
    stampEmpty: '#9D174D',
    stampEarned: '#BE185D',
    isLight: true,
    gradient: ['#FFF7ED', '#FCE7F3', '#FED7AA'],
    glow: 'rgba(251,207,232,0.45)',
    titleColor: '#431407',
    subtitleColor: '#7C2D12',
  },
  {
    id: 'electric-wave',
    name: 'טורקיז',
    surface: '#083344',
    surfaceAlt: '#0E7490',
    accent: '#CFFAFE',
    onAccent: '#083344',
    onSurface: '#ECFEFF',
    onSurfaceMuted: '#CFFAFE',
    keyline: 'rgba(207,250,254,0.34)',
    stampEmpty: '#A5F3FC',
    stampEarned: '#67E8F9',
    isLight: false,
    gradient: ['#082F49', '#0891B2', '#67E8F9'],
    glow: 'rgba(165,243,252,0.4)',
    titleColor: '#ECFEFF',
    subtitleColor: '#CFFAFE',
  },
  {
    id: 'royal-plum',
    name: 'סגול מלכותי',
    surface: '#3B0764',
    surfaceAlt: '#7E22CE',
    accent: '#E9D5FF',
    onAccent: '#3B0764',
    onSurface: '#FAF5FF',
    onSurfaceMuted: '#F3E8FF',
    keyline: 'rgba(243,232,255,0.34)',
    stampEmpty: '#D8B4FE',
    stampEarned: '#C084FC',
    isLight: false,
    gradient: ['#3B0764', '#7E22CE', '#C084FC'],
    glow: 'rgba(216,180,254,0.38)',
    titleColor: '#FAF5FF',
    subtitleColor: '#F3E8FF',
  },
  {
    id: 'cherry-studio',
    name: 'אדום דובדבן',
    surface: '#450A0A',
    surfaceAlt: '#B91C1C',
    accent: '#FECACA',
    onAccent: '#450A0A',
    onSurface: '#FEF2F2',
    onSurfaceMuted: '#FEE2E2',
    keyline: 'rgba(254,226,226,0.34)',
    stampEmpty: '#FCA5A5',
    stampEarned: '#F87171',
    isLight: false,
    gradient: ['#450A0A', '#B91C1C', '#F87171'],
    glow: 'rgba(254,202,202,0.38)',
    titleColor: '#FEF2F2',
    subtitleColor: '#FEE2E2',
  },
  {
    id: 'golden-hour',
    name: 'זהב',
    surface: '#FFFBEB',
    surfaceAlt: '#FDE68A',
    accent: '#92400E',
    onAccent: '#FFFFFF',
    onSurface: '#451A03',
    onSurfaceMuted: '#78350F',
    keyline: 'rgba(120,53,15,0.3)',
    stampEmpty: '#92400E',
    stampEarned: '#B45309',
    isLight: true,
    gradient: ['#FFFBEB', '#FDE68A', '#F59E0B'],
    glow: 'rgba(252,211,77,0.4)',
    titleColor: '#451A03',
    subtitleColor: '#78350F',
  },
  {
    id: 'ocean-deep',
    name: 'כחול אוקיינוס',
    surface: '#172554',
    surfaceAlt: '#1E40AF',
    accent: '#BFDBFE',
    onAccent: '#172554',
    onSurface: '#EFF6FF',
    onSurfaceMuted: '#DBEAFE',
    keyline: 'rgba(219,234,254,0.34)',
    stampEmpty: '#93C5FD',
    stampEarned: '#60A5FA',
    isLight: false,
    gradient: ['#172554', '#1E40AF', '#3B82F6'],
    glow: 'rgba(147,197,253,0.36)',
    titleColor: '#EFF6FF',
    subtitleColor: '#DBEAFE',
  },
  {
    id: 'slate-minimal',
    name: 'אפור אלגנטי',
    surface: '#F8FAFC',
    surfaceAlt: '#E2E8F0',
    accent: '#1E293B',
    onAccent: '#FFFFFF',
    onSurface: '#0F172A',
    onSurfaceMuted: '#334155',
    keyline: 'rgba(15,23,42,0.28)',
    stampEmpty: '#475569',
    stampEarned: '#1E293B',
    isLight: true,
    gradient: ['#F8FAFC', '#E2E8F0', '#94A3B8'],
    glow: 'rgba(148,163,184,0.34)',
    titleColor: '#0F172A',
    subtitleColor: '#334155',
  },
] as const;

const CARD_THEME_IDS = new Set(CARD_THEMES.map((theme) => theme.id));

/** Explicit aliases for historical values found in receipts or early builds. */
export const LEGACY_CARD_THEME_ID_MAP: Readonly<Record<string, string>> = {
  blue: 'midnight-luxe',
  midnight: 'midnight-luxe',
  sunset: 'sunset-pop',
  forest: 'forest-club',
  blush: 'champagne-blush',
  electric: 'electric-wave',
};

export function resolveCanonicalCardThemeId(
  themeId: string | null | undefined
) {
  const normalized = themeId?.trim().toLowerCase();
  if (!normalized) {
    return DEFAULT_CARD_THEME_ID;
  }
  if (CARD_THEME_IDS.has(normalized)) {
    return normalized;
  }
  return LEGACY_CARD_THEME_ID_MAP[normalized] ?? DEFAULT_CARD_THEME_ID;
}

export function isCanonicalCardThemeId(themeId: string) {
  return CARD_THEME_IDS.has(themeId.trim().toLowerCase());
}

export function resolveReservableCardThemeId(
  themeId: string | null | undefined
) {
  const normalized = themeId?.trim().toLowerCase();
  if (!normalized) {
    return DEFAULT_CARD_THEME_ID;
  }
  if (CARD_THEME_IDS.has(normalized)) {
    return normalized;
  }
  return LEGACY_CARD_THEME_ID_MAP[normalized] ?? null;
}

export function resolveCardTheme(themeId: string | null | undefined) {
  const canonicalId = resolveCanonicalCardThemeId(themeId);
  return (
    CARD_THEMES.find((theme) => theme.id === canonicalId) ?? CARD_THEMES[0]
  );
}
