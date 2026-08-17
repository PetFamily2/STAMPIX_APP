import { describe, expect, test } from 'bun:test';

import { computeCoreMetrics } from '../aiRecommendations';
import {
  buildDashboardLifecycleCountsFromStampEvents,
  isCustomerActiveForReferenceNow,
  isCustomerAtRiskForReferenceNow,
} from '../customerLifecycle';
import {
  collectLifetimeMetricChanges,
  collectLifetimeMetrics,
  getBusinessDashboardDay,
} from '../dashboard';

const DAY_MS = 24 * 60 * 60 * 1000;

class FakeQuery {
  constructor(rows) {
    this.rows = rows;
    this.predicates = [];
  }

  withIndex(_name, builder) {
    const conditions = [];
    const q = {
      eq: (field, value) => {
        conditions.push((row) => row[field] === value);
        return q;
      },
      lte: (field, value) => {
        conditions.push((row) => row[field] <= value);
        return q;
      },
    };
    builder(q);
    this.predicates.push((row) =>
      conditions.every((predicate) => predicate(row))
    );
    return this;
  }

  filter(builder) {
    const q = {
      field: (fieldName) => ({ fieldName }),
      eq: (left, right) => ({ left, right }),
    };
    const expression = builder(q);
    if (expression?.left?.fieldName) {
      this.predicates.push(
        (row) => row[expression.left.fieldName] === expression.right
      );
    }
    return this;
  }

  currentRows() {
    return this.rows.filter((row) =>
      this.predicates.every((predicate) => predicate(row))
    );
  }

  async collect() {
    return this.currentRows();
  }

  async first() {
    return this.currentRows()[0] ?? null;
  }
}

function buildDashboardCtx(tables) {
  return {
    auth: {
      getUserIdentity: async () => ({ subject: 'staff_1|session' }),
    },
    db: {
      get: async (id) => {
        for (const rows of Object.values(tables)) {
          const found = rows.find((row) => row._id === id);
          if (found) {
            return found;
          }
        }
        return null;
      },
      query: (tableName) => new FakeQuery(tables[tableName] ?? []),
    },
  };
}

describe('dashboard lifecycle KPI helpers', () => {
  test('counts customer as active when last stamp is within 30 days', () => {
    const referenceNow = 100 * DAY_MS;
    const stamps = [referenceNow - 10 * DAY_MS];

    expect(isCustomerActiveForReferenceNow(stamps, referenceNow)).toBe(true);
  });

  test('does not count customer as active when last stamp is older than 30 days', () => {
    const referenceNow = 100 * DAY_MS;
    const stamps = [referenceNow - 31 * DAY_MS];

    expect(isCustomerActiveForReferenceNow(stamps, referenceNow)).toBe(false);
  });

  test('counts multiple stamps in the 30-day window as one active customer', () => {
    const referenceNow = 100 * DAY_MS;
    const counts = buildDashboardLifecycleCountsFromStampEvents(
      [
        {
          customerUserId: 'customer_1',
          createdAt: referenceNow - 20 * DAY_MS,
          type: 'STAMP_ADDED',
        },
        {
          customerUserId: 'customer_1',
          createdAt: referenceNow - 5 * DAY_MS,
          type: 'STAMP_ADDED',
        },
        {
          customerUserId: 'customer_2',
          createdAt: referenceNow - 35 * DAY_MS,
          type: 'STAMP_ADDED',
        },
      ],
      referenceNow
    );

    expect(counts.activeCustomers).toBe(1);
  });

  test('historical referenceNow shifts the active window correctly', () => {
    const actualNow = 100 * DAY_MS;
    const historicalReferenceNow = actualNow - 15 * DAY_MS;
    const stamps = [actualNow - 5 * DAY_MS];

    expect(isCustomerActiveForReferenceNow(stamps, actualNow)).toBe(true);
    expect(
      isCustomerActiveForReferenceNow(stamps, historicalReferenceNow)
    ).toBe(false);
  });

  test('excludes customers with fewer than two visits from at-risk calculation', () => {
    const referenceNow = 100 * DAY_MS;
    const stamps = [referenceNow - 40 * DAY_MS];

    expect(isCustomerAtRiskForReferenceNow(stamps, referenceNow)).toBe(false);
  });

  test('counts customer as at risk when last visit is 1.5x beyond expected cycle', () => {
    const referenceNow = 100 * DAY_MS;
    const stamps = [
      referenceNow - 40 * DAY_MS,
      referenceNow - 30 * DAY_MS,
      referenceNow - 20 * DAY_MS,
    ];

    expect(isCustomerAtRiskForReferenceNow(stamps, referenceNow)).toBe(true);
  });

  test('historical referenceNow shifts at-risk calculation correctly', () => {
    const actualNow = 100 * DAY_MS;
    const historicalReferenceNow = 90 * DAY_MS;
    const stamps = [60 * DAY_MS, 70 * DAY_MS, 80 * DAY_MS];

    expect(
      isCustomerAtRiskForReferenceNow(stamps, historicalReferenceNow)
    ).toBe(false);
    expect(isCustomerAtRiskForReferenceNow(stamps, actualNow)).toBe(true);
  });

  test('lifecycle counts skip stamps with redacted customer identity', () => {
    const referenceNow = 100 * DAY_MS;
    const counts = buildDashboardLifecycleCountsFromStampEvents(
      [
        {
          customerUserId: undefined,
          createdAt: referenceNow - 5 * DAY_MS,
          type: 'STAMP_ADDED',
        },
        {
          customerUserId: 'customer_1',
          createdAt: referenceNow - 5 * DAY_MS,
          type: 'STAMP_ADDED',
        },
      ],
      referenceNow
    );

    expect(counts.activeCustomers).toBe(1);
    expect(counts.atRiskCustomers).toBe(0);
  });

  test('dashboard lifetime metrics preserve aggregate totals without undefined customers', () => {
    const now = 100 * DAY_MS;
    const events = [
      {
        type: 'STAMP_ADDED',
        customerUserId: undefined,
        createdAt: now - DAY_MS,
      },
      {
        type: 'STAMP_ADDED',
        customerUserId: undefined,
        createdAt: now,
      },
      {
        type: 'STAMP_ADDED',
        customerUserId: 'customer_1',
        createdAt: now,
      },
    ];

    const lifetime = collectLifetimeMetrics(events, [{ userId: 'customer_1' }]);
    const changes = collectLifetimeMetricChanges({
      events,
      memberships: [{ userId: 'customer_1', createdAt: now }],
      now,
    });

    expect(lifetime.totalStampsAllTime).toBe(3);
    expect(lifetime.returningCustomersAllTime).toBe(0);
    expect(changes.stampsLast7Days).toBe(3);
    expect(changes.returningCustomersLast7Days).toBe(0);
  });

  test('AI recommendation metrics do not count redacted customer identities as active users', () => {
    const now = 100 * DAY_MS;
    const result = computeCoreMetrics({
      memberships: [
        {
          _id: 'membership_1',
          userId: 'customer_1',
          programId: 'program_1',
          isActive: true,
          currentStamps: 1,
          createdAt: now - 10 * DAY_MS,
        },
      ],
      events: [
        {
          _id: 'event_missing_customer',
          type: 'STAMP_ADDED',
          customerUserId: undefined,
          createdAt: now - DAY_MS,
        },
      ],
      campaignRuns: [],
      primaryProgram: {
        _id: 'program_1',
        maxStamps: 10,
      },
      now,
      customerCycleDays: 30,
    });

    expect(result.metrics.visits_30d).toBe(1);
    expect(result.metrics.active_customers_30d).toBe(0);
    expect(result.metrics.joined_never_returned).toBe(1);
  });

  test('dashboard day counts redacted-actor stamps but not undefined staff actors', async () => {
    const now = Date.now();
    const dayStart = now - 60_000;
    const ctx = buildDashboardCtx({
      users: [{ _id: 'staff_1', isActive: true }],
      businesses: [{ _id: 'business_1', isActive: true }],
      businessStaff: [
        {
          _id: 'staff_link_1',
          businessId: 'business_1',
          userId: 'staff_1',
          staffRole: 'owner',
          status: 'active',
          isActive: true,
        },
      ],
      events: [
        {
          _id: 'event_redacted_actor',
          businessId: 'business_1',
          type: 'STAMP_ADDED',
          actorUserId: undefined,
          customerUserId: 'customer_1',
          createdAt: now,
        },
      ],
      messageLog: [],
      loyaltyPrograms: [],
    });

    const result = await getBusinessDashboardDay._handler(ctx, {
      businessId: 'business_1',
      dayStart,
    });

    expect(result.kpis.stamps.value).toBe(1);
    expect(result.activitySummary.staffScans).toBe(0);
  });
});
