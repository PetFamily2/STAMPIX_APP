export type CustomerActivityType =
  | 'JOINED_PROGRAM'
  | 'STAMP_ADDED'
  | 'REWARD_REDEEMED'
  | 'STAMP_REVERTED'
  | 'REWARD_REDEEM_REVERTED';

export type CustomerActivityFilter =
  | 'all'
  | 'stamps'
  | 'redemptions'
  | 'cancellations';

export const CUSTOMER_ACTIVITY_FILTERS: ReadonlyArray<{
  id: CustomerActivityFilter;
  label: string;
}> = [
  { id: 'all', label: 'הכל' },
  { id: 'stamps', label: 'ניקובים' },
  { id: 'redemptions', label: 'מימושים' },
  { id: 'cancellations', label: 'ביטולים' },
];

export function activityMatchesFilter(
  type: CustomerActivityType,
  filter: CustomerActivityFilter
) {
  if (filter === 'all') {
    return true;
  }
  if (filter === 'stamps') {
    return type === 'STAMP_ADDED';
  }
  if (filter === 'redemptions') {
    return type === 'REWARD_REDEEMED';
  }
  return type === 'STAMP_REVERTED' || type === 'REWARD_REDEEM_REVERTED';
}

function startOfLocalDay(timestamp: number) {
  const date = new Date(timestamp);
  return new Date(
    date.getFullYear(),
    date.getMonth(),
    date.getDate()
  ).getTime();
}

export function formatCustomerActivityDay(
  timestamp: number,
  nowTimestamp = Date.now()
) {
  const day = startOfLocalDay(timestamp);
  const today = startOfLocalDay(nowTimestamp);
  const dayDifference = Math.round((today - day) / 86_400_000);
  if (dayDifference === 0) {
    return 'היום';
  }
  if (dayDifference === 1) {
    return 'אתמול';
  }
  return new Date(timestamp).toLocaleDateString('he-IL', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
  });
}

export function groupCustomerActivityByDay<
  T extends { createdAt: number; type: CustomerActivityType },
>(
  items: readonly T[],
  filter: CustomerActivityFilter,
  nowTimestamp = Date.now()
) {
  const groups = new Map<string, T[]>();
  for (const item of items) {
    if (!activityMatchesFilter(item.type, filter)) {
      continue;
    }
    const title = formatCustomerActivityDay(item.createdAt, nowTimestamp);
    const group = groups.get(title) ?? [];
    group.push(item);
    groups.set(title, group);
  }
  return Array.from(groups, ([title, data]) => ({ title, data }));
}
