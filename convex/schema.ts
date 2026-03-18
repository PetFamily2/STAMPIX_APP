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
    activeBusinessId: v.optional(v.id('businesses')),
    avatarUrl: v.optional(v.string()),
    marketingOptIn: v.optional(v.boolean()),
    marketingOptInAt: v.optional(v.number()),
    birthdayMonth: v.optional(v.number()),
    birthdayDay: v.optional(v.number()),
    anniversaryMonth: v.optional(v.number()),
    anniversaryDay: v.optional(v.number()),
    userType: v.optional(v.union(v.literal('free'), v.literal('paid'))),
    subscriptionPlan: v.optional(
      v.union(v.literal('starter'), v.literal('pro'), v.literal('premium'))
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
    shortDescription: v.optional(v.string()),
    businessPhone: v.optional(v.string()),
    serviceTypes: v.optional(v.array(v.string())),
    serviceTags: v.optional(v.array(v.string())),
    onboardingSnapshot: v.optional(
      v.object({
        discoverySource: v.optional(v.string()),
        reason: v.optional(v.string()),
        usageAreas: v.optional(v.array(v.string())),
        ownerAgeRange: v.optional(v.string()),
        collectedAt: v.optional(v.number()),
      })
    ),
    aiProfile: v.optional(
      v.object({
        language: v.optional(v.union(v.literal('he'), v.literal('en'))),
        brandStyle: v.optional(
          v.union(
            v.literal('friendly'),
            v.literal('professional'),
            v.literal('premium'),
            v.literal('playful'),
            v.literal('minimal')
          )
        ),
        priceRange: v.optional(
          v.union(
            v.literal('low'),
            v.literal('mid'),
            v.literal('high'),
            v.literal('unknown')
          )
        ),
        businessModel: v.optional(
          v.union(
            v.literal('service'),
            v.literal('product'),
            v.literal('mixed')
          )
        ),
        customerCycleDays: v.optional(v.number()),
        businessTypeOverride: v.optional(v.string()),
        serviceNameOverride: v.optional(v.string()),
        rewardTypeOverride: v.optional(
          v.union(
            v.literal('free_item'),
            v.literal('free_service'),
            v.literal('discount'),
            v.literal('upgrade'),
            v.literal('bonus')
          )
        ),
        updatedAt: v.number(),
      })
    ),
    logoUrl: v.optional(v.string()),
    colors: v.optional(v.any()),
    subscriptionPlan: v.optional(
      v.union(v.literal('starter'), v.literal('pro'), v.literal('premium'))
    ),
    subscriptionStatus: v.optional(
      v.union(
        v.literal('active'),
        v.literal('trialing'),
        v.literal('past_due'),
        v.literal('canceled'),
        v.literal('inactive')
      )
    ),
    subscriptionStartAt: v.optional(v.union(v.number(), v.null())),
    subscriptionEndAt: v.optional(v.union(v.number(), v.null())),
    billingPeriod: v.optional(
      v.union(v.literal('monthly'), v.literal('yearly'), v.null())
    ),
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
    status: v.optional(
      v.union(v.literal('active'), v.literal('suspended'), v.literal('removed'))
    ),
    isActive: v.boolean(),
    joinedAt: v.optional(v.number()),
    statusChangedAt: v.optional(v.number()),
    statusChangedByUserId: v.optional(v.id('users')),
    roleChangedAt: v.optional(v.number()),
    roleChangedByUserId: v.optional(v.id('users')),
    removedAt: v.optional(v.number()),
    removedByUserId: v.optional(v.id('users')),
    lastSeenAt: v.optional(v.number()),
    createdAt: v.number(),
    updatedAt: v.optional(v.number()),
  })
    .index('by_businessId', ['businessId'])
    .index('by_userId', ['userId'])
    .index('by_businessId_userId', ['businessId', 'userId'])
    .index('by_businessId_status', ['businessId', 'status']),

  loyaltyPrograms: defineTable({
    businessId: v.id('businesses'),
    status: v.optional(
      v.union(v.literal('draft'), v.literal('active'), v.literal('archived'))
    ),
    publishedAt: v.optional(v.number()),
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
    posSortOrder: v.optional(v.number()),
    allowPosEnroll: v.optional(v.boolean()),
    lastStructureChangedAt: v.optional(v.number()),
    structureSignature: v.optional(v.string()),
    isArchived: v.optional(v.boolean()),
    archivedAt: v.optional(v.number()),
    archivedByUserId: v.optional(v.id('users')),
    isActive: v.boolean(),
    createdAt: v.number(),
    updatedAt: v.number(),
  })
    .index('by_businessId', ['businessId'])
    .index('by_businessId_status', ['businessId', 'status'])
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
    .index('by_programId', ['programId'])
    .index('by_businessId', ['businessId'])
    .index('by_businessId_createdAt', ['businessId', 'createdAt'])
    .index('by_userId_businessId', ['userId', 'businessId'])
    .index('by_userId_programId', ['userId', 'programId']),

  events: defineTable({
    type: v.string(), // e.g. STAMP_ADDED | REWARD_REDEEMED
    businessId: v.id('businesses'),
    programId: v.id('loyaltyPrograms'),
    membershipId: v.optional(v.id('memberships')),
    actorUserId: v.id('users'),
    customerUserId: v.id('users'),
    source: v.optional(
      v.union(
        v.literal('scanner_commit'),
        v.literal('scanner_undo'),
        v.literal('manual_adjustment')
      )
    ),
    revertsEventId: v.optional(v.id('events')),
    reversalEventId: v.optional(v.id('events')),
    reasonCode: v.optional(v.string()),
    reasonNote: v.optional(v.string()),
    scannerRuntimeSessionId: v.optional(v.string()),
    deviceId: v.optional(v.string()),
    membershipStateBefore: v.optional(
      v.object({
        currentStamps: v.number(),
        lastStampAt: v.optional(v.number()),
        isActive: v.optional(v.boolean()),
      })
    ),
    membershipStateAfter: v.optional(
      v.object({
        currentStamps: v.number(),
        lastStampAt: v.optional(v.number()),
        isActive: v.optional(v.boolean()),
      })
    ),
    metadata: v.optional(v.any()),
    createdAt: v.number(),
  })
    .index('by_businessId', ['businessId'])
    .index('by_businessId_createdAt', ['businessId', 'createdAt'])
    .index('by_businessId_customerUserId_createdAt', [
      'businessId',
      'customerUserId',
      'createdAt',
    ])
    .index('by_actorUserId', ['actorUserId'])
    .index('by_customerUserId', ['customerUserId'])
    .index('by_membershipId_createdAt', ['membershipId', 'createdAt'])
    .index('by_revertsEventId', ['revertsEventId'])
    .index('by_reversalEventId', ['reversalEventId'])
    .index('by_scannerRuntimeSessionId_createdAt', [
      'scannerRuntimeSessionId',
      'createdAt',
    ])
    .index('by_createdAt', ['createdAt']),

  scanSessions: defineTable({
    businessId: v.id('businesses'),
    programId: v.id('loyaltyPrograms'),
    customerId: v.id('users'),
    actorUserId: v.id('users'),
    scannerRuntimeSessionId: v.optional(v.string()),
    deviceId: v.optional(v.string()),
    actionType: v.union(v.literal('stamp'), v.literal('redeem')),
    tokenVersion: v.number(),
    tokenSignature: v.string(),
    tokenNonce: v.optional(v.string()),
    tokenIssuedAt: v.number(),
    tokenExpiresAt: v.number(),
    resolvedMembershipId: v.optional(v.id('memberships')),
    status: v.union(
      v.literal('ready'),
      v.literal('committed'),
      v.literal('failed_business'),
      v.literal('expired')
    ),
    failedCode: v.optional(v.string()),
    result: v.optional(v.any()),
    createdAt: v.number(),
    expiresAt: v.number(),
    committedAt: v.optional(v.number()),
  })
    .index('by_businessId', ['businessId'])
    .index('by_customerId', ['customerId'])
    .index('by_actorUserId', ['actorUserId'])
    .index('by_scannerRuntimeSessionId', ['scannerRuntimeSessionId'])
    .index('by_scannerRuntimeSessionId_createdAt', [
      'scannerRuntimeSessionId',
      'createdAt',
    ])
    .index('by_tokenNonce', ['tokenNonce'])
    .index('by_status', ['status']),

  scanTokenEvents: defineTable({
    businessId: v.id('businesses'),
    programId: v.id('loyaltyPrograms'),
    customerId: v.id('users'),
    signature: v.string(),
    nonce: v.optional(v.string()),
    tokenVersion: v.optional(v.number()),
    actionType: v.optional(v.union(v.literal('stamp'), v.literal('redeem'))),
    membershipId: v.optional(v.id('memberships')),
    actorUserId: v.optional(v.id('users')),
    scanSessionId: v.optional(v.id('scanSessions')),
    tokenTimestamp: v.number(),
    consumedAt: v.optional(v.number()),
    createdAt: v.number(),
  })
    .index('by_signature', ['signature'])
    .index('by_nonce', ['nonce'])
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
      v.literal('ai_marketing'),
      v.literal('ai_retention'),
      v.literal('retention_action')
    ),
    programId: v.optional(v.id('loyaltyPrograms')),
    title: v.optional(v.string()),
    messageTitle: v.optional(v.string()),
    messageBody: v.optional(v.string()),
    prompt: v.optional(v.string()),
    status: v.optional(
      v.union(
        v.literal('draft'),
        v.literal('active'),
        v.literal('paused'),
        v.literal('completed'),
        v.literal('archived')
      )
    ),
    rules: v.optional(v.any()),
    channels: v.optional(v.array(v.string())),
    automationEnabled: v.optional(v.boolean()),
    isActive: v.boolean(),
    archivedAt: v.optional(v.number()),
    archivedByUserId: v.optional(v.id('users')),
    createdAt: v.number(),
    updatedAt: v.number(),
  })
    .index('by_businessId', ['businessId'])
    .index('by_businessId_createdAt', ['businessId', 'createdAt'])
    .index('by_automationEnabled', ['automationEnabled']),

  campaignRuns: defineTable({
    businessId: v.id('businesses'),
    campaignId: v.id('campaigns'),
    programId: v.optional(v.id('loyaltyPrograms')),
    campaignType: v.string(),
    sentAt: v.number(),
    targetedCount: v.number(),
    deliveredCount: v.number(),
    lastDeliveryAt: v.optional(v.number()),
    summaryReadyAt: v.optional(v.number()),
    summaryWindowEndsAt: v.optional(v.number()),
    returnedCustomers14d: v.optional(v.number()),
    rewardRedemptions14d: v.optional(v.number()),
    summaryStatus: v.union(
      v.literal('pending'),
      v.literal('ready'),
      v.literal('summarized')
    ),
    summaryGeneratedAt: v.optional(v.number()),
    createdAt: v.number(),
    updatedAt: v.number(),
  })
    .index('by_businessId', ['businessId'])
    .index('by_campaignId', ['campaignId'])
    .index('by_businessId_sentAt', ['businessId', 'sentAt'])
    .index('by_businessId_summaryStatus', ['businessId', 'summaryStatus']),

  subscriptions: defineTable({
    businessId: v.id('businesses'),
    plan: v.union(v.literal('starter'), v.literal('pro'), v.literal('premium')),
    status: v.union(
      v.literal('active'),
      v.literal('trialing'),
      v.literal('past_due'),
      v.literal('canceled'),
      v.literal('inactive')
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
    .index('by_businessId_createdAt', ['businessId', 'createdAt'])
    .index('by_campaignId', ['campaignId'])
    .index('by_campaignId_toUserId', ['campaignId', 'toUserId'])
    .index('by_toUserId', ['toUserId'])
    .index('by_toUserId_createdAt', ['toUserId', 'createdAt'])
    .index('by_createdAt', ['createdAt']),

  aiBusinessSnapshots: defineTable({
    businessId: v.id('businesses'),
    scannedAt: v.number(),
    enoughData: v.boolean(),
    enoughDataReasons: v.array(v.string()),
    topBusinessState: v.optional(v.string()),
    primaryProgramId: v.optional(v.id('loyaltyPrograms')),
    stateHash: v.string(),
    snapshot: v.any(),
    createdAt: v.number(),
  })
    .index('by_businessId', ['businessId'])
    .index('by_businessId_createdAt', ['businessId', 'createdAt']),

  aiRecommendations: defineTable({
    businessId: v.id('businesses'),
    snapshotId: v.optional(v.id('aiBusinessSnapshots')),
    stateKey: v.string(),
    sectionTitle: v.optional(v.string()),
    layer: v.optional(
      v.union(
        v.literal('foundation'),
        v.literal('activation'),
        v.literal('optimization'),
        v.literal('performance')
      )
    ),
    statusTone: v.optional(
      v.union(
        v.literal('setup_needed'),
        v.literal('opportunity'),
        v.literal('stable'),
        v.literal('watch'),
        v.literal('wait')
      )
    ),
    signalQuality: v.optional(
      v.union(
        v.literal('setup_only'),
        v.literal('early_signal'),
        v.literal('directional_signal'),
        v.literal('performance_ready')
      )
    ),
    goal: v.union(
      v.literal('bring_back_customers'),
      v.literal('push_to_reward'),
      v.literal('general_engagement'),
      v.literal('campaign_summary'),
      v.literal('business_insight')
    ),
    source: v.union(v.literal('fixed'), v.literal('cache'), v.literal('ai')),
    action: v.union(
      v.literal('show_fixed'),
      v.literal('call_ai'),
      v.literal('defer'),
      v.literal('suppress')
    ),
    type: v.union(
      v.literal('campaign_message'),
      v.literal('business_insight'),
      v.literal('campaign_summary'),
      v.literal('recommendation_explanation')
    ),
    title: v.string(),
    message: v.string(),
    body: v.optional(v.string()),
    supportingText: v.optional(v.string()),
    evidenceTags: v.optional(v.array(v.string())),
    packageNote: v.optional(v.string()),
    showNoCtaReason: v.optional(v.boolean()),
    ctaType: v.union(
      v.literal('open_draft'),
      v.literal('view_insight'),
      v.literal('view_summary'),
      v.literal('view_reason'),
      v.literal('none')
    ),
    ctaLabel: v.string(),
    primaryCta: v.optional(
      v.object({
        kind: v.union(
          v.literal('open_cards'),
          v.literal('open_profile'),
          v.literal('open_campaign_draft'),
          v.literal('view_customers'),
          v.literal('view_analytics'),
          v.literal('view_subscription'),
          v.literal('none')
        ),
        label: v.string(),
        draftType: v.optional(
          v.union(
            v.literal('welcome'),
            v.literal('winback'),
            v.literal('promo')
          )
        ),
        customerFilter: v.optional(
          v.union(
            v.literal('near_reward'),
            v.literal('at_risk'),
            v.literal('new_customers')
          )
        ),
        routeTab: v.optional(v.string()),
        highlightTarget: v.optional(v.string()),
      })
    ),
    dedupeKey: v.string(),
    promptHash: v.optional(v.string()),
    cacheKey: v.optional(v.string()),
    relatedCampaignRunId: v.optional(v.id('campaignRuns')),
    guardrailReason: v.optional(v.string()),
    createdAt: v.number(),
    expiresAt: v.optional(v.number()),
    shownAt: v.optional(v.number()),
    consumedAt: v.optional(v.number()),
  })
    .index('by_businessId', ['businessId'])
    .index('by_businessId_createdAt', ['businessId', 'createdAt'])
    .index('by_businessId_dedupeKey', ['businessId', 'dedupeKey']),

  aiGenerationCache: defineTable({
    cacheKey: v.string(),
    promptHash: v.string(),
    goal: v.union(
      v.literal('bring_back_customers'),
      v.literal('push_to_reward'),
      v.literal('general_engagement'),
      v.literal('campaign_summary'),
      v.literal('business_insight')
    ),
    model: v.string(),
    responseJson: v.object({
      type: v.string(),
      title: v.string(),
      message: v.string(),
    }),
    inputSignature: v.string(),
    createdAt: v.number(),
    expiresAt: v.number(),
    lastUsedAt: v.optional(v.number()),
  })
    .index('by_cacheKey', ['cacheKey'])
    .index('by_expiresAt', ['expiresAt']),

  aiUsageLedger: defineTable({
    businessId: v.id('businesses'),
    monthKey: v.string(),
    requestType: v.union(
      v.literal('campaign_message'),
      v.literal('business_insight'),
      v.literal('campaign_summary'),
      v.literal('recommendation_explanation')
    ),
    model: v.string(),
    cacheHit: v.boolean(),
    status: v.union(v.literal('success'), v.literal('failed')),
    inputTokens: v.number(),
    outputTokens: v.number(),
    costEstimate: v.number(),
    recommendationId: v.optional(v.id('aiRecommendations')),
    createdAt: v.number(),
  })
    .index('by_businessId', ['businessId'])
    .index('by_businessId_monthKey', ['businessId', 'monthKey'])
    .index('by_createdAt', ['createdAt']),

  segments: defineTable({
    businessId: v.id('businesses'),
    name: v.string(),
    rules: v.object({
      match: v.union(v.literal('all'), v.literal('any')),
      conditions: v.array(
        v.object({
          field: v.union(
            v.literal('lastVisitDaysAgo'),
            v.literal('visitCount'),
            v.literal('loyaltyProgress'),
            v.literal('customerStatus'),
            v.literal('joinedDaysAgo')
          ),
          operator: v.union(
            v.literal('gt'),
            v.literal('gte'),
            v.literal('lt'),
            v.literal('lte'),
            v.literal('eq')
          ),
          value: v.union(v.number(), v.string()),
        })
      ),
    }),
    createdAt: v.number(),
    updatedAt: v.number(),
  })
    .index('by_businessId', ['businessId'])
    .index('by_businessId_name', ['businessId', 'name']),

  pushTokens: defineTable({
    userId: v.id('users'),
    token: v.string(),
    platform: v.union(v.literal('ios'), v.literal('android')),
    isActive: v.boolean(),
    createdAt: v.number(),
    updatedAt: v.number(),
    lastRegisteredAt: v.number(),
  })
    .index('by_userId', ['userId'])
    .index('by_token', ['token']),

  pushDeliveryLog: defineTable({
    businessId: v.id('businesses'),
    campaignId: v.optional(v.id('campaigns')),
    toUserId: v.id('users'),
    token: v.optional(v.string()),
    status: v.string(),
    errorMessage: v.optional(v.string()),
    createdAt: v.number(),
  })
    .index('by_businessId', ['businessId'])
    .index('by_campaignId', ['campaignId'])
    .index('by_toUserId', ['toUserId'])
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
    targetRole: v.optional(v.union(v.literal('manager'), v.literal('staff'))),
    inviteCode: v.string(),
    status: v.union(
      v.literal('pending'),
      v.literal('accepted'),
      v.literal('expired'),
      v.literal('cancelled')
    ),
    expiresAt: v.number(),
    createdAt: v.number(),
    cancelledAt: v.optional(v.number()),
    cancelledByUserId: v.optional(v.id('users')),
    acceptedAt: v.optional(v.number()),
    acceptedByUserId: v.optional(v.id('users')),
  })
    .index('by_inviteCode', ['inviteCode'])
    .index('by_businessId', ['businessId'])
    .index('by_invitedEmail', ['invitedEmail'])
    .index('by_invitedUserId', ['invitedUserId'])
    .index('by_invitedByUserId', ['invitedByUserId'])
    .index('by_status', ['status'])
    .index('by_businessId_invitedEmail_status', [
      'businessId',
      'invitedEmail',
      'status',
    ])
    .index('by_businessId_status', ['businessId', 'status']),

  staffEvents: defineTable({
    businessId: v.id('businesses'),
    actorUserId: v.optional(v.id('users')),
    targetUserId: v.optional(v.id('users')),
    targetInviteId: v.optional(v.id('staffInvites')),
    eventType: v.union(
      v.literal('invite_created'),
      v.literal('invite_cancelled'),
      v.literal('invite_accepted'),
      v.literal('invite_expired'),
      v.literal('role_changed'),
      v.literal('suspended'),
      v.literal('reactivated'),
      v.literal('removed'),
      v.literal('auto_disabled_by_plan'),
      v.literal('auto_invites_cancelled_by_plan'),
      v.literal('reinvited_after_removal')
    ),
    fromRole: v.optional(
      v.union(v.literal('owner'), v.literal('manager'), v.literal('staff'))
    ),
    toRole: v.optional(
      v.union(v.literal('owner'), v.literal('manager'), v.literal('staff'))
    ),
    fromStatus: v.optional(
      v.union(v.literal('active'), v.literal('suspended'), v.literal('removed'))
    ),
    toStatus: v.optional(
      v.union(v.literal('active'), v.literal('suspended'), v.literal('removed'))
    ),
    reasonCode: v.optional(v.string()),
    createdAt: v.number(),
  })
    .index('by_businessId', ['businessId'])
    .index('by_targetUserId', ['targetUserId'])
    .index('by_targetInviteId', ['targetInviteId']),
});
