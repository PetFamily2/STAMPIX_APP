import { v } from 'convex/values';
import type { Id } from './_generated/dataModel';
import { mutation, query } from './_generated/server';
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

    // Resolve business
    let business: any = null;

    if (parsed.mode === 'externalId') {
      business = await ctx.db
        .query('businesses')
        .withIndex('by_externalId', (q: any) =>
          q.eq('externalId', parsed.bizId)
        )
        .first();
    } else if (parsed.mode === 'publicId') {
      // Try businessPublicId first
      business = await ctx.db
        .query('businesses')
        .withIndex('by_businessPublicId', (q: any) =>
          q.eq('businessPublicId', parsed.bizId)
        )
        .first();
      // Fallback: try externalId
      if (!business) {
        business = await ctx.db
          .query('businesses')
          .withIndex('by_externalId', (q: any) =>
            q.eq('externalId', parsed.bizId)
          )
          .first();
      }
    } else if (parsed.mode === 'joinCode') {
      business = await ctx.db
        .query('businesses')
        .withIndex('by_joinCode', (q: any) => q.eq('joinCode', parsed.bizId))
        .first();
    }

    if (!business || business.isActive !== true)
      throw new Error('BUSINESS_NOT_FOUND');

    const program = await ctx.db
      .query('loyaltyPrograms')
      .withIndex('by_businessId', (q: any) => q.eq('businessId', business._id))
      .filter((q: any) => q.eq(q.field('isActive'), true))
      .first();

    if (!program) throw new Error('PROGRAM_NOT_FOUND');

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
