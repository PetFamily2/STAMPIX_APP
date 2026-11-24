import { describe, expect, test } from 'bun:test';
import { getDiscoveryH3Cell } from '../lib/discoveryGeo';
import {
  startBusinessDiscoveryH3Verification,
  verifyBusinessDiscoveryH3Batch,
} from '../migrations/backfillBusinessDiscoveryH3Cells';

function fixture(businesses) {
  const state = { businesses, discoveryH3Readiness: [] },
    scheduled = [];
  const ctx = {
    db: {
      query(table) {
        if (table === 'discoveryH3Readiness')
          return {
            withIndex: () => ({
              unique: async () => state.discoveryH3Readiness[0] ?? null,
            }),
          };
        return {
          paginate: async ({ cursor, numItems }) => {
            const start = cursor ? Number(cursor) : 0;
            const page = state.businesses.slice(start, start + numItems);
            const end = start + page.length;
            return {
              page,
              continueCursor: String(end),
              isDone: end >= state.businesses.length,
            };
          },
        };
      },
      async insert(table, doc) {
        const row = { _id: 'state1', ...doc };
        state[table].push(row);
        return row._id;
      },
      async patch(id, changes) {
        const row = state.discoveryH3Readiness.find((item) => item._id === id);
        if (!row) throw Error('missing');
        Object.assign(row, changes);
      },
    },
    scheduler: {
      async runAfter(_delay, _ref, args) {
        scheduled.push(args);
      },
    },
  };
  return { ctx, state, scheduled };
}
async function drain(f) {
  while (f.scheduled.length)
    await verifyBusinessDiscoveryH3Batch._handler(f.ctx, f.scheduled.shift());
}
describe('H3 backfill readiness', () => {
  test('never marks a partial or mismatched scan ready and verifies all records', async () => {
    const location = { lat: 32.08, lng: 34.78 },
      cell = getDiscoveryH3Cell(location);
    const f = fixture(
      Array.from({ length: 205 }, (_, i) => ({
        _id: String(i),
        location,
        discoveryH3R5: i === 201 ? undefined : cell,
        isActive: i % 2 === 0,
      }))
    );
    await startBusinessDiscoveryH3Verification._handler(f.ctx);
    expect(f.state.discoveryH3Readiness[0].status).toBe('checking');
    await verifyBusinessDiscoveryH3Batch._handler(f.ctx, f.scheduled.shift());
    expect(f.state.discoveryH3Readiness[0]).toMatchObject({
      status: 'checking',
      scanned: 100,
    });
    await drain(f);
    expect(f.state.discoveryH3Readiness[0]).toMatchObject({
      status: 'failed',
      scanned: 205,
      mismatched: 1,
    });
    f.state.businesses[201].discoveryH3R5 = cell;
    await startBusinessDiscoveryH3Verification._handler(f.ctx);
    await drain(f);
    expect(f.state.discoveryH3Readiness[0]).toMatchObject({
      status: 'ready',
      scanned: 205,
      mismatched: 0,
    });
  });
  test('invalid coordinates block readiness; duplicate or stale jobs cannot promote', async () => {
    const f = fixture([{ _id: 'bad', location: { lat: 100, lng: 2 } }]);
    await startBusinessDiscoveryH3Verification._handler(f.ctx);
    const old = f.scheduled.shift();
    await startBusinessDiscoveryH3Verification._handler(f.ctx);
    expect(await verifyBusinessDiscoveryH3Batch._handler(f.ctx, old)).toEqual({
      status: 'stale',
    });
    await drain(f);
    expect(f.state.discoveryH3Readiness[0].status).toBe('failed');
  });
  test('a failed batch may retry without advancing the recorded cursor', async () => {
    const location = { lat: 32, lng: 35 };
    const f = fixture([
      { _id: 'one', location, discoveryH3R5: getDiscoveryH3Cell(location) },
    ]);
    await startBusinessDiscoveryH3Verification._handler(f.ctx);
    const args = f.scheduled.shift();
    const patch = f.ctx.db.patch;
    let fail = true;
    f.ctx.db.patch = async (...parts) => {
      if (fail) {
        fail = false;
        throw Error('injected failure');
      }
      return patch(...parts);
    };
    await expect(
      verifyBusinessDiscoveryH3Batch._handler(f.ctx, args)
    ).rejects.toThrow('injected failure');
    expect(f.state.discoveryH3Readiness[0]).toMatchObject({
      status: 'checking',
      scanned: 0,
    });
    await verifyBusinessDiscoveryH3Batch._handler(f.ctx, args);
    expect(f.state.discoveryH3Readiness[0]).toMatchObject({
      status: 'ready',
      scanned: 1,
    });
  });
});
