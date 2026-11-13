import type { StampShape } from '@/constants/stampOptions';

/** Stable press angles. Index 0 is always the first earned stamp. */
export const CLASSIC_STAMP_ROTATIONS = [
  -6, 4, -3, 5, -4, 3, -5, 2, 6, -2, 4, -5, 3, -3, 5, -6, 2, 4, -4, 3,
] as const;

export function classicStampColumns(maxStamps: number) {
  const count = Math.max(1, Math.floor(maxStamps));
  if (count === 8 || count === 12) {
    return 4;
  }
  return 5;
}

export function classicStampRotation(index: number) {
  const safeIndex = Math.max(0, Math.floor(index));
  return CLASSIC_STAMP_ROTATIONS[safeIndex % CLASSIC_STAMP_ROTATIONS.length];
}

export function classicNameWeight(shape: StampShape): '500' | '600' | '700' {
  if (shape === 'roundedSquare') {
    return '700';
  }
  if (shape === 'square' || shape === 'hexagon') {
    return '600';
  }
  return '500';
}
