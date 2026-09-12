import { cronJobs, makeFunctionReference } from 'convex/server';

import { internal } from './_generated/api';

const crons = cronJobs();
const internalDeletionApi = (internal as any).businessDeletion;
const internalProviderCredentialsApi = (internal as any).providerCredentials;
const internalAccountDeletionApi = (internal as any).accountDeletionRequests;
const internalSmartManagerApi = (internal as any).smartManager;
const internalSmartManagerActionsApi = (internal as any).smartManagerActions;
const internalRedemptionReceiptsApi = (internal as any).redemptionReceipts;
const smartManagerDeliverySweepRef = makeFunctionReference<
  'mutation',
  Record<string, never>,
  { scheduled: number }
>('smartManagerDelivery:sweepSmartManagerDeliveriesInternal');

crons.hourly(
  'campaign automation sweep hourly',
  { minuteUTC: 0 },
  internal.campaigns.runAutomationSweepInternal
);

crons.interval(
  'ai recommendation sweep every 12 hours',
  { hours: 12 },
  internal.aiRecommendations.runRecommendationSweepInternal
);

crons.daily(
  'scan session retention cleanup daily',
  { hourUTC: 1, minuteUTC: 0 },
  internal.scanner.cleanupExpiredScanSessionsInternal
);

crons.daily(
  'redemption celebration receipt cleanup daily',
  { hourUTC: 1, minuteUTC: 10 },
  internalRedemptionReceiptsApi.cleanupRedemptionReceiptsInternal
);

crons.daily(
  'referral links and rewards expiration sweep daily',
  { hourUTC: 1, minuteUTC: 20 },
  internal.referrals.expireReferralLinksInternal
);

crons.daily(
  'referral rewards expiration sweep daily',
  { hourUTC: 1, minuteUTC: 35 },
  internal.referrals.expireReferralRewardsInternal
);

crons.hourly(
  'business referral qualification reconcile hourly',
  { minuteUTC: 20 },
  internal.businessReferralEngine.evaluateDueReferralsInternal,
  {}
);

crons.daily(
  'legacy business referral credit sweep daily',
  { hourUTC: 1, minuteUTC: 25 },
  internal.referrals.processDueBusinessReferralCreditsInternal
);

crons.daily(
  'permanent deletion audit and receipt retention cleanup daily',
  { hourUTC: 2, minuteUTC: 10 },
  internalDeletionApi.purgePermanentDeletionRetentionInternal
);

crons.daily(
  'handled account deletion request retention cleanup daily',
  { hourUTC: 2, minuteUTC: 30 },
  internalAccountDeletionApi.purgeExpiredHandledRequestsInternal
);

crons.hourly(
  'provider revocation retry and receipt cleanup hourly',
  { minuteUTC: 40 },
  internalProviderCredentialsApi.sweepProviderRevocationJobsInternal
);

crons.daily(
  'smart manager audit retention cleanup daily',
  { hourUTC: 2, minuteUTC: 50 },
  internalSmartManagerApi.purgeExpiredAuditEventsInternal,
  { limit: 100 }
);

crons.daily(
  'smart manager prepared action retention cleanup daily',
  { hourUTC: 3, minuteUTC: 10 },
  internalSmartManagerActionsApi.cleanupPreparedActionRetentionInternal,
  { limit: 100, phase: 'copies', cursor: null }
);

crons.interval(
  'smart manager bounded reconciliation every 15 minutes',
  { minutes: 15 },
  internalSmartManagerApi.reconcileDueEvaluationsInternal,
  { cursor: null, limit: 25 }
);

crons.interval(
  'smart manager delivery recovery every 5 minutes',
  { minutes: 5 },
  smartManagerDeliverySweepRef
);

export default crons;
