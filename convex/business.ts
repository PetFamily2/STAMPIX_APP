import { v } from 'convex/values';
import type { Doc, Id } from './_generated/dataModel';
import { mutation, query } from './_generated/server';
import { assertEntitlement } from './entitlements';
import {
  getBusinessStaffStatus,
  requireActorCanInviteRole,
  requireActorCanManageTargetStaff,
  requireActorCanManageTeamForBusiness,
  requireActorIsActiveStaffForBusiness,
  requireActorIsBusinessOwnerOrManager,
  requireActorIsStaffForBusiness,
  requireCurrentUser,
} from './guards';
import {
  generateInviteCode,
  generateJoinCode,
  generatePublicId,
} from './lib/ids';
import {
  assertScanTokenSignature,
  getScanTokenIdentity,
  isScanTokenExpired,
  parseScanToken,
} from './scanTokens';

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
    const patchData: Record<string, unknown> = { updatedAt: timestamp };
    if (existingStaff.staffRole !== staffRole) {
      patchData.staffRole = staffRole;
      patchData.roleChangedAt = timestamp;
      patchData.roleChangedByUserId = userId;
    }
    patchData.status = 'active';
    patchData.isActive = true;
    patchData.statusChangedAt = timestamp;
    patchData.statusChangedByUserId = userId;
    patchData.joinedAt = timestamp;
    patchData.removedAt = undefined;
    patchData.removedByUserId = undefined;
    await ctx.db.patch(existingStaff._id, patchData);
    return existingStaff._id;
  }

  const staffId = await ctx.db.insert('businessStaff', {
    businessId,
    userId,
    staffRole,
    status: 'active',
    isActive: true,
    joinedAt: timestamp,
    statusChangedAt: timestamp,
    statusChangedByUserId: userId,
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
    if (!existing) {
      return candidate;
    }
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
    if (!existing) {
      return candidate;
    }
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
  status: 'active' | 'suspended' | 'removed';
  isActive: boolean;
  joinedAt: number;
  statusChangedAt: number | null;
  statusChangedByUserId: Id<'users'> | null;
  roleChangedAt: number | null;
  roleChangedByUserId: Id<'users'> | null;
  removedAt: number | null;
  removedByUserId: Id<'users'> | null;
  lastSeenAt: number | null;
  createdAt: number;
  updatedAt: number | null;
  displayName: string;
  phone: string | null;
  email: string | null;
  isSelf: boolean;
};

type StaffRole = 'owner' | 'manager' | 'staff';
type StaffStatus = 'active' | 'suspended' | 'removed';
type InviteTargetRole = 'manager' | 'staff';

const TEAM_INVITE_EXPIRY_MS = 7 * 24 * 60 * 60 * 1000;
const STAFF_ROLE_SORT_ORDER: Record<StaffRole, number> = {
  owner: 0,
  manager: 1,
  staff: 2,
};

type TeamPendingInviteView = {
  inviteId: Id<'staffInvites'>;
  businessId: Id<'businesses'>;
  invitedEmail: string;
  invitedUserId: Id<'users'> | null;
  invitedDisplayName: string | null;
  invitedPhone: string | null;
  invitedResolvedEmail: string | null;
  invitedByUserId: Id<'users'>;
  invitedByDisplayName: string;
  targetRole: InviteTargetRole;
  status: 'pending';
  inviteCode: string;
  expiresAt: number;
  createdAt: number;
};

type TeamSummary = {
  activeStaffCount: number;
  pendingInvitesCount: number;
  suspendedCount: number;
  managersCount: number;
  usedSeats: number;
  maxSeats: number;
};

type TeamHistoryEventView = {
  eventId: Id<'staffEvents'>;
  eventType: Doc<'staffEvents'>['eventType'];
  actorUserId: Id<'users'> | null;
  actorDisplayName: string | null;
  targetUserId: Id<'users'> | null;
  targetDisplayName: string | null;
  targetPhone: string | null;
  targetEmail: string | null;
  targetInviteId: Id<'staffInvites'> | null;
  inviteCode: string | null;
  inviteTargetRole: InviteTargetRole | null;
  fromRole: StaffRole | null;
  toRole: StaffRole | null;
  fromStatus: StaffStatus | null;
  toStatus: StaffStatus | null;
  reasonCode: string | null;
  createdAt: number;
};

type TeamSeatStaffRow = {
  staffRole: StaffRole;
  status?: StaffStatus;
};

type TeamSeatInviteRow = {
  status: 'pending' | 'accepted' | 'cancelled' | 'expired';
  expiresAt: number;
};

function resolveStaffStatus(staff: any): StaffStatus {
  return getBusinessStaffStatus(staff);
}

function resolveInviteTargetRole(invite: any): InviteTargetRole {
  return invite?.targetRole === 'manager' ? 'manager' : 'staff';
}

function resolveUserDisplayName(
  user: Doc<'users'> | null,
  fallback = 'צוות'
): string {
  if (!user) {
    return fallback;
  }
  return user.fullName ?? user.email ?? user.externalId ?? fallback;
}

export function calculateTeamSeatsUsed(args: {
  staffRows: TeamSeatStaffRow[];
  invites: TeamSeatInviteRow[];
  now: number;
}) {
  const activeNonOwnerCount = args.staffRows.filter((staff) => {
    const status =
      staff.status === 'active' ||
      staff.status === 'suspended' ||
      staff.status === 'removed'
        ? staff.status
        : 'active';
    return status === 'active' && staff.staffRole !== 'owner';
  }).length;

  const pendingNonExpiredCount = args.invites.filter(
    (invite) => invite.status === 'pending' && invite.expiresAt > args.now
  ).length;

  return activeNonOwnerCount + pendingNonExpiredCount;
}

export function buildReinviteAfterRemovalPatch(args: {
  existingRole: StaffRole;
  acceptedRole: InviteTargetRole;
  actorUserId: Id<'users'>;
  now: number;
}) {
  const patchData: Record<string, unknown> = {
    status: 'active',
    isActive: true,
    joinedAt: args.now,
    statusChangedAt: args.now,
    statusChangedByUserId: args.actorUserId,
    removedAt: undefined,
    removedByUserId: undefined,
    updatedAt: args.now,
  };
  if (args.existingRole !== args.acceptedRole) {
    patchData.staffRole = args.acceptedRole;
    patchData.roleChangedAt = args.now;
    patchData.roleChangedByUserId = args.actorUserId;
  }
  return patchData;
}

async function requireTeamFeatureEnabled(
  ctx: any,
  businessId: Id<'businesses'>
) {
  await assertEntitlement(ctx, businessId, { featureKey: 'team' });
}

async function writeStaffEvent(
  ctx: any,
  args: {
    businessId: Id<'businesses'>;
    actorUserId?: Id<'users'>;
    targetUserId?: Id<'users'>;
    targetInviteId?: Id<'staffInvites'>;
    eventType:
      | 'invite_created'
      | 'invite_cancelled'
      | 'invite_accepted'
      | 'invite_expired'
      | 'role_changed'
      | 'suspended'
      | 'reactivated'
      | 'removed'
      | 'auto_disabled_by_plan'
      | 'auto_invites_cancelled_by_plan'
      | 'reinvited_after_removal';
    fromRole?: StaffRole;
    toRole?: StaffRole;
    fromStatus?: StaffStatus;
    toStatus?: StaffStatus;
    reasonCode?: string;
    createdAt?: number;
  }
) {
  await ctx.db.insert('staffEvents', {
    businessId: args.businessId,
    actorUserId: args.actorUserId,
    targetUserId: args.targetUserId,
    targetInviteId: args.targetInviteId,
    eventType: args.eventType,
    fromRole: args.fromRole,
    toRole: args.toRole,
    fromStatus: args.fromStatus,
    toStatus: args.toStatus,
    reasonCode: args.reasonCode,
    createdAt: args.createdAt ?? Date.now(),
  });
}

async function getSeatUsageForBusiness(
  ctx: any,
  businessId: Id<'businesses'>,
  now = Date.now()
) {
  const [staffRows, pendingInvites] = await Promise.all([
    ctx.db
      .query('businessStaff')
      .withIndex('by_businessId', (q: any) => q.eq('businessId', businessId))
      .collect(),
    ctx.db
      .query('staffInvites')
      .withIndex('by_businessId_status', (q: any) =>
        q.eq('businessId', businessId).eq('status', 'pending')
      )
      .collect(),
  ]);

  const usedSeats = calculateTeamSeatsUsed({
    staffRows: staffRows.map((staff: any) => ({
      staffRole: staff.staffRole,
      status: resolveStaffStatus(staff),
    })),
    invites: pendingInvites.map((invite: any) => ({
      status: invite.status,
      expiresAt: invite.expiresAt,
    })),
    now,
  });

  return {
    usedSeats,
  };
}

async function requireAvailableTeamSeat(
  ctx: any,
  businessId: Id<'businesses'>,
  now = Date.now()
) {
  const usage = await getSeatUsageForBusiness(ctx, businessId, now);
  const entitlements = await assertEntitlement(ctx, businessId, {
    limitKey: 'maxTeamSeats',
    currentValue: usage.usedSeats,
  });
  return { usage, maxSeats: entitlements.limits.maxTeamSeats };
}

async function getStaffMembershipByIdOrThrow(
  ctx: any,
  businessId: Id<'businesses'>,
  staffId: Id<'businessStaff'>
) {
  const staff = await ctx.db.get(staffId);
  if (!staff || staff.businessId !== businessId) {
    throw new Error('STAFF_NOT_FOUND');
  }
  return staff;
}

async function expireInviteIfNeeded(ctx: any, invite: any, now: number) {
  if (invite.status !== 'pending' || invite.expiresAt > now) {
    return false;
  }
  await ctx.db.patch(invite._id, {
    status: 'expired',
  });
  await writeStaffEvent(ctx, {
    businessId: invite.businessId,
    targetInviteId: invite._id,
    eventType: 'invite_expired',
    createdAt: now,
  });
  return true;
}

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
    if (!existing) {
      return candidate;
    }
  }
  throw new Error('FAILED_TO_GENERATE_INVITE_CODE');
}

export const listBusinessStaff = query({
  args: {
    businessId: v.optional(v.id('businesses')),
  },
  handler: async (ctx, { businessId }) => {
    if (!businessId) {
      return [];
    }

    const { actor, staffRole: actorRole } =
      await requireActorCanManageTeamForBusiness(ctx, businessId);
    await requireTeamFeatureEnabled(ctx, businessId);

    const staffRecords = await ctx.db
      .query('businessStaff')
      .withIndex('by_businessId', (q: any) => q.eq('businessId', businessId))
      .collect();

    const visibleStaff = staffRecords.filter((record: any) =>
      actorRole === 'owner' ? true : record.staffRole === 'staff'
    );

    const populated: Array<BusinessStaffView | null> = await Promise.all(
      visibleStaff.map(async (record): Promise<BusinessStaffView | null> => {
        const user = await ctx.db.get(record.userId);
        if (!user) {
          return null;
        }
        const status = resolveStaffStatus(record);
        const displayName = resolveUserDisplayName(user, 'עובד');
        const joinedAt = record.joinedAt ?? record.createdAt;
        return {
          staffId: record._id,
          userId: record.userId,
          staffRole: record.staffRole,
          status,
          isActive: status === 'active',
          joinedAt,
          statusChangedAt: record.statusChangedAt ?? null,
          statusChangedByUserId: record.statusChangedByUserId ?? null,
          roleChangedAt: record.roleChangedAt ?? null,
          roleChangedByUserId: record.roleChangedByUserId ?? null,
          removedAt: record.removedAt ?? null,
          removedByUserId: record.removedByUserId ?? null,
          lastSeenAt: record.lastSeenAt ?? null,
          createdAt: record.createdAt,
          updatedAt: record.updatedAt ?? null,
          displayName,
          phone: user.phone ?? null,
          email: user.email ?? null,
          isSelf: String(actor._id) === String(record.userId),
        };
      })
    );

    return populated
      .filter((entry): entry is BusinessStaffView => entry !== null)
      .sort((a, b) => {
        const roleDelta =
          STAFF_ROLE_SORT_ORDER[a.staffRole] -
          STAFF_ROLE_SORT_ORDER[b.staffRole];
        if (roleDelta !== 0) {
          return roleDelta;
        }
        return b.joinedAt - a.joinedAt;
      });
  },
});

export const listPendingStaffInvites = query({
  args: {
    businessId: v.optional(v.id('businesses')),
  },
  handler: async (ctx, { businessId }): Promise<TeamPendingInviteView[]> => {
    if (!businessId) {
      return [];
    }

    const { staffRole: actorRole } = await requireActorCanManageTeamForBusiness(
      ctx,
      businessId
    );
    await requireTeamFeatureEnabled(ctx, businessId);
    const now = Date.now();

    const pendingInvites = await ctx.db
      .query('staffInvites')
      .withIndex('by_businessId_status', (q: any) =>
        q.eq('businessId', businessId).eq('status', 'pending')
      )
      .collect();

    const visibleInvites = pendingInvites.filter((invite: any) => {
      if (invite.expiresAt <= now) {
        return false;
      }
      if (actorRole === 'owner') {
        return true;
      }
      return resolveInviteTargetRole(invite) === 'staff';
    });

    const populated = await Promise.all(
      visibleInvites.map(
        async (invite: any): Promise<TeamPendingInviteView> => {
          const invitedUser = invite.invitedUserId
            ? ((await ctx.db.get(invite.invitedUserId)) as Doc<'users'> | null)
            : null;
          const inviter = (await ctx.db.get(
            invite.invitedByUserId
          )) as Doc<'users'> | null;
          return {
            inviteId: invite._id,
            businessId: invite.businessId,
            invitedEmail: invite.invitedEmail,
            invitedUserId: invite.invitedUserId ?? null,
            invitedDisplayName: resolveUserDisplayName(invitedUser, 'משתמש'),
            invitedPhone: invitedUser?.phone ?? null,
            invitedResolvedEmail:
              invitedUser?.email ?? invite.invitedEmail ?? null,
            invitedByUserId: invite.invitedByUserId,
            invitedByDisplayName: resolveUserDisplayName(inviter),
            targetRole: resolveInviteTargetRole(invite),
            status: 'pending',
            inviteCode: invite.inviteCode,
            expiresAt: invite.expiresAt,
            createdAt: invite.createdAt,
          };
        }
      )
    );

    return populated.sort((a, b) => b.createdAt - a.createdAt);
  },
});

export const getBusinessTeamSummary = query({
  args: {
    businessId: v.optional(v.id('businesses')),
  },
  handler: async (ctx, { businessId }): Promise<TeamSummary | null> => {
    if (!businessId) {
      return null;
    }

    const { staffRole: actorRole } = await requireActorCanManageTeamForBusiness(
      ctx,
      businessId
    );
    await requireTeamFeatureEnabled(ctx, businessId);
    const now = Date.now();

    const [staffRows, invites, entitlements] = await Promise.all([
      ctx.db
        .query('businessStaff')
        .withIndex('by_businessId', (q: any) => q.eq('businessId', businessId))
        .collect(),
      ctx.db
        .query('staffInvites')
        .withIndex('by_businessId_status', (q: any) =>
          q.eq('businessId', businessId).eq('status', 'pending')
        )
        .collect(),
      assertEntitlement(ctx, businessId, { featureKey: 'team' }),
    ]);

    const visibleStaffRows = staffRows.filter((staff: any) =>
      actorRole === 'owner' ? true : staff.staffRole === 'staff'
    );
    const visiblePendingInvites = invites.filter((invite: any) => {
      if (invite.expiresAt <= now) {
        return false;
      }
      if (actorRole === 'owner') {
        return true;
      }
      return resolveInviteTargetRole(invite) === 'staff';
    });

    const activeStaffCount = visibleStaffRows.filter((staff: any) => {
      const status = resolveStaffStatus(staff);
      return status === 'active' && staff.staffRole !== 'owner';
    }).length;
    const suspendedCount = visibleStaffRows.filter((staff: any) => {
      const status = resolveStaffStatus(staff);
      return status === 'suspended' && staff.staffRole !== 'owner';
    }).length;
    const managersCount =
      actorRole === 'owner'
        ? visibleStaffRows.filter(
            (staff: any) =>
              staff.staffRole === 'manager' &&
              resolveStaffStatus(staff) === 'active'
          ).length
        : 0;

    const seatUsage = await getSeatUsageForBusiness(ctx, businessId, now);

    return {
      activeStaffCount,
      pendingInvitesCount: visiblePendingInvites.length,
      suspendedCount,
      managersCount,
      usedSeats: seatUsage.usedSeats,
      maxSeats: entitlements.limits.maxTeamSeats,
    };
  },
});

export const listBusinessStaffHistory = query({
  args: {
    businessId: v.optional(v.id('businesses')),
    limit: v.optional(v.number()),
  },
  handler: async (
    ctx,
    { businessId, limit }
  ): Promise<TeamHistoryEventView[]> => {
    if (!businessId) {
      return [];
    }

    const { staffRole: actorRole } = await requireActorCanManageTeamForBusiness(
      ctx,
      businessId
    );
    await requireTeamFeatureEnabled(ctx, businessId);

    const normalizedLimit = Math.max(1, Math.min(100, Math.floor(limit ?? 50)));

    const [events, staffMemberships] = await Promise.all([
      ctx.db
        .query('staffEvents')
        .withIndex('by_businessId', (q: any) => q.eq('businessId', businessId))
        .collect(),
      ctx.db
        .query('businessStaff')
        .withIndex('by_businessId', (q: any) => q.eq('businessId', businessId))
        .collect(),
    ]);

    const sortedEvents = [...events].sort((a: any, b: any) => {
      return b.createdAt - a.createdAt;
    });

    const staffRoleByUserId = new Map<string, StaffRole>();
    for (const membership of staffMemberships) {
      staffRoleByUserId.set(String(membership.userId), membership.staffRole);
    }

    const inviteIds = Array.from(
      new Set(
        sortedEvents
          .map((event: any) => event.targetInviteId)
          .filter((value: any): value is Id<'staffInvites'> => Boolean(value))
      )
    );
    const invites = await Promise.all(
      inviteIds.map(async (inviteId) => {
        return {
          inviteId,
          invite: (await ctx.db.get(inviteId)) as Doc<'staffInvites'> | null,
        };
      })
    );
    const inviteById = new Map<string, Doc<'staffInvites'>>();
    for (const row of invites) {
      if (row.invite) {
        inviteById.set(String(row.inviteId), row.invite);
      }
    }

    const userIds = new Set<string>();
    for (const event of sortedEvents) {
      if (event.actorUserId) {
        userIds.add(String(event.actorUserId));
      }
      if (event.targetUserId) {
        userIds.add(String(event.targetUserId));
      }
      const invite = event.targetInviteId
        ? (inviteById.get(String(event.targetInviteId)) ?? null)
        : null;
      if (invite?.invitedByUserId) {
        userIds.add(String(invite.invitedByUserId));
      }
      if (invite?.invitedUserId) {
        userIds.add(String(invite.invitedUserId));
      }
    }

    const userRows = await Promise.all(
      Array.from(userIds).map(async (idValue) => {
        const userId = idValue as Id<'users'>;
        return {
          userId,
          user: (await ctx.db.get(userId)) as Doc<'users'> | null,
        };
      })
    );
    const userById = new Map<string, Doc<'users'>>();
    for (const row of userRows) {
      if (row.user) {
        userById.set(String(row.userId), row.user);
      }
    }

    const result: TeamHistoryEventView[] = [];

    for (const event of sortedEvents) {
      const invite = event.targetInviteId
        ? (inviteById.get(String(event.targetInviteId)) ?? null)
        : null;
      const inviteTargetRole = invite ? resolveInviteTargetRole(invite) : null;

      if (actorRole === 'manager') {
        const targetStaffRole = event.targetUserId
          ? (staffRoleByUserId.get(String(event.targetUserId)) ?? null)
          : null;

        if (event.fromRole && event.fromRole !== 'staff') {
          continue;
        }
        if (event.toRole && event.toRole !== 'staff') {
          continue;
        }
        if (inviteTargetRole && inviteTargetRole !== 'staff') {
          continue;
        }
        if (!event.fromRole && !event.toRole && !inviteTargetRole) {
          if (targetStaffRole !== 'staff') {
            continue;
          }
        }
      }

      const actorUser = event.actorUserId
        ? (userById.get(String(event.actorUserId)) ?? null)
        : null;
      const targetUser = event.targetUserId
        ? (userById.get(String(event.targetUserId)) ?? null)
        : null;
      const invitedUser = invite?.invitedUserId
        ? (userById.get(String(invite.invitedUserId)) ?? null)
        : null;

      const targetDisplayName = targetUser
        ? resolveUserDisplayName(targetUser, 'משתמש')
        : invitedUser
          ? resolveUserDisplayName(invitedUser, 'משתמש')
          : invite?.invitedEmail?.trim() || null;

      result.push({
        eventId: event._id,
        eventType: event.eventType,
        actorUserId: event.actorUserId ?? null,
        actorDisplayName: actorUser
          ? resolveUserDisplayName(actorUser, 'מערכת')
          : null,
        targetUserId: event.targetUserId ?? null,
        targetDisplayName,
        targetPhone: targetUser?.phone ?? invitedUser?.phone ?? null,
        targetEmail:
          targetUser?.email ??
          invitedUser?.email ??
          invite?.invitedEmail ??
          null,
        targetInviteId: event.targetInviteId ?? null,
        inviteCode: invite?.inviteCode ?? null,
        inviteTargetRole,
        fromRole: (event.fromRole as StaffRole | undefined) ?? null,
        toRole: (event.toRole as StaffRole | undefined) ?? null,
        fromStatus: (event.fromStatus as StaffStatus | undefined) ?? null,
        toStatus: (event.toStatus as StaffStatus | undefined) ?? null,
        reasonCode: event.reasonCode ?? null,
        createdAt: event.createdAt,
      });

      if (result.length >= normalizedLimit) {
        break;
      }
    }

    return result;
  },
});

export const getMyBusinessMemberships = query({
  args: {},
  handler: async (ctx) => {
    const actor = await requireCurrentUser(ctx);
    const memberships = await ctx.db
      .query('businessStaff')
      .withIndex('by_userId', (q: any) => q.eq('userId', actor._id))
      .collect();

    const rows = await Promise.all(
      memberships.map(async (membership: any) => {
        const business = (await ctx.db.get(
          membership.businessId
        )) as Doc<'businesses'> | null;
        if (!business || business.isActive !== true) {
          return null;
        }
        const status = resolveStaffStatus(membership);
        return {
          staffId: membership._id,
          businessId: membership.businessId,
          businessName: business.name,
          staffRole: membership.staffRole as StaffRole,
          status,
          isActive: status === 'active',
          joinedAt: membership.joinedAt ?? membership.createdAt,
          updatedAt: membership.updatedAt ?? null,
        };
      })
    );

    return rows
      .filter((row): row is NonNullable<typeof row> => row !== null)
      .sort((a, b) => b.joinedAt - a.joinedAt);
  },
});

export const getMyStaffProfileForBusiness = query({
  args: {
    businessId: v.optional(v.id('businesses')),
  },
  handler: async (ctx, { businessId }) => {
    if (!businessId) {
      return null;
    }

    const { actor, membership, staffRole } =
      await requireActorIsActiveStaffForBusiness(ctx, businessId);
    const business = await ctx.db.get(businessId);
    if (!business || business.isActive !== true) {
      throw new Error('BUSINESS_INACTIVE');
    }

    const permissionsByRole: Record<StaffRole, string[]> = {
      owner: [
        'manage_subscription',
        'manage_team',
        'manage_business_settings',
        'scanner_access',
      ],
      manager: [
        'manage_staff_only',
        'manage_business_settings',
        'scanner_access',
      ],
      staff: ['scanner_access'],
    };

    return {
      userId: actor._id,
      businessId,
      businessName: business.name,
      staffRole,
      status: resolveStaffStatus(membership),
      permissions: permissionsByRole[staffRole],
      joinedAt: membership.joinedAt ?? membership.createdAt,
      canManageTeam: staffRole === 'owner' || staffRole === 'manager',
    };
  },
});

export const inviteBusinessStaff = mutation({
  args: {
    businessId: v.id('businesses'),
    email: v.string(),
    role: v.union(v.literal('manager'), v.literal('staff')),
  },
  handler: async (ctx, { businessId, email, role }) => {
    const { actor, staffRole: actorRole } =
      await requireActorCanManageTeamForBusiness(ctx, businessId);
    await requireTeamFeatureEnabled(ctx, businessId);
    requireActorCanInviteRole(actorRole, role);

    const normalizedEmail = email.trim().toLowerCase();
    if (!normalizedEmail) {
      throw new Error('EMAIL_REQUIRED');
    }
    if (normalizedEmail === actor.email?.toLowerCase()) {
      throw new Error('CANNOT_INVITE_SELF');
    }

    const now = Date.now();
    const existingPendingInvites = await ctx.db
      .query('staffInvites')
      .withIndex('by_businessId_invitedEmail_status', (q: any) =>
        q
          .eq('businessId', businessId)
          .eq('invitedEmail', normalizedEmail)
          .eq('status', 'pending')
      )
      .collect();

    for (const invite of existingPendingInvites) {
      const didExpire = await expireInviteIfNeeded(ctx, invite, now);
      if (!didExpire) {
        throw new Error('INVITE_ALREADY_PENDING');
      }
    }

    const targetUser = await ctx.db
      .query('users')
      .withIndex('by_email', (q: any) => q.eq('email', normalizedEmail))
      .first();

    if (targetUser) {
      const existingMembership = await ctx.db
        .query('businessStaff')
        .withIndex('by_businessId_userId', (q: any) =>
          q.eq('businessId', businessId).eq('userId', targetUser._id)
        )
        .first();

      if (existingMembership) {
        if (existingMembership.staffRole === 'owner') {
          throw new Error('OWNER_CANNOT_BE_INVITED');
        }
        const membershipStatus = resolveStaffStatus(existingMembership);
        if (membershipStatus === 'active') {
          throw new Error('ALREADY_STAFF');
        }
        if (membershipStatus === 'suspended') {
          throw new Error('SUSPENDED_MEMBER_CANNOT_REINVITE');
        }
      }
    }

    await requireAvailableTeamSeat(ctx, businessId, now);

    const inviteCode = await generateUniqueInviteCode(ctx);
    const inviteId = await ctx.db.insert('staffInvites', {
      businessId,
      invitedEmail: normalizedEmail,
      invitedUserId: targetUser?._id,
      invitedByUserId: actor._id,
      targetRole: role,
      inviteCode,
      status: 'pending',
      expiresAt: now + TEAM_INVITE_EXPIRY_MS,
      createdAt: now,
    });

    await writeStaffEvent(ctx, {
      businessId,
      actorUserId: actor._id,
      targetInviteId: inviteId,
      eventType: 'invite_created',
      toRole: role,
      createdAt: now,
    });

    return {
      inviteCode,
      inviteId,
      alreadyPending: false,
      deliveryChannel: targetUser
        ? ('in_app' as const)
        : ('invite_code' as const),
      invitedUserExists: Boolean(targetUser),
    };
  },
});

export const inviteBusinessStaffByScanToken = mutation({
  args: {
    businessId: v.id('businesses'),
    scanToken: v.string(),
    role: v.union(v.literal('manager'), v.literal('staff')),
  },
  handler: async (ctx, { businessId, scanToken, role }) => {
    const { actor, staffRole: actorRole } =
      await requireActorCanManageTeamForBusiness(ctx, businessId);
    await requireTeamFeatureEnabled(ctx, businessId);
    requireActorCanInviteRole(actorRole, role);

    const normalizedToken = scanToken.trim();
    if (!normalizedToken) {
      throw new Error('INVALID_SCAN_TOKEN');
    }

    let tokenPayload: ReturnType<typeof parseScanToken>;
    try {
      tokenPayload = parseScanToken(normalizedToken);
      await assertScanTokenSignature(tokenPayload);
    } catch {
      throw new Error('INVALID_SCAN_TOKEN');
    }

    if (isScanTokenExpired(tokenPayload)) {
      throw new Error('SCAN_TOKEN_EXPIRED');
    }

    const tokenIdentity = getScanTokenIdentity(tokenPayload);
    const targetUser = (await ctx.db.get(
      tokenIdentity.customerId as Id<'users'>
    )) as Doc<'users'> | null;

    if (!targetUser) {
      throw new Error('TARGET_USER_NOT_FOUND');
    }
    if (String(targetUser._id) === String(actor._id)) {
      throw new Error('CANNOT_INVITE_SELF');
    }

    const normalizedEmail = targetUser.email?.trim().toLowerCase() ?? '';
    const invitedUserName =
      targetUser.fullName?.trim() ||
      [targetUser.firstName?.trim(), targetUser.lastName?.trim()]
        .filter((part): part is string => Boolean(part))
        .join(' ')
        .trim() ||
      normalizedEmail ||
      targetUser.externalId?.trim() ||
      'עובד';
    const invitedUserPhone = targetUser.phone?.trim() || null;
    const now = Date.now();

    const pendingByUser = await ctx.db
      .query('staffInvites')
      .withIndex('by_invitedUserId', (q: any) =>
        q.eq('invitedUserId', targetUser._id)
      )
      .filter((q: any) => q.eq(q.field('businessId'), businessId))
      .filter((q: any) => q.eq(q.field('status'), 'pending'))
      .collect();

    const pendingByEmail = normalizedEmail
      ? await ctx.db
          .query('staffInvites')
          .withIndex('by_businessId_invitedEmail_status', (q: any) =>
            q
              .eq('businessId', businessId)
              .eq('invitedEmail', normalizedEmail)
              .eq('status', 'pending')
          )
          .collect()
      : [];

    const uniquePendingInvites = new Map<string, any>();
    for (const invite of pendingByUser) {
      uniquePendingInvites.set(String(invite._id), invite);
    }
    for (const invite of pendingByEmail) {
      uniquePendingInvites.set(String(invite._id), invite);
    }

    for (const invite of uniquePendingInvites.values()) {
      const didExpire = await expireInviteIfNeeded(ctx, invite, now);
      if (!didExpire) {
        throw new Error('INVITE_ALREADY_PENDING');
      }
    }

    const existingMembership = await ctx.db
      .query('businessStaff')
      .withIndex('by_businessId_userId', (q: any) =>
        q.eq('businessId', businessId).eq('userId', targetUser._id)
      )
      .first();

    if (existingMembership) {
      if (existingMembership.staffRole === 'owner') {
        throw new Error('OWNER_CANNOT_BE_INVITED');
      }
      const membershipStatus = resolveStaffStatus(existingMembership);
      if (membershipStatus === 'active') {
        throw new Error('ALREADY_STAFF');
      }
      if (membershipStatus === 'suspended') {
        throw new Error('SUSPENDED_MEMBER_CANNOT_REINVITE');
      }
    }

    await requireAvailableTeamSeat(ctx, businessId, now);

    const inviteCode = await generateUniqueInviteCode(ctx);
    const inviteId = await ctx.db.insert('staffInvites', {
      businessId,
      invitedEmail: normalizedEmail,
      invitedUserId: targetUser._id,
      invitedByUserId: actor._id,
      targetRole: role,
      inviteCode,
      status: 'pending',
      expiresAt: now + TEAM_INVITE_EXPIRY_MS,
      createdAt: now,
    });

    await writeStaffEvent(ctx, {
      businessId,
      actorUserId: actor._id,
      targetInviteId: inviteId,
      eventType: 'invite_created',
      toRole: role,
      createdAt: now,
    });

    return {
      inviteCode,
      inviteId,
      alreadyPending: false,
      deliveryChannel: 'in_app' as const,
      invitedUserExists: true,
      invitedUser: {
        name: invitedUserName,
        phone: invitedUserPhone,
        email: normalizedEmail || null,
      },
    };
  },
});

export const cancelStaffInvite = mutation({
  args: {
    businessId: v.id('businesses'),
    inviteId: v.id('staffInvites'),
  },
  handler: async (ctx, { businessId, inviteId }) => {
    const { actor, staffRole: actorRole } =
      await requireActorCanManageTeamForBusiness(ctx, businessId);
    await requireTeamFeatureEnabled(ctx, businessId);
    const now = Date.now();

    const invite = await ctx.db.get(inviteId);
    if (!invite || invite.businessId !== businessId) {
      throw new Error('INVITE_NOT_FOUND');
    }

    if (invite.status !== 'pending') {
      throw new Error('INVITE_NOT_PENDING');
    }
    if (invite.expiresAt <= now) {
      await expireInviteIfNeeded(ctx, invite, now);
      throw new Error('INVITE_EXPIRED');
    }
    if (
      actorRole === 'manager' &&
      resolveInviteTargetRole(invite) !== 'staff'
    ) {
      throw new Error('NOT_AUTHORIZED');
    }

    await ctx.db.patch(inviteId, {
      status: 'cancelled',
      cancelledAt: now,
      cancelledByUserId: actor._id,
    });

    await writeStaffEvent(ctx, {
      businessId,
      actorUserId: actor._id,
      targetInviteId: inviteId,
      eventType: 'invite_cancelled',
      createdAt: now,
    });

    return { inviteId, status: 'cancelled' as const };
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

    if (!invite) {
      throw new Error('INVITE_NOT_FOUND');
    }
    if (invite.status !== 'pending') {
      throw new Error('INVITE_NOT_PENDING');
    }
    if (invite.expiresAt <= now) {
      await expireInviteIfNeeded(ctx, invite, now);
      throw new Error('INVITE_EXPIRED');
    }

    if (
      invite.invitedUserId &&
      String(invite.invitedUserId) !== String(user._id)
    ) {
      throw new Error('EMAIL_MISMATCH');
    }
    if (
      !invite.invitedUserId &&
      invite.invitedEmail &&
      user.email?.toLowerCase() !== invite.invitedEmail.toLowerCase()
    ) {
      throw new Error('EMAIL_MISMATCH');
    }

    await requireTeamFeatureEnabled(ctx, invite.businessId);

    const existingMembership = await ctx.db
      .query('businessStaff')
      .withIndex('by_businessId_userId', (q: any) =>
        q.eq('businessId', invite.businessId).eq('userId', user._id)
      )
      .first();

    let staffId: Id<'businessStaff'>;
    const acceptedRole: InviteTargetRole = resolveInviteTargetRole(invite);
    let reusedRemovedMembership = false;
    let previousRole: StaffRole | undefined;

    if (existingMembership) {
      const membershipStatus = resolveStaffStatus(existingMembership);
      previousRole = existingMembership.staffRole as StaffRole;
      if (membershipStatus === 'active') {
        throw new Error('ALREADY_STAFF');
      }
      if (membershipStatus === 'suspended') {
        throw new Error('SUSPENDED_MEMBER_CANNOT_ACCEPT_INVITE');
      }
      if (existingMembership.staffRole === 'owner') {
        throw new Error('OWNER_CANNOT_BE_INVITED');
      }

      const patchData = buildReinviteAfterRemovalPatch({
        existingRole: existingMembership.staffRole,
        acceptedRole,
        actorUserId: user._id,
        now,
      });

      await ctx.db.patch(existingMembership._id, patchData);
      staffId = existingMembership._id;
      reusedRemovedMembership = true;
    } else {
      staffId = await ctx.db.insert('businessStaff', {
        businessId: invite.businessId,
        userId: user._id,
        staffRole: acceptedRole,
        status: 'active',
        isActive: true,
        joinedAt: now,
        statusChangedAt: now,
        statusChangedByUserId: user._id,
        createdAt: now,
        updatedAt: now,
      });
    }

    await ctx.db.patch(invite._id, {
      status: 'accepted',
      invitedUserId: user._id,
      acceptedAt: now,
      acceptedByUserId: user._id,
    });

    await writeStaffEvent(ctx, {
      businessId: invite.businessId,
      actorUserId: user._id,
      targetUserId: user._id,
      targetInviteId: invite._id,
      eventType: 'invite_accepted',
      toRole: acceptedRole,
      toStatus: 'active',
      createdAt: now,
    });

    if (reusedRemovedMembership) {
      await writeStaffEvent(ctx, {
        businessId: invite.businessId,
        actorUserId: user._id,
        targetUserId: user._id,
        targetInviteId: invite._id,
        eventType: 'reinvited_after_removal',
        fromRole: previousRole,
        toRole: acceptedRole,
        fromStatus: 'removed',
        toStatus: 'active',
        createdAt: now,
      });
    }

    const currentUser = await ctx.db.get(user._id);
    if (currentUser) {
      await ctx.db.patch(user._id, {
        activeMode: 'business',
        activeBusinessId: invite.businessId,
        updatedAt: now,
      });
    }

    return {
      staffId,
      businessId: invite.businessId,
      staffRole: acceptedRole,
      reusedRemovedMembership,
    };
  },
});

export const updateBusinessStaffRole = mutation({
  args: {
    businessId: v.id('businesses'),
    staffId: v.id('businessStaff'),
    role: v.union(v.literal('manager'), v.literal('staff')),
  },
  handler: async (ctx, { businessId, staffId, role }) => {
    const { actor, staffRole: actorRole } =
      await requireActorCanManageTeamForBusiness(ctx, businessId);
    await requireTeamFeatureEnabled(ctx, businessId);
    if (actorRole !== 'owner') {
      throw new Error('NOT_AUTHORIZED');
    }

    const target = await getStaffMembershipByIdOrThrow(
      ctx,
      businessId,
      staffId
    );
    requireActorCanManageTargetStaff({
      actorUserId: actor._id,
      actorRole,
      targetUserId: target.userId,
      targetRole: target.staffRole,
    });

    if (target.staffRole === role) {
      return { staffId: target._id, staffRole: target.staffRole };
    }

    const now = Date.now();
    await ctx.db.patch(target._id, {
      staffRole: role,
      roleChangedAt: now,
      roleChangedByUserId: actor._id,
      updatedAt: now,
    });

    await writeStaffEvent(ctx, {
      businessId,
      actorUserId: actor._id,
      targetUserId: target.userId,
      eventType: 'role_changed',
      fromRole: target.staffRole,
      toRole: role,
      createdAt: now,
    });

    return { staffId: target._id, staffRole: role };
  },
});

export const suspendBusinessStaff = mutation({
  args: {
    businessId: v.id('businesses'),
    staffId: v.id('businessStaff'),
  },
  handler: async (ctx, { businessId, staffId }) => {
    const { actor, staffRole: actorRole } =
      await requireActorCanManageTeamForBusiness(ctx, businessId);
    await requireTeamFeatureEnabled(ctx, businessId);

    const target = await getStaffMembershipByIdOrThrow(
      ctx,
      businessId,
      staffId
    );
    requireActorCanManageTargetStaff({
      actorUserId: actor._id,
      actorRole,
      targetUserId: target.userId,
      targetRole: target.staffRole,
    });

    const currentStatus = resolveStaffStatus(target);
    if (currentStatus === 'removed') {
      throw new Error('REMOVED_CANNOT_BE_SUSPENDED');
    }
    if (currentStatus === 'suspended') {
      return { staffId: target._id, status: 'suspended' as const };
    }

    const now = Date.now();
    await ctx.db.patch(target._id, {
      status: 'suspended',
      isActive: false,
      statusChangedAt: now,
      statusChangedByUserId: actor._id,
      updatedAt: now,
    });

    await writeStaffEvent(ctx, {
      businessId,
      actorUserId: actor._id,
      targetUserId: target.userId,
      eventType: 'suspended',
      fromStatus: 'active',
      toStatus: 'suspended',
      createdAt: now,
    });

    return { staffId: target._id, status: 'suspended' as const };
  },
});

export const reactivateBusinessStaff = mutation({
  args: {
    businessId: v.id('businesses'),
    staffId: v.id('businessStaff'),
  },
  handler: async (ctx, { businessId, staffId }) => {
    const { actor, staffRole: actorRole } =
      await requireActorCanManageTeamForBusiness(ctx, businessId);
    await requireTeamFeatureEnabled(ctx, businessId);

    const target = await getStaffMembershipByIdOrThrow(
      ctx,
      businessId,
      staffId
    );
    requireActorCanManageTargetStaff({
      actorUserId: actor._id,
      actorRole,
      targetUserId: target.userId,
      targetRole: target.staffRole,
    });

    const currentStatus = resolveStaffStatus(target);
    if (currentStatus === 'removed') {
      throw new Error('REMOVED_REQUIRES_NEW_INVITE');
    }
    if (currentStatus === 'active') {
      return { staffId: target._id, status: 'active' as const };
    }

    await requireAvailableTeamSeat(ctx, businessId, Date.now());
    const now = Date.now();
    await ctx.db.patch(target._id, {
      status: 'active',
      isActive: true,
      statusChangedAt: now,
      statusChangedByUserId: actor._id,
      updatedAt: now,
    });

    await writeStaffEvent(ctx, {
      businessId,
      actorUserId: actor._id,
      targetUserId: target.userId,
      eventType: 'reactivated',
      fromStatus: 'suspended',
      toStatus: 'active',
      createdAt: now,
    });

    return { staffId: target._id, status: 'active' as const };
  },
});

export const removeBusinessStaff = mutation({
  args: {
    businessId: v.id('businesses'),
    staffId: v.id('businessStaff'),
  },
  handler: async (ctx, { businessId, staffId }) => {
    const { actor, staffRole: actorRole } =
      await requireActorCanManageTeamForBusiness(ctx, businessId);
    await requireTeamFeatureEnabled(ctx, businessId);

    const target = await getStaffMembershipByIdOrThrow(
      ctx,
      businessId,
      staffId
    );
    requireActorCanManageTargetStaff({
      actorUserId: actor._id,
      actorRole,
      targetUserId: target.userId,
      targetRole: target.staffRole,
    });

    const previousStatus = resolveStaffStatus(target);
    if (previousStatus === 'removed') {
      return { staffId: target._id, status: 'removed' as const };
    }

    const now = Date.now();
    await ctx.db.patch(target._id, {
      status: 'removed',
      isActive: false,
      statusChangedAt: now,
      statusChangedByUserId: actor._id,
      removedAt: now,
      removedByUserId: actor._id,
      updatedAt: now,
    });

    await writeStaffEvent(ctx, {
      businessId,
      actorUserId: actor._id,
      targetUserId: target.userId,
      eventType: 'removed',
      fromStatus: previousStatus,
      toStatus: 'removed',
      createdAt: now,
    });

    return { staffId: target._id, status: 'removed' as const };
  },
});
