import { expect, test } from 'bun:test';
import { list, markRead } from '../webInbox';
import { baseTables, buildCtx } from './helpers/scannerFixtures';

function context(tables, actor = 'customer_1') {
  const ctx = buildCtx(tables, actor);
  const query = ctx.db.query.bind(ctx.db);
  ctx.db.query = (table) => {
    const result = query(table);
    result.order = () => result;
    return result;
  };
  return ctx;
}
test('legacy campaign logs expose canonical campaign copy, newer snapshots win', async () => {
  const tables = baseTables({
    campaigns: [{ _id: 'campaign_1', businessId: 'business_1', title: 'Internal', messageTitle: 'Canonical', messageBody: 'Campaign body' }],
    messageLog: [
      { _id: 'log_1', toUserId: 'customer_1', businessId: 'business_1', campaignId: 'campaign_1', createdAt: 1 },
      { _id: 'log_2', toUserId: 'customer_1', businessId: 'business_1', campaignId: 'campaign_1', createdAt: 2, inboxPayload: { title: 'Snapshot', body: 'Snapshot body' } },
      { _id: 'foreign', toUserId: 'staff_1', businessId: 'business_1', campaignId: 'campaign_1', createdAt: 3 },
    ],
  });
  const result = await list._handler(context(tables), {});
  expect(result.map(({ title, body }) => ({ title, body }))).toEqual([
    { title: 'Canonical', body: 'Campaign body' }, { title: 'Snapshot', body: 'Snapshot body' },
  ]);
  await expect(markRead._handler(context(tables, 'staff_1'), { id: 'log_1' })).rejects.toThrow('NOT_AUTHORIZED');
  await markRead._handler(context(tables), { id: 'log_1' });
  const firstRead = tables.messageLog[0].readAt;
  await markRead._handler(context(tables), { id: 'log_1' });
  expect(tables.messageLog[0].readAt).toBe(firstRead);
});
test('cross-business campaign references cannot disclose copy; unauthenticated and suspended actors are denied', async () => {
  const tables = baseTables({
    campaigns: [{ _id: 'foreign', businessId: 'business_other', messageTitle: 'Private', messageBody: 'Private body' }],
    messageLog: [{ _id: 'log_1', toUserId: 'customer_1', businessId: 'business_1', campaignId: 'foreign', createdAt: 1 }],
  });
  expect((await list._handler(context(tables), {}))[0].title).toBe('עדכון חדש');
  await expect(list._handler(context(tables, null), {})).rejects.toThrow();
  tables.users.find((u) => u._id === 'customer_1').isActive = false;
  await expect(list._handler(context(tables), {})).rejects.toThrow('NOT_AUTHORIZED');
});
