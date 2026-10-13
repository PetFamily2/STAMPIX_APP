import { resolveCardTheme } from '@/constants/cardThemes';

export type ClassicStampPalette = {
  paper: string;
  ink: string;
  mute: string;
  soft: string;
};

/**
 * Printed card stock for every saved theme.
 * Dark themes stay ink-on-paper. They do not become the old gradient panel.
 */
const PALETTES: Readonly<Record<string, ClassicStampPalette>> = {
  'midnight-luxe': {
    paper: '#E7EAF2',
    ink: '#0F172A',
    mute: '#5C6B85',
    soft: '#1E293B',
  },
  'sunset-pop': {
    paper: '#F8E6D8',
    ink: '#7C2D12',
    mute: '#A86A48',
    soft: '#7C2D12',
  },
  'forest-club': {
    paper: '#E5F0E6',
    ink: '#052E16',
    mute: '#3F6B4A',
    soft: '#14532D',
  },
  'champagne-blush': {
    paper: '#F8EDE4',
    ink: '#431407',
    mute: '#8C6248',
    soft: '#7C2D12',
  },
  'electric-wave': {
    paper: '#E5F4F6',
    ink: '#083344',
    mute: '#3E6D78',
    soft: '#155E75',
  },
  'royal-plum': {
    paper: '#F3E8F6',
    ink: '#3B0764',
    mute: '#7A508C',
    soft: '#581C87',
  },
  'cherry-studio': {
    paper: '#F6DDD0',
    ink: '#641E1E',
    mute: '#A06860',
    soft: '#6E302C',
  },
  'golden-hour': {
    paper: '#F3E2C8',
    ink: '#3F2912',
    mute: '#8C6E52',
    soft: '#5C4030',
  },
  'ocean-deep': {
    paper: '#E6EEF8',
    ink: '#172554',
    mute: '#5A6E96',
    soft: '#1E3A8A',
  },
  'slate-minimal': {
    paper: '#EFECE6',
    ink: '#1A1A1A',
    mute: '#7A6858',
    soft: '#3A3834',
  },
};

export function resolveClassicStampPalette(themeId: string | null | undefined) {
  const theme = resolveCardTheme(themeId);
  return PALETTES[theme.id] ?? PALETTES['midnight-luxe'];
}
