import { makeFunctionReference } from 'convex/server';
import { v } from 'convex/values';
import type { Doc, Id } from './_generated/dataModel';
import {
  internalAction,
  internalMutation,
  mutation,
  query,
} from './_generated/server';
import {
  getBusinessStaffStatus,
  isBusinessPermanentDeletionInProgress,
  requireCurrentUser,
} from './guards';
import { sendExpoPushMessages } from './pushNotifications';

const DELETE_BATCH_SIZE = 50;
const SCHEDULED_PUSH_TIMEOUT_MS = 5 * 60 * 1000;
const COMPLETED_JOB_RETENTION_MS = 7 * 24 * 60 * 60 * 1000;

type DeletionPhase = Doc<'businessDeletionJobs'>['phase'];
type BusinessDeletionProcessResult =
  | { status: 'stale' }
  | { status: 'processed'; phase: DeletionPhase };
type BusinessDeletionWorkerResult =
  | BusinessDeletionProcessResult
  | { status: 'failed' };
type PermanentDeletionPushClaim =
  | { claimed: false }
  | {
      claimed: true;
      businessName: string;
      tokens: Array<{ tokenId: Id<'pushTokens'>; token: string }>;
    };

const internalDeletionApi = {
  runBusinessDeletionWorkerInternal: makeFunctionReference<
    'action',
    { jobId: Id<'businessDeletionJobs'> },
    BusinessDeletionWorkerResult
  >('businessDeletion:runBusinessDeletionWorkerInternal'),
  processBusinessDeletionBatchInternal: makeFunctionReference<
    'mutation',
    { jobId: Id<'businessDeletionJobs'> },
    BusinessDeletionProcessResult
  >('businessDeletion:processBusinessDeletionBatchInternal'),
  markBusinessDeletionFailedInternal: makeFunctionReference<
    'mutation',
    {
      jobId: Id<'businessDeletionJobs'>;
      failureCode: string;
      failureDetail: string;
    },
    { status: 'stale' | 'failed' }
  >('businessDeletion:markBusinessDeletionFailedInternal'),
  claimPermanentDeletionPushAttemptInternal: makeFunctionReference<
    'mutation',
    { recipientId: Id<'businessDeletionRecipients'> },
    PermanentDeletionPushClaim
  >('businessDeletion:claimPermanentDeletionPushAttemptInternal'),
  finalizePermanentDeletionPushAttemptInternal: makeFunctionReference<
    'mutation',
    {
      recipientId: Id<'businessDeletionRecipients'>;
      status: 'sent' | 'failed';
      failureDetail?: string;
      deviceNotRegisteredTokenIds: Array<Id<'pushTokens'>>;
    },
    { status: 'stale' | 'sent' | 'failed' }
  >('businessDeletion:finalizePermanentDeletionPushAttemptInternal'),
  deliverPermanentDeletionPushInternal: makeFunctionReference<
    'action',
    { recipientId: Id<'businessDeletionRecipients'> },
    { status: 'stale_or_skipped' | 'sent' | 'failed' }
  >('businessDeletion:deliverPermanentDeletionPushInternal'),
} as const;

function normalizeConfirmationName(value: string) {
  return value.normalize('NFKC').trim().replace(/\s+/g, ' ').toLowerCase();
}

function addMonthsUtc(timestamp: number, months: number) {
  const date = new Date(timestamp);
  const day = date.getUTCDate();
  date.setUTCDate(1);
  date.setUTCMonth(date.getUTCMonth() + months);
  const lastDay = new Date(
    Date.UTC(date.getUTCFullYear(), date.getUTCMonth() + 1, 0)
  ).getUTCDate();
  date.setUTCDate(Math.min(day, lastDay));
  return date.getTime();
}

function asProgress(value: unknown) {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

function getProgressStep(job: Doc<'businessDeletionJobs'>, fallback: string) {
  const step = asProgress(job.progress).step;
  return typeof step === 'string' ? step : fallback;
}

function serializeJob(job: Doc<'businessDeletionJobs'>) {
  return {
    jobId: job._id,
    businessId: job.businessId,
    businessName: job.businessNameSnapshot,
    status: job.status,
    phase: job.phase,
    requestedAt: job.requestedAt ?? job.createdAt,
    completedAt: job.completedAt ?? null,
    failureCode: job.failureCode ?? null,
  };
}

async function findJobsForBusiness(ctx: any, businessId: string) {
  return await ctx.db
    .query('businessDeletionJobs')
    .withIndex('by_businessId', (q: any) => q.eq('businessId', businessId))
    .order('desc')
    .take(20);
}

async function getRevenueCatBillingState(
  ctx: any,
  businessId: Id<'businesses'>
) {
  const statuses = [
    'active',
    'trialing',
    'past_due',
    'canceled',
    'inactive',
  ] as const;
  for (const status of statuses) {
    const row = await ctx.db
      .query('subscriptions')
      .withIndex('by_businessId_provider_status', (q: any) =>
        q
          .eq('businessId', businessId)
          .eq('provider', 'revenuecat')
          .eq('status', status)
      )
      .order('desc')
      .first();
    if (row) {
      return {
        provider: 'revenuecat' as const,
        status,
        plan: row.plan,
        period: row.period,
        endAt: row.endAt ?? null,
        renewalActive:
          status === 'active' || status === 'trialing' || status === 'past_due',
      };
    }
  }
  return {
    provider: null,
    status: null,
    plan: null,
    period: null,
    endAt: null,
    renewalActive: false,
  } as const;
}

async function requireCanonicalOwnerRelationship(
  ctx: any,
  business: Doc<'businesses'>,
  user: Doc<'users'>
) {
  if (String(business.ownerUserId) !== String(user._id)) {
    throw new Error('NOT_AUTHORIZED');
  }
  const ownerRow = await ctx.db
    .query('businessStaff')
    .withIndex('by_businessId_userId', (q: any) =>
      q.eq('businessId', business._id).eq('userId', user._id)
    )
    .first();
  if (
    !ownerRow ||
    ownerRow.staffRole !== 'owner' ||
    getBusinessStaffStatus(ownerRow) !== 'active'
  ) {
    throw new Error('NOT_AUTHORIZED');
  }
  return ownerRow;
}

export const listMyBusinessesForPermanentDeletion = query({
  args: {},
  handler: async (ctx) => {
    const user = await requireCurrentUser(ctx);
    const businesses = await ctx.db
      .query('businesses')
      .withIndex('by_ownerUserId', (q: any) => q.eq('ownerUserId', user._id))
      .collect();
    const result = [];
    for (const business of businesses) {
      const deletionJob = business.permanentDeletionJobId
        ? await ctx.db.get(business.permanentDeletionJobId)
        : null;
      const deletionLocked = isBusinessPermanentDeletionInProgress(business);
      if (deletionLocked) {
        if (
          !deletionJob ||
          deletionJob.status === 'completed' ||
          String(deletionJob.requestedByUserId) !== String(user._id)
        ) {
          continue;
        }
      } else {
        const ownerRow = await ctx.db
          .query('businessStaff')
          .withIndex('by_businessId_userId', (q: any) =>
            q.eq('businessId', business._id).eq('userId', user._id)
          )
          .first();
        if (
          !ownerRow ||
          ownerRow.staffRole !== 'owner' ||
          getBusinessStaffStatus(ownerRow) !== 'active'
        ) {
          continue;
        }
      }
      const billing = await getRevenueCatBillingState(ctx, business._id);
      result.push({
        businessExists: true as const,
        businessId: business._id,
        name: business.name,
        isActive: business.isActive,
        closedAt: business.closedAt ?? null,
        permanentDeletionStatus: business.permanentDeletionStatus ?? null,
        permanentDeletionJobId: business.permanentDeletionJobId ?? null,
        permanentDeletionJobStatus: deletionJob?.status ?? null,
        permanentDeletionPhase: deletionJob?.phase ?? null,
        permanentDeletionFailureCode: deletionJob?.failureCode ?? null,
        billing,
        deletionEligible: !billing.renewalActive,
      });
    }

    const unfinishedJobs: Doc<'businessDeletionJobs'>[] = [];
    for (const status of ['queued', 'running', 'failed'] as const) {
      const jobs = await ctx.db
        .query('businessDeletionJobs')
        .withIndex('by_requestedByUserId_status', (q: any) =>
          q.eq('requestedByUserId', user._id).eq('status', status)
        )
        .order('desc')
        .collect();
      unfinishedJobs.push(...jobs);
    }
    unfinishedJobs.sort((left, right) => right.updatedAt - left.updatedAt);

    const syntheticBusinessIds = new Set<string>();
    for (const job of unfinishedJobs) {
      if (String(job.requestedByUserId) !== String(user._id)) {
        continue;
      }
      const businessId = ctx.db.normalizeId('businesses', job.businessId);
      if (!businessId || syntheticBusinessIds.has(String(businessId))) {
        continue;
      }
      const business = await ctx.db.get(businessId);
      if (business) {
        continue;
      }
      syntheticBusinessIds.add(String(businessId));
      result.push({
        businessExists: false as const,
        businessId,
        name: job.businessNameSnapshot,
        permanentDeletionStatus: 'in_progress' as const,
        permanentDeletionJobId: job._id,
        permanentDeletionJobStatus: job.status,
        permanentDeletionPhase: job.phase,
        permanentDeletionFailureCode: job.failureCode ?? null,
      });
    }
    return result;
  },
});

export const deleteBusinessPermanently = mutation({
  args: {
    businessId: v.id('businesses'),
    confirmationBusinessName: v.string(),
  },
  handler: async (ctx, args) => {
    const user = await requireCurrentUser(ctx);
    const business = await ctx.db.get(args.businessId);
    if (!business) {
      const previousJobs = await findJobsForBusiness(ctx, String(args.businessId));
      const previous = previousJobs.find(
        (job: Doc<'businessDeletionJobs'>) =>
          String(job.requestedByUserId) === String(user._id)
      );
      if (previous) {
        return { ...serializeJob(previous), reused: true };
      }
      throw new Error('BUSINESS_NOT_FOUND');
    }

    const existingJobs = await findJobsForBusiness(ctx, String(business._id));
    const existing = existingJobs.find(
      (job: Doc<'businessDeletionJobs'>) => job.status !== 'completed'
    );
    if (existing) {
      if (
        String(existing.requestedByUserId) !== String(user._id) ||
        String(business.ownerUserId) !== String(user._id)
      ) {
        throw new Error('NOT_AUTHORIZED');
      }
      return { ...serializeJob(existing), reused: true };
    }

    await requireCanonicalOwnerRelationship(ctx, business, user);
    if (
      normalizeConfirmationName(args.confirmationBusinessName) !==
      normalizeConfirmationName(business.name)
    ) {
      throw new Error('BUSINESS_NAME_CONFIRMATION_MISMATCH');
    }
    const billing = await getRevenueCatBillingState(ctx, business._id);
    if (billing.renewalActive) {
      throw new Error('BUSINESS_SUBSCRIPTION_RENEWAL_ACTIVE');
    }

    const now = Date.now();
    const jobId = await ctx.db.insert('businessDeletionJobs', {
      businessId: String(business._id),
      requestedByUserId: user._id,
      businessNameSnapshot: business.name,
      status: 'queued',
      phase: 'capture_customers',
      requestedAt: now,
      billingSnapshot: billing,
      createdAt: now,
      updatedAt: now,
    });
    await ctx.db.patch(business._id, {
      permanentDeletionStatus: 'in_progress',
      permanentDeletionJobId: jobId,
      permanentDeletionRequestedAt: now,
      isActive: false,
      updatedAt: now,
    });
    if (String(user.activeBusinessId ?? '') === String(business._id)) {
      await ctx.db.patch(user._id, {
        activeBusinessId: undefined,
        activeMode: 'customer',
        updatedAt: now,
      });
    }
    await ctx.scheduler.runAfter(
      0,
      internalDeletionApi.runBusinessDeletionWorkerInternal,
      { jobId }
    );
    const job = await ctx.db.get(jobId);
    return { ...serializeJob(job!), reused: false };
  },
});

export const getPermanentBusinessDeletionStatus = query({
  args: { jobId: v.id('businessDeletionJobs') },
  handler: async (ctx, { jobId }) => {
    const user = await requireCurrentUser(ctx);
    const job = await ctx.db.get(jobId);
    if (!job) {
      return null;
    }
    if (String(job.requestedByUserId) !== String(user._id)) {
      throw new Error('NOT_AUTHORIZED');
    }
    return serializeJob(job);
  },
});

export const retryPermanentBusinessDeletion = mutation({
  args: { jobId: v.id('businessDeletionJobs') },
  handler: async (ctx, { jobId }) => {
    const user = await requireCurrentUser(ctx);
    const job = await ctx.db.get(jobId);
    if (!job) {
      throw new Error('BUSINESS_DELETION_JOB_NOT_FOUND');
    }
    if (String(job.requestedByUserId) !== String(user._id)) {
      throw new Error('NOT_AUTHORIZED');
    }
    if (job.status === 'completed') {
      return serializeJob(job);
    }
    if (job.status !== 'failed') {
      throw new Error('BUSINESS_DELETION_JOB_NOT_RETRYABLE');
    }
    const businessId = ctx.db.normalizeId('businesses', job.businessId);
    const business = businessId ? await ctx.db.get(businessId) : null;
    if (
      (business && String(business.ownerUserId) !== String(user._id)) ||
      (!business && job.phase !== 'finalize')
    ) {
      throw new Error('NOT_AUTHORIZED');
    }
    const now = Date.now();
    await ctx.db.patch(job._id, {
      status: 'running',
      failureCode: undefined,
      failureDetail: undefined,
      updatedAt: now,
    });
    if (business) {
      await ctx.db.patch(business._id, {
        permanentDeletionStatus: 'in_progress',
        isActive: false,
        updatedAt: now,
      });
    }
    await ctx.scheduler.runAfter(
      0,
      internalDeletionApi.runBusinessDeletionWorkerInternal,
      { jobId: job._id }
    );
    return {
      ...serializeJob(job),
      status: 'running' as const,
      failureCode: null,
    };
  },
});

export const runBusinessDeletionWorkerInternal = internalAction({
  args: { jobId: v.id('businessDeletionJobs') },
  handler: async (ctx, { jobId }) => {
    try {
      return await ctx.runMutation(
        internalDeletionApi.processBusinessDeletionBatchInternal,
        { jobId }
      );
    } catch (error) {
      const detail =
        error instanceof Error ? error.message.slice(0, 500) : 'UNKNOWN';
      await ctx.runMutation(internalDeletionApi.markBusinessDeletionFailedInternal, {
        jobId,
        failureCode: 'DELETION_PHASE_FAILED',
        failureDetail: detail,
      });
      return { status: 'failed' as const };
    }
  },
});

export const markBusinessDeletionFailedInternal = internalMutation({
  args: {
    jobId: v.id('businessDeletionJobs'),
    failureCode: v.string(),
    failureDetail: v.string(),
  },
  handler: async (ctx, args) => {
    const job = await ctx.db.get(args.jobId);
    if (!job || job.status === 'completed') {
      return { status: 'stale' as const };
    }
    const now = Date.now();
    await ctx.db.patch(job._id, {
      status: 'failed',
      failureCode: args.failureCode,
      failureDetail: args.failureDetail,
      updatedAt: now,
    });
    const businessId = ctx.db.normalizeId('businesses', job.businessId);
    const business = businessId ? await ctx.db.get(businessId) : null;
    if (business) {
      await ctx.db.patch(business._id, {
        permanentDeletionStatus: 'failed',
        isActive: false,
        updatedAt: now,
      });
    }
    return { status: 'failed' as const };
  },
});

async function scheduleWorker(ctx: any, jobId: Id<'businessDeletionJobs'>, delay = 0) {
  await ctx.scheduler.runAfter(
    delay,
    internalDeletionApi.runBusinessDeletionWorkerInternal,
    { jobId }
  );
}

async function moveToPhase(
  ctx: any,
  job: Doc<'businessDeletionJobs'>,
  phase: DeletionPhase
) {
  await ctx.db.patch(job._id, {
    status: 'running',
    phase,
    cursor: undefined,
    progress: undefined,
    updatedAt: Date.now(),
  });
  await scheduleWorker(ctx, job._id);
}

async function continuePhase(
  ctx: any,
  job: Doc<'businessDeletionJobs'>,
  patch?: { cursor?: string; progress?: Record<string, unknown> },
  delay = 0
) {
  await ctx.db.patch(job._id, {
    status: 'running',
    ...(patch ?? {}),
    updatedAt: Date.now(),
  });
  await scheduleWorker(ctx, job._id, delay);
}

async function ensureRecipient(
  ctx: any,
  jobId: Id<'businessDeletionJobs'>,
  userId: Id<'users'>,
  audience: 'customer' | 'staff'
) {
  const existing = await ctx.db
    .query('businessDeletionRecipients')
    .withIndex('by_jobId_userId', (q: any) =>
      q.eq('jobId', jobId).eq('userId', userId)
    )
    .first();
  if (existing) {
    return existing._id;
  }
  const now = Date.now();
  return await ctx.db.insert('businessDeletionRecipients', {
    jobId,
    userId,
    audience,
    pushStatus: 'pending',
    createdAt: now,
    updatedAt: now,
  });
}

async function captureAsset(
  ctx: any,
  jobId: Id<'businessDeletionJobs'>,
  storageId: Id<'_storage'>
) {
  const existing = await ctx.db
    .query('businessDeletionAssets')
    .withIndex('by_jobId_storageId', (q: any) =>
      q.eq('jobId', jobId).eq('storageId', storageId)
    )
    .first();
  if (existing) {
    return existing._id;
  }
  const now = Date.now();
  return await ctx.db.insert('businessDeletionAssets', {
    jobId,
    storageId,
    cleanupStatus: 'pending',
    createdAt: now,
    updatedAt: now,
  });
}

export const claimPermanentDeletionPushAttemptInternal = internalMutation({
  args: { recipientId: v.id('businessDeletionRecipients') },
  handler: async (ctx, { recipientId }) => {
    const recipient = await ctx.db.get(recipientId);
    if (!recipient || recipient.pushStatus !== 'scheduled') {
      return { claimed: false as const };
    }
    const job = await ctx.db.get(recipient.jobId);
    if (!job) {
      await ctx.db.patch(recipient._id, {
        pushStatus: 'skipped',
        failureDetail: 'job_not_found',
        updatedAt: Date.now(),
      });
      return { claimed: false as const };
    }
    const now = Date.now();
    const tokens = await ctx.db
      .query('pushTokens')
      .withIndex('by_userId', (q: any) => q.eq('userId', recipient.userId))
      .filter((q: any) => q.eq(q.field('isActive'), true))
      .collect();
    if (tokens.length === 0) {
      await ctx.db.patch(recipient._id, {
        pushStatus: 'skipped',
        attemptedAt: now,
        deliveredAt: now,
        failureDetail: 'no_active_push_token',
        updatedAt: now,
      });
      return { claimed: false as const };
    }
    await ctx.db.patch(recipient._id, {
      pushStatus: 'attempted',
      attemptedAt: now,
      updatedAt: now,
    });
    return {
      claimed: true as const,
      businessName: job.businessNameSnapshot,
      tokens: tokens.map((token: Doc<'pushTokens'>) => ({
        tokenId: token._id,
        token: token.token,
      })),
    };
  },
});

export const finalizePermanentDeletionPushAttemptInternal = internalMutation({
  args: {
    recipientId: v.id('businessDeletionRecipients'),
    status: v.union(v.literal('sent'), v.literal('failed')),
    failureDetail: v.optional(v.string()),
    deviceNotRegisteredTokenIds: v.array(v.id('pushTokens')),
  },
  handler: async (ctx, args) => {
    const now = Date.now();
    const recipient = await ctx.db.get(args.recipientId);
    for (const tokenId of args.deviceNotRegisteredTokenIds) {
      const token = await ctx.db.get(tokenId);
      if (
        token &&
        (!recipient || String(token.userId) === String(recipient.userId))
      ) {
        await ctx.db.patch(token._id, { isActive: false, updatedAt: now });
      }
    }
    if (!recipient || recipient.pushStatus !== 'attempted') {
      return { status: 'stale' as const };
    }
    await ctx.db.patch(recipient._id, {
      pushStatus: args.status,
      deliveredAt: now,
      failureDetail: args.failureDetail,
      updatedAt: now,
    });
    return { status: args.status };
  },
});

export const deliverPermanentDeletionPushInternal = internalAction({
  args: { recipientId: v.id('businessDeletionRecipients') },
  handler: async (ctx, { recipientId }) => {
    const claim = await ctx.runMutation(
      internalDeletionApi.claimPermanentDeletionPushAttemptInternal,
      { recipientId }
    );
    if (!claim.claimed) {
      return { status: 'stale_or_skipped' as const };
    }
    const title = 'העסק נמחק לצמיתות';
    const body = `העסק ${claim.businessName} נמחק לצמיתות מ-StampAix. הכרטיסים והגישה לעסק אינם זמינים עוד.`;
    const result = await sendExpoPushMessages(
      claim.tokens.map((token: { token: string }) => ({
        to: token.token,
        title,
        body,
        sound: 'default' as const,
        channelId: 'default',
        data: { type: 'business_permanently_deleted' },
      }))
    );
    const deviceNotRegisteredTokenIds: Id<'pushTokens'>[] = [];
    let sent = false;
    if (result.ok) {
      result.tickets.forEach((ticket, index) => {
        if (ticket?.status === 'ok') {
          sent = true;
        }
        if (ticket?.details?.error === 'DeviceNotRegistered') {
          const tokenId = claim.tokens[index]?.tokenId;
          if (tokenId) {
            deviceNotRegisteredTokenIds.push(tokenId);
          }
        }
      });
    }
    await ctx.runMutation(
      internalDeletionApi.finalizePermanentDeletionPushAttemptInternal,
      {
        recipientId,
        status: sent ? 'sent' : 'failed',
        failureDetail: result.ok ? undefined : result.errorMessage,
        deviceNotRegisteredTokenIds,
      }
    );
    return { status: sent ? ('sent' as const) : ('failed' as const) };
  },
});

type DeleteStep = {
  name: string;
  table: string;
  index: string;
  field: string;
};

async function deleteDirectBusinessBatch(
  ctx: any,
  step: DeleteStep,
  businessId: Id<'businesses'>
) {
  const rows = await ctx.db
    .query(step.table)
    .withIndex(step.index, (q: any) => q.eq(step.field, businessId))
    .take(DELETE_BATCH_SIZE);
  for (const row of rows) {
    await ctx.db.delete(row._id);
  }
  return rows.length;
}

async function runDeleteSteps(
  ctx: any,
  job: Doc<'businessDeletionJobs'>,
  businessId: Id<'businesses'>,
  steps: DeleteStep[],
  nextPhase: DeletionPhase
) {
  const stepName = getProgressStep(job, steps[0].name);
  const stepIndex = Math.max(
    0,
    steps.findIndex((candidate) => candidate.name === stepName)
  );
  const deleted = await deleteDirectBusinessBatch(
    ctx,
    steps[stepIndex],
    businessId
  );
  if (deleted > 0) {
    await continuePhase(ctx, job, { progress: { step: steps[stepIndex].name } });
    return;
  }
  if (stepIndex + 1 < steps.length) {
    await continuePhase(ctx, job, {
      progress: { step: steps[stepIndex + 1].name },
    });
    return;
  }
  await moveToPhase(ctx, job, nextPhase);
}

async function runCaptureCustomers(
  ctx: any,
  job: Doc<'businessDeletionJobs'>,
  businessId: Id<'businesses'>
) {
  const page = await ctx.db
    .query('memberships')
    .withIndex('by_businessId', (q: any) => q.eq('businessId', businessId))
    .paginate({
      cursor: job.cursor ?? null,
      numItems: DELETE_BATCH_SIZE,
    });
  for (const membership of page.page) {
    if (membership.isActive === true) {
      await ensureRecipient(ctx, job._id, membership.userId, 'customer');
    }
  }
  if (!page.isDone) {
    await continuePhase(ctx, job, { cursor: page.continueCursor });
    return;
  }
  await moveToPhase(ctx, job, 'capture_staff');
}

async function runCaptureStaff(
  ctx: any,
  job: Doc<'businessDeletionJobs'>,
  businessId: Id<'businesses'>
) {
  const page = await ctx.db
    .query('businessStaff')
    .withIndex('by_businessId', (q: any) => q.eq('businessId', businessId))
    .paginate({
      cursor: job.cursor ?? null,
      numItems: DELETE_BATCH_SIZE,
    });
  for (const staff of page.page) {
    if (
      staff.staffRole !== 'owner' &&
      getBusinessStaffStatus(staff) === 'active' &&
      String(staff.userId) !== String(job.requestedByUserId)
    ) {
      await ensureRecipient(ctx, job._id, staff.userId, 'staff');
    }
  }
  if (!page.isDone) {
    await continuePhase(ctx, job, { cursor: page.continueCursor });
    return;
  }
  await moveToPhase(ctx, job, 'schedule_notifications');
}

async function runScheduleNotifications(
  ctx: any,
  job: Doc<'businessDeletionJobs'>
) {
  const pending = await ctx.db
    .query('businessDeletionRecipients')
    .withIndex('by_jobId_pushStatus', (q: any) =>
      q.eq('jobId', job._id).eq('pushStatus', 'pending')
    )
    .take(DELETE_BATCH_SIZE);
  if (pending.length > 0) {
    const now = Date.now();
    for (const recipient of pending) {
      await ctx.db.patch(recipient._id, {
        pushStatus: 'scheduled',
        scheduledAt: now,
        updatedAt: now,
      });
      await ctx.scheduler.runAfter(
        0,
        internalDeletionApi.deliverPermanentDeletionPushInternal,
        { recipientId: recipient._id }
      );
    }
    await continuePhase(ctx, job);
    return;
  }
  const scheduled = await ctx.db
    .query('businessDeletionRecipients')
    .withIndex('by_jobId_pushStatus', (q: any) =>
      q.eq('jobId', job._id).eq('pushStatus', 'scheduled')
    )
    .first();
  if (scheduled) {
    if (
      Number(scheduled.scheduledAt ?? 0) <=
      Date.now() - SCHEDULED_PUSH_TIMEOUT_MS
    ) {
      await ctx.db.patch(scheduled._id, {
        pushStatus: 'failed',
        failureDetail: 'push_attempt_timeout',
        updatedAt: Date.now(),
      });
      await continuePhase(ctx, job);
    } else {
      await continuePhase(ctx, job, undefined, 1000);
    }
    return;
  }
  await moveToPhase(ctx, job, 'clear_active_user_refs');
}

async function runClearActiveUserRefs(
  ctx: any,
  job: Doc<'businessDeletionJobs'>,
  businessId: Id<'businesses'>
) {
  const users = await ctx.db
    .query('users')
    .withIndex('by_activeBusinessId', (q: any) =>
      q.eq('activeBusinessId', businessId)
    )
    .take(DELETE_BATCH_SIZE);
  const now = Date.now();
  for (const user of users) {
    await ctx.db.patch(user._id, {
      activeBusinessId: undefined,
      activeMode: 'customer',
      updatedAt: now,
    });
  }
  if (users.length > 0) {
    await continuePhase(ctx, job);
    return;
  }
  await moveToPhase(ctx, job, 'reconcile_b2b');
}

async function runB2bReconciliation(
  ctx: any,
  job: Doc<'businessDeletionJobs'>,
  businessId: Id<'businesses'>
) {
  const step = getProgressStep(job, 'referrer_rows');
  if (step === 'referrer_rows') {
    const rows = await ctx.db
      .query('businessReferrals')
      .withIndex('by_referrerBusinessId_status_createdAt', (q: any) =>
        q.eq('referrerBusinessId', businessId)
      )
      .take(DELETE_BATCH_SIZE);
    for (const row of rows) {
      await ctx.db.delete(row._id);
    }
    if (rows.length > 0) {
      await continuePhase(ctx, job, { progress: { step } });
    } else {
      await continuePhase(ctx, job, {
        progress: { step: 'referrer_links' },
      });
    }
    return;
  }
  if (step === 'referrer_links') {
    const links = await ctx.db
      .query('businessReferralLinks')
      .withIndex('by_referrerBusinessId', (q: any) =>
        q.eq('referrerBusinessId', businessId)
      )
      .take(DELETE_BATCH_SIZE);
    for (const link of links) {
      await ctx.db.delete(link._id);
    }
    if (links.length > 0) {
      await continuePhase(ctx, job, { progress: { step } });
    } else {
      await continuePhase(ctx, job, {
        progress: { step: 'referred_rows' },
      });
    }
    return;
  }

  const referredRows = await ctx.db
    .query('businessReferrals')
    .withIndex('by_referredBusinessId', (q: any) =>
      q.eq('referredBusinessId', businessId)
    )
    .take(DELETE_BATCH_SIZE);
  const now = Date.now();
  for (const row of referredRows) {
    const earned = row.status === 'credited';
    await ctx.db.patch(row._id, {
      referredBusinessId: undefined,
      referredBusinessDeletedAt: row.referredBusinessDeletedAt ?? now,
      createdByUserId: undefined,
      ...(earned
        ? {}
        : {
            status: 'skipped' as const,
            skipReason: 'referred_business_deleted',
            qualificationDueAt: undefined,
          }),
      updatedAt: now,
    });
  }
  if (referredRows.length > 0) {
    await continuePhase(ctx, job, { progress: { step: 'referred_rows' } });
    return;
  }
  await moveToPhase(ctx, job, 'redact_audit');
}

async function runAuditRedaction(
  ctx: any,
  job: Doc<'businessDeletionJobs'>,
  businessId: Id<'businesses'>
) {
  const step = getProgressStep(job, 'referral_admin');
  if (step === 'referral_admin') {
    const rows = await ctx.db
      .query('referralAdminAuditLog')
      .withIndex('by_businessId_createdAt', (q: any) =>
        q.eq('businessId', businessId)
      )
      .take(DELETE_BATCH_SIZE);
    const now = Date.now();
    for (const row of rows) {
      const redactedAt = row.redactedAt ?? now;
      await ctx.db.patch(row._id, {
        targetId: 'redacted',
        businessId: undefined,
        customerReferralId: undefined,
        referralRewardId: undefined,
        beforeSnapshot: undefined,
        afterSnapshot: undefined,
        reasonNote: '[redacted]',
        redactedAt,
        purgeAfter: row.purgeAfter ?? addMonthsUtc(redactedAt, 12),
      });
    }
    if (rows.length > 0) {
      await continuePhase(ctx, job, { progress: { step } });
    } else {
      await continuePhase(ctx, job, {
        progress: { step: 'revenuecat' },
      });
    }
    return;
  }

  const rows = await ctx.db
    .query('revenueCatWebhookEvents')
    .withIndex('by_businessId', (q: any) => q.eq('businessId', businessId))
    .take(DELETE_BATCH_SIZE);
  const now = Date.now();
  for (const row of rows) {
    const redactedAt = row.redactedAt ?? now;
    await ctx.db.patch(row._id, {
      appUserId: 'redacted',
      businessId: undefined,
      rawEvent: { redacted: true },
      redactedAt,
      purgeAfter: row.purgeAfter ?? addMonthsUtc(redactedAt, 12),
    });
  }
  if (rows.length > 0) {
    await continuePhase(ctx, job, { progress: { step: 'revenuecat' } });
    return;
  }
  await moveToPhase(ctx, job, 'purge_customer_referrals');
}

async function runApiPurge(
  ctx: any,
  job: Doc<'businessDeletionJobs'>,
  businessId: Id<'businesses'>
) {
  const client = await ctx.db
    .query('apiClients')
    .withIndex('by_businessId', (q: any) => q.eq('businessId', businessId))
    .first();
  if (!client) {
    await moveToPhase(ctx, job, 'purge_onboarding');
    return;
  }
  const keys = await ctx.db
    .query('apiKeys')
    .withIndex('by_clientId', (q: any) => q.eq('clientId', client._id))
    .take(DELETE_BATCH_SIZE);
  if (keys.length > 0) {
    for (const key of keys) {
      await ctx.db.delete(key._id);
    }
    await continuePhase(ctx, job);
    return;
  }
  await ctx.db.delete(client._id);
  await continuePhase(ctx, job);
}

async function runOnboardingPurge(
  ctx: any,
  job: Doc<'businessDeletionJobs'>,
  businessId: Id<'businesses'>
) {
  const drafts = await ctx.db
    .query('businessOnboardingDrafts')
    .withIndex('by_businessId', (q: any) => q.eq('businessId', businessId))
    .take(DELETE_BATCH_SIZE);
  for (const draft of drafts) {
    if (draft.programImageStorageId) {
      await captureAsset(ctx, job._id, draft.programImageStorageId);
    }
    await ctx.db.delete(draft._id);
  }
  if (drafts.length > 0) {
    await continuePhase(ctx, job);
    return;
  }
  await moveToPhase(ctx, job, 'purge_memberships');
}

async function runProgramPurge(
  ctx: any,
  job: Doc<'businessDeletionJobs'>,
  businessId: Id<'businesses'>
) {
  const programs = await ctx.db
    .query('loyaltyPrograms')
    .withIndex('by_businessId', (q: any) => q.eq('businessId', businessId))
    .take(DELETE_BATCH_SIZE);
  for (const program of programs) {
    if (program.imageStorageId) {
      await captureAsset(ctx, job._id, program.imageStorageId);
    }
    await ctx.db.delete(program._id);
  }
  if (programs.length > 0) {
    await continuePhase(ctx, job);
    return;
  }
  await moveToPhase(ctx, job, 'purge_assets');
}

async function runAssetPurge(
  ctx: any,
  job: Doc<'businessDeletionJobs'>
) {
  const assets = await ctx.db
    .query('businessDeletionAssets')
    .withIndex('by_jobId_cleanupStatus', (q: any) =>
      q.eq('jobId', job._id).eq('cleanupStatus', 'pending')
    )
    .take(DELETE_BATCH_SIZE);
  const now = Date.now();
  for (const asset of assets) {
    const [programReference, draftReference] = await Promise.all([
      ctx.db
        .query('loyaltyPrograms')
        .withIndex('by_imageStorageId', (q: any) =>
          q.eq('imageStorageId', asset.storageId)
        )
        .first(),
      ctx.db
        .query('businessOnboardingDrafts')
        .withIndex('by_programImageStorageId', (q: any) =>
          q.eq('programImageStorageId', asset.storageId)
        )
        .first(),
    ]);
    if (programReference || draftReference) {
      await ctx.db.patch(asset._id, {
        cleanupStatus: 'preserved_shared',
        updatedAt: now,
      });
    } else {
      await ctx.storage.delete(asset.storageId);
      await ctx.db.patch(asset._id, {
        cleanupStatus: 'deleted',
        updatedAt: now,
      });
    }
  }
  if (assets.length > 0) {
    await continuePhase(ctx, job);
    return;
  }
  await moveToPhase(ctx, job, 'verify');
}

async function hasDirectRows(
  ctx: any,
  table: string,
  index: string,
  field: string,
  value: unknown
) {
  return Boolean(
    await ctx.db
      .query(table)
      .withIndex(index, (q: any) => q.eq(field, value))
      .first()
  );
}

async function findRemainingPhase(
  ctx: any,
  job: Doc<'businessDeletionJobs'>,
  businessId: Id<'businesses'>
): Promise<DeletionPhase | null> {
  if (
    await hasDirectRows(
      ctx,
      'users',
      'by_activeBusinessId',
      'activeBusinessId',
      businessId
    )
  ) {
    return 'clear_active_user_refs';
  }
  const b2bChecks = [
    ['businessReferralLinks', 'by_referrerBusinessId', 'referrerBusinessId'],
    [
      'businessReferrals',
      'by_referrerBusinessId_status_createdAt',
      'referrerBusinessId',
    ],
    ['businessReferrals', 'by_referredBusinessId', 'referredBusinessId'],
  ];
  for (const [table, index, field] of b2bChecks) {
    if (await hasDirectRows(ctx, table, index, field, businessId)) {
      return 'reconcile_b2b';
    }
  }
  if (
    (await hasDirectRows(
      ctx,
      'referralAdminAuditLog',
      'by_businessId_createdAt',
      'businessId',
      businessId
    )) ||
    (await hasDirectRows(
      ctx,
      'revenueCatWebhookEvents',
      'by_businessId',
      'businessId',
      businessId
    ))
  ) {
    return 'redact_audit';
  }

  const phaseChecks: Array<[DeletionPhase, DeleteStep[]]> = [
    [
      'purge_customer_referrals',
      [
        {
          name: '',
          table: 'referralRewards',
          index: 'by_businessId_status_createdAt',
          field: 'businessId',
        },
        {
          name: '',
          table: 'customerReferrals',
          index: 'by_businessId_status_createdAt',
          field: 'businessId',
        },
        {
          name: '',
          table: 'customerReferralLinks',
          index: 'by_businessId_createdAt',
          field: 'businessId',
        },
        { name: '', table: 'referralConfigs', index: 'by_businessId', field: 'businessId' },
      ],
    ],
    [
      'purge_scans_events',
      [
        { name: '', table: 'scanTokenEvents', index: 'by_businessId', field: 'businessId' },
        { name: '', table: 'scanSessions', index: 'by_businessId', field: 'businessId' },
        { name: '', table: 'events', index: 'by_businessId', field: 'businessId' },
      ],
    ],
    [
      'purge_messages',
      [
        { name: '', table: 'messageLog', index: 'by_businessId', field: 'businessId' },
        { name: '', table: 'pushDeliveryLog', index: 'by_businessId', field: 'businessId' },
      ],
    ],
    [
      'purge_ai',
      [
        { name: '', table: 'aiUsageLedger', index: 'by_businessId', field: 'businessId' },
        {
          name: '',
          table: 'recommendationInteractions',
          index: 'by_businessId',
          field: 'businessId',
        },
        {
          name: '',
          table: 'recommendationGuideSessions',
          index: 'by_businessId',
          field: 'businessId',
        },
        {
          name: '',
          table: 'smartManagerAuditEvents',
          index: 'by_businessId',
          field: 'businessId',
        },
        {
          name: '',
          table: 'smartManagerShadowComparisons',
          index: 'by_businessId',
          field: 'businessId',
        },
        {
          name: '',
          table: 'smartManagerDecisions',
          index: 'by_businessId',
          field: 'businessId',
        },
        {
          name: '',
          table: 'smartManagerFactSnapshots',
          index: 'by_businessId',
          field: 'businessId',
        },
        {
          name: '',
          table: 'smartManagerEvaluationStates',
          index: 'by_businessId',
          field: 'businessId',
        },
        { name: '', table: 'aiRecommendations', index: 'by_businessId', field: 'businessId' },
        { name: '', table: 'aiBusinessSnapshots', index: 'by_businessId', field: 'businessId' },
        { name: '', table: 'aiGenerationCache', index: 'by_businessId', field: 'businessId' },
      ],
    ],
    [
      'purge_campaigns',
      [
        { name: '', table: 'campaignRuns', index: 'by_businessId', field: 'businessId' },
        { name: '', table: 'campaigns', index: 'by_businessId', field: 'businessId' },
      ],
    ],
    [
      'purge_staff',
      [
        { name: '', table: 'staffEvents', index: 'by_businessId', field: 'businessId' },
        { name: '', table: 'staffInvites', index: 'by_businessId', field: 'businessId' },
        { name: '', table: 'businessStaff', index: 'by_businessId', field: 'businessId' },
      ],
    ],
    [
      'purge_onboarding',
      [
        {
          name: '',
          table: 'businessOnboardingDrafts',
          index: 'by_businessId',
          field: 'businessId',
        },
      ],
    ],
    [
      'purge_memberships',
      [{ name: '', table: 'memberships', index: 'by_businessId', field: 'businessId' }],
    ],
    [
      'purge_subscriptions',
      [{ name: '', table: 'subscriptions', index: 'by_businessId', field: 'businessId' }],
    ],
    [
      'purge_programs',
      [{ name: '', table: 'loyaltyPrograms', index: 'by_businessId', field: 'businessId' }],
    ],
  ];
  for (const [phase, checks] of phaseChecks) {
    for (const check of checks) {
      if (
        await hasDirectRows(
          ctx,
          check.table,
          check.index,
          check.field,
          businessId
        )
      ) {
        return phase;
      }
    }
  }
  if (
    await hasDirectRows(
      ctx,
      'apiClients',
      'by_businessId',
      'businessId',
      businessId
    )
  ) {
    return 'purge_api';
  }
  const pendingAsset = await ctx.db
    .query('businessDeletionAssets')
    .withIndex('by_jobId_cleanupStatus', (q: any) =>
      q.eq('jobId', job._id).eq('cleanupStatus', 'pending')
    )
    .first();
  const failedAsset = await ctx.db
    .query('businessDeletionAssets')
    .withIndex('by_jobId_cleanupStatus', (q: any) =>
      q.eq('jobId', job._id).eq('cleanupStatus', 'failed')
    )
    .first();
  if (failedAsset) {
    throw new Error('BUSINESS_DELETION_ASSET_CLEANUP_FAILED');
  }
  return pendingAsset ? 'purge_assets' : null;
}

async function runFinalization(
  ctx: any,
  job: Doc<'businessDeletionJobs'>,
  businessId: Id<'businesses'>
) {
  const step = getProgressStep(job, 'delete_root');
  if (step === 'delete_root') {
    const remaining = await findRemainingPhase(ctx, job, businessId);
    if (remaining) {
      await moveToPhase(ctx, job, remaining);
      return;
    }
    const business = await ctx.db.get(businessId);
    if (business) {
      await ctx.db.delete(business._id);
    }
    await continuePhase(ctx, job, {
      progress: { step: 'cleanup_recipients' },
    });
    return;
  }
  if (step === 'cleanup_recipients') {
    const recipients = await ctx.db
      .query('businessDeletionRecipients')
      .withIndex('by_jobId', (q: any) => q.eq('jobId', job._id))
      .take(DELETE_BATCH_SIZE);
    for (const recipient of recipients) {
      await ctx.db.delete(recipient._id);
    }
    if (recipients.length > 0) {
      await continuePhase(ctx, job, {
        progress: { step: 'cleanup_recipients' },
      });
    } else {
      await continuePhase(ctx, job, {
        progress: { step: 'cleanup_assets' },
      });
    }
    return;
  }
  const assets = await ctx.db
    .query('businessDeletionAssets')
    .withIndex('by_jobId', (q: any) => q.eq('jobId', job._id))
    .take(DELETE_BATCH_SIZE);
  for (const asset of assets) {
    await ctx.db.delete(asset._id);
  }
  if (assets.length > 0) {
    await continuePhase(ctx, job, {
      progress: { step: 'cleanup_assets' },
    });
    return;
  }
  const now = Date.now();
  await ctx.db.patch(job._id, {
    status: 'completed',
    phase: 'completed',
    cursor: undefined,
    progress: undefined,
    failureCode: undefined,
    failureDetail: undefined,
    completedAt: now,
    updatedAt: now,
  });
}

const CUSTOMER_REFERRAL_STEPS: DeleteStep[] = [
  {
    name: 'rewards',
    table: 'referralRewards',
    index: 'by_businessId_status_createdAt',
    field: 'businessId',
  },
  {
    name: 'referrals',
    table: 'customerReferrals',
    index: 'by_businessId_status_createdAt',
    field: 'businessId',
  },
  {
    name: 'links',
    table: 'customerReferralLinks',
    index: 'by_businessId_createdAt',
    field: 'businessId',
  },
  {
    name: 'config',
    table: 'referralConfigs',
    index: 'by_businessId',
    field: 'businessId',
  },
];

const SCAN_EVENT_STEPS: DeleteStep[] = [
  { name: 'tokens', table: 'scanTokenEvents', index: 'by_businessId', field: 'businessId' },
  { name: 'sessions', table: 'scanSessions', index: 'by_businessId', field: 'businessId' },
  { name: 'events', table: 'events', index: 'by_businessId', field: 'businessId' },
];

const MESSAGE_STEPS: DeleteStep[] = [
  { name: 'messages', table: 'messageLog', index: 'by_businessId', field: 'businessId' },
  { name: 'push_logs', table: 'pushDeliveryLog', index: 'by_businessId', field: 'businessId' },
];

const AI_STEPS: DeleteStep[] = [
  { name: 'usage', table: 'aiUsageLedger', index: 'by_businessId', field: 'businessId' },
  {
    name: 'interactions',
    table: 'recommendationInteractions',
    index: 'by_businessId',
    field: 'businessId',
  },
  {
    name: 'guides',
    table: 'recommendationGuideSessions',
    index: 'by_businessId',
    field: 'businessId',
  },
  {
    name: 'manager_audits',
    table: 'smartManagerAuditEvents',
    index: 'by_businessId',
    field: 'businessId',
  },
  {
    name: 'manager_shadow',
    table: 'smartManagerShadowComparisons',
    index: 'by_businessId',
    field: 'businessId',
  },
  {
    name: 'manager_decisions',
    table: 'smartManagerDecisions',
    index: 'by_businessId',
    field: 'businessId',
  },
  {
    name: 'manager_facts',
    table: 'smartManagerFactSnapshots',
    index: 'by_businessId',
    field: 'businessId',
  },
  {
    name: 'manager_dirty',
    table: 'smartManagerEvaluationStates',
    index: 'by_businessId',
    field: 'businessId',
  },
  {
    name: 'recommendations',
    table: 'aiRecommendations',
    index: 'by_businessId',
    field: 'businessId',
  },
  { name: 'snapshots', table: 'aiBusinessSnapshots', index: 'by_businessId', field: 'businessId' },
  { name: 'cache', table: 'aiGenerationCache', index: 'by_businessId', field: 'businessId' },
];

const CAMPAIGN_STEPS: DeleteStep[] = [
  { name: 'runs', table: 'campaignRuns', index: 'by_businessId', field: 'businessId' },
  { name: 'campaigns', table: 'campaigns', index: 'by_businessId', field: 'businessId' },
];

const STAFF_STEPS: DeleteStep[] = [
  { name: 'events', table: 'staffEvents', index: 'by_businessId', field: 'businessId' },
  { name: 'invites', table: 'staffInvites', index: 'by_businessId', field: 'businessId' },
  { name: 'relationships', table: 'businessStaff', index: 'by_businessId', field: 'businessId' },
];

export const processBusinessDeletionBatchInternal = internalMutation({
  args: { jobId: v.id('businessDeletionJobs') },
  handler: async (ctx, { jobId }) => {
    const job = await ctx.db.get(jobId);
    if (!job || job.status === 'completed' || job.status === 'failed') {
      return { status: 'stale' as const };
    }
    if (job.status === 'queued') {
      await ctx.db.patch(job._id, {
        status: 'running',
        updatedAt: Date.now(),
      });
    }
    const businessId = ctx.db.normalizeId('businesses', job.businessId);
    if (!businessId) {
      throw new Error('BUSINESS_ID_INVALID');
    }
    const business = await ctx.db.get(businessId);
    if (!business && job.phase !== 'finalize') {
      throw new Error('BUSINESS_ROOT_MISSING_EARLY');
    }

    switch (job.phase) {
      case 'capture_customers':
        await runCaptureCustomers(ctx, job, businessId);
        break;
      case 'capture_staff':
        await runCaptureStaff(ctx, job, businessId);
        break;
      case 'schedule_notifications':
        await runScheduleNotifications(ctx, job);
        break;
      case 'clear_active_user_refs':
        await runClearActiveUserRefs(ctx, job, businessId);
        break;
      case 'reconcile_b2b':
        await runB2bReconciliation(ctx, job, businessId);
        break;
      case 'redact_audit':
        await runAuditRedaction(ctx, job, businessId);
        break;
      case 'purge_customer_referrals':
        await runDeleteSteps(
          ctx,
          job,
          businessId,
          CUSTOMER_REFERRAL_STEPS,
          'purge_scans_events'
        );
        break;
      case 'purge_scans_events':
        await runDeleteSteps(
          ctx,
          job,
          businessId,
          SCAN_EVENT_STEPS,
          'purge_messages'
        );
        break;
      case 'purge_messages':
        await runDeleteSteps(
          ctx,
          job,
          businessId,
          MESSAGE_STEPS,
          'purge_ai'
        );
        break;
      case 'purge_ai':
        await runDeleteSteps(ctx, job, businessId, AI_STEPS, 'purge_campaigns');
        break;
      case 'purge_campaigns':
        await runDeleteSteps(
          ctx,
          job,
          businessId,
          CAMPAIGN_STEPS,
          'purge_staff'
        );
        break;
      case 'purge_staff':
        await runDeleteSteps(ctx, job, businessId, STAFF_STEPS, 'purge_api');
        break;
      case 'purge_api':
        await runApiPurge(ctx, job, businessId);
        break;
      case 'purge_onboarding':
        await runOnboardingPurge(ctx, job, businessId);
        break;
      case 'purge_memberships':
        await runDeleteSteps(
          ctx,
          job,
          businessId,
          [
            {
              name: 'memberships',
              table: 'memberships',
              index: 'by_businessId',
              field: 'businessId',
            },
          ],
          'purge_subscriptions'
        );
        break;
      case 'purge_subscriptions':
        await runDeleteSteps(
          ctx,
          job,
          businessId,
          [
            {
              name: 'subscriptions',
              table: 'subscriptions',
              index: 'by_businessId',
              field: 'businessId',
            },
          ],
          'purge_programs'
        );
        break;
      case 'purge_programs':
        await runProgramPurge(ctx, job, businessId);
        break;
      case 'purge_assets':
        await runAssetPurge(ctx, job);
        break;
      case 'verify': {
        const remaining = await findRemainingPhase(ctx, job, businessId);
        if (remaining) {
          await moveToPhase(ctx, job, remaining);
        } else {
          await moveToPhase(ctx, job, 'finalize');
        }
        break;
      }
      case 'finalize':
        await runFinalization(ctx, job, businessId);
        break;
      default:
        throw new Error(`UNSUPPORTED_DELETION_PHASE:${job.phase}`);
    }
    return { status: 'processed' as const, phase: job.phase };
  },
});

export const purgePermanentDeletionRetentionInternal = internalMutation({
  args: {},
  handler: async (ctx) => {
    const now = Date.now();
    const revenueRows = await ctx.db
      .query('revenueCatWebhookEvents')
      .withIndex('by_purgeAfter', (q: any) => q.lte('purgeAfter', now))
      .take(DELETE_BATCH_SIZE);
    let revenueCatAuditDeleted = 0;
    for (const row of revenueRows) {
      if (row.redactedAt && row.purgeAfter && row.purgeAfter <= now) {
        await ctx.db.delete(row._id);
        revenueCatAuditDeleted += 1;
      }
    }
    const referralRows = await ctx.db
      .query('referralAdminAuditLog')
      .withIndex('by_purgeAfter', (q: any) => q.lte('purgeAfter', now))
      .take(DELETE_BATCH_SIZE);
    let referralAuditDeleted = 0;
    for (const row of referralRows) {
      if (row.redactedAt && row.purgeAfter && row.purgeAfter <= now) {
        await ctx.db.delete(row._id);
        referralAuditDeleted += 1;
      }
    }
    const completedJobs = await ctx.db
      .query('businessDeletionJobs')
      .withIndex('by_status_completedAt', (q: any) =>
        q
          .eq('status', 'completed')
          .lte('completedAt', now - COMPLETED_JOB_RETENTION_MS)
      )
      .take(DELETE_BATCH_SIZE);
    for (const job of completedJobs) {
      await ctx.db.delete(job._id);
    }
    return {
      revenueCatAuditDeleted,
      referralAuditDeleted,
      completedJobsDeleted: completedJobs.length,
    };
  },
});

export async function getIncompleteDeletionBusinessIdsForUser(
  ctx: any,
  userId: Id<'users'>
) {
  const jobs: Doc<'businessDeletionJobs'>[] = [];
  for (const status of ['queued', 'running', 'failed'] as const) {
    const matching = await ctx.db
      .query('businessDeletionJobs')
      .withIndex('by_requestedByUserId_status', (q: any) =>
        q.eq('requestedByUserId', userId).eq('status', status)
      )
      .collect();
    jobs.push(...matching);
  }
  return jobs.map(
    (job) =>
      ctx.db.normalizeId('businesses', job.businessId) ??
      (job.businessId as Id<'businesses'>)
  );
}

export async function cleanupCompletedDeletionReferencesForUser(
  ctx: any,
  userId: Id<'users'>
) {
  while (true) {
    const recipients = await ctx.db
      .query('businessDeletionRecipients')
      .withIndex('by_userId', (q: any) => q.eq('userId', userId))
      .take(DELETE_BATCH_SIZE);
    if (recipients.length === 0) {
      break;
    }
    for (const recipient of recipients) {
      await ctx.db.delete(recipient._id);
    }
  }
  while (true) {
    const jobs = await ctx.db
      .query('businessDeletionJobs')
      .withIndex('by_requestedByUserId_status', (q: any) =>
        q.eq('requestedByUserId', userId).eq('status', 'completed')
      )
      .take(DELETE_BATCH_SIZE);
    if (jobs.length === 0) {
      break;
    }
    for (const job of jobs) {
      await ctx.db.delete(job._id);
    }
  }
}
