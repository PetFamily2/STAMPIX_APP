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

const BUSINESS_NAME_MAX_LENGTH = 80;
const BUSINESS_SHORT_DESCRIPTION_MAX_LENGTH = 220;
const BUSINESS_PHONE_MAX_LENGTH = 24;
const BUSINESS_SERVICE_TYPE_MAX_COUNT = 6;
const BUSINESS_SERVICE_TAG_MAX_COUNT = 8;
const BUSINESS_SERVICE_TAG_MIN_LENGTH = 2;
const BUSINESS_SERVICE_TAG_MAX_LENGTH = 24;

const BUSINESS_SERVICE_TYPE_LITERALS = [
  'food_drink',
  'beauty',
  'health_wellness',
  'fitness',
  'retail',
  'professional_services',
  'education',
  'hospitality',
  'other',
] as const;

type BusinessServiceType = (typeof BUSINESS_SERVICE_TYPE_LITERALS)[number];

const BUSINESS_SERVICE_TYPE_SET = new Set<string>(
  BUSINESS_SERVICE_TYPE_LITERALS
);

const BUSINESS_SERVICE_TYPE_UNION = v.union(
  v.literal('food_drink'),
  v.literal('beauty'),
  v.literal('health_wellness'),
  v.literal('fitness'),
  v.literal('retail'),
  v.literal('professional_services'),
  v.literal('education'),
  v.literal('hospitality'),
  v.literal('other')
);

const BUSINESS_DISCOVERY_SOURCE_LITERALS = [
  'referral',
  'search',
  'social',
  'tiktok',
  'app_store',
  'in_app',
  'other',
] as const;

const BUSINESS_REASON_LITERALS = [
  'repeat',
  'replace_paper',
  'insights',
  'basket',
  'offers',
  'other',
] as const;

const BUSINESS_USAGE_AREA_LITERALS = [
  'nearby',
  'citywide',
  'online',
  'multiple',
] as const;

const BUSINESS_OWNER_AGE_RANGE_LITERALS = [
  '18-24',
  '25-34',
  '35-44',
  '45-54',
  '55+',
  'not_specified',
] as const;

type BusinessDiscoverySource =
  (typeof BUSINESS_DISCOVERY_SOURCE_LITERALS)[number];
type BusinessReason = (typeof BUSINESS_REASON_LITERALS)[number];
type BusinessUsageArea = (typeof BUSINESS_USAGE_AREA_LITERALS)[number];
type BusinessOwnerAgeRange = (typeof BUSINESS_OWNER_AGE_RANGE_LITERALS)[number];

const BUSINESS_DISCOVERY_SOURCE_SET = new Set<string>(
  BUSINESS_DISCOVERY_SOURCE_LITERALS
);
const BUSINESS_REASON_SET = new Set<string>(BUSINESS_REASON_LITERALS);
const BUSINESS_USAGE_AREA_SET = new Set<string>(BUSINESS_USAGE_AREA_LITERALS);
const BUSINESS_OWNER_AGE_RANGE_SET = new Set<string>(
  BUSINESS_OWNER_AGE_RANGE_LITERALS
);

const BUSINESS_PROFILE_COMPLETION_FIELDS = [
  'name',
  'shortDescription',
  'businessPhone',
  'address',
  'serviceTypes',
  'serviceTags',
  'discoverySource',
  'reason',
  'usageAreas',
  'ownerAgeRange',
] as const;

type BusinessProfileCompletionField =
  (typeof BUSINESS_PROFILE_COMPLETION_FIELDS)[number];

type BusinessOnboardingSnapshotView = {
  discoverySource?: BusinessDiscoverySource;
  reason?: BusinessReason;
  usageAreas?: BusinessUsageArea[];
  ownerAgeRange?: BusinessOwnerAgeRange;
  collectedAt?: number;
};

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
    await requireActorIsBusinessOwnerOrManager(ctx, businessId);
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

function normalizeBusinessShortDescription(value: string) {
  const normalized = value.trim().replace(/\s+/g, ' ');
  if (!normalized) {
    return '';
  }
  if (normalized.length > BUSINESS_SHORT_DESCRIPTION_MAX_LENGTH) {
    throw new Error('BUSINESS_SHORT_DESCRIPTION_TOO_LONG');
  }
  return normalized;
}

function normalizeBusinessPhone(value: string) {
  const normalized = value.trim().replace(/\s+/g, ' ');
  if (!normalized) {
    return '';
  }
  if (normalized.length > BUSINESS_PHONE_MAX_LENGTH) {
    throw new Error('BUSINESS_PHONE_TOO_LONG');
  }
  if (!/^[0-9+()\-\s]+$/.test(normalized)) {
    throw new Error('BUSINESS_PHONE_INVALID');
  }
  return normalized;
}

function normalizeServiceTypes(values: BusinessServiceType[]) {
  const unique: BusinessServiceType[] = [];

  for (const value of values) {
    if (!BUSINESS_SERVICE_TYPE_SET.has(value)) {
      throw new Error('BUSINESS_SERVICE_TYPE_INVALID');
    }
    if (!unique.includes(value)) {
      unique.push(value);
    }
  }

  if (unique.length > BUSINESS_SERVICE_TYPE_MAX_COUNT) {
    throw new Error('BUSINESS_SERVICE_TYPES_TOO_MANY');
  }

  return unique;
}

function sanitizeServiceTypes(values: string[] | undefined) {
  const unique: BusinessServiceType[] = [];
  if (!values) {
    return unique;
  }

  for (const value of values) {
    if (!BUSINESS_SERVICE_TYPE_SET.has(value)) {
      continue;
    }
    const typedValue = value as BusinessServiceType;
    if (!unique.includes(typedValue)) {
      unique.push(typedValue);
    }
    if (unique.length >= BUSINESS_SERVICE_TYPE_MAX_COUNT) {
      break;
    }
  }

  return unique;
}

function normalizeServiceTags(values: string[]) {
  const unique: string[] = [];
  for (const value of values) {
    const normalized = value.trim().replace(/\s+/g, ' ');
    if (!normalized) {
      continue;
    }
    if (normalized.length < BUSINESS_SERVICE_TAG_MIN_LENGTH) {
      throw new Error('BUSINESS_SERVICE_TAG_TOO_SHORT');
    }
    if (normalized.length > BUSINESS_SERVICE_TAG_MAX_LENGTH) {
      throw new Error('BUSINESS_SERVICE_TAG_TOO_LONG');
    }
    if (!unique.includes(normalized)) {
      unique.push(normalized);
    }
  }

  if (unique.length > BUSINESS_SERVICE_TAG_MAX_COUNT) {
    throw new Error('BUSINESS_SERVICE_TAGS_TOO_MANY');
  }

  return unique;
}

function sanitizeServiceTags(values: string[] | undefined) {
  const unique: string[] = [];
  if (!values) {
    return unique;
  }

  for (const value of values) {
    const normalized = value.trim().replace(/\s+/g, ' ');
    if (!normalized) {
      continue;
    }
    if (
      normalized.length < BUSINESS_SERVICE_TAG_MIN_LENGTH ||
      normalized.length > BUSINESS_SERVICE_TAG_MAX_LENGTH
    ) {
      continue;
    }
    if (!unique.includes(normalized)) {
      unique.push(normalized);
    }
    if (unique.length >= BUSINESS_SERVICE_TAG_MAX_COUNT) {
      break;
    }
  }

  return unique;
}

function normalizeOptionalText(value: string | undefined) {
  if (typeof value !== 'string') {
    return '';
  }
  return value.trim().replace(/\s+/g, ' ');
}

function sanitizeOnboardingChoice<T extends string>(
  value: string | undefined,
  allowedSet: Set<string>
) {
  const normalized = normalizeOptionalText(value);
  if (!normalized) {
    return undefined;
  }
  if (!allowedSet.has(normalized)) {
    return undefined;
  }
  return normalized as T;
}

function sanitizeOnboardingUsageAreas(
  value: string[] | undefined
): BusinessUsageArea[] {
  const unique: BusinessUsageArea[] = [];
  if (!value) {
    return unique;
  }
  for (const area of value) {
    const normalized = normalizeOptionalText(area);
    if (!normalized) {
      continue;
    }
    if (!BUSINESS_USAGE_AREA_SET.has(normalized)) {
      continue;
    }
    const typedValue = normalized as BusinessUsageArea;
    if (!unique.includes(typedValue)) {
      unique.push(typedValue);
    }
  }
  return unique;
}

function normalizeOnboardingChoiceInput<T extends string>(
  value: string | undefined,
  allowedSet: Set<string>,
  errorCode: string
) {
  if (value === undefined) {
    return undefined;
  }
  const normalized = normalizeOptionalText(value);
  if (!normalized || !allowedSet.has(normalized)) {
    throw new Error(errorCode);
  }
  return normalized as T;
}

function normalizeOnboardingUsageAreasInput(value: string[] | undefined) {
  if (value === undefined) {
    return undefined;
  }
  const unique: BusinessUsageArea[] = [];
  for (const area of value) {
    const normalized = normalizeOptionalText(area);
    if (!normalized || !BUSINESS_USAGE_AREA_SET.has(normalized)) {
      throw new Error('BUSINESS_USAGE_AREA_INVALID');
    }
    const typedValue = normalized as BusinessUsageArea;
    if (!unique.includes(typedValue)) {
      unique.push(typedValue);
    }
  }
  if (unique.length === 0) {
    throw new Error('BUSINESS_USAGE_AREAS_REQUIRED');
  }
  return unique;
}

function sanitizeBusinessOnboardingSnapshot(snapshot: unknown) {
  if (!snapshot || typeof snapshot !== 'object') {
    return null;
  }

  const source = snapshot as Record<string, unknown>;
  const discoverySource = sanitizeOnboardingChoice<BusinessDiscoverySource>(
    typeof source.discoverySource === 'string'
      ? source.discoverySource
      : undefined,
    BUSINESS_DISCOVERY_SOURCE_SET
  );
  const reason = sanitizeOnboardingChoice<BusinessReason>(
    typeof source.reason === 'string' ? source.reason : undefined,
    BUSINESS_REASON_SET
  );
  const usageAreas = sanitizeOnboardingUsageAreas(
    Array.isArray(source.usageAreas)
      ? source.usageAreas.filter(
          (entry): entry is string => typeof entry === 'string'
        )
      : undefined
  );
  const ownerAgeRange = sanitizeOnboardingChoice<BusinessOwnerAgeRange>(
    typeof source.ownerAgeRange === 'string' ? source.ownerAgeRange : undefined,
    BUSINESS_OWNER_AGE_RANGE_SET
  );
  const collectedAt = Number.isFinite(source.collectedAt)
    ? Math.max(0, Math.floor(Number(source.collectedAt)))
    : undefined;

  const normalizedSnapshot: BusinessOnboardingSnapshotView = {};
  if (discoverySource) {
    normalizedSnapshot.discoverySource = discoverySource;
  }
  if (reason) {
    normalizedSnapshot.reason = reason;
  }
  if (usageAreas.length > 0) {
    normalizedSnapshot.usageAreas = usageAreas;
  }
  if (ownerAgeRange) {
    normalizedSnapshot.ownerAgeRange = ownerAgeRange;
  }
  if (collectedAt !== undefined) {
    normalizedSnapshot.collectedAt = collectedAt;
  }

  return Object.keys(normalizedSnapshot).length > 0 ? normalizedSnapshot : null;
}

function hasBusinessAddress(business: {
  formattedAddress?: string;
  placeId?: string;
  location?: { lat?: number; lng?: number } | null;
}) {
  return (
    normalizeOptionalText(business.formattedAddress).length > 0 &&
    normalizeOptionalText(business.placeId).length > 0 &&
    Number.isFinite(business.location?.lat) &&
    Number.isFinite(business.location?.lng)
  );
}

function computeBusinessProfileCompletion(business: {
  name: string;
  shortDescription?: string;
  businessPhone?: string;
  formattedAddress?: string;
  placeId?: string;
  location?: { lat?: number; lng?: number } | null;
  serviceTypes?: string[];
  serviceTags?: string[];
  onboardingSnapshot?: unknown;
}) {
  const missingFields: BusinessProfileCompletionField[] = [];
  if (!normalizeOptionalText(business.name)) {
    missingFields.push('name');
  }
  if (!normalizeOptionalText(business.shortDescription)) {
    missingFields.push('shortDescription');
  }
  if (!normalizeOptionalText(business.businessPhone)) {
    missingFields.push('businessPhone');
  }
  if (!hasBusinessAddress(business)) {
    missingFields.push('address');
  }
  if (sanitizeServiceTypes(business.serviceTypes).length === 0) {
    missingFields.push('serviceTypes');
  }
  if (sanitizeServiceTags(business.serviceTags).length === 0) {
    missingFields.push('serviceTags');
  }

  const snapshot = sanitizeBusinessOnboardingSnapshot(
    business.onboardingSnapshot
  );
  if (!snapshot?.discoverySource) {
    missingFields.push('discoverySource');
  }
  if (!snapshot?.reason) {
    missingFields.push('reason');
  }
  if (!snapshot?.usageAreas || snapshot.usageAreas.length === 0) {
    missingFields.push('usageAreas');
  }
  if (!snapshot?.ownerAgeRange) {
    missingFields.push('ownerAgeRange');
  }

  return {
    isComplete: missingFields.length === 0,
    missingFields,
  };
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

    const onboardingSnapshot = sanitizeBusinessOnboardingSnapshot(
      business.onboardingSnapshot
    );
    const profileCompletion = computeBusinessProfileCompletion(business);

    return {
      businessId: business._id,
      name: business.name,
      shortDescription: business.shortDescription ?? '',
      businessPhone: business.businessPhone ?? '',
      serviceTypes: sanitizeServiceTypes(business.serviceTypes),
      serviceTags: sanitizeServiceTags(business.serviceTags),
      onboardingSnapshot,
      formattedAddress: business.formattedAddress ?? '',
      placeId: business.placeId ?? '',
      location: business.location ?? null,
      city: business.city ?? '',
      street: business.street ?? '',
      streetNumber: business.streetNumber ?? '',
      logoUrl: business.logoUrl ?? null,
      colors: business.colors ?? null,
      profileCompletion,
      updatedAt: business.updatedAt,
    };
  },
});

export const updateBusinessProfile = mutation({
  args: {
    businessId: v.id('businesses'),
    name: v.string(),
    shortDescription: v.string(),
    businessPhone: v.string(),
    serviceTypes: v.array(BUSINESS_SERVICE_TYPE_UNION),
    serviceTags: v.array(v.string()),
  },
  handler: async (
    ctx,
    {
      businessId,
      name,
      shortDescription,
      businessPhone,
      serviceTypes,
      serviceTags,
    }
  ) => {
    await requireActorIsBusinessOwnerOrManager(ctx, businessId);
    const business = await ctx.db.get(businessId);
    if (!business || business.isActive !== true) {
      throw new Error('BUSINESS_INACTIVE');
    }

    const normalizedName = normalizeBusinessName(name);
    const normalizedShortDescription =
      normalizeBusinessShortDescription(shortDescription);
    const normalizedBusinessPhone = normalizeBusinessPhone(businessPhone);
    const normalizedServiceTypes = normalizeServiceTypes(serviceTypes);
    const normalizedServiceTags = normalizeServiceTags(serviceTags);
    const updatedAt = Date.now();

    await ctx.db.patch(businessId, {
      name: normalizedName,
      shortDescription: normalizedShortDescription || undefined,
      businessPhone: normalizedBusinessPhone || undefined,
      serviceTypes:
        normalizedServiceTypes.length > 0 ? normalizedServiceTypes : undefined,
      serviceTags:
        normalizedServiceTags.length > 0 ? normalizedServiceTags : undefined,
      updatedAt,
    });

    return {
      businessId,
      name: normalizedName,
      shortDescription: normalizedShortDescription,
      businessPhone: normalizedBusinessPhone,
      serviceTypes: normalizedServiceTypes,
      serviceTags: normalizedServiceTags,
      updatedAt,
    };
  },
});

export const saveBusinessOnboardingSnapshot = mutation({
  args: {
    businessId: v.id('businesses'),
    discoverySource: v.optional(v.string()),
    reason: v.optional(v.string()),
    usageAreas: v.optional(v.array(v.string())),
    ownerAgeRange: v.optional(v.string()),
  },
  handler: async (
    ctx,
    { businessId, discoverySource, reason, usageAreas, ownerAgeRange }
  ) => {
    await requireActorIsBusinessOwnerOrManager(ctx, businessId);
    const business = await ctx.db.get(businessId);
    if (!business || business.isActive !== true) {
      throw new Error('BUSINESS_INACTIVE');
    }

    const normalizedDiscoverySource =
      normalizeOnboardingChoiceInput<BusinessDiscoverySource>(
        discoverySource,
        BUSINESS_DISCOVERY_SOURCE_SET,
        'BUSINESS_DISCOVERY_SOURCE_INVALID'
      );
    const normalizedReason = normalizeOnboardingChoiceInput<BusinessReason>(
      reason,
      BUSINESS_REASON_SET,
      'BUSINESS_REASON_INVALID'
    );
    const normalizedUsageAreas = normalizeOnboardingUsageAreasInput(usageAreas);
    const normalizedOwnerAgeRange =
      normalizeOnboardingChoiceInput<BusinessOwnerAgeRange>(
        ownerAgeRange,
        BUSINESS_OWNER_AGE_RANGE_SET,
        'BUSINESS_OWNER_AGE_RANGE_INVALID'
      );

    const existingSnapshot =
      sanitizeBusinessOnboardingSnapshot(business.onboardingSnapshot) ?? {};

    const nextSnapshot = {
      ...existingSnapshot,
      discoverySource:
        normalizedDiscoverySource ?? existingSnapshot.discoverySource,
      reason: normalizedReason ?? existingSnapshot.reason,
      usageAreas: normalizedUsageAreas ?? existingSnapshot.usageAreas,
      ownerAgeRange: normalizedOwnerAgeRange ?? existingSnapshot.ownerAgeRange,
      collectedAt: Date.now(),
    };

    await ctx.db.patch(businessId, {
      onboardingSnapshot: nextSnapshot,
      updatedAt: Date.now(),
    });

    return {
      businessId,
      onboardingSnapshot: nextSnapshot,
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

function normalizeServiceTypeFilters(value: BusinessServiceType[] | undefined) {
  if (!value || value.length === 0) {
    return [];
  }

  return normalizeServiceTypes(value);
}

function getPrimaryServiceType(
  value: string[] | undefined
): BusinessServiceType | null {
  if (!value || value.length === 0) {
    return null;
  }

  for (const item of value) {
    if (BUSINESS_SERVICE_TYPE_SET.has(item)) {
      return item as BusinessServiceType;
    }
  }

  return null;
}

export const getBusinessesNearby = query({
  args: {
    userLat: v.number(),
    userLng: v.number(),
    radiusKm: v.number(),
    serviceTypeFilters: v.optional(v.array(BUSINESS_SERVICE_TYPE_UNION)),
    sortBy: v.optional(
      v.union(v.literal('distance'), v.literal('service_type'))
    ),
  },
  handler: async (
    ctx,
    { userLat, userLng, radiusKm, serviceTypeFilters, sortBy }
  ) => {
    await requireCurrentUser(ctx);

    if (
      !Number.isFinite(userLat) ||
      !Number.isFinite(userLng) ||
      !Number.isFinite(radiusKm)
    ) {
      throw new Error('INVALID_LOCATION_QUERY');
    }

    const normalizedRadiusKm = Math.max(0.1, Math.min(radiusKm, 50));
    const normalizedServiceTypeFilters =
      normalizeServiceTypeFilters(serviceTypeFilters);
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

        const normalizedBusinessServiceTypes = sanitizeServiceTypes(
          business.serviceTypes
        );

        if (
          normalizedServiceTypeFilters.length > 0 &&
          !normalizedBusinessServiceTypes.some((serviceType) =>
            normalizedServiceTypeFilters.includes(serviceType)
          )
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
            serviceTypes: normalizedBusinessServiceTypes,
            serviceTags: sanitizeServiceTags(business.serviceTags),
          },
        ];
      })
      .sort((first, second) => {
        if (sortBy === 'service_type') {
          const firstPrimaryType = getPrimaryServiceType(first.serviceTypes);
          const secondPrimaryType = getPrimaryServiceType(second.serviceTypes);
          const firstTypeIndex =
            firstPrimaryType === null
              ? Number.MAX_SAFE_INTEGER
              : BUSINESS_SERVICE_TYPE_LITERALS.indexOf(firstPrimaryType);
          const secondTypeIndex =
            secondPrimaryType === null
              ? Number.MAX_SAFE_INTEGER
              : BUSINESS_SERVICE_TYPE_LITERALS.indexOf(secondPrimaryType);

          if (firstTypeIndex !== secondTypeIndex) {
            return firstTypeIndex - secondTypeIndex;
          }

          if (first.distanceKm !== second.distanceKm) {
            return first.distanceKm - second.distanceKm;
          }

          return first.name.localeCompare(second.name, 'he');
        }

        return first.distanceKm - second.distanceKm;
      })
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
