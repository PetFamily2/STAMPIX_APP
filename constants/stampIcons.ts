import type { ComponentProps } from 'react';
import type { Ionicons } from '@expo/vector-icons';

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
  { id: 'coffee', label: 'קפה ושתייה', icon: 'cafe' },
  { id: 'star', label: 'הטבה כללית', icon: 'star' },
  { id: 'gift', label: 'מתנה', icon: 'gift' },
  { id: 'heart', label: 'אהבה', icon: 'heart' },
  { id: 'food', label: 'אוכל', icon: 'restaurant' },
  { id: 'beauty', label: 'טיפוח ויופי', icon: 'flower' },
  { id: 'fitness', label: 'כושר', icon: 'barbell' },
  { id: 'pets', label: 'חיות מחמד', icon: 'paw' },
  { id: 'automotive', label: 'רכב', icon: 'car-sport' },
  { id: 'sparkles', label: 'נצנוץ', icon: 'sparkles' },
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
    : LEGACY_ICON_ALIASES[normalized] ?? DEFAULT_STAMP_ICON_ID;
  return ICON_BY_ID.get(id) ?? STAMP_ICON_CATALOG[1];
}

export function isCanonicalStampIcon(value: string) {
  return ICON_BY_ID.has(value.trim().toLowerCase());
}
