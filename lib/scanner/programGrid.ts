export const PROGRAM_GRID_COLUMNS = 5;
export const PROGRAM_GRID_GAP = 7;
export const TABLET_PROGRAM_GRID_MAX_WIDTH = 560;

export function getProgramGridMetrics(
  availableWidth: number,
  isTablet: boolean
) {
  const normalizedWidth = Math.max(0, availableWidth);
  const gridWidth = isTablet
    ? Math.min(normalizedWidth, TABLET_PROGRAM_GRID_MAX_WIDTH)
    : normalizedWidth;
  const tileWidth = Math.max(
    0,
    (gridWidth - PROGRAM_GRID_GAP * (PROGRAM_GRID_COLUMNS - 1)) /
      PROGRAM_GRID_COLUMNS
  );

  return { columns: PROGRAM_GRID_COLUMNS, gap: PROGRAM_GRID_GAP, gridWidth, tileWidth };
}

export function getProgramGridRowCount(programCount: number) {
  return Math.ceil(Math.max(0, Math.floor(programCount)) / PROGRAM_GRID_COLUMNS);
}

export function getProgramGridEmptySlots(programCount: number) {
  const normalizedCount = Math.max(0, Math.floor(programCount));
  if (normalizedCount === 0) {
    return 0;
  }
  return (
    (PROGRAM_GRID_COLUMNS - (normalizedCount % PROGRAM_GRID_COLUMNS)) %
    PROGRAM_GRID_COLUMNS
  );
}
