import { v } from 'convex/values';

import { mutation, query } from './_generated/server';
import { getCurrentUserOrNull, requireCurrentUser } from './guards';

const BUSINESS_ONBOARDING_FLOW_UNION = v.union(
  v.literal('default'),
  v.literal('additional')
);
const BUSINESS_ONBOARDING_STATUS_UNION = v.union(
  v.literal('in_progress'),
  v.literal('paused'),
  v.literal('completed')
);
const BUSINESS_ONBOARDING_STEP_UNION = v.union(
  v.literal('role'),
  v.literal('discovery'),
  v.literal('reason'),
  v.literal('name'),
  v.literal('createBusiness'),
  v.literal('usageArea'),
  v.literal('businessType'),
  v.literal('businessCadence'),
  v.literal('businessCampaignRelevance'),
  v.literal('plan'),
  v.literal('createProgram'),
  v.literal('previewCard')
);

type BusinessOnboardingFlow = 'default' | 'additional';
type BusinessOnboardingStatus = 'in_progress' | 'paused' | 'completed';
type BusinessOnboardingStep =
  | 'role'
  | 'discovery'
  | 'reason'
  | 'name'
  | 'createBusiness'
  | 'usageArea'
  | 'businessType'
  | 'businessCadence'
  | 'businessCampaignRelevance'
  | 'plan'
  | 'createProgram'
  | 'previewCard';

const DEFAULT_STEP_ORDER: Record<BusinessOnboardingStep, number> = {
  role: 1,
  discovery: 2,
  reason: 3,
  name: 4,
  createBusiness: 5,
  usageArea: 6,
  businessType: 7,
  businessCadence: 8,
  businessCampaignRelevance: 9,
  plan: 10,
  createProgram: 11,
  previewCard: 12,
};

const ADDITIONAL_STEP_ORDER: Partial<Record<BusinessOnboardingStep, number>> = {
  name: 1,
  createBusiness: 2,
  plan: 3,
  createProgram: 4,
  previewCard: 5,
};

function resolveStepOrder(
  flow: BusinessOnboardingFlow,
  step: BusinessOnboardingStep
) {
  if (flow === 'additional') {
    const additionalOrder = ADDITIONAL_STEP_ORDER[step];
    if (additionalOrder != null) {
      return additionalOrder;
    }
  }
  return DEFAULT_STEP_ORDER[step];
}

function asRecord(value: unknown) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    return undefined;
  }
  return value as Record<string, unknown>;
}

export const getMyBusinessOnboardingDraft = query({
  args: {
    flow: v.optional(BUSINESS_ONBOARDING_FLOW_UNION),
  },
  handler: async (ctx, { flow }) => {
    const user = await getCurrentUserOrNull(ctx);
    if (!user) {
      return null;
    }

    const targetFlow: BusinessOnboardingFlow = flow ?? 'default';
    const draft = await ctx.db
      .query('businessOnboardingDrafts')
      .withIndex('by_userId_flow', (q) =>
        q.eq('userId', user._id).eq('flow', targetFlow)
      )
      .unique();

    if (!draft || draft.status === 'completed') {
      return null;
    }

    return {
      draftId: draft._id,
      flow: draft.flow as BusinessOnboardingFlow,
      status: draft.status as BusinessOnboardingStatus,
      currentStep: draft.currentStep as BusinessOnboardingStep,
      farthestStep: draft.farthestStep as BusinessOnboardingStep,
      farthestStepOrder: draft.farthestStepOrder,
      businessId: draft.businessId ?? null,
      programId: draft.programId ?? null,
      businessDraft: asRecord(draft.businessDraft) ?? null,
      programDraft: asRecord(draft.programDraft) ?? null,
      businessOnboardingDraft: asRecord(draft.businessOnboardingDraft) ?? null,
      pausedAt: draft.pausedAt ?? null,
      updatedAt: draft.updatedAt,
    };
  },
});

export const saveMyBusinessOnboardingDraft = mutation({
  args: {
    flow: BUSINESS_ONBOARDING_FLOW_UNION,
    currentStep: BUSINESS_ONBOARDING_STEP_UNION,
    status: v.optional(BUSINESS_ONBOARDING_STATUS_UNION),
    businessId: v.optional(v.id('businesses')),
    programId: v.optional(v.id('loyaltyPrograms')),
    businessDraft: v.optional(v.any()),
    programDraft: v.optional(v.any()),
    businessOnboardingDraft: v.optional(v.any()),
  },
  handler: async (
    ctx,
    {
      flow,
      currentStep,
      status,
      businessId,
      programId,
      businessDraft,
      programDraft,
      businessOnboardingDraft,
    }
  ) => {
    const user = await requireCurrentUser(ctx);
    const now = Date.now();
    const nextStatus: BusinessOnboardingStatus = status ?? 'in_progress';
    const currentStepOrder = resolveStepOrder(flow, currentStep);

    const existing = await ctx.db
      .query('businessOnboardingDrafts')
      .withIndex('by_userId_flow', (q) =>
        q.eq('userId', user._id).eq('flow', flow)
      )
      .unique();

    const hasReusableProgress = existing && existing.status !== 'completed';
    const previousFarthestOrder = hasReusableProgress
      ? existing.farthestStepOrder
      : 0;
    const nextFarthestOrder = Math.max(previousFarthestOrder, currentStepOrder);
    const nextFarthestStep =
      currentStepOrder >= previousFarthestOrder
        ? currentStep
        : ((existing?.farthestStep as BusinessOnboardingStep) ?? currentStep);

    const payload = {
      flow,
      status: nextStatus,
      currentStep,
      farthestStep: nextFarthestStep,
      farthestStepOrder: nextFarthestOrder,
      businessId: businessId ?? existing?.businessId,
      programId: programId ?? existing?.programId,
      businessDraft: asRecord(businessDraft) ?? existing?.businessDraft,
      programDraft: asRecord(programDraft) ?? existing?.programDraft,
      businessOnboardingDraft:
        asRecord(businessOnboardingDraft) ?? existing?.businessOnboardingDraft,
      pausedAt: nextStatus === 'paused' ? now : undefined,
      completedAt: nextStatus === 'completed' ? now : undefined,
      updatedAt: now,
    };

    if (existing) {
      await ctx.db.patch(existing._id, payload);
      return {
        draftId: existing._id,
        status: nextStatus,
        currentStep,
        farthestStep: nextFarthestStep,
      };
    }

    const draftId = await ctx.db.insert('businessOnboardingDrafts', {
      userId: user._id,
      createdAt: now,
      ...payload,
    });

    return {
      draftId,
      status: nextStatus,
      currentStep,
      farthestStep: nextFarthestStep,
    };
  },
});
