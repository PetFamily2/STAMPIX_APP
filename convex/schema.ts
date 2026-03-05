import { authTables } from '@convex-dev/auth/server';
import { defineSchema, defineTable } from 'convex/server';
import { v } from 'convex/values';

export default defineSchema({
  ...authTables,

  authVerifiers: defineTable({
    sessionId: v.optional(v.id('authSessions')),
    signature: v.optional(v.string()),
  })
    .index('signature', ['signature'])
    .index('by_sessionId', ['sessionId']),

  // -------------------------
  // Core (MVP + future-ready)
  // -------------------------
  users: defineTable({
    externalId: v.optional(v.string()),
    email: v.optional(v.string()),
    emailVerified: v.optional(v.boolean()),
    phone: v.optional(v.string()),
    firstName: v.optional(v.string()),
    lastName: v.optional(v.string()),
    fullName: v.optional(v.string()),
    needsNameCapture: v.optional(v.boolean()), // deprecated: use customerOnboardedAt
    postAuthOnboardingRequired: v.optional(v.boolean()), // deprecated: use customerOnboardedAt
    customerOnboardedAt: v.optional(v.number()),
    businessOnboardedAt: v.optional(v.number()),
    activeMode: v.optional(
      v.union(v.literal('customer'), v.literal('business'))
    ),
    avatarUrl: v.optional(v.string()),
    marketingOptIn: v.optional(v.boolean()),
    marketingOptInAt: v.optional(v.number()),
    birthdayMonth: v.optional(v.number()),
    birthdayDay: v.optional(v.number()),
    anniversaryMonth: v.optional(v.number()),
    anniversaryDay: v.optional(v.number()),
    userType: v.optional(v.union(v.literal('free'), v.literal('paid'))),
    subscriptionPlan: v.optional(
      v.union(v.literal('free'), v.literal('pro'), v.literal('unlimited'))
    ),
    subscriptionStatus: v.optional(
      v.union(
        v.literal('active'),
        v.literal('inactive'),
        v.literal('cancelled')
      )
    ),
    subscriptionProductId: v.optional(v.string()),
    subscriptionUpdatedAt: v.optional(v.number()),
    role: v.optional(
      v.union(
        v.literal('customer'),
        v.literal('merchant'),
        v.literal('staff'),
        v.literal('admin')
      )
    ), // deprecated: business access via businessStaff
    preferredMode: v.optional(
      v.union(v.literal('customer'), v.literal('business'), v.literal('staff'))
    ), // deprecated: use activeMode
    isAdmin: v.optional(v.boolean()),
    isActive: v.boolean(),
    createdAt: v.number(),
    updatedAt: v.number(),
  })
    .index('by_externalId', ['externalId'])
    .index('by_email', ['email'])
    .index('by_isActive', ['isActive'])
    .index('by_userType', ['userType']),

  userIdentities: defineTable({
    userId: v.id('users'),
    provider: v.union(
      v.literal('google'),
      v.literal('apple'),
      v.literal('email')
    ),
    providerUserId: v.string(),
    email: v.optional(v.string()),
    createdAt: v.number(),
    updatedAt: v.number(),
  })
    .index('by_provider_providerUserId', ['provider', 'providerUserId'])
    .index('by_userId', ['userId'])
    .index('by_email', ['email']),

  businesses: defineTable({
    ownerUserId: v.id('users'),
    externalId: v.string(),
    businessPublicId: v.optional(v.string()), // opaque nanoid(12) for QR links
    joinCode: v.optional(v.string()), // short alphanumeric code for manual entry
    name: v.string(),
    logoUrl: v.optional(v.string()),
    colors: v.optional(v.any()),
    subscriptionPlan: v.optional(
      v.union(v.literal('starter'), v.literal('pro'), v.literal('unlimited'))
    ),
    subscriptionStatus: v.optional(
      v.union(
        v.literal('active'),
        v.literal('trialing'),
        v.literal('past_due'),
        v.literal('canceled')
      )
    ),
    subscriptionStartAt: v.optional(v.union(v.number(), v.null())),
    subscriptionEndAt: v.optional(v.union(v.number(), v.null())),
    billingPeriod: v.optional(
      v.union(v.literal('monthly'), v.literal('yearly'), v.null())
    ),
    aiCampaignsUsedThisMonth: v.optional(v.number()),
    aiCampaignsMonthKey: v.optional(v.string()),
    customerSegmentationConfig: v.optional(
      v.object({
        riskDaysWithoutVisit: v.number(),
        frequentVisitsLast30Days: v.number(),
        dropPercentThreshold: v.number(),
        updatedAt: v.number(),
      })
    ),
    location: v.optional(
      v.object({
        lat: v.number(),
        lng: v.number(),
      })
    ),
    placeId: v.optional(v.string()),
    formattedAddress: v.optional(v.string()),
    city: v.optional(v.string()),
    street: v.optional(v.string()),
    streetNumber: v.optional(v.string()),
    isActive: v.boolean(),
    createdAt: v.number(),
    updatedAt: v.number(),
  })
    .index('by_ownerUserId', ['ownerUserId'])
    .index('by_externalId', ['externalId'])
    .index('by_businessPublicId', ['businessPublicId'])
    .index('by_joinCode', ['joinCode'])
    .index('by_isActive', ['isActive']),

  businessStaff: defineTable({
    businessId: v.id('businesses'),
    userId: v.id('users'),
    staffRole: v.union(
      v.literal('owner'),
      v.literal('manager'),
      v.literal('staff')
    ),
    isActive: v.boolean(),
    createdAt: v.number(),
    updatedAt: v.optional(v.number()),
  })
    .index('by_businessId', ['businessId'])
    .index('by_userId', ['userId'])
    .index('by_businessId_userId', ['businessId', 'userId']),

  loyaltyPrograms: defineTable({
    businessId: v.id('businesses'),
    title: v.string(),
    rewardName: v.string(),
    maxStamps: v.number(),
    stampIcon: v.string(),
    cardThemeId: v.optional(v.string()),
    isArchived: v.optional(v.boolean()),
    archivedAt: v.optional(v.number()),
    archivedByUserId: v.optional(v.id('users')),
    isActive: v.boolean(),
    createdAt: v.number(),
    updatedAt: v.number(),
  })
    .index('by_businessId', ['businessId'])
    .index('by_isActive', ['isActive']),

  memberships: defineTable({
    userId: v.id('users'),
    businessId: v.id('businesses'),
    programId: v.id('loyaltyPrograms'),
    currentStamps: v.number(),
    lastStampAt: v.optional(v.number()),
    joinSource: v.optional(v.string()), // src param from join QR link
    joinCampaign: v.optional(v.string()), // camp param from join QR link
    isActive: v.boolean(),
    createdAt: v.number(),
    updatedAt: v.number(),
  })
    .index('by_userId', ['userId'])
    .index('by_businessId', ['businessId'])
    .index('by_userId_businessId', ['userId', 'businessId'])
    .index('by_userId_programId', ['userId', 'programId']),

  events: defineTable({
    type: v.string(), // e.g. STAMP_ADDED | REWARD_REDEEMED
    businessId: v.id('businesses'),
    programId: v.id('loyaltyPrograms'),
    membershipId: v.optional(v.id('memberships')),
    actorUserId: v.id('users'),
    customerUserId: v.id('users'),
    metadata: v.optional(v.any()),
    createdAt: v.number(),
  })
    .index('by_businessId', ['businessId'])
    .index('by_actorUserId', ['actorUserId'])
    .index('by_customerUserId', ['customerUserId'])
    .index('by_createdAt', ['createdAt']),

  scanTokenEvents: defineTable({
    businessId: v.id('businesses'),
    programId: v.id('loyaltyPrograms'),
    customerId: v.id('users'),
    signature: v.string(),
    tokenTimestamp: v.number(),
    createdAt: v.number(),
  })
    .index('by_signature', ['signature'])
    .index('by_businessId', ['businessId'])
    .index('by_businessProgram', ['businessId', 'programId'])
    .index('by_customerId', ['customerId']),

  emailOtps: defineTable({
    email: v.string(),
    code: v.string(),
    status: v.union(
      v.literal('pending'),
      v.literal('sent'),
      v.literal('failed'),
      v.literal('consumed'),
      v.literal('invalidated')
    ),
    attempts: v.number(),
    maxAttempts: v.number(),
    expiresAt: v.number(),
    createdAt: v.number(),
    sentAt: v.optional(v.number()),
    consumedAt: v.optional(v.number()),
    failureReason: v.optional(v.string()),
  })
    .index('by_email', ['email'])
    .index('by_expiresAt', ['expiresAt'])
    .index('by_status', ['status']),

  // -------------------------
  // Future scaffolds (no MVP UI)
  // -------------------------
  campaigns: defineTable({
    businessId: v.id('businesses'),
    type: v.union(
      v.literal('welcome'),
      v.literal('birthday'),
      v.literal('anniversary'),
      v.literal('winback'),
      v.literal('promo'),
      v.literal('ai_marketing')
    ),
    programId: v.optional(v.id('loyaltyPrograms')),
    title: v.optional(v.string()),
    messageTitle: v.optional(v.string()),
    messageBody: v.optional(v.string()),
    prompt: v.optional(v.string()),
    status: v.optional(
      v.union(v.literal('draft'), v.literal('scheduled'), v.literal('sent'))
    ),
    rules: v.optional(v.any()),
    channels: v.optional(v.array(v.string())),
    isActive: v.boolean(),
    createdAt: v.number(),
    updatedAt: v.number(),
  }).index('by_businessId', ['businessId']),

  subscriptions: defineTable({
    businessId: v.id('businesses'),
    plan: v.union(
      v.literal('starter'),
      v.literal('pro'),
      v.literal('unlimited')
    ),
    status: v.union(
      v.literal('active'),
      v.literal('trialing'),
      v.literal('past_due'),
      v.literal('canceled')
    ),
    period: v.union(v.literal('monthly'), v.literal('yearly')),
    startAt: v.number(),
    endAt: v.optional(v.union(v.number(), v.null())),
    provider: v.union(
      v.literal('revenuecat'),
      v.literal('mock'),
      v.literal('manual')
    ),
    providerSubscriptionId: v.optional(v.string()),
    createdAt: v.number(),
    updatedAt: v.number(),
  })
    .index('by_businessId', ['businessId'])
    .index('by_providerSubscriptionId', ['providerSubscriptionId']),

  messageLog: defineTable({
    businessId: v.id('businesses'),
    campaignId: v.optional(v.id('campaigns')),
    toUserId: v.id('users'),
    channel: v.string(),
    status: v.string(),
    providerMessageId: v.optional(v.string()),
    readAt: v.optional(v.number()),
    createdAt: v.number(),
  })
    .index('by_businessId', ['businessId'])
    .index('by_campaignId', ['campaignId'])
    .index('by_campaignId_toUserId', ['campaignId', 'toUserId'])
    .index('by_toUserId', ['toUserId'])
    .index('by_toUserId_createdAt', ['toUserId', 'createdAt'])
    .index('by_createdAt', ['createdAt']),

  supportRequests: defineTable({
    userId: v.id('users'),
    name: v.string(),
    email: v.optional(v.string()),
    phone: v.optional(v.string()),
    message: v.string(),
    status: v.union(v.literal('new'), v.literal('handled')),
    createdAt: v.number(),
    updatedAt: v.number(),
  })
    .index('by_userId', ['userId'])
    .index('by_status', ['status'])
    .index('by_createdAt', ['createdAt']),

  apiClients: defineTable({
    businessId: v.id('businesses'),
    name: v.string(),
    isActive: v.boolean(),
    createdAt: v.number(),
  }).index('by_businessId', ['businessId']),

  apiKeys: defineTable({
    clientId: v.id('apiClients'),
    hashedKey: v.string(),
    scopes: v.array(v.string()),
    lastUsedAt: v.optional(v.number()),
    createdAt: v.number(),
  }).index('by_clientId', ['clientId']),

  staffInvites: defineTable({
    businessId: v.id('businesses'),
    invitedEmail: v.string(),
    invitedUserId: v.optional(v.id('users')),
    invitedByUserId: v.id('users'),
    inviteCode: v.string(),
    status: v.union(
      v.literal('pending'),
      v.literal('accepted'),
      v.literal('expired'),
      v.literal('cancelled')
    ),
    expiresAt: v.number(),
    createdAt: v.number(),
    acceptedAt: v.optional(v.number()),
  })
    .index('by_inviteCode', ['inviteCode'])
    .index('by_businessId', ['businessId'])
    .index('by_invitedEmail', ['invitedEmail'])
    .index('by_invitedUserId', ['invitedUserId'])
    .index('by_invitedByUserId', ['invitedByUserId'])
    .index('by_status', ['status']),
});
