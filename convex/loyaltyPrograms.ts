import { v } from 'convex/values';
import { mutation, query } from './_generated/server';
import { assertEntitlement } from './entitlements';
import {
  requireActorIsBusinessOwnerOrManager,
  requireActorIsStaffForBusiness,
} from './guards';
import { buildProgramStructureSignature } from './lib/recommendationUtils';

const DEFAULT_THEME_ID = 'midnight-luxe';
const DAY_MS = 24 * 60 * 60 * 1000;

function normalizeTitle(value: string) {
  const normalized = value.trim();
  if (!normalized) {
    throw new Error('TITLE_REQUIRED');
  }
  return normalized;
}

function normalizeReward(value: string) {
  const normalized = value.trim();
  if (!normalized) {
    throw new Error('REWARD_REQUIRED');
  }
  return normalized;
}

function normalizeIcon(value: string) {
  const normalized = value.trim();
  if (!normalized) {
    throw new Error('STAMP_ICON_REQUIRED');
  }
  return normalized;
}

function normalizeMaxStamps(value: number) {
  if (!Number.isFinite(value) || value <= 0) {
    throw new Error('MAX_STAMPS_INVALID');
  }
  return Math.floor(value);
}

function normalizeThemeId(value: string | undefined) {
  const normalized = value?.trim();
  return normalized && normalized.length > 0 ? normalized : DEFAULT_THEME_ID;
}

async function getProgramOrThrow(
  ctx: any,
  businessId: string,
  programId: string
) {
  const program = await ctx.db.get(programId);
  if (
    !program ||
    program.businessId !== businessId ||
    program.isActive !== true
  ) {
    throw new Error('PROGRAM_NOT_FOUND');
  }
  return program;
}

function getProgramLifecycle(isArchived: boolean | undefined) {
  return isArchived === true ? 'archived' : 'active';
}

export const listByBusiness = query({
  args: {
    businessId: v.optional(v.id('businesses')),
  },
  handler: async (ctx, { businessId }) => {
    if (!businessId) {
      return [];
    }
    await requireActorIsStaffForBusiness(ctx, businessId);

    const programs = await ctx.db
      .query('loyaltyPrograms')
      .withIndex('by_businessId', (q: any) => q.eq('businessId', businessId))
      .filter((q: any) => q.eq(q.field('isActive'), true))
      .collect();

    return programs.map((program) => ({
      loyaltyProgramId: program._id,
      businessId: program.businessId,
      title: program.title,
      rewardName: program.rewardName,
      maxStamps: program.maxStamps,
      stampIcon: program.stampIcon,
      cardThemeId: program.cardThemeId ?? DEFAULT_THEME_ID,
      isArchived: program.isArchived === true,
      isActive: program.isActive,
    }));
  },
});

export const listManagementByBusiness = query({
  args: {
    businessId: v.optional(v.id('businesses')),
  },
  handler: async (ctx, { businessId }) => {
    if (!businessId) {
      return [];
    }

    await requireActorIsStaffForBusiness(ctx, businessId);

    const now = Date.now();
    const sevenDaysAgo = now - 7 * DAY_MS;
    const thirtyDaysAgo = now - 30 * DAY_MS;

    const [programs, activeMemberships, allMemberships, events] =
      await Promise.all([
        ctx.db
          .query('loyaltyPrograms')
          .withIndex('by_businessId', (q: any) =>
            q.eq('businessId', businessId)
          )
          .filter((q: any) => q.eq(q.field('isActive'), true))
          .collect(),
        ctx.db
          .query('memberships')
          .withIndex('by_businessId', (q: any) =>
            q.eq('businessId', businessId)
          )
          .filter((q: any) => q.eq(q.field('isActive'), true))
          .collect(),
        ctx.db
          .query('memberships')
          .withIndex('by_businessId', (q: any) =>
            q.eq('businessId', businessId)
          )
          .collect(),
        ctx.db
          .query('events')
          .withIndex('by_businessId', (q: any) =>
            q.eq('businessId', businessId)
          )
          .filter((q: any) => q.gte(q.field('createdAt'), thirtyDaysAgo))
          .collect(),
      ]);

    const mapped = programs.map((program) => {
      const programId = String(program._id);
      const activeMembers = activeMemberships.filter(
        (membership) => String(membership.programId) === programId
      );
      const totalMembers = allMemberships.filter(
        (membership) => String(membership.programId) === programId
      );
      const programEvents = events.filter(
        (event) => String(event.programId) === programId
      );
      const lastActivityAt =
        programEvents.length > 0
          ? Math.max(...programEvents.map((event) => event.createdAt))
          : null;
      const stamps7d = programEvents.filter(
        (event) =>
          event.type === 'STAMP_ADDED' &&
          Number(event.createdAt) >= sevenDaysAgo
      ).length;
      const redemptions30d = programEvents.filter(
        (event) => event.type === 'REWARD_REDEEMED'
      ).length;

      return {
        loyaltyProgramId: program._id,
        title: program.title,
        rewardName: program.rewardName,
        maxStamps: program.maxStamps,
        stampIcon: program.stampIcon,
        cardThemeId: program.cardThemeId ?? DEFAULT_THEME_ID,
        lifecycle: getProgramLifecycle(program.isArchived),
        metrics: {
          activeMembers: activeMembers.length,
          totalMembers: totalMembers.length,
          stamps7d,
          redemptions30d,
          lastActivityAt,
        },
      };
    });

    mapped.sort((a, b) => {
      if (a.lifecycle !== b.lifecycle) {
        return a.lifecycle === 'active' ? -1 : 1;
      }
      const aLast = a.metrics.lastActivityAt ?? 0;
      const bLast = b.metrics.lastActivityAt ?? 0;
      return bLast - aLast;
    });

    return mapped;
  },
});

export const getProgramDetailsForManagement = query({
  args: {
    businessId: v.id('businesses'),
    programId: v.id('loyaltyPrograms'),
  },
  handler: async (ctx, { businessId, programId }) => {
    await requireActorIsStaffForBusiness(ctx, businessId);
    const program = await getProgramOrThrow(ctx, businessId, programId);

    const now = Date.now();
    const sevenDaysAgo = now - 7 * DAY_MS;
    const thirtyDaysAgo = now - 30 * DAY_MS;

    const [activeMemberships, allMemberships, events] = await Promise.all([
      ctx.db
        .query('memberships')
        .withIndex('by_businessId', (q: any) => q.eq('businessId', businessId))
        .filter((q: any) => q.eq(q.field('isActive'), true))
        .collect(),
      ctx.db
        .query('memberships')
        .withIndex('by_businessId', (q: any) => q.eq('businessId', businessId))
        .collect(),
      ctx.db
        .query('events')
        .withIndex('by_businessId', (q: any) => q.eq('businessId', businessId))
        .filter((q: any) => q.gte(q.field('createdAt'), thirtyDaysAgo))
        .collect(),
    ]);

    const programIdString = String(program._id);
    const programEvents = events.filter(
      (event) => String(event.programId) === programIdString
    );
    const lastActivityAt =
      programEvents.length > 0
        ? Math.max(...programEvents.map((event) => event.createdAt))
        : null;

    return {
      loyaltyProgramId: program._id,
      businessId: program.businessId,
      title: program.title,
      rewardName: program.rewardName,
      maxStamps: program.maxStamps,
      stampIcon: program.stampIcon,
      cardThemeId: program.cardThemeId ?? DEFAULT_THEME_ID,
      lifecycle: getProgramLifecycle(program.isArchived),
      metrics: {
        activeMembers: activeMemberships.filter(
          (membership) => String(membership.programId) === programIdString
        ).length,
        totalMembers: allMemberships.filter(
          (membership) => String(membership.programId) === programIdString
        ).length,
        stamps7d: programEvents.filter(
          (event) =>
            event.type === 'STAMP_ADDED' &&
            Number(event.createdAt) >= sevenDaysAgo
        ).length,
        redemptions30d: programEvents.filter(
          (event) => event.type === 'REWARD_REDEEMED'
        ).length,
        lastActivityAt,
      },
      archivedAt: program.archivedAt ?? null,
    };
  },
});

export const createLoyaltyProgram = mutation({
  args: {
    businessId: v.id('businesses'),
    title: v.string(),
    rewardName: v.string(),
    maxStamps: v.number(),
    stampIcon: v.string(),
    cardThemeId: v.optional(v.string()),
  },
  handler: async (
    ctx,
    { businessId, title, rewardName, maxStamps, stampIcon, cardThemeId }
  ) => {
    await requireActorIsBusinessOwnerOrManager(ctx, businessId);
    const existingPrograms = await ctx.db
      .query('loyaltyPrograms')
      .withIndex('by_businessId', (q: any) => q.eq('businessId', businessId))
      .filter((q: any) =>
        q.and(
          q.eq(q.field('isActive'), true),
          q.neq(q.field('isArchived'), true)
        )
      )
      .collect();
    await assertEntitlement(ctx, businessId, {
      limitKey: 'maxCards',
      currentValue: existingPrograms.length,
    });

    const normalizedTitle = normalizeTitle(title);
    const normalizedReward = normalizeReward(rewardName);
    const normalizedIcon = normalizeIcon(stampIcon);
    const normalizedMaxStamps = normalizeMaxStamps(maxStamps);
    const normalizedThemeId = normalizeThemeId(cardThemeId);
    const structureSignature = buildProgramStructureSignature({
      title: normalizedTitle,
      rewardName: normalizedReward,
      maxStamps: normalizedMaxStamps,
    });

    const now = Date.now();
    const loyaltyProgramId = await ctx.db.insert('loyaltyPrograms', {
      businessId,
      title: normalizedTitle,
      rewardName: normalizedReward,
      maxStamps: normalizedMaxStamps,
      stampIcon: normalizedIcon,
      cardThemeId: normalizedThemeId,
      structureSignature,
      lastStructureChangedAt: now,
      isArchived: false,
      isActive: true,
      createdAt: now,
      updatedAt: now,
    });

    return { loyaltyProgramId };
  },
});

export const updateProgramForManagement = mutation({
  args: {
    businessId: v.id('businesses'),
    programId: v.id('loyaltyPrograms'),
    title: v.string(),
    rewardName: v.string(),
    maxStamps: v.number(),
    stampIcon: v.string(),
    cardThemeId: v.optional(v.string()),
  },
  handler: async (
    ctx,
    {
      businessId,
      programId,
      title,
      rewardName,
      maxStamps,
      stampIcon,
      cardThemeId,
    }
  ) => {
    await requireActorIsBusinessOwnerOrManager(ctx, businessId);
    const program = await getProgramOrThrow(ctx, businessId, programId);
    const normalizedTitle = normalizeTitle(title);
    const normalizedReward = normalizeReward(rewardName);
    const normalizedMaxStamps = normalizeMaxStamps(maxStamps);
    const normalizedIcon = normalizeIcon(stampIcon);
    const normalizedThemeId = normalizeThemeId(cardThemeId);
    const nextStructureSignature = buildProgramStructureSignature({
      title: normalizedTitle,
      rewardName: normalizedReward,
      maxStamps: normalizedMaxStamps,
    });

    const now = Date.now();
    const patchPayload: Record<string, unknown> = {
      title: normalizedTitle,
      rewardName: normalizedReward,
      maxStamps: normalizedMaxStamps,
      stampIcon: normalizedIcon,
      cardThemeId: normalizedThemeId,
      updatedAt: now,
    };

    if (program.structureSignature !== nextStructureSignature) {
      patchPayload.structureSignature = nextStructureSignature;
      patchPayload.lastStructureChangedAt = now;
    }

    await ctx.db.patch(program._id, patchPayload);

    return { ok: true };
  },
});

export const archiveProgram = mutation({
  args: {
    businessId: v.id('businesses'),
    programId: v.id('loyaltyPrograms'),
  },
  handler: async (ctx, { businessId, programId }) => {
    const { actor } = await requireActorIsBusinessOwnerOrManager(
      ctx,
      businessId
    );
    const program = await getProgramOrThrow(ctx, businessId, programId);
    const now = Date.now();

    await ctx.db.patch(program._id, {
      isArchived: true,
      archivedAt: now,
      archivedByUserId: actor._id,
      updatedAt: now,
    });

    return { ok: true };
  },
});

export const unarchiveProgram = mutation({
  args: {
    businessId: v.id('businesses'),
    programId: v.id('loyaltyPrograms'),
  },
  handler: async (ctx, { businessId, programId }) => {
    await requireActorIsBusinessOwnerOrManager(ctx, businessId);
    const program = await getProgramOrThrow(ctx, businessId, programId);
    const now = Date.now();

    const activePrograms = await ctx.db
      .query('loyaltyPrograms')
      .withIndex('by_businessId', (q: any) => q.eq('businessId', businessId))
      .filter((q: any) =>
        q.and(
          q.eq(q.field('isActive'), true),
          q.neq(q.field('isArchived'), true)
        )
      )
      .collect();

    const activeCountExcludingCurrent = activePrograms.filter(
      (item) => String(item._id) !== String(program._id)
    ).length;

    await assertEntitlement(ctx, businessId, {
      limitKey: 'maxCards',
      currentValue: activeCountExcludingCurrent,
    });

    await ctx.db.patch(program._id, {
      isArchived: false,
      archivedAt: undefined,
      archivedByUserId: undefined,
      updatedAt: now,
    });

    return { ok: true };
  },
});
