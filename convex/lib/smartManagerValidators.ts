import { type Infer, type Validator, v } from 'convex/values';

const businessCapabilityValidator = v.union(
  v.literal('access_dashboard'),
  v.literal('access_customers'),
  v.literal('access_campaigns'),
  v.literal('create_campaigns'),
  v.literal('edit_campaigns'),
  v.literal('activate_send_campaigns'),
  v.literal('delete_campaigns'),
  v.literal('access_analytics'),
  v.literal('export_reports'),
  v.literal('view_usage_quota'),
  v.literal('view_billing_state'),
  v.literal('manage_subscription'),
  v.literal('manage_team'),
  v.literal('edit_loyalty_cards'),
  v.literal('view_settings'),
  v.literal('edit_business_profile'),
  v.literal('scanner_access'),
  v.literal('view_customer_state_tier')
);

const knownFact = <V extends Validator<any, 'required', any>>(value: V) =>
  v.object({
    state: v.literal('known'),
    value,
    observedAt: v.number(),
  });

const unavailableFactValidator = v.union(
  v.object({
    state: v.literal('unknown'),
    reasonCode: v.string(),
  }),
  v.object({
    state: v.literal('restricted'),
    requiredCapability: businessCapabilityValidator,
  })
);

const fact = <V extends Validator<any, 'required', any>>(value: V) =>
  v.union(knownFact(value), unavailableFactValidator);

const recommendationActorCapabilitiesValidator = v.object({
  accessDashboard: v.boolean(),
  accessCustomers: v.boolean(),
  accessCampaigns: v.boolean(),
  createCampaigns: v.boolean(),
  editCampaigns: v.boolean(),
  activateSendCampaigns: v.boolean(),
  viewUsageQuota: v.boolean(),
  viewBillingState: v.boolean(),
  manageSubscription: v.boolean(),
  manageTeam: v.boolean(),
  editLoyaltyCards: v.boolean(),
  editBusinessProfile: v.boolean(),
});

const ownerCapabilityMapValidator = v.object({
  access_dashboard: v.boolean(),
  access_customers: v.boolean(),
  access_campaigns: v.boolean(),
  create_campaigns: v.boolean(),
  edit_campaigns: v.boolean(),
  activate_send_campaigns: v.boolean(),
  delete_campaigns: v.boolean(),
  access_analytics: v.boolean(),
  export_reports: v.boolean(),
  view_usage_quota: v.boolean(),
  view_billing_state: v.boolean(),
  manage_subscription: v.boolean(),
  manage_team: v.boolean(),
  edit_loyalty_cards: v.boolean(),
  view_settings: v.boolean(),
  edit_business_profile: v.boolean(),
  scanner_access: v.boolean(),
  view_customer_state_tier: v.boolean(),
});

export const smartManagerPolicyConfigValidator = v.object({
  recipientContactCooldownDays: v.number(),
  equivalentActionCooldownDays: v.number(),
  campaignSpacingHours: v.number(),
  allowedSendWindow: v.object({
    startHourLocal: v.number(),
    endHourLocal: v.number(),
    defaultSuggestionHourLocal: v.number(),
  }),
  recipientCeiling: v.number(),
  aiGeneration: v.object({
    minimumAudienceForFreshGeneration: v.number(),
  }),
  actionExpiryHours: v.number(),
  approvalExpiryHours: v.number(),
  delivery: v.object({
    batchSize: v.number(),
    leaseMinutes: v.number(),
    maximumAttempts: v.number(),
    retryBackoffMinutes: v.array(v.number()),
  }),
  outcomeWindowDays: v.number(),
  evaluationRefreshHours: v.number(),
  interactions: v.object({
    setup: v.object({
      snoozeDays: v.number(),
      dismissal: v.union(
        v.object({ mode: v.literal('evidence_bound') }),
        v.object({ mode: v.literal('timed'), days: v.number() })
      ),
    }),
    operational: v.object({
      snoozeDays: v.number(),
      dismissal: v.union(
        v.object({ mode: v.literal('evidence_bound') }),
        v.object({ mode: v.literal('timed'), days: v.number() })
      ),
    }),
    growth: v.object({
      snoozeDays: v.number(),
      dismissal: v.union(
        v.object({ mode: v.literal('evidence_bound') }),
        v.object({ mode: v.literal('timed'), days: v.number() })
      ),
    }),
    default: v.object({
      snoozeDays: v.number(),
      dismissal: v.union(
        v.object({ mode: v.literal('evidence_bound') }),
        v.object({ mode: v.literal('timed'), days: v.number() })
      ),
    }),
  }),
  celebration: v.object({
    autoPresentHours: v.number(),
    reopenDays: v.number(),
    retentionDays: v.number(),
  }),
});

export const smartManagerPolicyEnvelopeValidator = v.object({
  version: v.string(),
  schemaVersion: v.number(),
  policyHash: v.string(),
  config: smartManagerPolicyConfigValidator,
});

export const smartManagerFactEnvelopeValidator = v.object({
  schemaVersion: v.number(),
  businessId: v.id('businesses'),
  generatedAt: v.number(),
  actor: v.object({
    role: v.union(v.literal('owner'), v.literal('manager'), v.literal('staff')),
    capabilities: recommendationActorCapabilitiesValidator,
  }),
  facts: v.object({
    businessProfile: fact(
      v.object({
        isComplete: v.boolean(),
        missingFieldIds: v.array(v.string()),
      })
    ),
    address: fact(v.object({ isComplete: v.boolean() })),
    logo: fact(v.object({ hasResolvableLogo: v.boolean() })),
    programs: fact(
      v.object({
        activeCount: v.number(),
        draftCount: v.number(),
        archivedCount: v.number(),
        firstActiveProgramId: v.union(v.id('loyaltyPrograms'), v.null()),
        firstDraftProgramId: v.union(v.id('loyaltyPrograms'), v.null()),
      })
    ),
    customers: fact(v.object({ uniqueActiveCustomerCount: v.number() })),
    campaigns: fact(
      v.object({
        totalNonarchivedCampaigns: v.number(),
        draftCount: v.number(),
        scheduledCount: v.number(),
        recurringCount: v.number(),
        pausedCount: v.number(),
        completedCount: v.number(),
        inconsistentCount: v.number(),
        meaningfullyActiveCount: v.number(),
        firstDraftCampaignId: v.union(v.id('campaigns'), v.null()),
        firstPausedCampaignId: v.union(v.id('campaigns'), v.null()),
        firstScheduledCampaignId: v.union(v.id('campaigns'), v.null()),
        firstRecurringCampaignId: v.union(v.id('campaigns'), v.null()),
        nextScheduled: v.union(
          v.null(),
          v.object({
            campaignId: v.id('campaigns'),
            timestamp: v.number(),
          })
        ),
        lifecycleSourceVersion: v.string(),
      })
    ),
    campaignQuota: fact(
      v.object({
        campaignDefinitionUsage: v.number(),
        campaignDefinitionLimit: v.number(),
        remainingDefinitions: v.number(),
        isAtOrAboveLimit: v.boolean(),
      })
    ),
    team: fact(
      v.object({
        activeNonOwnerStaffCount: v.number(),
        unexpiredPendingInvitationCount: v.number(),
      })
    ),
    subscription: fact(
      v.object({
        plan: v.union(
          v.literal('starter'),
          v.literal('pro'),
          v.literal('premium')
        ),
        status: v.union(
          v.literal('active'),
          v.literal('trialing'),
          v.literal('past_due'),
          v.literal('canceled'),
          v.literal('inactive'),
          v.literal('unknown')
        ),
      })
    ),
    customerLifecycleSegments: v.object({
      nearReward: fact(
        v.object({ count: v.number(), evidenceFingerprint: v.string() })
      ),
      inactive: fact(
        v.object({ count: v.number(), evidenceFingerprint: v.string() })
      ),
    }),
  }),
});

export type SmartManagerFactEnvelope = Infer<
  typeof smartManagerFactEnvelopeValidator
>;

export const smartManagerCapabilityAvailabilityValidator = v.object({
  customerFacts: v.union(v.literal('known'), v.literal('unknown')),
  customerLifecycleFacts: v.union(v.literal('known'), v.literal('unknown')),
  campaignFacts: v.union(v.literal('known'), v.literal('unknown')),
  programFacts: v.union(v.literal('known'), v.literal('unknown')),
  teamFacts: v.union(v.literal('known'), v.literal('unknown')),
  entitlementFacts: v.union(v.literal('known'), v.literal('unknown')),
  ownerCapabilities: ownerCapabilityMapValidator,
});

const recommendationAccessValidator = v.union(
  v.object({ state: v.literal('allowed') }),
  v.object({
    state: v.literal('restricted'),
    reasonCode: v.union(
      v.literal('CAPABILITY_REQUIRED'),
      v.literal('ENTITLEMENT_REQUIRED')
    ),
  }),
  v.object({
    state: v.literal('unavailable'),
    reasonCode: v.literal('FACT_UNAVAILABLE'),
  })
);

const recommendationActionValidator = v.union(
  v.object({ type: v.literal('open_business_address') }),
  v.object({
    type: v.literal('open_business_profile'),
    fieldId: v.optional(v.string()),
  }),
  v.object({ type: v.literal('open_programs') }),
  v.object({ type: v.literal('open_program'), programId: v.string() }),
  v.object({ type: v.literal('open_campaigns') }),
  v.object({ type: v.literal('open_campaign'), campaignId: v.string() }),
  v.object({
    type: v.literal('open_customers_segment'),
    segment: v.union(v.literal('at_risk'), v.literal('near_reward')),
  }),
  v.object({ type: v.literal('open_team_pending') }),
  v.object({
    type: v.literal('open_subscription'),
    limitKey: v.optional(v.literal('campaigns')),
  })
);

export const smartManagerDecisionSummaryValidator = v.object({
  stableId: v.string(),
  category: v.union(
    v.literal('operational'),
    v.literal('setup'),
    v.literal('retention'),
    v.literal('growth'),
    v.literal('informational')
  ),
  priority: v.number(),
  placement: v.optional(v.union(v.literal('primary'), v.literal('secondary'))),
  title: v.optional(v.string()),
  reason: v.optional(v.string()),
  ctaLabel: v.optional(v.string()),
  action: v.optional(recommendationActionValidator),
  entityType: v.optional(
    v.union(v.literal('program'), v.literal('campaign'), v.null())
  ),
  entityId: v.optional(v.union(v.string(), v.null())),
  guideId: v.optional(
    v.union(
      v.literal('subscription-recover'),
      v.literal('address-resolve'),
      v.literal('profile-complete'),
      v.literal('program-create'),
      v.literal('program-publish'),
      v.literal('campaign-create'),
      v.literal('campaign-publish'),
      v.literal('campaign-resume'),
      v.literal('campaign-schedule-review'),
      v.literal('inactive-review'),
      v.literal('near-reward'),
      v.literal('team-pending'),
      v.literal('quota-review')
    )
  ),
  tone: v.optional(
    v.union(
      v.literal('blocker'),
      v.literal('setup'),
      v.literal('growth'),
      v.literal('retention'),
      v.literal('operational'),
      v.literal('informational')
    )
  ),
  evidenceFingerprint: v.string(),
  evidenceObservedAt: v.number(),
  count: v.union(v.number(), v.null()),
  requiredCapabilities: v.optional(v.array(businessCapabilityValidator)),
  access: recommendationAccessValidator,
});

const nullableString = v.union(v.string(), v.null());
const nullableNumber = v.union(v.number(), v.null());
const nullableBoolean = v.union(v.boolean(), v.null());

const representativeUnavailableFactValidator = v.object({
  state: v.union(v.literal('unknown'), v.literal('restricted')),
  reasonCode: nullableString,
  requiredCapability: v.union(businessCapabilityValidator, v.null()),
});

export const smartManagerRepresentativeFactSummaryValidator = v.object({
  businessProfile: v.union(
    v.object({
      state: v.literal('known'),
      isComplete: nullableBoolean,
      missingFieldIds: v.union(v.array(v.string()), v.null()),
    }),
    representativeUnavailableFactValidator
  ),
  address: v.union(
    v.object({
      state: v.literal('known'),
      isComplete: nullableBoolean,
    }),
    representativeUnavailableFactValidator
  ),
  logo: v.union(
    v.object({
      state: v.literal('known'),
      hasResolvableLogo: nullableBoolean,
    }),
    representativeUnavailableFactValidator
  ),
  programs: v.union(
    v.object({
      state: v.literal('known'),
      activeCount: nullableNumber,
      draftCount: nullableNumber,
      archivedCount: nullableNumber,
    }),
    representativeUnavailableFactValidator
  ),
  customers: v.union(
    v.object({
      state: v.literal('known'),
      uniqueActiveCustomerCount: nullableNumber,
    }),
    representativeUnavailableFactValidator
  ),
  inactive: v.union(
    v.object({
      state: v.literal('known'),
      count: nullableNumber,
      evidenceFingerprint: nullableString,
    }),
    representativeUnavailableFactValidator
  ),
  nearReward: v.union(
    v.object({
      state: v.literal('known'),
      count: nullableNumber,
      evidenceFingerprint: nullableString,
    }),
    representativeUnavailableFactValidator
  ),
  campaigns: v.union(
    v.object({
      state: v.literal('known'),
      totalNonarchivedCampaigns: nullableNumber,
      draftCount: nullableNumber,
      scheduledCount: nullableNumber,
      recurringCount: nullableNumber,
      pausedCount: nullableNumber,
      inconsistentCount: nullableNumber,
      meaningfullyActiveCount: nullableNumber,
      lifecycleSourceVersion: nullableString,
    }),
    representativeUnavailableFactValidator
  ),
  campaignQuota: v.union(
    v.object({
      state: v.literal('known'),
      campaignDefinitionUsage: nullableNumber,
      campaignDefinitionLimit: nullableNumber,
      isAtOrAboveLimit: nullableBoolean,
    }),
    representativeUnavailableFactValidator
  ),
  team: v.union(
    v.object({
      state: v.literal('known'),
      activeNonOwnerStaffCount: nullableNumber,
      unexpiredPendingInvitationCount: nullableNumber,
    }),
    representativeUnavailableFactValidator
  ),
  subscription: v.union(
    v.object({
      state: v.literal('known'),
      plan: v.union(
        v.literal('starter'),
        v.literal('pro'),
        v.literal('premium'),
        v.null()
      ),
      status: v.union(
        v.literal('active'),
        v.literal('trialing'),
        v.literal('past_due'),
        v.literal('canceled'),
        v.literal('inactive'),
        v.literal('unknown'),
        v.null()
      ),
    }),
    representativeUnavailableFactValidator
  ),
  capabilities: recommendationActorCapabilitiesValidator,
});

export const smartManagerComparisonSummaryValidator = v.object({
  actorScope: v.optional(
    v.object({
      role: v.union(v.literal('owner'), v.literal('manager'), v.literal('staff')),
      capabilityScope: v.string(),
    })
  ),
  recommendations: v.array(smartManagerDecisionSummaryValidator),
  facts: smartManagerRepresentativeFactSummaryValidator,
});

export const smartManagerAuthorityModeValidator = v.literal(
  'shadow_parity_v1'
);

export const smartManagerPreparedActionStateValidator = v.union(
  v.literal('reviewable'),
  v.literal('superseded'),
  v.literal('stale')
);

export const smartManagerPreparedActionGenerationStateValidator = v.union(
  v.literal('not_requested'),
  v.literal('queued'),
  v.literal('running'),
  v.literal('succeeded'),
  v.literal('failed'),
  v.literal('stale_discarded')
);

export const smartManagerPreparedActionChannelValidator = v.union(
  v.literal('push'),
  v.literal('in_app')
);

export const smartManagerPreparedActionCopyProvenanceValidator = v.union(
  v.literal('deterministic'),
  v.literal('ai_fresh'),
  v.literal('ai_cache')
);

export const smartManagerAiFailureCodeValidator = v.union(
  v.literal('AI_ASSIST_NOT_AVAILABLE'),
  v.literal('AI_SUBSCRIPTION_INACTIVE'),
  v.literal('AI_FRESH_AUDIENCE_BELOW_MINIMUM'),
  v.literal('AI_MONTHLY_QUOTA_EXHAUSTED'),
  v.literal('AI_USAGE_EVIDENCE_UNAVAILABLE'),
  v.literal('AI_RATE_LIMITED'),
  v.literal('AI_GENERATION_SCHEDULING_FAILED'),
  v.literal('AI_CACHE_UNAVAILABLE'),
  v.literal('AI_PROVIDER_NOT_CONFIGURED'),
  v.literal('AI_PROVIDER_TIMEOUT'),
  v.literal('AI_PROVIDER_NETWORK_ERROR'),
  v.literal('AI_PROVIDER_HTTP_ERROR'),
  v.literal('AI_PROVIDER_EMPTY_RESPONSE'),
  v.literal('AI_PROVIDER_INVALID_JSON'),
  v.literal('AI_PROVIDER_SCHEMA_INVALID'),
  v.literal('AI_PROVIDER_LANGUAGE_INVALID'),
  v.literal('AI_PROVIDER_CONTENT_INVALID'),
  v.literal('COPY_REVISION_CONFLICT'),
  v.literal('ACTION_STALE'),
  v.literal('ACTION_EXPIRED'),
  v.literal('REEVALUATION_PENDING')
);

export const smartManagerPreparedCampaignDraftValidator = v.object({
  type: v.literal('winback'),
  family: v.literal('lifecycle'),
  opportunityType: v.literal('winback'),
  audienceSource: v.literal('automatic'),
  internalTitle: v.string(),
});

export const smartManagerPreparedChannelStrategyValidator = v.object({
  channelStrategyVersion: v.literal('push-with-in-app-fallback-v1'),
  preferredChannels: v.array(smartManagerPreparedActionChannelValidator),
  supportedChannels: v.array(smartManagerPreparedActionChannelValidator),
  campaignCompatibleChannels: v.array(
    smartManagerPreparedActionChannelValidator
  ),
  primaryIntent: v.literal('push'),
  fallbackIntent: v.literal('in_app'),
  reachabilityResolution: v.literal('deferred_to_batch_3'),
});

export const smartManagerAuditEventDetailValidator = v.union(
  v.object({
    factChanged: v.boolean(),
    comparisonChanged: v.boolean(),
    shadowStatus: v.union(
      v.literal('parity'),
      v.literal('mismatch'),
      v.literal('bounded_source_unavailable')
    ),
    differenceCount: v.number(),
  }),
  v.object({
    attempt: v.number(),
    retryScheduled: v.boolean(),
  }),
  v.object({
    initializedGeneration: v.optional(v.number()),
    fromMode: v.optional(v.literal('shadow')),
    toMode: v.optional(v.literal('live')),
  }),
  v.object({
    migrationKey: v.literal('smart_manager_batch_1_v1'),
    migrationVersion: v.literal(1),
  }),
  v.object({
    actionKind: v.literal('winback_campaign'),
    preparationKey: v.string(),
    selectedCopyRevision: v.number(),
  }),
  v.object({
    actionKind: v.literal('winback_campaign'),
    reasonCode: v.literal('NEW_CURRENT_PREPARATION'),
  }),
  v.object({
    actionKind: v.literal('winback_campaign'),
    reasonCode: v.union(
      v.literal('ACTIVE_POLICY_INVALID'),
      v.literal('BUSINESS_DELETION_IN_PROGRESS'),
      v.literal('BUSINESS_INACTIVE'),
      v.literal('BUSINESS_NOT_FOUND'),
      v.literal('COMPARISON_AMBIGUOUS'),
      v.literal('COMPARISON_BINDING_MISMATCH'),
      v.literal('COMPARISON_HASH_MISMATCH'),
      v.literal('COMPARISON_NOT_FOUND'),
      v.literal('COMPARISON_NOT_PARITY'),
      v.literal('DECISION_AMBIGUOUS'),
      v.literal('DECISION_BINDING_MISMATCH'),
      v.literal('DECISION_EVIDENCE_MISMATCH'),
      v.literal('DECISION_HASH_MISMATCH'),
      v.literal('DECISION_INACTIVE'),
      v.literal('DECISION_NOT_FOUND'),
      v.literal('EVALUATION_AMBIGUOUS'),
      v.literal('EVALUATION_GENERATION_MISMATCH'),
      v.literal('EVALUATION_NOT_FOUND'),
      v.literal('EVIDENCE_EXPIRED'),
      v.literal('EVIDENCE_FINGERPRINT_MISMATCH'),
      v.literal('FACT_SNAPSHOT_AMBIGUOUS'),
      v.literal('FACT_SNAPSHOT_BINDING_MISMATCH'),
      v.literal('FACT_SNAPSHOT_NOT_FOUND'),
      v.literal('LIFECYCLE_AUDIENCE_INVALID'),
      v.literal('LIFECYCLE_EVIDENCE_UNAVAILABLE'),
      v.literal('POLICY_BINDING_MISMATCH'),
      v.literal('ACTION_AUDIENCE_BINDING_CHANGED'),
      v.literal('ACTION_AUTHORITY_BINDING_CHANGED'),
      v.literal('ACTION_AUTHORITY_MODE_CHANGED'),
      v.literal('ACTION_CONTRACT_INVALID'),
      v.literal('ACTION_DECISION_BINDING_CHANGED'),
      v.literal('ACTION_PREPARATION_KEY_CHANGED')
    ),
    authorityBindingHash: v.optional(v.string()),
    decisionHash: v.string(),
    evidenceFingerprint: v.string(),
    comparisonHash: v.string(),
    lifecycleSourceFingerprint: v.string(),
    audienceCount: v.number(),
    generationRequestDiscarded: v.boolean(),
  }),
  v.object({
    actionKind: v.literal('winback_campaign'),
    requestToken: v.string(),
    requestBindingHash: v.string(),
    reservedResultRevision: v.number(),
    generationVersion: v.string(),
    promptVersion: v.string(),
    model: v.optional(v.string()),
    provenance: v.optional(
      smartManagerPreparedActionCopyProvenanceValidator
    ),
    failureCode: v.optional(smartManagerAiFailureCodeValidator),
    copyId: v.optional(v.id('smartManagerPreparedActionCopies')),
    selectedCopyRevision: v.optional(v.number()),
  }),
  v.object({
    actionKind: v.literal('winback_campaign'),
    copyId: v.id('smartManagerPreparedActionCopies'),
    selectedCopyRevision: v.number(),
    provenance: smartManagerPreparedActionCopyProvenanceValidator,
  })
);

export const smartManagerWorkerEvaluationValidator = v.object({
  observedAt: v.number(),
  sourceGeneration: v.number(),
  sourceWatermark: v.string(),
  factHash: v.string(),
  policy: smartManagerPolicyEnvelopeValidator,
  capabilityAvailability: smartManagerCapabilityAvailabilityValidator,
  facts: smartManagerFactEnvelopeValidator,
  canonicalDecisions: v.array(smartManagerDecisionSummaryValidator),
  canonicalSummary: smartManagerComparisonSummaryValidator,
  liveSummary: smartManagerComparisonSummaryValidator,
  status: v.union(
    v.literal('parity'),
    v.literal('mismatch'),
    v.literal('bounded_source_unavailable')
  ),
  differences: v.array(v.string()),
  comparisonHash: v.string(),
});
