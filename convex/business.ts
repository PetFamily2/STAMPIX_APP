import { v } from 'convex/values';
import type { Id } from './_generated/dataModel';
import { mutation, query } from './_generated/server';
import { assertEntitlement, getCurrentMonthKey } from './entitlements';
import {
  requireActorIsBusinessOwner,
  requireActorIsBusinessOwnerOrManager,
  requireActorIsStaffForBusiness,
  requireCurrentUser,
} from './guards';
import {
  generateInviteCode,
  generateJoinCode,
  generatePublicId,
} from './lib/ids';

type BusinessAddressInput = {
  formattedAddress: string;
  placeId: string;
  lat: number;
  lng: number;
  city: string;
  street: string;
  streetNumber: string;
};

export interface BusinessCreationInput {
  ownerUserId: Id<'users'>;
  externalId: string;
  name: string;
  logoUrl?: string;
  colors?: unknown;
  address: BusinessAddressInput;
  now?: number;
}

export type BusinessCustomerSegmentationConfig = {
  riskDaysWithoutVisit: number;
  frequentVisitsLast30Days: number;
  dropPercentThreshold: number;
  updatedAt: number;
};

export const DEFAULT_CUSTOMER_SEGMENTATION_CONFIG = {
  riskDaysWithoutVisit: 10,
  frequentVisitsLast30Days: 6,
  dropPercentThreshold: 40,
} as const;

export function normalizeCustomerSegmentationConfig(
  config: unknown,
  now: number
): BusinessCustomerSegmentationConfig {
  const source =
    config && typeof config === 'object'
      ? (config as Record<string, unknown>)
      : {};

  const riskDaysWithoutVisit = Number.isFinite(source.riskDaysWithoutVisit)
    ? Math.max(1, Math.min(90, Math.floor(Number(source.riskDaysWithoutVisit))))
    : DEFAULT_CUSTOMER_SEGMENTATION_CONFIG.riskDaysWithoutVisit;

  const frequentVisitsLast30Days = Number.isFinite(
    source.frequentVisitsLast30Days
  )
    ? Math.max(
        1,
        Math.min(60, Math.floor(Number(source.frequentVisitsLast30Days)))
      )
    : DEFAULT_CUSTOMER_SEGMENTATION_CONFIG.frequentVisitsLast30Days;

  const dropPercentThreshold = Number.isFinite(source.dropPercentThreshold)
    ? Math.max(1, Math.min(95, Math.floor(Number(source.dropPercentThreshold))))
    : DEFAULT_CUSTOMER_SEGMENTATION_CONFIG.dropPercentThreshold;

  const updatedAt = Number.isFinite(source.updatedAt)
    ? Math.max(0, Math.floor(Number(source.updatedAt)))
    : now;

  return {
    riskDaysWithoutVisit,
    frequentVisitsLast30Days,
    dropPercentThreshold,
    updatedAt,
  };
}

function normalizeBusinessAddressInput(input: BusinessAddressInput) {
  const formattedAddress = input.formattedAddress.trim();
  const placeId = input.placeId.trim();
  const city = input.city.trim();
  const street = input.street.trim();
  const streetNumber = input.streetNumber.trim();

  if (!formattedAddress) {
    throw new Error('FORMATTED_ADDRESS_REQUIRED');
  }
  if (!placeId) {
    throw new Error('PLACE_ID_REQUIRED');
  }
  if (!Number.isFinite(input.lat) || !Number.isFinite(input.lng)) {
    throw new Error('LOCATION_REQUIRED');
  }

  return {
    formattedAddress,
    placeId,
    city,
    street,
    streetNumber,
    location: {
      lat: input.lat,
      lng: input.lng,
    },
  };
}

function toRadians(value: number) {
  return (value * Math.PI) / 180;
}

function haversineDistanceKm(
  startLat: number,
  startLng: number,
  endLat: number,
  endLng: number
) {
  const earthRadiusKm = 6371;
  const deltaLat = toRadians(endLat - startLat);
  const deltaLng = toRadians(endLng - startLng);
  const originLat = toRadians(startLat);
  const destinationLat = toRadians(endLat);

  const a =
    Math.sin(deltaLat / 2) * Math.sin(deltaLat / 2) +
    Math.cos(originLat) *
      Math.cos(destinationLat) *
      Math.sin(deltaLng / 2) *
      Math.sin(deltaLng / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));

  return earthRadiusKm * c;
}

async function ensureBusinessStaffRecord(
  ctx: any,
  businessId: Id<'businesses'>,
  userId: Id<'users'>,
  staffRole: 'owner' | 'manager' | 'staff',
  now?: number
) {
  const timestamp = now ?? Date.now();
  const existingStaff = await ctx.db
    .query('businessStaff')
    .withIndex('by_businessId_userId', (q: any) =>
      q.eq('businessId', businessId).eq('userId', userId)
    )
    .first();

  if (existingStaff) {
    const patchData: Record<string, unknown> = {
      isActive: true,
      updatedAt: timestamp,
    };
    if (existingStaff.staffRole !== staffRole) {
      patchData.staffRole = staffRole;
    }
    await ctx.db.patch(existingStaff._id, patchData);
    return existingStaff._id;
  }

  const staffId = await ctx.db.insert('businessStaff', {
    businessId,
    userId,
    staffRole,
    isActive: true,
    createdAt: timestamp,
    updatedAt: timestamp,
  });

  return staffId;
}

export async function ensureBusinessOwnerStaff(
  ctx: any,
  businessId: Id<'businesses'>,
  ownerUserId: Id<'users'>,
  now?: number
) {
  return ensureBusinessStaffRecord(ctx, businessId, ownerUserId, 'owner', now);
}

/**
 * Generate a unique businessPublicId with retry on collision.
 */
async function generateUniquePublicId(
  ctx: any,
  maxRetries = 5
): Promise<string> {
  for (let i = 0; i < maxRetries; i++) {
    const candidate = generatePublicId(12);
    const existing = await ctx.db
      .query('businesses')
      .withIndex('by_businessPublicId', (q: any) =>
        q.eq('businessPublicId', candidate)
      )
      .first();
    if (!existing) return candidate;
  }
  throw new Error('FAILED_TO_GENERATE_PUBLIC_ID');
}

/**
 * Generate a unique joinCode with retry on collision.
 */
async function generateUniqueJoinCode(
  ctx: any,
  maxRetries = 5
): Promise<string> {
  for (let i = 0; i < maxRetries; i++) {
    const candidate = generateJoinCode(8);
    const existing = await ctx.db
      .query('businesses')
      .withIndex('by_joinCode', (q: any) => q.eq('joinCode', candidate))
      .first();
    if (!existing) return candidate;
  }
  throw new Error('FAILED_TO_GENERATE_JOIN_CODE');
}

export async function createBusinessForOwner(
  ctx: any,
  input: BusinessCreationInput
) {
  const now = input.now ?? Date.now();
  const normalizedAddress = normalizeBusinessAddressInput(input.address);

  const businessPublicId = await generateUniquePublicId(ctx);
  const joinCode = await generateUniqueJoinCode(ctx);

  const businessId = await ctx.db.insert('businesses', {
    ownerUserId: input.ownerUserId,
    externalId: input.externalId,
    businessPublicId,
    joinCode,
    name: input.name,
    logoUrl: input.logoUrl,
    colors: input.colors,
    subscriptionPlan: 'starter',
    subscriptionStatus: 'active',
    subscriptionStartAt: now,
    subscriptionEndAt: null,
    billingPeriod: null,
    aiCampaignsUsedThisMonth: 0,
    aiCampaignsMonthKey: getCurrentMonthKey(now),
    customerSegmentationConfig: {
      ...DEFAULT_CUSTOMER_SEGMENTATION_CONFIG,
      updatedAt: now,
    },
    location: normalizedAddress.location,
    placeId: normalizedAddress.placeId,
    formattedAddress: normalizedAddress.formattedAddress,
    city: normalizedAddress.city,
    street: normalizedAddress.street,
    streetNumber: normalizedAddress.streetNumber,
    isActive: true,
    createdAt: now,
    updatedAt: now,
  });

  await ensureBusinessOwnerStaff(ctx, businessId, input.ownerUserId, now);
  return { businessId, businessPublicId, joinCode };
}

export const createBusiness = mutation({
  args: {
    name: v.string(),
    externalId: v.string(),
    logoUrl: v.optional(v.string()),
    colors: v.optional(v.any()),
    formattedAddress: v.string(),
    placeId: v.string(),
    lat: v.number(),
    lng: v.number(),
    city: v.string(),
    street: v.string(),
    streetNumber: v.string(),
  },
  handler: async (
    ctx,
    {
      name,
      externalId,
      logoUrl,
      colors,
      formattedAddress,
      placeId,
      lat,
      lng,
      city,
      street,
      streetNumber,
    }
  ) => {
    const user = await requireCurrentUser(ctx);
    const normalizedName = name.trim();
    const normalizedExternalId = externalId.trim();
    if (!normalizedName) {
      throw new Error('NAME_REQUIRED');
    }
    if (!normalizedExternalId) {
      throw new Error('EXTERNAL_ID_REQUIRED');
    }

    const existing = await ctx.db
      .query('businesses')
      .withIndex('by_externalId', (q: any) =>
        q.eq('externalId', normalizedExternalId)
      )
      .first();

    if (existing) {
      throw new Error('EXTERNAL_ID_TAKEN');
    }

    const { businessId } = await createBusinessForOwner(ctx, {
      ownerUserId: user._id,
      externalId: normalizedExternalId,
      name: normalizedName,
      logoUrl,
      colors,
      address: {
        formattedAddress,
        placeId,
        lat,
        lng,
        city,
        street,
        streetNumber,
      },
      now: Date.now(),
    });

    return { businessId };
  },
});

export const updateBusinessAddress = mutation({
  args: {
    businessId: v.id('businesses'),
    formattedAddress: v.string(),
    placeId: v.string(),
    lat: v.number(),
    lng: v.number(),
    city: v.string(),
    street: v.string(),
    streetNumber: v.string(),
  },
  handler: async (
    ctx,
    {
      businessId,
      formattedAddress,
      placeId,
      lat,
      lng,
      city,
      street,
      streetNumber,
    }
  ) => {
    await requireActorIsBusinessOwner(ctx, businessId);
    const normalizedAddress = normalizeBusinessAddressInput({
      formattedAddress,
      placeId,
      lat,
      lng,
      city,
      street,
      streetNumber,
    });

    await ctx.db.patch(businessId, {
      location: normalizedAddress.location,
      placeId: normalizedAddress.placeId,
      formattedAddress: normalizedAddress.formattedAddress,
      city: normalizedAddress.city,
      street: normalizedAddress.street,
      streetNumber: normalizedAddress.streetNumber,
      updatedAt: Date.now(),
    });

    return { businessId };
  },
});

const BUSINESS_NAME_MAX_LENGTH = 80;

function normalizeBusinessName(value: string) {
  const normalized = value.trim().replace(/\s+/g, ' ');
  if (!normalized) {
    throw new Error('BUSINESS_NAME_REQUIRED');
  }
  if (normalized.length > BUSINESS_NAME_MAX_LENGTH) {
    throw new Error('BUSINESS_NAME_TOO_LONG');
  }
  return normalized;
}

export const getBusinessSettings = query({
  args: {
    businessId: v.optional(v.id('businesses')),
  },
  handler: async (ctx, { businessId }) => {
    if (!businessId) {
      return null;
    }

    await requireActorIsStaffForBusiness(ctx, businessId);
    const business = await ctx.db.get(businessId);
    if (!business || business.isActive !== true) {
      throw new Error('BUSINESS_INACTIVE');
    }

    return {
      businessId: business._id,
      name: business.name,
      formattedAddress: business.formattedAddress ?? '',
      city: business.city ?? '',
      street: business.street ?? '',
      streetNumber: business.streetNumber ?? '',
      logoUrl: business.logoUrl ?? null,
      colors: business.colors ?? null,
      updatedAt: business.updatedAt,
    };
  },
});

export const updateBusinessProfile = mutation({
  args: {
    businessId: v.id('businesses'),
    name: v.string(),
  },
  handler: async (ctx, { businessId, name }) => {
    await requireActorIsBusinessOwnerOrManager(ctx, businessId);
    const business = await ctx.db.get(businessId);
    if (!business || business.isActive !== true) {
      throw new Error('BUSINESS_INACTIVE');
    }

    const normalizedName = normalizeBusinessName(name);
    const updatedAt = Date.now();

    await ctx.db.patch(businessId, {
      name: normalizedName,
      updatedAt,
    });

    return {
      businessId,
      name: normalizedName,
      updatedAt,
    };
  },
});

export const getCustomerSegmentationConfig = query({
  args: {
    businessId: v.optional(v.id('businesses')),
  },
  handler: async (ctx, { businessId }) => {
    if (!businessId) {
      return null;
    }

    await requireActorIsStaffForBusiness(ctx, businessId);
    const business = await ctx.db.get(businessId);
    if (!business || business.isActive !== true) {
      throw new Error('BUSINESS_INACTIVE');
    }

    return normalizeCustomerSegmentationConfig(
      business.customerSegmentationConfig,
      Date.now()
    );
  },
});

export const updateCustomerSegmentationConfig = mutation({
  args: {
    businessId: v.id('businesses'),
    riskDaysWithoutVisit: v.number(),
    frequentVisitsLast30Days: v.number(),
    dropPercentThreshold: v.number(),
  },
  handler: async (
    ctx,
    {
      businessId,
      riskDaysWithoutVisit,
      frequentVisitsLast30Days,
      dropPercentThreshold,
    }
  ) => {
    await requireActorIsBusinessOwnerOrManager(ctx, businessId);
    const business = await ctx.db.get(businessId);
    if (!business || business.isActive !== true) {
      throw new Error('BUSINESS_INACTIVE');
    }

    const now = Date.now();
    const nextConfig = normalizeCustomerSegmentationConfig(
      {
        riskDaysWithoutVisit,
        frequentVisitsLast30Days,
        dropPercentThreshold,
        updatedAt: now,
      },
      now
    );

    await ctx.db.patch(businessId, {
      customerSegmentationConfig: nextConfig,
      updatedAt: now,
    });

    return {
      businessId,
      config: nextConfig,
    };
  },
});

export const getBusinessesNearby = query({
  args: {
    userLat: v.number(),
    userLng: v.number(),
    radiusKm: v.number(),
  },
  handler: async (ctx, { userLat, userLng, radiusKm }) => {
    await requireCurrentUser(ctx);

    if (
      !Number.isFinite(userLat) ||
      !Number.isFinite(userLng) ||
      !Number.isFinite(radiusKm)
    ) {
      throw new Error('INVALID_LOCATION_QUERY');
    }

    const normalizedRadiusKm = Math.max(0.1, Math.min(radiusKm, 50));
    const businesses = await ctx.db
      .query('businesses')
      .withIndex('by_isActive', (q: any) => q.eq('isActive', true))
      .collect();

    const nearbyBusinesses = businesses
      .flatMap((business) => {
        const lat = business.location?.lat;
        const lng = business.location?.lng;
        if (
          typeof lat !== 'number' ||
          typeof lng !== 'number' ||
          business.name.trim().length === 0
        ) {
          return [];
        }

        const distanceKm = haversineDistanceKm(userLat, userLng, lat, lng);
        if (distanceKm > normalizedRadiusKm) {
          return [];
        }

        return [
          {
            businessId: business._id,
            name: business.name,
            distanceKm,
            lat,
            lng,
            formattedAddress: business.formattedAddress ?? '',
          },
        ];
      })
      .sort((first, second) => first.distanceKm - second.distanceKm)
      .slice(0, 50);

    return nearbyBusinesses;
  },
});

type BusinessStaffView = {
  staffId: Id<'businessStaff'>;
  userId: Id<'users'>;
  staffRole: 'owner' | 'manager' | 'staff';
  isActive: boolean;
  createdAt: number;
  updatedAt: number | null;
  displayName: string;
  email: string | null;
  role: 'staff' | 'merchant' | 'customer' | 'admin' | null;
};

export const listBusinessStaff = query({
  args: {
    businessId: v.optional(v.id('businesses')),
  },
  handler: async (ctx, { businessId }) => {
    if (!businessId) {
      return [];
    }

    await requireActorIsStaffForBusiness(ctx, businessId);
    await assertEntitlement(ctx, businessId, {
      featureKey: 'canManageTeam',
    });

    const staffRecords = await ctx.db
      .query('businessStaff')
      .withIndex('by_businessId', (q: any) => q.eq('businessId', businessId))
      .filter((q: any) => q.eq(q.field('isActive'), true))
      .collect();

    const populated: Array<BusinessStaffView | null> = await Promise.all(
      staffRecords.map(async (record): Promise<BusinessStaffView | null> => {
        const user = await ctx.db.get(record.userId);
        if (!user || user.isActive !== true) {
          return null;
        }
        const displayName =
          user.fullName ?? user.email ?? user.externalId ?? 'עובד';
        return {
          staffId: record._id,
          userId: record.userId,
          staffRole: record.staffRole,
          isActive: record.isActive,
          createdAt: record.createdAt,
          updatedAt: record.updatedAt ?? null,
          displayName,
          email: user.email ?? null,
          role:
            record.staffRole === 'owner' || record.staffRole === 'manager'
              ? 'merchant'
              : 'staff',
        };
      })
    );

    return populated
      .filter((entry): entry is BusinessStaffView => entry !== null)
      .sort((a, b) => {
        if (a.staffRole === 'owner' && b.staffRole !== 'owner') return -1;
        if (b.staffRole === 'owner' && a.staffRole !== 'owner') return 1;
        return b.createdAt - a.createdAt;
      });
  },
});

/**
 * Generate a unique invite code with retry on collision.
 */
async function generateUniqueInviteCode(
  ctx: any,
  maxRetries = 5
): Promise<string> {
  for (let i = 0; i < maxRetries; i++) {
    const candidate = generateInviteCode(8);
    const existing = await ctx.db
      .query('staffInvites')
      .withIndex('by_inviteCode', (q: any) => q.eq('inviteCode', candidate))
      .first();
    if (!existing) return candidate;
  }
  throw new Error('FAILED_TO_GENERATE_INVITE_CODE');
}

export const inviteBusinessStaff = mutation({
  args: {
    businessId: v.id('businesses'),
    email: v.string(),
  },
  handler: async (ctx, { businessId, email }) => {
    const actor = await requireActorIsBusinessOwner(ctx, businessId);
    await assertEntitlement(ctx, businessId, {
      featureKey: 'canManageTeam',
    });
    const normalizedEmail = email.trim().toLowerCase();
    if (!normalizedEmail) {
      throw new Error('EMAIL_REQUIRED');
    }

    const existing = await ctx.db
      .query('staffInvites')
      .withIndex('by_invitedEmail', (q: any) =>
        q.eq('invitedEmail', normalizedEmail)
      )
      .filter((q: any) =>
        q.and(
          q.eq(q.field('businessId'), businessId),
          q.eq(q.field('status'), 'pending')
        )
      )
      .first();

    if (existing && existing.expiresAt >= Date.now()) {
      return { inviteCode: existing.inviteCode, alreadyPending: true };
    }

    const targetUser = await ctx.db
      .query('users')
      .withIndex('by_email', (q: any) => q.eq('email', normalizedEmail))
      .first();

    if (targetUser && String(targetUser._id) === String(actor._id)) {
      throw new Error('CANNOT_INVITE_SELF');
    }

    if (targetUser && targetUser.isActive) {
      const alreadyStaff = await ctx.db
        .query('businessStaff')
        .withIndex('by_businessId_userId', (q: any) =>
          q.eq('businessId', businessId).eq('userId', targetUser._id)
        )
        .first();
      if (alreadyStaff?.isActive) {
        throw new Error('ALREADY_STAFF');
      }
    }

    const inviteCode = await generateUniqueInviteCode(ctx);
    const now = Date.now();

    await ctx.db.insert('staffInvites', {
      businessId,
      invitedEmail: normalizedEmail,
      invitedUserId: targetUser?._id,
      invitedByUserId: actor._id,
      inviteCode,
      status: 'pending',
      expiresAt: now + 7 * 24 * 60 * 60 * 1000,
      createdAt: now,
    });

    return { inviteCode, alreadyPending: false };
  },
});

export const acceptStaffInvite = mutation({
  args: {
    inviteCode: v.string(),
  },
  handler: async (ctx, { inviteCode }) => {
    const user = await requireCurrentUser(ctx);
    const now = Date.now();

    const invite = await ctx.db
      .query('staffInvites')
      .withIndex('by_inviteCode', (q: any) =>
        q.eq('inviteCode', inviteCode.trim())
      )
      .first();

    if (!invite) throw new Error('INVITE_NOT_FOUND');
    if (invite.status !== 'pending') throw new Error('INVITE_NOT_PENDING');
    if (invite.expiresAt < now) {
      await ctx.db.patch(invite._id, { status: 'expired' });
      throw new Error('INVITE_EXPIRED');
    }

    if (
      invite.invitedEmail &&
      user.email?.toLowerCase() !== invite.invitedEmail.toLowerCase()
    ) {
      throw new Error('EMAIL_MISMATCH');
    }
    await assertEntitlement(ctx, invite.businessId, {
      featureKey: 'canManageTeam',
    });

    const staffId = await ensureBusinessStaffRecord(
      ctx,
      invite.businessId,
      user._id,
      'staff',
      now
    );

    await ctx.db.patch(invite._id, {
      status: 'accepted',
      invitedUserId: user._id,
      acceptedAt: now,
    });

    const currentUser = await ctx.db.get(user._id);
    if (
      currentUser &&
      (!currentUser.activeMode || currentUser.activeMode === 'customer')
    ) {
      await ctx.db.patch(user._id, {
        activeMode: 'business',
        updatedAt: now,
      });
    }

    return { staffId, businessId: invite.businessId };
  },
});
