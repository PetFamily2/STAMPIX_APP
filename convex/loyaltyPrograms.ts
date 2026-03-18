import { v } from 'convex/values';
import type { Id } from './_generated/dataModel';
import { mutation, query } from './_generated/server';
import { assertEntitlement } from './entitlements';
import {
  requireActorIsBusinessOwnerOrManager,
  requireActorIsStaffForBusiness,
} from './guards';
import { buildProgramStructureSignature } from './lib/recommendationUtils';

const DEFAULT_THEME_ID = 'midnight-luxe';
const DEFAULT_STAMP_SHAPE = 'circle';
const STAMP_SHAPE_SET = new Set([
  'circle',
  'roundedSquare',
  'square',
  'hexagon',
  'icon',
]);
const DAY_MS = 24 * 60 * 60 * 1000;

const CARD_RULES_LOCKED_ERROR_MESSAGE =
  'Card rules cannot be changed after the card is published.';

type ProgramLifecycle = 'draft' | 'active' | 'archived';

const LIFECYCLE_SORT_ORDER: Record<ProgramLifecycle, number> = {
  active: 0,
  draft: 1,
  archived: 2,
};

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

function normalizeStampShape(value: string | undefined) {
  const normalized = value?.trim();
  if (!normalized) {
    return DEFAULT_STAMP_SHAPE;
  }
  return STAMP_SHAPE_SET.has(normalized) ? normalized : DEFAULT_STAMP_SHAPE;
}

function normalizeOptionalText(value: string | undefined) {
  const normalized = value?.trim();
  return normalized && normalized.length > 0 ? normalized : undefined;
}

function normalizeStructureText(value: string | undefined) {
  return normalizeOptionalText(value) ?? '';
}

function resolveProgramLifecycle(program: any): ProgramLifecycle {
  if (
    program?.status === 'draft' ||
    program?.status === 'active' ||
    program?.status === 'archived'
  ) {
    return program.status;
  }

  if (program?.isArchived === true) {
    return 'archived';
  }

  return 'active';
}

function isProgramScannerEligible(program: any) {
  if (!program || program.isActive !== true) {
    return false;
  }
  return resolveProgramLifecycle(program) === 'active';
}

function isLifecycleOperational(lifecycle: ProgramLifecycle) {
  return lifecycle === 'active' || lifecycle === 'archived';
}

function isRuleLocked(lifecycle: ProgramLifecycle) {
  return lifecycle !== 'draft';
}

function buildStructureSignature(input: {
  rewardName: string;
  maxStamps: number;
  cardTerms: string;
  rewardConditions: string;
}) {
  return buildProgramStructureSignature({
    rewardName: input.rewardName,
    maxStamps: input.maxStamps,
    cardTerms: input.cardTerms,
    rewardConditions: input.rewardConditions,
  });
}

async function listBusinessPrograms(ctx: any, businessId: string) {
  return await ctx.db
    .query('loyaltyPrograms')
    .withIndex('by_businessId', (q: any) => q.eq('businessId', businessId))
    .filter((q: any) => q.eq(q.field('isActive'), true))
    .collect();
}

async function resolveProgramImageUrl(ctx: any, program: any) {
  const storageId = program.imageStorageId as Id<'_storage'> | undefined;
  if (storageId) {
    const url = await ctx.storage.getUrl(storageId);
    if (url) {
      return url;
    }
  }
  return program.imageUrl ?? null;
}

function sortProgramsForScanner(programs: any[]) {
  return [...programs].sort((a, b) => {
    const aPos = Number.isFinite(a.posSortOrder)
      ? Number(a.posSortOrder)
      : null;
    const bPos = Number.isFinite(b.posSortOrder)
      ? Number(b.posSortOrder)
      : null;
    if (aPos !== null && bPos !== null && aPos !== bPos) {
      return aPos - bPos;
    }
    if (aPos !== null && bPos === null) {
      return -1;
    }
    if (aPos === null && bPos !== null) {
      return 1;
    }

    const aPublishedAt = Number(a.publishedAt ?? 0);
    const bPublishedAt = Number(b.publishedAt ?? 0);
    if (aPublishedAt !== bPublishedAt) {
      return aPublishedAt - bPublishedAt;
    }

    const aCreatedAt = Number(a.createdAt ?? 0);
    const bCreatedAt = Number(b.createdAt ?? 0);
    if (aCreatedAt !== bCreatedAt) {
      return aCreatedAt - bCreatedAt;
    }

    return String(a._id).localeCompare(String(b._id));
  });
}

async function getProgramMembershipCount(ctx: any, programId: string) {
  const memberships = await ctx.db
    .query('memberships')
    .withIndex('by_programId', (q: any) => q.eq('programId', programId))
    .collect();

  return memberships.length;
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

export const listByBusiness = query({
  args: {
    businessId: v.optional(v.id('businesses')),
  },
  handler: async (ctx, { businessId }) => {
    if (!businessId) {
      return [];
    }
    await requireActorIsStaffForBusiness(ctx, businessId);

    const allPrograms = await listBusinessPrograms(ctx, businessId);
    const programs = allPrograms.filter((program: any) =>
      isLifecycleOperational(resolveProgramLifecycle(program))
    );

    return await Promise.all(
      programs.map(async (program: any) => {
        const lifecycle = resolveProgramLifecycle(program);
        return {
          loyaltyProgramId: program._id,
          businessId: program.businessId,
          title: program.title,
          imageUrl: await resolveProgramImageUrl(ctx, program),
          rewardName: program.rewardName,
          maxStamps: program.maxStamps,
          stampIcon: program.stampIcon,
          stampShape: normalizeStampShape(program.stampShape),
          cardThemeId: program.cardThemeId ?? DEFAULT_THEME_ID,
          isArchived: lifecycle === 'archived',
          isActive: program.isActive,
          posSortOrder:
            typeof program.posSortOrder === 'number'
              ? program.posSortOrder
              : null,
          allowPosEnroll: program.allowPosEnroll !== false,
          lifecycle,
          status: lifecycle,
        };
      })
    );
  },
});

export const listScannerPrograms = query({
  args: {
    businessId: v.optional(v.id('businesses')),
  },
  handler: async (ctx, { businessId }) => {
    if (!businessId) {
      return [];
    }
    await requireActorIsStaffForBusiness(ctx, businessId);

    const allPrograms = await listBusinessPrograms(ctx, businessId);
    const eligiblePrograms = sortProgramsForScanner(
      allPrograms.filter((program: any) => isProgramScannerEligible(program))
    );

    return await Promise.all(
      eligiblePrograms.map(async (program: any) => ({
        loyaltyProgramId: program._id,
        businessId: program.businessId,
        title: program.title,
        imageUrl: await resolveProgramImageUrl(ctx, program),
        rewardName: program.rewardName,
        maxStamps: program.maxStamps,
        stampIcon: program.stampIcon,
        stampShape: normalizeStampShape(program.stampShape),
        cardThemeId: program.cardThemeId ?? DEFAULT_THEME_ID,
        posSortOrder:
          typeof program.posSortOrder === 'number'
            ? program.posSortOrder
            : null,
        allowPosEnroll: program.allowPosEnroll !== false,
        lifecycle: 'active' as const,
        status: 'active' as const,
        isArchived: false,
        isActive: true,
      }))
    );
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
        listBusinessPrograms(ctx, businessId),
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

    const mapped = await Promise.all(
      programs.map(async (program: any) => {
        const programId = String(program._id);
        const lifecycle = resolveProgramLifecycle(program);
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
          imageUrl: await resolveProgramImageUrl(ctx, program),
          rewardName: program.rewardName,
          maxStamps: program.maxStamps,
          stampIcon: program.stampIcon,
          stampShape: normalizeStampShape(program.stampShape),
          cardThemeId: program.cardThemeId ?? DEFAULT_THEME_ID,
          lifecycle,
          status: lifecycle,
          isArchived: lifecycle === 'archived',
          isRuleLocked: isRuleLocked(lifecycle),
          canDelete: totalMembers.length === 0,
          membershipCount: totalMembers.length,
          metrics: {
            activeMembers: activeMembers.length,
            totalMembers: totalMembers.length,
            stamps7d,
            redemptions30d,
            lastActivityAt,
          },
        };
      })
    );

    mapped.sort((a: any, b: any) => {
      if (a.lifecycle !== b.lifecycle) {
        return (
          LIFECYCLE_SORT_ORDER[a.lifecycle as ProgramLifecycle] -
          LIFECYCLE_SORT_ORDER[b.lifecycle as ProgramLifecycle]
        );
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
    const lifecycle = resolveProgramLifecycle(program);

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

    const membershipCount = allMemberships.filter(
      (membership) => String(membership.programId) === programIdString
    ).length;

    return {
      loyaltyProgramId: program._id,
      businessId: program.businessId,
      title: program.title,
      description: program.description ?? null,
      imageUrl: await resolveProgramImageUrl(ctx, program),
      imageStorageId: program.imageStorageId ?? null,
      rewardName: program.rewardName,
      maxStamps: program.maxStamps,
      cardTerms: program.cardTerms ?? null,
      rewardConditions: program.rewardConditions ?? null,
      stampIcon: program.stampIcon,
      stampShape: normalizeStampShape(program.stampShape),
      cardThemeId: program.cardThemeId ?? DEFAULT_THEME_ID,
      lifecycle,
      status: lifecycle,
      isArchived: lifecycle === 'archived',
      isRuleLocked: isRuleLocked(lifecycle),
      canDelete: membershipCount === 0,
      membershipCount,
      metrics: {
        activeMembers: activeMemberships.filter(
          (membership) => String(membership.programId) === programIdString
        ).length,
        totalMembers: membershipCount,
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
      publishedAt: program.publishedAt ?? null,
      archivedAt: program.archivedAt ?? null,
    };
  },
});

export const generateProgramImageUploadUrl = mutation({
  args: {
    businessId: v.id('businesses'),
  },
  handler: async (ctx, { businessId }) => {
    await requireActorIsBusinessOwnerOrManager(ctx, businessId);
    const uploadUrl = await ctx.storage.generateUploadUrl();
    return { uploadUrl };
  },
});

export const createLoyaltyProgram = mutation({
  args: {
    businessId: v.id('businesses'),
    title: v.string(),
    description: v.optional(v.string()),
    imageUrl: v.optional(v.string()),
    imageStorageId: v.optional(v.id('_storage')),
    rewardName: v.string(),
    maxStamps: v.number(),
    cardTerms: v.optional(v.string()),
    rewardConditions: v.optional(v.string()),
    stampIcon: v.string(),
    stampShape: v.optional(v.string()),
    cardThemeId: v.optional(v.string()),
  },
  handler: async (
    ctx,
    {
      businessId,
      title,
      description,
      imageUrl,
      imageStorageId,
      rewardName,
      maxStamps,
      cardTerms,
      rewardConditions,
      stampIcon,
      stampShape,
      cardThemeId,
    }
  ) => {
    await requireActorIsBusinessOwnerOrManager(ctx, businessId);

    const normalizedTitle = normalizeTitle(title);
    const normalizedDescription = normalizeOptionalText(description);
    const normalizedImageUrl = normalizeOptionalText(imageUrl);
    const normalizedImageStorageId = imageStorageId;
    const normalizedReward = normalizeReward(rewardName);
    const normalizedMaxStamps = normalizeMaxStamps(maxStamps);
    const normalizedCardTerms = normalizeOptionalText(cardTerms);
    const normalizedRewardConditions = normalizeOptionalText(rewardConditions);
    const normalizedIcon = normalizeIcon(stampIcon);
    const normalizedStampShape = normalizeStampShape(stampShape);
    const normalizedThemeId = normalizeThemeId(cardThemeId);
    const existingPrograms = await listBusinessPrograms(ctx, businessId);
    const maxPosSortOrder = existingPrograms.reduce(
      (highest: number, program: any) => {
        if (typeof program.posSortOrder !== 'number') {
          return highest;
        }
        return Math.max(highest, program.posSortOrder);
      },
      -1
    );
    const posSortOrder = maxPosSortOrder + 1;
    const structureSignature = buildStructureSignature({
      rewardName: normalizedReward,
      maxStamps: normalizedMaxStamps,
      cardTerms: normalizeStructureText(normalizedCardTerms),
      rewardConditions: normalizeStructureText(normalizedRewardConditions),
    });

    const now = Date.now();
    const loyaltyProgramId = await ctx.db.insert('loyaltyPrograms', {
      businessId,
      status: 'draft',
      publishedAt: undefined,
      title: normalizedTitle,
      description: normalizedDescription,
      imageUrl: normalizedImageUrl,
      imageStorageId: normalizedImageStorageId,
      rewardName: normalizedReward,
      maxStamps: normalizedMaxStamps,
      cardTerms: normalizedCardTerms,
      rewardConditions: normalizedRewardConditions,
      stampIcon: normalizedIcon,
      stampShape: normalizedStampShape,
      cardThemeId: normalizedThemeId,
      posSortOrder,
      allowPosEnroll: true,
      structureSignature,
      lastStructureChangedAt: now,
      isArchived: false,
      archivedAt: undefined,
      archivedByUserId: undefined,
      isActive: true,
      createdAt: now,
      updatedAt: now,
    });

    return { loyaltyProgramId };
  },
});

export const publishProgram = mutation({
  args: {
    businessId: v.id('businesses'),
    programId: v.id('loyaltyPrograms'),
  },
  handler: async (ctx, { businessId, programId }) => {
    await requireActorIsBusinessOwnerOrManager(ctx, businessId);
    const program = await getProgramOrThrow(ctx, businessId, programId);
    const lifecycle = resolveProgramLifecycle(program);

    if (lifecycle === 'archived') {
      throw new Error('PROGRAM_REACTIVATION_FORBIDDEN');
    }
    if (lifecycle === 'active') {
      throw new Error('PROGRAM_ALREADY_PUBLISHED');
    }

    const allPrograms = await listBusinessPrograms(ctx, businessId);
    const activeCountExcludingCurrent = allPrograms.filter((item: any) => {
      if (String(item._id) === String(program._id)) {
        return false;
      }
      return resolveProgramLifecycle(item) === 'active';
    }).length;

    await assertEntitlement(ctx, businessId, {
      limitKey: 'maxCards',
      currentValue: activeCountExcludingCurrent,
    });

    const now = Date.now();
    await ctx.db.patch(program._id, {
      status: 'active',
      publishedAt: now,
      isArchived: false,
      archivedAt: undefined,
      archivedByUserId: undefined,
      updatedAt: now,
    });

    return { ok: true };
  },
});

export const updateProgramForManagement = mutation({
  args: {
    businessId: v.id('businesses'),
    programId: v.id('loyaltyPrograms'),
    title: v.string(),
    description: v.optional(v.string()),
    imageUrl: v.optional(v.string()),
    imageStorageId: v.optional(v.id('_storage')),
    rewardName: v.string(),
    maxStamps: v.number(),
    cardTerms: v.optional(v.string()),
    rewardConditions: v.optional(v.string()),
    stampIcon: v.string(),
    stampShape: v.optional(v.string()),
    cardThemeId: v.optional(v.string()),
  },
  handler: async (
    ctx,
    {
      businessId,
      programId,
      title,
      description,
      imageUrl,
      imageStorageId,
      rewardName,
      maxStamps,
      cardTerms,
      rewardConditions,
      stampIcon,
      stampShape,
      cardThemeId,
    }
  ) => {
    await requireActorIsBusinessOwnerOrManager(ctx, businessId);
    const program = await getProgramOrThrow(ctx, businessId, programId);
    const lifecycle = resolveProgramLifecycle(program);
    const ruleLocked = isRuleLocked(lifecycle);

    const normalizedTitle = normalizeTitle(title);
    const normalizedDescription = normalizeOptionalText(description);
    const normalizedImageUrl = normalizeOptionalText(imageUrl);
    const normalizedImageStorageId = imageStorageId;
    const normalizedReward = normalizeReward(rewardName);
    const normalizedMaxStamps = normalizeMaxStamps(maxStamps);
    const normalizedCardTerms = normalizeOptionalText(cardTerms);
    const normalizedRewardConditions = normalizeOptionalText(rewardConditions);
    const normalizedIcon = normalizeIcon(stampIcon);
    const normalizedStampShape = normalizeStampShape(stampShape);
    const normalizedThemeId = normalizeThemeId(cardThemeId);

    const currentReward = normalizeReward(program.rewardName);
    const currentMaxStamps = normalizeMaxStamps(program.maxStamps);
    const currentCardTerms = normalizeOptionalText(program.cardTerms);
    const currentRewardConditions = normalizeOptionalText(
      program.rewardConditions
    );

    const lockedFieldsChanged =
      normalizedReward !== currentReward ||
      normalizedMaxStamps !== currentMaxStamps ||
      normalizeStructureText(normalizedCardTerms) !==
        normalizeStructureText(currentCardTerms) ||
      normalizeStructureText(normalizedRewardConditions) !==
        normalizeStructureText(currentRewardConditions);

    if (ruleLocked && lockedFieldsChanged) {
      throw new Error(CARD_RULES_LOCKED_ERROR_MESSAGE);
    }

    const now = Date.now();
    const patchPayload: Record<string, unknown> = {
      title: normalizedTitle,
      description: normalizedDescription,
      imageUrl: normalizedImageUrl,
      imageStorageId: normalizedImageStorageId,
      stampIcon: normalizedIcon,
      stampShape: normalizedStampShape,
      cardThemeId: normalizedThemeId,
      updatedAt: now,
    };

    if (!ruleLocked) {
      patchPayload.rewardName = normalizedReward;
      patchPayload.maxStamps = normalizedMaxStamps;
      patchPayload.cardTerms = normalizedCardTerms;
      patchPayload.rewardConditions = normalizedRewardConditions;

      const nextStructureSignature = buildStructureSignature({
        rewardName: normalizedReward,
        maxStamps: normalizedMaxStamps,
        cardTerms: normalizeStructureText(normalizedCardTerms),
        rewardConditions: normalizeStructureText(normalizedRewardConditions),
      });

      if (program.structureSignature !== nextStructureSignature) {
        patchPayload.structureSignature = nextStructureSignature;
        patchPayload.lastStructureChangedAt = now;
      }
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
    const lifecycle = resolveProgramLifecycle(program);
    if (lifecycle !== 'active') {
      throw new Error('PROGRAM_CANNOT_BE_ARCHIVED');
    }

    const now = Date.now();
    await ctx.db.patch(program._id, {
      status: 'archived',
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
  handler: async () => {
    throw new Error('PROGRAM_REACTIVATION_FORBIDDEN');
  },
});

export const deleteProgram = mutation({
  args: {
    businessId: v.id('businesses'),
    programId: v.id('loyaltyPrograms'),
  },
  handler: async (ctx, { businessId, programId }) => {
    await requireActorIsBusinessOwnerOrManager(ctx, businessId);
    const program = await getProgramOrThrow(ctx, businessId, programId);
    const membershipCount = await getProgramMembershipCount(ctx, program._id);

    if (membershipCount > 0) {
      throw new Error('PROGRAM_DELETE_FORBIDDEN_HAS_MEMBERSHIPS');
    }

    await ctx.db.delete(program._id);
    return { ok: true };
  },
});
