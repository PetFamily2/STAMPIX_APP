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
  isLight: boolean;
  gradient: [string, string, string];
  glow: string;
  titleColor: string;
  subtitleColor: string;
};

export const CARD_THEMES: CardTheme[] = [
  {
    id: 'midnight-luxe',
    name: 'Midnight Luxe',
    surface: '#111827',
    surfaceAlt: '#172554',
    accent: '#60A5FA',
    onAccent: '#0F172A',
    onSurface: '#F8FAFC',
    onSurfaceMuted: '#C7D2FE',
    keyline: 'rgba(191,219,254,0.24)',
    isLight: false,
    gradient: ['#0F172A', '#1D4ED8', '#312E81'],
    glow: 'rgba(147,197,253,0.32)',
    titleColor: '#F8FAFC',
    subtitleColor: '#D6E6FF',
  },
  {
    id: 'sunset-pop',
    name: 'Sunset Pop',
    surface: '#7C2D12',
    surfaceAlt: '#9A3412',
    accent: '#FDBA74',
    onAccent: '#431407',
    onSurface: '#FFF7ED',
    onSurfaceMuted: '#FED7AA',
    keyline: 'rgba(255,237,213,0.28)',
    isLight: false,
    gradient: ['#7C2D12', '#EA580C', '#FDBA74'],
    glow: 'rgba(255,237,213,0.4)',
    titleColor: '#FFF7ED',
    subtitleColor: '#FFEDD5',
  },
  {
    id: 'forest-club',
    name: 'Forest Club',
    surface: '#052E16',
    surfaceAlt: '#14532D',
    accent: '#86EFAC',
    onAccent: '#052E16',
    onSurface: '#F0FDF4',
    onSurfaceMuted: '#BBF7D0',
    keyline: 'rgba(220,252,231,0.24)',
    isLight: false,
    gradient: ['#052E16', '#15803D', '#86EFAC'],
    glow: 'rgba(220,252,231,0.35)',
    titleColor: '#F0FDF4',
    subtitleColor: '#DCFCE7',
  },
  {
    id: 'champagne-blush',
    name: 'Champagne Blush',
    surface: '#FFF7ED',
    surfaceAlt: '#FCE7F3',
    accent: '#BE185D',
    onAccent: '#FFFFFF',
    onSurface: '#431407',
    onSurfaceMuted: '#7C2D12',
    keyline: 'rgba(190,24,93,0.2)',
    isLight: true,
    gradient: ['#FFF7ED', '#FCE7F3', '#FED7AA'],
    glow: 'rgba(251,207,232,0.45)',
    titleColor: '#431407',
    subtitleColor: '#7C2D12',
  },
  {
    id: 'electric-wave',
    name: 'Electric Wave',
    surface: '#083344',
    surfaceAlt: '#155E75',
    accent: '#67E8F9',
    onAccent: '#083344',
    onSurface: '#ECFEFF',
    onSurfaceMuted: '#A5F3FC',
    keyline: 'rgba(207,250,254,0.26)',
    isLight: false,
    gradient: ['#082F49', '#0891B2', '#67E8F9'],
    glow: 'rgba(165,243,252,0.4)',
    titleColor: '#ECFEFF',
    subtitleColor: '#CFFAFE',
  },
];

export function resolveCardTheme(themeId: string | undefined) {
  return CARD_THEMES.find((theme) => theme.id === themeId) ?? CARD_THEMES[0];
}
