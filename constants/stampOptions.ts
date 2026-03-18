export const MAX_STAMP_OPTIONS = [5, 8, 10, 12, 14, 20] as const;

export type StampShape =
  | 'circle'
  | 'roundedSquare'
  | 'square'
  | 'hexagon'
  | 'icon';

export const STAMP_SHAPE_OPTIONS: Array<{
  id: StampShape;
  label: string;
  description: string;
}> = [
  { id: 'circle', label: 'עיגול', description: 'ברירת מחדל' },
  { id: 'roundedSquare', label: 'ריבוע מעוגל', description: 'בטוח ומודרני' },
  { id: 'square', label: 'ריבוע', description: 'אלטרנטיבה' },
  { id: 'hexagon', label: 'משושה', description: 'בידול' },
  { id: 'icon', label: 'אייקון', description: 'חוויית מותג' },
];

export const DEFAULT_STAMP_SHAPE: StampShape = 'circle';

export function normalizeStampShape(
  value: string | null | undefined
): StampShape {
  if (
    value === 'circle' ||
    value === 'roundedSquare' ||
    value === 'square' ||
    value === 'hexagon' ||
    value === 'icon'
  ) {
    return value;
  }
  return DEFAULT_STAMP_SHAPE;
}
