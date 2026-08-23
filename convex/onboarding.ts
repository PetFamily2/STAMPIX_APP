import { v } from 'convex/values';

import type { Doc, Id } from './_generated/dataModel';
import { type MutationCtx, mutation, query } from './_generated/server';
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
  v.literal('businessBasics'),
  v.literal('previewCard')
);

export type BusinessOnboardingFlow = 'default' | 'additional';
export type BusinessOnboardingStatus = 'in_progress' | 'paused' | 'completed';
export type BusinessOnboardingStep =
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
  | 'businessBasics'
  | 'previewCard';

const DEFAULT_STEP_ORDER: Record<BusinessOnboardingStep, number> = {
  role: 1,
  discovery: 2,
  reason: 2,
  name: 2,
  businessBasics: 2,
  usageArea: 2,
  businessType: 2,
  businessCadence: 2,
  businessCampaignRelevance: 2,
  createBusiness: 3,
  plan: 4,
  createProgram: 4,
  previewCard: 5,
};

const ADDITIONAL_STEP_ORDER: Partial<Record<BusinessOnboardingStep, number>> = {
  name: 1,
  businessBasics: 1,
  createBusiness: 2,
  plan: 3,
  createProgram: 3,
  previewCard: 4,
};

function normalizeStep(
  flow: BusinessOnboardingFlow,
  step: BusinessOnboardingStep
): BusinessOnboardingStep {
  if (
    step === 'name' ||
    step === 'discovery' ||
    step === 'reason' ||
    step === 'usageArea' ||
    step === 'businessType' ||
    step === 'businessCadence' ||
    step === 'businessCampaignRelevance'
  ) {
    return 'businessBasics';
  }

  if (step === 'plan') {
    return 'createProgram';
  }

  if (flow === 'additional' && step === 'role') {
    return 'businessBasics';
  }

  return step;
}

function resolveStepOrder(
  flow: BusinessOnboardingFlow,
  step: BusinessOnboardingStep
) {
  const normalizedStep = normalizeStep(flow, step);
  if (flow === 'additional') {
    const additionalOrder = ADDITIONAL_STEP_ORDER[normalizedStep];
    if (additionalOrder != null) {
      return additionalOrder;
    }
  }
  return DEFAULT_STEP_ORDER[normalizedStep];
}

function asRecord(value: unknown) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    return undefined;
  }
  return value as Record<string, unknown>;
}

export function getProgramImageStorageIdCandidate(programDraft: unknown) {
  const candidate = asRecord(programDraft)?.imageStorageId;
  return typeof candidate === 'string' && candidate.length > 0
    ? candidate
    : undefined;
}

export async function getBusinessOnboardingDraftForUserAndFlow(
  ctx: MutationCtx,
  userId: Id<'users'>,
  flow: BusinessOnboardingFlow
): Promise<Doc<'businessOnboardingDrafts'> | null> {
  return await ctx.db
    .query('businessOnboardingDrafts')
    .withIndex('by_userId_flow', (q) =>
      q.eq('userId', userId).eq('flow', flow)
    )
    .unique();
}

export async function upsertBusinessOnboardingDraft(
  ctx: MutationCtx,
  input: {
    userId: Id<'users'>;
    flow: BusinessOnboardingFlow;
    currentStep: BusinessOnboardingStep;
    status?: BusinessOnboardingStatus;
    businessId?: Id<'businesses'>;
    programId?: Id<'loyaltyPrograms'>;
    businessDraft?: unknown;
    programDraft?: unknown;
    businessOnboardingDraft?: unknown;
  }
) {
  const now = Date.now();
  const nextStatus: BusinessOnboardingStatus = input.status ?? 'in_progress';
  const normalizedCurrentStep = normalizeStep(input.flow, input.currentStep);
  const currentStepOrder = resolveStepOrder(
    input.flow,
    normalizedCurrentStep
  );
  const existing = await getBusinessOnboardingDraftForUserAndFlow(
    ctx,
    input.userId,
    input.flow
  );

  const hasReusableProgress = existing && existing.status !== 'completed';
  const previousFarthestStep = hasReusableProgress
    ? normalizeStep(
        input.flow,
        existing.farthestStep as BusinessOnboardingStep
      )
    : normalizedCurrentStep;
  const previousFarthestOrder = hasReusableProgress
    ? resolveStepOrder(input.flow, previousFarthestStep)
    : 0;
  const nextFarthestOrder = Math.max(previousFarthestOrder, currentStepOrder);
  const nextFarthestStep =
    currentStepOrder >= previousFarthestOrder
      ? normalizedCurrentStep
      : previousFarthestStep;
  const nextProgramDraft =
    asRecord(input.programDraft) ?? existing?.programDraft;
  const programImageStorageIdCandidate =
    getProgramImageStorageIdCandidate(nextProgramDraft);
  const programImageStorageId = programImageStorageIdCandidate
    ? (ctx.db.system.normalizeId('_storage', programImageStorageIdCandidate) ??
      undefined)
    : undefined;

  const payload = {
    flow: input.flow,
    status: nextStatus,
    currentStep: normalizedCurrentStep,
    farthestStep: nextFarthestStep,
    farthestStepOrder: nextFarthestOrder,
    businessId: input.businessId ?? existing?.businessId,
    programId: input.programId ?? existing?.programId,
    programImageStorageId,
    businessDraft: asRecord(input.businessDraft) ?? existing?.businessDraft,
    programDraft: nextProgramDraft,
    businessOnboardingDraft:
      asRecord(input.businessOnboardingDraft) ??
      existing?.businessOnboardingDraft,
    pausedAt: nextStatus === 'paused' ? now : undefined,
    completedAt: nextStatus === 'completed' ? now : undefined,
    updatedAt: now,
  };

  if (existing) {
    await ctx.db.patch(existing._id, payload);
    return {
      draftId: existing._id,
      status: nextStatus,
      currentStep: normalizedCurrentStep,
      farthestStep: nextFarthestStep,
    };
  }

  const draftId = await ctx.db.insert('businessOnboardingDrafts', {
    userId: input.userId,
    createdAt: now,
    ...payload,
  });

  return {
    draftId,
    status: nextStatus,
    currentStep: normalizedCurrentStep,
    farthestStep: nextFarthestStep,
  };
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
      currentStep: normalizeStep(
        draft.flow as BusinessOnboardingFlow,
        draft.currentStep as BusinessOnboardingStep
      ),
      farthestStep: normalizeStep(
        draft.flow as BusinessOnboardingFlow,
        draft.farthestStep as BusinessOnboardingStep
      ),
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
    return await upsertBusinessOnboardingDraft(ctx, {
      userId: user._id,
      flow,
      currentStep,
      status,
      businessId,
      programId,
      businessDraft,
      programDraft,
      businessOnboardingDraft,
    });
  },
});
