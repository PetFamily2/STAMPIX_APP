import { v } from 'convex/values';
import type { Id } from './_generated/dataModel';
import { mutation, query } from './_generated/server';
import {
  assertEntitlement,
  countActiveCustomersForBusiness,
} from './entitlements';
import {
  getCurrentUserOrNull,
  requireActorIsStaffForBusiness,
  requireCurrentUser,
} from './guards';

// ---------------------------------------------------------------------------
// Public resolve queries (no auth required -- used by landing page & join flow)
// ---------------------------------------------------------------------------

export const resolveBusinessByPublicId = query({
  args: { businessPublicId: v.string() },
  handler: async (ctx, { businessPublicId }) => {
    const business = await ctx.db
      .query('businesses')
      .withIndex('by_businessPublicId', (q: any) =>
        q.eq('businessPublicId', businessPublicId)
      )
      .first();

    if (!business || business.isActive !== true) return null;

    return {
      businessId: business._id,
      name: business.name,
      logoUrl: business.logoUrl ?? null,
      joinCode: business.joinCode ?? null,
    };
  },
});

export const resolveBusinessByJoinCode = query({
  args: { joinCode: v.string() },
  handler: async (ctx, { joinCode }) => {
    const normalized = joinCode.trim().toUpperCase();
    if (!normalized) return null;

    const business = await ctx.db
      .query('businesses')
      .withIndex('by_joinCode', (q: any) => q.eq('joinCode', normalized))
      .first();

    if (!business || business.isActive !== true) return null;

    return {
      businessId: business._id,
      name: business.name,
      logoUrl: business.logoUrl ?? null,
      businessPublicId: business.businessPublicId ?? null,
    };
  },
});

type CustomerMembershipRecord = {
  membershipId: Id<'memberships'>;
  userId: Id<'users'>;
  businessId: Id<'businesses'>;
  programId: Id<'loyaltyPrograms'>;
  businessName: string;
  businessLogoUrl: string | null;
  programTitle: string;
  rewardName: string;
  stampIcon: string;
  cardThemeId: string | null;
  currentStamps: number;
  maxStamps: number;
  lastStampAt: number;
  canRedeem: boolean;
};

type CustomerProgramSelection = {
  programId: Id<'loyaltyPrograms'>;
  title: string;
  rewardName: string;
  maxStamps: number;
  stampIcon: string;
  cardThemeId: string | null;
  membershipId: Id<'memberships'> | null;
  isJoined: boolean;
  currentStamps: number;
  canRedeem: boolean;
  lastStampAt: number | null;
};

async function resolveBusinessFromJoinInput(
  ctx: any,
  parsed: ReturnType<typeof parseJoinInput>
) {
  if (parsed.mode === 'externalId') {
    return await ctx.db
      .query('businesses')
      .withIndex('by_externalId', (q: any) => q.eq('externalId', parsed.bizId))
      .first();
  }

  if (parsed.mode === 'publicId') {
    const byPublicId = await ctx.db
      .query('businesses')
      .withIndex('by_businessPublicId', (q: any) =>
        q.eq('businessPublicId', parsed.bizId)
      )
      .first();
    if (byPublicId) {
      return byPublicId;
    }
    return await ctx.db
      .query('businesses')
      .withIndex('by_externalId', (q: any) => q.eq('externalId', parsed.bizId))
      .first();
  }

  return await ctx.db
    .query('businesses')
    .withIndex('by_joinCode', (q: any) => q.eq('joinCode', parsed.bizId))
    .first();
}

function resolveProgramLifecycle(
  program: any
): 'draft' | 'active' | 'archived' {
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

function isLifecycleJoinable(lifecycle: 'draft' | 'active' | 'archived') {
  return lifecycle === 'active';
}

function isLifecycleOperational(lifecycle: 'draft' | 'active' | 'archived') {
  return lifecycle === 'active' || lifecycle === 'archived';
}

async function listActiveProgramsForBusiness(
  ctx: any,
  businessId: Id<'businesses'>
) {
  const allPrograms = await ctx.db
    .query('loyaltyPrograms')
    .withIndex('by_businessId', (q: any) => q.eq('businessId', businessId))
    .filter((q: any) => q.eq(q.field('isActive'), true))
    .collect();

  const programs = allPrograms.filter((program: any) =>
    isLifecycleJoinable(resolveProgramLifecycle(program))
  );

  programs.sort((left: any, right: any) =>
    String(left.title ?? '').localeCompare(String(right.title ?? ''), 'he')
  );

  return programs;
}

function buildProgramSelectionRows(
  programs: any[],
  activeMembershipsByProgramId: Map<string, any>
): CustomerProgramSelection[] {
  return programs.map((program: any) => {
    const membership =
      activeMembershipsByProgramId.get(String(program._id)) ?? null;
    const currentStamps = Number(membership?.currentStamps ?? 0);
    const maxStamps = Number(program.maxStamps ?? 0);
    return {
      programId: program._id,
      title: program.title,
      rewardName: program.rewardName,
      maxStamps,
      stampIcon: program.stampIcon,
      cardThemeId: program.cardThemeId ?? null,
      membershipId: membership?._id ?? null,
      isJoined: membership !== null,
      currentStamps,
      canRedeem: currentStamps >= maxStamps,
      lastStampAt:
        membership?.lastStampAt ??
        membership?.updatedAt ??
        membership?.createdAt ??
        null,
    };
  });
}

export const byCustomer = query({
  args: {},
  handler: async (ctx) => {
    const user = await getCurrentUserOrNull(ctx);
    if (!user) {
      return [];
    }

    const memberships = await ctx.db
      .query('memberships')
      .withIndex('by_userId', (q: any) => q.eq('userId', user._id))
      .filter((q: any) => q.eq(q.field('isActive'), true))
      .collect();

    const resolved = await Promise.all(
      memberships.map(async (membership) => {
        const [business, program] = await Promise.all([
          ctx.db.get(membership.businessId),
          ctx.db.get(membership.programId),
        ]);

        if (!business || business.isActive !== true) {
          return null;
        }
        if (
          !program ||
          program.isActive !== true ||
          !isLifecycleOperational(resolveProgramLifecycle(program)) ||
          program.businessId !== business._id
        ) {
          return null;
        }

        const lastStampAt =
          membership.lastStampAt ??
          membership.updatedAt ??
          membership.createdAt ??
          Date.now();

        return {
          membershipId: membership._id,
          userId: membership.userId,
          businessId: business._id,
          programId: program._id,
          businessName: business.name,
          businessLogoUrl: business.logoUrl ?? null,
          programTitle: program.title,
          rewardName: program.rewardName,
          stampIcon: program.stampIcon,
          cardThemeId: program.cardThemeId ?? null,
          currentStamps: membership.currentStamps,
          maxStamps: program.maxStamps,
          lastStampAt,
          canRedeem: membership.currentStamps >= program.maxStamps,
        };
      })
    );

    const customers = resolved.filter(
      (item): item is CustomerMembershipRecord => item !== null
    );

    customers.sort((a, b) => b.lastStampAt - a.lastStampAt);

    return customers;
  },
});

export const getMembershipActivity = query({
  args: {
    membershipId: v.id('memberships'),
    limit: v.optional(v.number()),
  },
  handler: async (ctx, { membershipId, limit }) => {
    const user = await requireCurrentUser(ctx);
    const membership = await ctx.db.get(membershipId);
    if (!membership || String(membership.userId) !== String(user._id)) {
      throw new Error('MEMBERSHIP_NOT_FOUND');
    }

    const [business, program] = await Promise.all([
      ctx.db.get(membership.businessId),
      ctx.db.get(membership.programId),
    ]);
    if (
      !business ||
      business.isActive !== true ||
      !program ||
      program.isActive !== true
    ) {
      return [];
    }

    const safeLimit = Math.max(1, Math.min(limit ?? 20, 50));
    const events = await ctx.db
      .query('events')
      .withIndex('by_membershipId_createdAt', (q: any) =>
        q.eq('membershipId', membershipId)
      )
      .collect();

    const visibleEvents = events
      .filter((event: any) =>
        [
          'STAMP_ADDED',
          'REWARD_REDEEMED',
          'STAMP_REVERTED',
          'REWARD_REDEEM_REVERTED',
        ].includes(event.type)
      )
      .sort((left: any, right: any) => right.createdAt - left.createdAt)
      .slice(0, safeLimit);

    return visibleEvents.map((event: any) => {
      const actionType =
        event.type === 'STAMP_ADDED'
          ? 'stamp_added'
          : event.type === 'REWARD_REDEEMED'
            ? 'reward_redeemed'
            : event.type === 'STAMP_REVERTED'
              ? 'stamp_reverted'
              : 'reward_redeem_reverted';

      return {
        id: event._id,
        eventType: event.type,
        actionType,
        businessName: business.name,
        programName: program.title,
        reasonCode: event.reasonCode ?? null,
        reasonNote: event.reasonNote ?? null,
        createdAt: event.createdAt,
      };
    });
  },
});

export const byCustomerBusinesses = query({
  args: {},
  handler: async (ctx) => {
    const user = await getCurrentUserOrNull(ctx);
    if (!user) {
      return [];
    }

    const memberships = await ctx.db
      .query('memberships')
      .withIndex('by_userId', (q: any) => q.eq('userId', user._id))
      .filter((q: any) => q.eq(q.field('isActive'), true))
      .collect();

    const businessSummaries = new Map<
      string,
      {
        businessId: Id<'businesses'>;
        businessName: string;
        businessLogoUrl: string | null;
        joinedProgramCount: number;
        redeemableCount: number;
        lastActivityAt: number;
        previewProgramTitle: string | null;
        previewRewardName: string | null;
        previewCardThemeId: string | null;
        previewMaxStamps: number | null;
        previewCurrentStamps: number | null;
      }
    >();

    for (const membership of memberships) {
      const [business, program] = await Promise.all([
        ctx.db.get(membership.businessId),
        ctx.db.get(membership.programId),
      ]);
      if (!business || business.isActive !== true) {
        continue;
      }
      if (
        !program ||
        program.isActive !== true ||
        !isLifecycleOperational(resolveProgramLifecycle(program)) ||
        program.businessId !== business._id
      ) {
        continue;
      }

      const key = String(business._id);
      const lastActivityAt =
        membership.lastStampAt ??
        membership.updatedAt ??
        membership.createdAt ??
        Date.now();
      const redeemable =
        Number(membership.currentStamps ?? 0) >= Number(program.maxStamps ?? 0);
      const existing = businessSummaries.get(key);
      if (!existing) {
        businessSummaries.set(key, {
          businessId: business._id,
          businessName: business.name,
          businessLogoUrl: business.logoUrl ?? null,
          joinedProgramCount: 1,
          redeemableCount: redeemable ? 1 : 0,
          lastActivityAt,
          previewProgramTitle: program.title,
          previewRewardName: program.rewardName,
          previewCardThemeId: program.cardThemeId ?? null,
          previewMaxStamps: Number(program.maxStamps ?? 0),
          previewCurrentStamps: Number(membership.currentStamps ?? 0),
        });
        continue;
      }

      existing.joinedProgramCount += 1;
      if (redeemable) {
        existing.redeemableCount += 1;
      }
      if (lastActivityAt > existing.lastActivityAt) {
        existing.lastActivityAt = lastActivityAt;
        existing.previewProgramTitle = program.title;
        existing.previewRewardName = program.rewardName;
        existing.previewCardThemeId = program.cardThemeId ?? null;
        existing.previewMaxStamps = Number(program.maxStamps ?? 0);
        existing.previewCurrentStamps = Number(membership.currentStamps ?? 0);
      }
    }

    return Array.from(businessSummaries.values()).sort((left, right) => {
      if (right.lastActivityAt !== left.lastActivityAt) {
        return right.lastActivityAt - left.lastActivityAt;
      }
      return left.businessName.localeCompare(right.businessName, 'he');
    });
  },
});

export const getBusinessRewardEligibilitySummary = query({
  args: {
    businessId: v.optional(v.id('businesses')),
  },
  handler: async (ctx, { businessId }) => {
    if (!businessId) {
      return {
        redeemableCustomers: 0,
        redeemableCards: 0,
      };
    }

    await requireActorIsStaffForBusiness(ctx, businessId);

    const [memberships, programs] = await Promise.all([
      ctx.db
        .query('memberships')
        .withIndex('by_businessId', (q: any) => q.eq('businessId', businessId))
        .filter((q: any) => q.eq(q.field('isActive'), true))
        .collect(),
      ctx.db
        .query('loyaltyPrograms')
        .withIndex('by_businessId', (q: any) => q.eq('businessId', businessId))
        .filter((q: any) => q.eq(q.field('isActive'), true))
        .collect(),
    ]);

    const programById = new Map(
      programs
        .filter((program: any) =>
          isLifecycleOperational(resolveProgramLifecycle(program))
        )
        .map((program: any) => [String(program._id), program])
    );

    let redeemableCards = 0;
    const redeemableCustomers = new Set<string>();

    for (const membership of memberships) {
      const program = programById.get(String(membership.programId));
      if (!program) {
        continue;
      }

      const maxStamps = Number(program.maxStamps ?? 0);
      if (maxStamps <= 0) {
        continue;
      }

      const currentStamps = Number(membership.currentStamps ?? 0);
      if (currentStamps < maxStamps) {
        continue;
      }

      redeemableCards += 1;
      redeemableCustomers.add(String(membership.userId));
    }

    return {
      redeemableCustomers: redeemableCustomers.size,
      redeemableCards,
    };
  },
});

export const getCustomerBusiness = query({
  args: {
    businessId: v.id('businesses'),
  },
  handler: async (ctx, { businessId }) => {
    const user = await requireCurrentUser(ctx);

    const business = await ctx.db.get(businessId);
    if (!business || business.isActive !== true) {
      throw new Error('BUSINESS_NOT_FOUND');
    }

    const [allPrograms, memberships] = await Promise.all([
      ctx.db
        .query('loyaltyPrograms')
        .withIndex('by_businessId', (q: any) => q.eq('businessId', businessId))
        .filter((q: any) => q.eq(q.field('isActive'), true))
        .collect(),
      ctx.db
        .query('memberships')
        .withIndex('by_userId_businessId', (q: any) =>
          q.eq('userId', user._id).eq('businessId', businessId)
        )
        .filter((q: any) => q.eq(q.field('isActive'), true))
        .collect(),
    ]);

    const programById = new Map(
      allPrograms.map((program: any) => [String(program._id), program])
    );

    const joinedPrograms = memberships
      .map((membership: any) => {
        const program = programById.get(String(membership.programId));
        if (
          !program ||
          !isLifecycleOperational(resolveProgramLifecycle(program))
        ) {
          return null;
        }

        const maxStamps = Number(program.maxStamps ?? 0);
        const currentStamps = Number(membership.currentStamps ?? 0);
        return {
          programId: program._id,
          title: program.title,
          rewardName: program.rewardName,
          maxStamps,
          stampIcon: program.stampIcon,
          cardThemeId: program.cardThemeId ?? null,
          membershipId: membership._id,
          isJoined: true,
          currentStamps,
          canRedeem: currentStamps >= maxStamps,
          lastStampAt:
            membership.lastStampAt ??
            membership.updatedAt ??
            membership.createdAt ??
            null,
        };
      })
      .filter((row): row is NonNullable<typeof row> => row !== null)
      .sort((left, right) => {
        const leftAt = left.lastStampAt ?? 0;
        const rightAt = right.lastStampAt ?? 0;
        return rightAt - leftAt;
      });

    const joinedProgramIdSet = new Set(
      memberships.map((membership) => String(membership.programId))
    );
    const availablePrograms = allPrograms
      .filter((program: any) =>
        isLifecycleJoinable(resolveProgramLifecycle(program))
      )
      .filter((program: any) => !joinedProgramIdSet.has(String(program._id)))
      .map((program: any) => ({
        programId: program._id,
        title: program.title,
        rewardName: program.rewardName,
        maxStamps: Number(program.maxStamps ?? 0),
        stampIcon: program.stampIcon,
        cardThemeId: program.cardThemeId ?? null,
        membershipId: null,
        isJoined: false,
        currentStamps: 0,
        canRedeem: false,
        lastStampAt: null,
      }))
      .sort((left, right) =>
        String(left.title ?? '').localeCompare(String(right.title ?? ''), 'he')
      );

    return {
      business: {
        businessId: business._id,
        name: business.name,
        logoUrl: business.logoUrl ?? null,
        formattedAddress: business.formattedAddress ?? null,
        serviceTypes: business.serviceTypes ?? [],
        serviceTags: business.serviceTags ?? [],
      },
      joinedPrograms,
      availablePrograms,
    };
  },
});

/**
 * Parse QR data / input into a business lookup key.
 *
 * Supported formats:
 *   a) "businessExternalId:<value>"              (legacy)
 *   b) "https://stampix.app/join?biz=<id>&..."   (deep link URL)
 *   c) raw businessPublicId / externalId string
 *   d) joinCode (short uppercase alphanumeric)
 *
 * Returns { bizId, source, campaign, mode } where mode indicates which
 * index to query.
 */
function parseJoinInput(raw: string): {
  bizId: string;
  source: string | undefined;
  campaign: string | undefined;
  mode: 'externalId' | 'publicId' | 'joinCode';
} {
  // (a) Legacy prefix
  const legacyPrefix = 'businessExternalId:';
  if (raw.startsWith(legacyPrefix)) {
    return {
      bizId: raw.slice(legacyPrefix.length).trim(),
      source: undefined,
      campaign: undefined,
      mode: 'externalId',
    };
  }

  // (b) URL format
  if (raw.startsWith('http://') || raw.startsWith('https://')) {
    try {
      const url = new URL(raw);
      const biz = url.searchParams.get('biz') ?? '';
      const src = url.searchParams.get('src') || undefined;
      const camp = url.searchParams.get('camp') || undefined;
      if (biz) {
        return { bizId: biz, source: src, campaign: camp, mode: 'publicId' };
      }
    } catch {
      // not a valid URL -- fall through
    }
  }

  // (d) joinCode pattern: 4-10 uppercase alphanumeric without I/O/1/0
  const joinCodePattern = /^[23456789ABCDEFGHJKLMNPQRSTUVWXYZ]{4,10}$/;
  if (joinCodePattern.test(raw.toUpperCase())) {
    return {
      bizId: raw.toUpperCase(),
      source: undefined,
      campaign: undefined,
      mode: 'joinCode',
    };
  }

  // (c) raw businessPublicId or externalId -- try publicId first
  return {
    bizId: raw,
    source: undefined,
    campaign: undefined,
    mode: 'publicId',
  };
}

export const resolveJoinBusiness = query({
  args: {
    qrData: v.string(),
    source: v.optional(v.string()),
    campaign: v.optional(v.string()),
  },
  handler: async (
    ctx,
    { qrData, source: argSource, campaign: argCampaign }
  ) => {
    const user = await requireCurrentUser(ctx);
    const raw = (qrData ?? '').trim();
    if (!raw) {
      throw new Error('INVALID_QR');
    }

    const parsed = parseJoinInput(raw);
    if (!parsed.bizId) {
      throw new Error('INVALID_QR');
    }

    const resolvedSource = parsed.source ?? argSource;
    const resolvedCampaign = parsed.campaign ?? argCampaign;
    const business = await resolveBusinessFromJoinInput(ctx, parsed);

    if (!business || business.isActive !== true) {
      throw new Error('BUSINESS_NOT_FOUND');
    }

    const [programs, memberships] = await Promise.all([
      listActiveProgramsForBusiness(ctx, business._id),
      ctx.db
        .query('memberships')
        .withIndex('by_userId_businessId', (q: any) =>
          q.eq('userId', user._id).eq('businessId', business._id)
        )
        .filter((q: any) => q.eq(q.field('isActive'), true))
        .collect(),
    ]);

    if (programs.length === 0) {
      throw new Error('PROGRAM_NOT_FOUND');
    }

    const activeMembershipsByProgramId = new Map(
      memberships.map((membership) => [
        String(membership.programId),
        membership,
      ])
    );

    return {
      business: {
        businessId: business._id,
        name: business.name,
        logoUrl: business.logoUrl ?? null,
      },
      source: resolvedSource ?? null,
      campaign: resolvedCampaign ?? null,
      programs: buildProgramSelectionRows(
        programs,
        activeMembershipsByProgramId
      ),
    };
  },
});

export const joinSelectedPrograms = mutation({
  args: {
    businessId: v.id('businesses'),
    programIds: v.array(v.id('loyaltyPrograms')),
    source: v.optional(v.string()),
    campaign: v.optional(v.string()),
  },
  handler: async (ctx, { businessId, programIds, source, campaign }) => {
    const user = await requireCurrentUser(ctx);
    const now = Date.now();

    const uniqueProgramIds: Id<'loyaltyPrograms'>[] = [];
    const seen = new Set<string>();
    for (const programId of programIds) {
      const key = String(programId);
      if (!seen.has(key)) {
        seen.add(key);
        uniqueProgramIds.push(programId);
      }
    }

    if (uniqueProgramIds.length === 0) {
      throw new Error('PROGRAM_SELECTION_REQUIRED');
    }

    const business = await ctx.db.get(businessId);
    if (!business || business.isActive !== true) {
      throw new Error('BUSINESS_NOT_FOUND');
    }

    const [selectedPrograms, allBusinessMemberships] = await Promise.all([
      Promise.all(uniqueProgramIds.map((programId) => ctx.db.get(programId))),
      ctx.db
        .query('memberships')
        .withIndex('by_userId_businessId', (q: any) =>
          q.eq('userId', user._id).eq('businessId', businessId)
        )
        .collect(),
    ]);

    const invalidProgram = selectedPrograms.find(
      (program) =>
        !program ||
        program.isActive !== true ||
        !isLifecycleJoinable(resolveProgramLifecycle(program)) ||
        String(program.businessId) !== String(businessId)
    );
    if (invalidProgram) {
      throw new Error('PROGRAM_NOT_AVAILABLE');
    }

    const membershipByProgramId = new Map<string, any>();
    for (const membership of allBusinessMemberships) {
      const key = String(membership.programId);
      const existing = membershipByProgramId.get(key);
      if (!existing) {
        membershipByProgramId.set(key, membership);
        continue;
      }
      if (existing.isActive !== true && membership.isActive === true) {
        membershipByProgramId.set(key, membership);
      }
    }
    const hasActiveBusinessMembership = allBusinessMemberships.some(
      (membership) => membership.isActive === true
    );
    const willActivateBusinessMembership = uniqueProgramIds.some(
      (programId) => {
        const existing = membershipByProgramId.get(String(programId));
        return !existing || existing.isActive !== true;
      }
    );

    if (!hasActiveBusinessMembership && willActivateBusinessMembership) {
      const activeCustomersCount = await countActiveCustomersForBusiness(
        ctx,
        businessId
      );
      await assertEntitlement(ctx, businessId, {
        limitKey: 'maxCustomers',
        currentValue: activeCustomersCount,
      });
    }

    const joinedPrograms: Array<{
      programId: Id<'loyaltyPrograms'>;
      membershipId: Id<'memberships'>;
      status: 'created' | 'existing' | 'reactivated';
    }> = [];

    for (const programId of uniqueProgramIds) {
      const existing = membershipByProgramId.get(String(programId));
      if (existing && existing.isActive === true) {
        joinedPrograms.push({
          programId,
          membershipId: existing._id,
          status: 'existing',
        });
        continue;
      }

      if (existing && existing.isActive !== true) {
        await ctx.db.patch(existing._id, {
          isActive: true,
          updatedAt: now,
          joinSource: source ?? existing.joinSource,
          joinCampaign: campaign ?? existing.joinCampaign,
        });
        joinedPrograms.push({
          programId,
          membershipId: existing._id,
          status: 'reactivated',
        });
        continue;
      }

      const membershipId = await ctx.db.insert('memberships', {
        userId: user._id,
        businessId,
        programId,
        currentStamps: 0,
        lastStampAt: undefined,
        joinSource: source,
        joinCampaign: campaign,
        isActive: true,
        createdAt: now,
        updatedAt: now,
      });
      joinedPrograms.push({
        programId,
        membershipId,
        status: 'created',
      });
    }

    return {
      ok: true,
      businessId,
      joinedCount: joinedPrograms.length,
      joinedPrograms,
    };
  },
});

// Join a business (create membership) by scanning the BUSINESS QR (customer flow).
// Supports: legacy externalId prefix, deep link URL, publicId, and joinCode.
export const joinByBusinessQr = mutation({
  args: {
    qrData: v.string(),
    source: v.optional(v.string()),
    campaign: v.optional(v.string()),
  },
  handler: async (
    ctx,
    { qrData, source: argSource, campaign: argCampaign }
  ) => {
    const user = await requireCurrentUser(ctx);
    const now = Date.now();

    const raw = (qrData ?? '').trim();
    if (!raw) throw new Error('INVALID_QR');

    const parsed = parseJoinInput(raw);
    if (!parsed.bizId) throw new Error('INVALID_QR');

    // Merge source/campaign: URL params take priority, then explicit args
    const source = parsed.source ?? argSource;
    const campaign = parsed.campaign ?? argCampaign;

    const business = await resolveBusinessFromJoinInput(ctx, parsed);

    if (!business || business.isActive !== true)
      throw new Error('BUSINESS_NOT_FOUND');

    const programs = await ctx.db
      .query('loyaltyPrograms')
      .withIndex('by_businessId', (q: any) => q.eq('businessId', business._id))
      .filter((q: any) => q.eq(q.field('isActive'), true))
      .collect();

    const program =
      programs.find((item: any) =>
        isLifecycleJoinable(resolveProgramLifecycle(item))
      ) ?? null;

    if (!program) throw new Error('PROGRAM_NOT_FOUND');

    const existingBusinessMembership = await ctx.db
      .query('memberships')
      .withIndex('by_userId_businessId', (q: any) =>
        q.eq('userId', user._id).eq('businessId', business._id)
      )
      .filter((q: any) => q.eq(q.field('isActive'), true))
      .first();

    const existing = await ctx.db
      .query('memberships')
      .withIndex('by_userId_programId', (q: any) =>
        q.eq('userId', user._id).eq('programId', program._id)
      )
      .first();

    if (existing) {
      if (!existing.isActive) {
        await ctx.db.patch(existing._id, { isActive: true, updatedAt: now });
      }
      return {
        ok: true,
        membershipId: existing._id,
        businessId: business._id,
        programId: program._id,
        alreadyExisted: true,
      };
    }

    if (!existingBusinessMembership) {
      const activeCustomersCount = await countActiveCustomersForBusiness(
        ctx,
        business._id
      );
      await assertEntitlement(ctx, business._id, {
        limitKey: 'maxCustomers',
        currentValue: activeCustomersCount,
      });
    }

    const membershipId = await ctx.db.insert('memberships', {
      userId: user._id,
      businessId: business._id,
      programId: program._id,
      currentStamps: 0,
      lastStampAt: undefined,
      joinSource: source,
      joinCampaign: campaign,
      isActive: true,
      createdAt: now,
      updatedAt: now,
    });

    return {
      ok: true,
      membershipId,
      businessId: business._id,
      programId: program._id,
      alreadyExisted: false,
    };
  },
});
