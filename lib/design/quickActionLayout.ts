export const QUICK_ACTION_MIN_TAP_TARGET = 44;
export const QUICK_ACTION_MIN_COMFORTABLE_TILE_WIDTH = 104;
export const QUICK_ACTION_TILE_MAX_WIDTH = 168;
export const QUICK_ACTION_CONTENT_MAX_WIDTH = 1180;

export function getQuickActionContentWidth({
  windowWidth,
  pageHorizontalPadding,
  contentMaxWidth = QUICK_ACTION_CONTENT_MAX_WIDTH,
}: {
  windowWidth: number;
  pageHorizontalPadding: number;
  contentMaxWidth?: number;
}) {
  const boundedWindow = Math.min(Math.max(windowWidth, 0), contentMaxWidth);
  return Math.max(0, boundedWindow - pageHorizontalPadding * 2);
}

export function getQuickActionColumnCount({
  contentWidth,
  itemCount,
  gap,
  minComfortableTileWidth = QUICK_ACTION_MIN_COMFORTABLE_TILE_WIDTH,
}: {
  contentWidth: number;
  itemCount: number;
  gap: number;
  minComfortableTileWidth?: number;
}) {
  const count = Math.max(0, Math.floor(itemCount));
  if (count <= 1) {
    return 1;
  }
  if (contentWidth <= 0) {
    return count;
  }

  const singleRowTileWidth = (contentWidth - gap * (count - 1)) / count;
  if (singleRowTileWidth >= minComfortableTileWidth) {
    return count;
  }

  return Math.min(2, count);
}

export function getQuickActionTileWidth({
  contentWidth,
  columns,
  gap,
  maxTileWidth = QUICK_ACTION_TILE_MAX_WIDTH,
}: {
  contentWidth: number;
  columns: number;
  gap: number;
  maxTileWidth?: number;
}) {
  const safeColumns = Math.max(1, columns);
  const available = contentWidth - gap * (safeColumns - 1);
  if (!Number.isFinite(available) || available <= 0) {
    return Math.min(maxTileWidth, QUICK_ACTION_MIN_TAP_TARGET);
  }

  return Math.min(maxTileWidth, Math.floor(available / safeColumns));
}

export function getQuickActionRowCount(itemCount: number, columns: number) {
  if (itemCount <= 0) {
    return 0;
  }

  return Math.ceil(itemCount / Math.max(1, columns));
}

export function chunkQuickActionItems<T>(items: readonly T[], columns: number) {
  const size = Math.max(1, columns);
  const rows: T[][] = [];
  for (let index = 0; index < items.length; index += size) {
    rows.push(items.slice(index, index + size));
  }
  return rows;
}
