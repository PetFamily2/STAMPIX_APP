export type CardTheme = {
  id: string;
  name: string;
  gradient: [string, string, string];
  glow: string;
  titleColor: string;
  subtitleColor: string;
};

export const CARD_THEMES: CardTheme[] = [
  {
    id: 'midnight-luxe',
    name: 'Midnight Luxe',
    gradient: ['#0F172A', '#1D4ED8', '#312E81'],
    glow: 'rgba(147,197,253,0.32)',
    titleColor: '#F8FAFC',
    subtitleColor: '#D6E6FF',
  },
  {
    id: 'sunset-pop',
    name: 'Sunset Pop',
    gradient: ['#7C2D12', '#EA580C', '#FDBA74'],
    glow: 'rgba(255,237,213,0.4)',
    titleColor: '#FFF7ED',
    subtitleColor: '#FFEDD5',
  },
  {
    id: 'forest-club',
    name: 'Forest Club',
    gradient: ['#052E16', '#15803D', '#86EFAC'],
    glow: 'rgba(220,252,231,0.35)',
    titleColor: '#F0FDF4',
    subtitleColor: '#DCFCE7',
  },
  {
    id: 'champagne-blush',
    name: 'Champagne Blush',
    gradient: ['#FFF7ED', '#FCE7F3', '#FED7AA'],
    glow: 'rgba(251,207,232,0.45)',
    titleColor: '#431407',
    subtitleColor: '#7C2D12',
  },
  {
    id: 'electric-wave',
    name: 'Electric Wave',
    gradient: ['#082F49', '#0891B2', '#67E8F9'],
    glow: 'rgba(165,243,252,0.4)',
    titleColor: '#ECFEFF',
    subtitleColor: '#CFFAFE',
  },
];

export function resolveCardTheme(themeId: string | undefined) {
  return CARD_THEMES.find((theme) => theme.id === themeId) ?? CARD_THEMES[0];
}
