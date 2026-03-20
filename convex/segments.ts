import { v } from 'convex/values';
import type { Id } from './_generated/dataModel';
import { mutation, query } from './_generated/server';
import { buildCustomerLifecycleSnapshotForBusiness } from './customerLifecycle';
import { assertEntitlement } from './entitlements';
import {
  requireActorIsBusinessOwnerOrManager,
  requireActorIsStaffForBusiness,
} from './guards';

export type SegmentField =
  | 'lastVisitDaysAgo'
  | 'visitCount'
  | 'loyaltyProgress'
  | 'customerStatus'
  | 'customerState'
  | 'customerValueTier'
  | 'joinedDaysAgo';
export type SegmentOperator = 'gt' | 'gte' | 'lt' | 'lte' | 'eq';
export type SegmentCondition = {
  field: SegmentField;
  operator: SegmentOperator;
  value: number | string;
};
export type SegmentRules = {
  match: 'all' | 'any';
  conditions: SegmentCondition[];
};

const ALLOWED_FIELDS = new Set<SegmentField>([
  'lastVisitDaysAgo',
  'visitCount',
  'loyaltyProgress',
  'customerStatus',
  'customerState',
  'customerValueTier',
  'joinedDaysAgo',
]);
const ALLOWED_OPERATORS = new Set<SegmentOperator>([
  'gt',
  'gte',
  'lt',
  'lte',
  'eq',
]);
const ALLOWED_CUSTOMER_STATUSES = new Set([
  'NEW_CUSTOMER',
  'ACTIVE',
  'AT_RISK',
  'NEAR_REWARD',
  'VIP',
]);
const ALLOWED_CUSTOMER_STATES = new Set([
  'NEW',
  'ACTIVE',
  'NEEDS_NURTURE',
  'NEEDS_WINBACK',
  'CLOSE_TO_REWARD',
]);
const ALLOWED_CUSTOMER_VALUE_TIERS = new Set(['REGULAR', 'LOYAL', 'VIP']);

function normalizeSegmentName(value: string) {
  const normalized = value.trim().replace(/\s+/g, ' ');
  if (!normalized) {
    throw new Error('SEGMENT_NAME_REQUIRED');
  }
  if (normalized.length > 60) {
    throw new Error('SEGMENT_NAME_TOO_LONG');
  }
  return normalized;
}

export function normalizeSegmentRules(rules: unknown): SegmentRules {
  const source =
    rules && typeof rules === 'object'
      ? (rules as Record<string, unknown>)
      : {};
  const match = source.match === 'any' ? 'any' : 'all';
  const rawConditions = Array.isArray(source.conditions)
    ? source.conditions
    : [];

  const conditions = rawConditions
    .map((entry): SegmentCondition | null => {
      if (!entry || typeof entry !== 'object') {
        return null;
      }
      const candidate = entry as Record<string, unknown>;
      const field = candidate.field;
      const operator = candidate.operator;
      const value = candidate.value;

      if (
        typeof field !== 'string' ||
        typeof operator !== 'string' ||
        !ALLOWED_FIELDS.has(field as SegmentField) ||
        !ALLOWED_OPERATORS.has(operator as SegmentOperator)
      ) {
        return null;
      }

      if (field === 'customerStatus') {
        if (
          typeof value !== 'string' ||
          !ALLOWED_CUSTOMER_STATUSES.has(value)
        ) {
          return null;
        }
        return {
          field: field as SegmentField,
          operator: operator as SegmentOperator,
          value,
        };
      }

      if (field === 'customerState') {
        if (typeof value !== 'string' || !ALLOWED_CUSTOMER_STATES.has(value)) {
          return null;
        }
        return {
          field: field as SegmentField,
          operator: operator as SegmentOperator,
          value,
        };
      }

      if (field === 'customerValueTier') {
        if (
          typeof value !== 'string' ||
          !ALLOWED_CUSTOMER_VALUE_TIERS.has(value)
        ) {
          return null;
        }
        return {
          field: field as SegmentField,
          operator: operator as SegmentOperator,
          value,
        };
      }

      if (!Number.isFinite(value)) {
        return null;
      }

      return {
        field: field as SegmentField,
        operator: operator as SegmentOperator,
        value: Number(value),
      };
    })
    .filter((condition): condition is SegmentCondition => condition !== null);

  if (conditions.length === 0) {
    throw new Error('SEGMENT_RULES_REQUIRED');
  }

  return { match, conditions };
}

function compareValues(
  left: number | string,
  operator: SegmentOperator,
  right: number | string
) {
  switch (operator) {
    case 'gt':
      return Number(left) > Number(right);
    case 'gte':
      return Number(left) >= Number(right);
    case 'lt':
      return Number(left) < Number(right);
    case 'lte':
      return Number(left) <= Number(right);
    case 'eq':
      return left === right;
    default:
      return false;
  }
}

export function applySegmentRules(
  customers: Awaited<
    ReturnType<typeof buildCustomerLifecycleSnapshotForBusiness>
  >['customers'],
  rules: SegmentRules
) {
  return customers.filter((customer) => {
    const evaluations = rules.conditions.map((condition) => {
      switch (condition.field) {
        case 'lastVisitDaysAgo':
          return compareValues(
            customer.lastVisitDaysAgo,
            condition.operator,
            condition.value
          );
        case 'visitCount':
          return compareValues(
            customer.visitCount,
            condition.operator,
            condition.value
          );
        case 'loyaltyProgress':
          return compareValues(
            customer.loyaltyProgress,
            condition.operator,
            condition.value
          );
        case 'joinedDaysAgo':
          return compareValues(
            customer.joinedDaysAgo,
            condition.operator,
            condition.value
          );
        case 'customerStatus':
          return compareValues(
            customer.lifecycleStatus,
            condition.operator,
            condition.value
          );
        case 'customerState':
          return compareValues(
            customer.customerState,
            condition.operator,
            condition.value
          );
        case 'customerValueTier':
          return compareValues(
            customer.customerValueTier,
            condition.operator,
            condition.value
          );
        default:
          return false;
      }
    });

    return rules.match === 'all'
      ? evaluations.every(Boolean)
      : evaluations.some(Boolean);
  });
}

async function getSegmentOrThrow(
  ctx: any,
  businessId: Id<'businesses'>,
  segmentId: Id<'segments'>
) {
  const segment = await ctx.db.get(segmentId);
  if (!segment || String(segment.businessId) !== String(businessId)) {
    throw new Error('SEGMENT_NOT_FOUND');
  }
  return segment;
}

export const previewSegment = query({
  args: {
    businessId: v.id('businesses'),
    rules: v.any(),
  },
  handler: async (ctx, { businessId, rules }) => {
    await requireActorIsStaffForBusiness(ctx, businessId);
    await assertEntitlement(ctx, businessId, {
      featureKey: 'segmentationBuilder',
    });

    const normalizedRules = normalizeSegmentRules(rules);
    const snapshot = await buildCustomerLifecycleSnapshotForBusiness(
      ctx,
      businessId
    );
    const matchedCustomers = applySegmentRules(
      snapshot.customers,
      normalizedRules
    );

    return {
      rules: normalizedRules,
      count: matchedCustomers.length,
      customers: matchedCustomers.slice(0, 50),
    };
  },
});

export const listSegments = query({
  args: {
    businessId: v.optional(v.id('businesses')),
  },
  handler: async (ctx, { businessId }) => {
    if (!businessId) {
      return [];
    }

    await requireActorIsStaffForBusiness(ctx, businessId);
    await assertEntitlement(ctx, businessId, {
      featureKey: 'savedSegments',
    });

    const segments = await ctx.db
      .query('segments')
      .withIndex('by_businessId', (q: any) => q.eq('businessId', businessId))
      .collect();

    return segments
      .sort((left, right) => right.updatedAt - left.updatedAt)
      .map((segment) => ({
        segmentId: segment._id,
        name: segment.name,
        rules: normalizeSegmentRules(segment.rules),
        createdAt: segment.createdAt,
        updatedAt: segment.updatedAt,
      }));
  },
});

export const createSegment = mutation({
  args: {
    businessId: v.id('businesses'),
    name: v.string(),
    rules: v.any(),
  },
  handler: async (ctx, { businessId, name, rules }) => {
    await requireActorIsBusinessOwnerOrManager(ctx, businessId);
    await assertEntitlement(ctx, businessId, {
      featureKey: 'segmentationBuilder',
    });
    await assertEntitlement(ctx, businessId, {
      featureKey: 'savedSegments',
    });

    const normalizedRules = normalizeSegmentRules(rules);
    const normalizedName = normalizeSegmentName(name);
    const now = Date.now();

    const segmentId = await ctx.db.insert('segments', {
      businessId,
      name: normalizedName,
      rules: normalizedRules,
      createdAt: now,
      updatedAt: now,
    });

    return {
      segmentId,
      name: normalizedName,
      rules: normalizedRules,
    };
  },
});

export const deleteSegment = mutation({
  args: {
    businessId: v.id('businesses'),
    segmentId: v.id('segments'),
  },
  handler: async (ctx, { businessId, segmentId }) => {
    await requireActorIsBusinessOwnerOrManager(ctx, businessId);
    await assertEntitlement(ctx, businessId, {
      featureKey: 'savedSegments',
    });
    await getSegmentOrThrow(ctx, businessId, segmentId);
    await ctx.db.delete(segmentId);
    return { ok: true };
  },
});

export async function resolveSegmentAudience(
  ctx: any,
  businessId: Id<'businesses'>,
  segmentId: Id<'segments'>
) {
  const segment = await getSegmentOrThrow(ctx, businessId, segmentId);
  const snapshot = await buildCustomerLifecycleSnapshotForBusiness(
    ctx,
    businessId
  );
  const rules = normalizeSegmentRules(segment.rules);
  return {
    segment,
    rules,
    customers: applySegmentRules(snapshot.customers, rules),
  };
}
