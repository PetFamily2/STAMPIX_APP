import { authTables } from '@convex-dev/auth/server';
import { defineSchema, defineTable } from 'convex/server';
import { v } from 'convex/values';

export default defineSchema({
  ...authTables,

  // -------------------------
  // Core (MVP + future-ready)
  // -------------------------
  users: defineTable({
    externalId: v.optional(v.string()),
    email: v.optional(v.string()),
    emailVerified: v.optional(v.boolean()),
    phone: v.optional(v.string()),
    fullName: v.optional(v.string()),
    avatarUrl: v.optional(v.string()),
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
    ),
    isActive: v.boolean(),
    createdAt: v.number(),
    updatedAt: v.number(),
  })
    .index('by_externalId', ['externalId'])
    .index('by_email', ['email'])
    .index('by_isActive', ['isActive'])
    .index('by_userType', ['userType']),

  businesses: defineTable({
    ownerUserId: v.id('users'),
    externalId: v.string(),
    name: v.string(),
    logoUrl: v.optional(v.string()),
    colors: v.optional(v.any()),
    isActive: v.boolean(),
    createdAt: v.number(),
    updatedAt: v.number(),
  })
    .index('by_ownerUserId', ['ownerUserId'])
    .index('by_externalId', ['externalId'])
    .index('by_isActive', ['isActive']),

  businessStaff: defineTable({
    businessId: v.id('businesses'),
    userId: v.id('users'),
    staffRole: v.union(v.literal('owner'), v.literal('staff')),
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
    .index('by_businessProgram', ['businessId', 'programId'])
    .index('by_customerId', ['customerId']),

  // -------------------------
  // Future scaffolds (no MVP UI)
  // -------------------------
  campaigns: defineTable({
    businessId: v.id('businesses'),
    type: v.union(
      v.literal('birthday'),
      v.literal('winback'),
      v.literal('promo')
    ),
    rules: v.optional(v.any()),
    channels: v.optional(v.array(v.string())),
    isActive: v.boolean(),
    createdAt: v.number(),
    updatedAt: v.number(),
  }).index('by_businessId', ['businessId']),

  messageLog: defineTable({
    businessId: v.id('businesses'),
    campaignId: v.optional(v.id('campaigns')),
    toUserId: v.id('users'),
    channel: v.string(),
    status: v.string(),
    providerMessageId: v.optional(v.string()),
    createdAt: v.number(),
  })
    .index('by_businessId', ['businessId'])
    .index('by_toUserId', ['toUserId'])
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
});
