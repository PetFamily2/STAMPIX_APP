import { v } from 'convex/values';
import type { Id } from './_generated/dataModel';
import { mutation, query } from './_generated/server';
import {
  assertEntitlement,
  countActiveCustomersForBusiness,
} from './entitlements';
import { getCurrentUserOrNull, requireCurrentUser } from './guards';

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

async function listActiveProgramsForBusiness(
  ctx: any,
  businessId: Id<'businesses'>
) {
  const programs = await ctx.db
    .query('loyaltyPrograms')
    .withIndex('by_businessId', (q: any) => q.eq('businessId', businessId))
    .filter((q: any) =>
      q.and(q.eq(q.field('isActive'), true), q.neq(q.field('isArchived'), true))
    )
    .collect();

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
        program.isArchived === true ||
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
        });
        continue;
      }

      existing.joinedProgramCount += 1;
      if (redeemable) {
        existing.redeemableCount += 1;
      }
      if (lastActivityAt > existing.lastActivityAt) {
        existing.lastActivityAt = lastActivityAt;
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

    const [programs, memberships] = await Promise.all([
      listActiveProgramsForBusiness(ctx, businessId),
      ctx.db
        .query('memberships')
        .withIndex('by_userId_businessId', (q: any) =>
          q.eq('userId', user._id).eq('businessId', businessId)
        )
        .filter((q: any) => q.eq(q.field('isActive'), true))
        .collect(),
    ]);

    const activeMembershipsByProgramId = new Map(
      memberships.map((membership) => [
        String(membership.programId),
        membership,
      ])
    );
    const rows = buildProgramSelectionRows(
      programs,
      activeMembershipsByProgramId
    );

    const joinedPrograms = rows
      .filter((row) => row.isJoined)
      .sort((left, right) => {
        const leftAt = left.lastStampAt ?? 0;
        const rightAt = right.lastStampAt ?? 0;
        return rightAt - leftAt;
      });
    const availablePrograms = rows.filter((row) => !row.isJoined);

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
        program.isArchived === true ||
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

    const program = await ctx.db
      .query('loyaltyPrograms')
      .withIndex('by_businessId', (q: any) => q.eq('businessId', business._id))
      .filter((q: any) =>
        q.and(
          q.eq(q.field('isActive'), true),
          q.neq(q.field('isArchived'), true)
        )
      )
      .first();

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
