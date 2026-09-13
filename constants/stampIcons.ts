import type { Ionicons } from '@expo/vector-icons';
import type { ComponentProps } from 'react';

export type StampIconName = ComponentProps<typeof Ionicons>['name'];

export type StampIconDefinition = {
  id: string;
  label: string;
  icon: StampIconName;
  opticalScale?: number;
};

export const DEFAULT_STAMP_ICON_ID = 'star';

/** Curated, stable values written to loyaltyPrograms.stampIcon. */
export const STAMP_ICON_CATALOG: readonly StampIconDefinition[] = [
  { id: 'coffee', label: 'קפה ושתייה', icon: 'cafe', opticalScale: 0.94 },
  { id: 'star', label: 'הטבה כללית', icon: 'star', opticalScale: 0.9 },
  { id: 'gift', label: 'מתנה', icon: 'gift', opticalScale: 0.88 },
  { id: 'heart', label: 'אהבה', icon: 'heart', opticalScale: 0.91 },
  { id: 'food', label: 'אוכל', icon: 'restaurant', opticalScale: 0.86 },
  { id: 'beauty', label: 'טיפוח ויופי', icon: 'flower', opticalScale: 0.92 },
  { id: 'fitness', label: 'כושר', icon: 'barbell', opticalScale: 0.9 },
  { id: 'pets', label: 'חיות מחמד', icon: 'paw', opticalScale: 0.9 },
  { id: 'automotive', label: 'רכב', icon: 'car-sport', opticalScale: 0.88 },
  { id: 'sparkles', label: 'נצנוץ', icon: 'sparkles', opticalScale: 0.9 },
] as const;

const ICON_BY_ID = new Map(
  STAMP_ICON_CATALOG.map((definition) => [definition.id, definition])
);

const LEGACY_ICON_ALIASES: Readonly<Record<string, string>> = {
  cafe: 'coffee',
  drink: 'coffee',
  '☕': 'coffee',
  '★': 'star',
  '⭐': 'star',
  '*': 'star',
  present: 'gift',
  '🎁': 'gift',
  '❤': 'heart',
  '❤️': 'heart',
  restaurant: 'food',
  flower: 'beauty',
  barbell: 'fitness',
  paw: 'pets',
  car: 'automotive',
  sparkle: 'sparkles',
};

export function resolveStampIcon(value: string | null | undefined) {
  const normalized = value?.trim().toLowerCase() || DEFAULT_STAMP_ICON_ID;
  const id = ICON_BY_ID.has(normalized)
    ? normalized
    : (LEGACY_ICON_ALIASES[normalized] ?? DEFAULT_STAMP_ICON_ID);
  return ICON_BY_ID.get(id) ?? STAMP_ICON_CATALOG[1];
}

export function isCanonicalStampIcon(value: string) {
  return ICON_BY_ID.has(value.trim().toLowerCase());
}
