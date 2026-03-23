import { v } from 'convex/values';
import type { Id } from './_generated/dataModel';
import { query } from './_generated/server';
import { getLatestRecommendationForBusiness } from './aiRecommendations';
import { getBusinessActivity } from './analytics';
import {
  getBusinessSettings,
  getBusinessTeamSummary,
  listBusinessStaffHistory,
} from './business';
import { listManagementCampaignsByBusiness } from './campaigns';
import { getBusinessUsageSummary } from './entitlements';
import { getCustomerManagementSnapshot, getRecentActivity } from './events';
import { requireActorIsStaffForBusiness } from './guards';
import { listManagementByBusiness } from './loyaltyPrograms';
import { getBusinessRewardEligibilitySummary } from './memberships';

const DAY_MS = 24 * 60 * 60 * 1000;
const CAMPAIGN_WINDOW_DAYS = 45;
const ACTIVITY_WINDOW_DAYS = 7;

type CampaignRunLite = {
  campaignId: Id<'campaigns'>;
  sentAt: number;
  summaryStatus: 'pending' | 'ready' | 'summarized';
  deliveredCount: number;
  returnedCustomers14d?: number;
  rewardRedemptions14d?: number;
};

type CampaignSummaryRow = {
  campaignId: Id<'campaigns'>;
  title: string;
  type: string;
  lifecycle: 'active' | 'inactive' | 'archived';
  automationEnabled: boolean;
  estimatedAudience: number;
  reachedMessagesAllTime: number;
  reachedUniqueAllTime: number;
  lastSentAt: number | null;
  summaryStatus: 'pending' | 'ready' | 'summarized' | 'not_available';
  deliveredCount14d: number | null;
  returnedCustomers14d: number | null;
  rewardRedemptions14d: number | null;
};

function safeNumber(value: unknown, fallback = 0) {
  return typeof value === 'number' && Number.isFinite(value) ? value : fallback;
}

function sumLast7Days(
  daily:
    | Array<{ stamps?: number | null; redemptions?: number | null }>
    | undefined
) {
  const source = Array.isArray(daily) ? daily.slice(-7) : [];
  const stamps = source.reduce(
    (sum, day) => sum + safeNumber(day.stamps, 0),
    0
  );
  const redemptions = source.reduce(
    (sum, day) => sum + safeNumber(day.redemptions, 0),
    0
  );
  return { stamps, redemptions };
}

function toLifecycle(value: unknown): 'active' | 'inactive' | 'archived' {
  if (value === 'active' || value === 'inactive' || value === 'archived') {
    return value;
  }
  return 'inactive';
}

function toSummaryStatus(
  value: unknown
): 'pending' | 'ready' | 'summarized' | 'not_available' {
  if (value === 'pending' || value === 'ready' || value === 'summarized') {
    return value;
  }
  return 'not_available';
}

function percent(used: number, limit: number) {
  if (limit <= 0) {
    return 0;
  }
  return Math.round((used / limit) * 100);
}

function isNearLimit(used: number, limit: number) {
  if (limit <= 0) {
    return false;
  }
  const ratio = used / limit;
  return ratio >= 0.8 && ratio < 1;
}

function isAtLimit(used: number, limit: number) {
  if (limit <= 0) {
    return false;
  }
  return used >= limit;
}

function addAttentionSignal(
  rows: Array<{
    key: string;
    priority: number;
    tone: 'info' | 'warning' | 'critical';
    title: string;
    subtitle: string;
    ctaRoute: string;
  }>,
  row: {
    key: string;
    priority: number;
    tone: 'info' | 'warning' | 'critical';
    title: string;
    subtitle: string;
    ctaRoute: string;
  }
) {
  rows.push(row);
}

export const getBusinessDashboardSummary = query({
  args: {
    businessId: v.optional(v.id('businesses')),
  },
  handler: async (
    ctx: any,
    { businessId }: { businessId?: Id<'businesses'> }
  ): Promise<any> => {
    if (!businessId) {
      return null;
    }

    await requireActorIsStaffForBusiness(ctx, businessId);

    const safeRun = async (fn: () => Promise<any>, fallback: any) => {
      try {
        return await fn();
      } catch {
        return fallback;
      }
    };

    const [
      businessSettings,
      usageSummary,
      activity,
      programs,
      rewardEligibilitySummary,
      recentActivity,
      aiRecommendation,
      customerSnapshot,
      campaigns,
      teamSummary,
      teamHistory,
    ]: any[] = await Promise.all([
      safeRun(
        () =>
          ctx.runQuery(getBusinessSettings, {
            businessId,
          }),
        null
      ),
      safeRun(
        () =>
          ctx.runQuery(getBusinessUsageSummary, {
            businessId,
          }),
        null
      ),
      safeRun(
        () =>
          ctx.runQuery(getBusinessActivity, {
            businessId,
          }),
        null
      ),
      safeRun(
        () =>
          ctx.runQuery(listManagementByBusiness, {
            businessId,
          }),
        []
      ),
      safeRun(
        () =>
          ctx.runQuery(getBusinessRewardEligibilitySummary, {
            businessId,
          }),
        { redeemableCustomers: 0, redeemableCards: 0 }
      ),
      safeRun(
        () =>
          ctx.runQuery(getRecentActivity, {
            businessId,
            limit: 5,
          }),
        []
      ),
      safeRun(
        () =>
          ctx.runQuery(getLatestRecommendationForBusiness, {
            businessId,
          }),
        null
      ),
      safeRun(
        () =>
          ctx.runQuery(getCustomerManagementSnapshot, {
            businessId,
          }),
        null
      ),
      safeRun(
        () =>
          ctx.runQuery(listManagementCampaignsByBusiness, {
            businessId,
          }),
        []
      ),
      safeRun(
        () =>
          ctx.runQuery(getBusinessTeamSummary, {
            businessId,
          }),
        null
      ),
      safeRun(
        () =>
          ctx.runQuery(listBusinessStaffHistory, {
            businessId,
            limit: 5,
          }),
        []
      ),
    ]);

    const now = Date.now();
    const campaignWindowStart = now - CAMPAIGN_WINDOW_DAYS * DAY_MS;
    const campaignRunsRaw = (await ctx.db
      .query('campaignRuns')
      .withIndex('by_businessId_sentAt', (q: any) =>
        q.eq('businessId', businessId).gte('sentAt', campaignWindowStart)
      )
      .collect()) as CampaignRunLite[];

    const latestRunByCampaignId = new Map<string, CampaignRunLite>();
    for (const run of campaignRunsRaw) {
      const key = String(run.campaignId);
      const existing = latestRunByCampaignId.get(key);
      if (!existing || run.sentAt > existing.sentAt) {
        latestRunByCampaignId.set(key, run);
      }
    }

    const campaignRows = (Array.isArray(campaigns) ? campaigns : []).map(
      (campaign: any): CampaignSummaryRow => {
        const run = latestRunByCampaignId.get(String(campaign.campaignId));
        return {
          campaignId: campaign.campaignId,
          title: String(campaign.title ?? 'Campaign'),
          type: String(campaign.type ?? 'promo'),
          lifecycle: toLifecycle(campaign.lifecycle),
          automationEnabled: campaign.automationEnabled === true,
          estimatedAudience: safeNumber(campaign.estimatedAudience, 0),
          reachedMessagesAllTime: safeNumber(
            campaign.reachedMessagesAllTime,
            0
          ),
          reachedUniqueAllTime: safeNumber(campaign.reachedUniqueAllTime, 0),
          lastSentAt:
            typeof campaign.lastSentAt === 'number'
              ? campaign.lastSentAt
              : null,
          summaryStatus: run
            ? toSummaryStatus(run.summaryStatus)
            : 'not_available',
          deliveredCount14d: run ? safeNumber(run.deliveredCount, 0) : null,
          returnedCustomers14d: run
            ? safeNumber(run.returnedCustomers14d, 0)
            : null,
          rewardRedemptions14d: run
            ? safeNumber(run.rewardRedemptions14d, 0)
            : null,
        };
      }
    );

    const rowsWithReadySummary = campaignRows.filter(
      (row) =>
        row.summaryStatus === 'ready' || row.summaryStatus === 'summarized'
    );

    const bestReturnCampaign =
      rowsWithReadySummary
        .slice()
        .sort(
          (a, b) =>
            safeNumber(b.returnedCustomers14d, 0) -
            safeNumber(a.returnedCustomers14d, 0)
        )[0] ?? null;
    const bestRedemptionCampaign =
      rowsWithReadySummary
        .slice()
        .sort(
          (a, b) =>
            safeNumber(b.rewardRedemptions14d, 0) -
            safeNumber(a.rewardRedemptions14d, 0)
        )[0] ?? null;
    const largestReachCampaign =
      campaignRows
        .slice()
        .sort((a, b) => b.reachedUniqueAllTime - a.reachedUniqueAllTime)[0] ??
      null;

    const needsReviewCampaign =
      rowsWithReadySummary.find((row) => {
        const reach = Math.max(
          safeNumber(row.deliveredCount14d, 0),
          safeNumber(row.reachedUniqueAllTime, 0)
        );
        return (
          reach >= 20 &&
          safeNumber(row.returnedCustomers14d, 0) === 0 &&
          safeNumber(row.rewardRedemptions14d, 0) === 0
        );
      }) ?? null;

    const campaignPerformanceTopRows = campaignRows
      .slice()
      .sort((a, b) => {
        const outcomeA =
          safeNumber(a.returnedCustomers14d, 0) * 3 +
          safeNumber(a.rewardRedemptions14d, 0) * 2 +
          safeNumber(a.reachedUniqueAllTime, 0);
        const outcomeB =
          safeNumber(b.returnedCustomers14d, 0) * 3 +
          safeNumber(b.rewardRedemptions14d, 0) * 2 +
          safeNumber(b.reachedUniqueAllTime, 0);
        return outcomeB - outcomeA;
      })
      .slice(0, 5);

    const daily = Array.isArray((activity as any)?.daily)
      ? ((activity as any).daily as Array<{
          stamps?: number;
          redemptions?: number;
        }>)
      : [];
    const totals7d = sumLast7Days(daily);

    const activePrograms = (Array.isArray(programs) ? programs : []).filter(
      (program: any) => program.lifecycle === 'active'
    );
    const draftPrograms = (Array.isArray(programs) ? programs : []).filter(
      (program: any) => program.lifecycle === 'draft'
    );
    const archivedPrograms = (Array.isArray(programs) ? programs : []).filter(
      (program: any) => program.lifecycle === 'archived'
    );

    const usage = usageSummary as any;
    const cardsUsed = safeNumber(usage?.cardsUsed, activePrograms.length);
    const cardsLimit = safeNumber(usage?.limits?.maxCards, 0);
    const customersUsed = safeNumber(usage?.customersUsed, 0);
    const customersLimit = safeNumber(usage?.limits?.maxCustomers, 0);
    const campaignsUsed = safeNumber(usage?.activeManagementCampaignsUsed, 0);
    const campaignsLimit = safeNumber(usage?.limits?.maxCampaigns, 0);
    const retentionUsed = safeNumber(usage?.activeRetentionActionsUsed, 0);
    const retentionLimit = safeNumber(
      usage?.limits?.maxActiveRetentionActions,
      0
    );
    const aiUsed = safeNumber(usage?.aiExecutionsThisMonthUsed, 0);
    const aiLimit = safeNumber(usage?.limits?.maxAiExecutionsPerMonth, 0);

    const usageWarnings: string[] = [];
    if (isAtLimit(cardsUsed, cardsLimit))
      usageWarnings.push('cards_limit_reached');
    else if (isNearLimit(cardsUsed, cardsLimit))
      usageWarnings.push('cards_limit_near');
    if (isAtLimit(customersUsed, customersLimit))
      usageWarnings.push('customers_limit_reached');
    else if (isNearLimit(customersUsed, customersLimit))
      usageWarnings.push('customers_limit_near');
    if (isAtLimit(campaignsUsed, campaignsLimit))
      usageWarnings.push('campaigns_limit_reached');
    else if (isNearLimit(campaignsUsed, campaignsLimit))
      usageWarnings.push('campaigns_limit_near');
    if (isAtLimit(retentionUsed, retentionLimit))
      usageWarnings.push('retention_limit_reached');
    else if (isNearLimit(retentionUsed, retentionLimit))
      usageWarnings.push('retention_limit_near');
    if (isAtLimit(aiUsed, aiLimit)) usageWarnings.push('ai_limit_reached');
    else if (isNearLimit(aiUsed, aiLimit)) usageWarnings.push('ai_limit_near');

    const customerSummary = (customerSnapshot as any)?.summary ?? null;
    const attentionSignals: Array<{
      key: string;
      priority: number;
      tone: 'info' | 'warning' | 'critical';
      title: string;
      subtitle: string;
      ctaRoute: string;
    }> = [];

    const missingFieldsCount = safeNumber(
      (businessSettings as any)?.profileCompletion?.missingFields?.length,
      0
    );
    const profileIncomplete = (businessSettings as any)?.profileCompletion
      ?.isComplete
      ? false
      : missingFieldsCount > 0;

    if (profileIncomplete) {
      addAttentionSignal(attentionSignals, {
        key: 'profile_incomplete',
        priority: 10,
        tone: 'critical',
        title: 'השלמת פרופיל עסק',
        subtitle: `יש ${missingFieldsCount} שדות חסרים`,
        ctaRoute: '/(authenticated)/(business)/settings-business-profile',
      });
    }

    if (activePrograms.length === 0) {
      addAttentionSignal(attentionSignals, {
        key: 'no_active_program',
        priority: 20,
        tone: 'warning',
        title: 'אין כרטיס נאמנות פעיל',
        subtitle: 'כדי להפעיל לקוחות וקמפיינים צריך לפחות תוכנית פעילה אחת.',
        ctaRoute: '/(authenticated)/(business)/cards',
      });
    }

    if (totals7d.stamps === 0) {
      addAttentionSignal(attentionSignals, {
        key: 'no_activity_7d',
        priority: 40,
        tone: 'warning',
        title: 'אין פעילות ב-7 ימים האחרונים',
        subtitle: 'לא נרשמו ניקובים בשבוע האחרון.',
        ctaRoute: '/(authenticated)/(business)/analytics',
      });
    }

    if (safeNumber(customerSummary?.atRiskCustomers, 0) > 0) {
      addAttentionSignal(attentionSignals, {
        key: 'customers_at_risk',
        priority: 30,
        tone: 'critical',
        title: 'לקוחות בסיכון נטישה',
        subtitle: `${safeNumber(customerSummary?.atRiskCustomers, 0)} לקוחות דורשים התייחסות`,
        ctaRoute: '/(authenticated)/(business)/customers',
      });
    }

    if (
      usageWarnings.includes('cards_limit_reached') ||
      usageWarnings.includes('customers_limit_reached') ||
      usageWarnings.includes('campaigns_limit_reached')
    ) {
      addAttentionSignal(attentionSignals, {
        key: 'plan_limit_reached',
        priority: 15,
        tone: 'critical',
        title: 'הגעתם למגבלת המסלול',
        subtitle: 'חלק מהיכולות מוגבלות עד לשדרוג המסלול.',
        ctaRoute: '/(authenticated)/(business)/settings-business-subscription',
      });
    } else if (
      usageWarnings.includes('cards_limit_near') ||
      usageWarnings.includes('customers_limit_near') ||
      usageWarnings.includes('campaigns_limit_near')
    ) {
      addAttentionSignal(attentionSignals, {
        key: 'plan_limit_near',
        priority: 16,
        tone: 'warning',
        title: 'מתקרבים למגבלת המסלול',
        subtitle: 'כדאי להיערך לפני חסימה של פעולות נוספות.',
        ctaRoute: '/(authenticated)/(business)/settings-business-subscription',
      });
    }

    const sortedAttentionSignals = attentionSignals
      .slice()
      .sort((a, b) => a.priority - b.priority)
      .slice(0, 3);

    const primaryStatus = sortedAttentionSignals[0]
      ? {
          key: sortedAttentionSignals[0].key,
          tone: sortedAttentionSignals[0].tone,
          title: sortedAttentionSignals[0].title,
          subtitle: sortedAttentionSignals[0].subtitle,
          ctaRoute: sortedAttentionSignals[0].ctaRoute,
        }
      : {
          key: 'healthy',
          tone: 'healthy' as const,
          title: 'העסק במצב טוב',
          subtitle: `נרשמו ${totals7d.stamps} ניקובים ו-${totals7d.redemptions} מימושים ב-7 ימים`,
          ctaRoute: null,
        };

    const topPrograms = activePrograms
      .slice()
      .sort(
        (a: any, b: any) =>
          safeNumber(b.metrics?.stamps7d, 0) -
          safeNumber(a.metrics?.stamps7d, 0)
      )
      .slice(0, 5)
      .map((program: any) => ({
        loyaltyProgramId: program.loyaltyProgramId,
        title: String(program.title ?? 'Program'),
        lifecycle:
          program.lifecycle === 'draft' ||
          program.lifecycle === 'active' ||
          program.lifecycle === 'archived'
            ? program.lifecycle
            : 'active',
        activeMembers: safeNumber(program.metrics?.activeMembers, 0),
        stamps7d: safeNumber(program.metrics?.stamps7d, 0),
        redemptions30d: safeNumber(program.metrics?.redemptions30d, 0),
        lastActivityAt:
          typeof program.metrics?.lastActivityAt === 'number'
            ? program.metrics.lastActivityAt
            : null,
      }));

    const inactivePrograms = activePrograms
      .filter((program: any) => {
        const last = safeNumber(program.metrics?.lastActivityAt, 0);
        if (last <= 0) {
          return true;
        }
        return now - last > 21 * DAY_MS;
      })
      .slice(0, 5)
      .map((program: any) => ({
        loyaltyProgramId: program.loyaltyProgramId,
        title: String(program.title ?? 'Program'),
        lastActivityAt:
          typeof program.metrics?.lastActivityAt === 'number'
            ? program.metrics.lastActivityAt
            : null,
      }));

    return {
      businessStatus: {
        businessId,
        businessName: String((businessSettings as any)?.name ?? ''),
        logoUrl: ((businessSettings as any)?.logoUrl ?? null) as string | null,
        plan: (usage?.plan ?? 'starter') as 'starter' | 'pro' | 'premium',
        profileCompletionPercent: safeNumber(
          (businessSettings as any)?.profileCompletion?.percent,
          0
        ),
        profileIncomplete,
        missingFieldsCount,
        primaryStatus,
      },
      kpiMetrics: {
        stamps7d: totals7d.stamps,
        redemptions7d: totals7d.redemptions,
        activeCustomers: customersUsed,
        activeCards: cardsUsed,
        redeemableCustomers: safeNumber(
          (rewardEligibilitySummary as any)?.redeemableCustomers,
          0
        ),
        growthPercent:
          typeof (activity as any)?.growthPercent === 'number'
            ? (activity as any).growthPercent
            : null,
      },
      attentionSignals: sortedAttentionSignals,
      aiRecommendation,
      customerHealthSummary: {
        isLocked: customerSnapshot == null,
        totalCustomers: safeNumber(customerSummary?.totalCustomers, 0),
        activeCustomers: safeNumber(customerSummary?.activeCustomers, 0),
        atRiskCustomers: safeNumber(customerSummary?.atRiskCustomers, 0),
        nearRewardCustomers: safeNumber(
          customerSummary?.nearRewardCustomers,
          0
        ),
        vipCustomers: safeNumber(customerSummary?.vipCustomers, 0),
        loyalCustomers: safeNumber(customerSummary?.loyalCustomers, 0),
        newCustomers: safeNumber(customerSummary?.newCustomers, 0),
        insights: Array.isArray((customerSnapshot as any)?.insights)
          ? (customerSnapshot as any).insights
          : [],
        opportunities: Array.isArray(
          (customerSnapshot as any)?.campaignOpportunityCards
        )
          ? (customerSnapshot as any).campaignOpportunityCards.map(
              (item: any) => ({
                key: String(item?.type ?? item?.key ?? 'opportunity'),
                title: String(item?.title ?? 'Opportunity'),
                audienceCount: safeNumber(item?.audienceCount, 0),
              })
            )
          : [],
      },
      campaignPerformanceSummary: {
        hasEnoughOutcomeData: rowsWithReadySummary.length > 0,
        overview: {
          activeCampaigns: campaignRows.filter(
            (row) => row.lifecycle === 'active'
          ).length,
          automatedCampaigns: campaignRows.filter(
            (row) => row.automationEnabled
          ).length,
          totalMessagesSent: campaignRows.reduce(
            (sum, row) => sum + safeNumber(row.reachedMessagesAllTime, 0),
            0
          ),
          campaignsWithReadyOutcomes: rowsWithReadySummary.length,
        },
        bestReturnCampaign,
        bestRedemptionCampaign,
        largestReachCampaign,
        needsReviewCampaign,
        topCampaigns: campaignPerformanceTopRows,
      },
      loyaltyProgramsSummary: {
        activeProgramsCount: activePrograms.length,
        draftProgramsCount: draftPrograms.length,
        archivedProgramsCount: archivedPrograms.length,
        activeMembers: activePrograms.reduce(
          (sum: number, program: any) =>
            sum + safeNumber(program.metrics?.activeMembers, 0),
          0
        ),
        redemptions30d: activePrograms.reduce(
          (sum: number, program: any) =>
            sum + safeNumber(program.metrics?.redemptions30d, 0),
          0
        ),
        redeemableCustomers: safeNumber(
          (rewardEligibilitySummary as any)?.redeemableCustomers,
          0
        ),
        redeemableCards: safeNumber(
          (rewardEligibilitySummary as any)?.redeemableCards,
          0
        ),
        topPrograms,
        inactivePrograms,
      },
      teamSummary: {
        isAvailable: teamSummary != null,
        activeStaffCount: safeNumber((teamSummary as any)?.activeStaffCount, 0),
        pendingInvitesCount: safeNumber(
          (teamSummary as any)?.pendingInvitesCount,
          0
        ),
        suspendedCount: safeNumber((teamSummary as any)?.suspendedCount, 0),
        managersCount: safeNumber((teamSummary as any)?.managersCount, 0),
        usedSeats: safeNumber((teamSummary as any)?.usedSeats, 0),
        maxSeats: safeNumber((teamSummary as any)?.maxSeats, 0),
        recentTeamEvents: (Array.isArray(teamHistory) ? teamHistory : []).map(
          (event: any) => ({
            eventId: event.eventId,
            eventType: String(event.eventType ?? ''),
            targetDisplayName:
              typeof event.targetDisplayName === 'string'
                ? event.targetDisplayName
                : null,
            actorDisplayName:
              typeof event.actorDisplayName === 'string'
                ? event.actorDisplayName
                : null,
            createdAt: safeNumber(event.createdAt, now),
          })
        ),
      },
      planUsageSummary: {
        plan: (usage?.plan ?? 'starter') as 'starter' | 'pro' | 'premium',
        billingPeriod:
          usage?.billingPeriod === 'monthly' ||
          usage?.billingPeriod === 'yearly'
            ? usage.billingPeriod
            : null,
        limits: {
          cardsUsed,
          cardsLimit,
          customersUsed,
          customersLimit,
          campaignsUsed,
          campaignsLimit,
          retentionUsed,
          retentionLimit,
          aiUsed,
          aiLimit,
        },
        warnings: usageWarnings,
      },
      recentActivity: (Array.isArray(recentActivity) ? recentActivity : []).map(
        (item: any) => ({
          id: item.id,
          type: item.type,
          customer: String(item.customer ?? ''),
          detail: String(item.detail ?? ''),
          timeLabel: String(item.time ?? ''),
          createdAt: null,
        })
      ),
      freshness: {
        generatedAt: now,
        activityWindowDays: ACTIVITY_WINDOW_DAYS,
        campaignOutcomeWindowDays: CAMPAIGN_WINDOW_DAYS,
      },
      // Compatibility payload to enable gradual migration of existing dashboard UI.
      sources: {
        businessSettings,
        usageSummary,
        activity,
        programs,
        rewardEligibilitySummary,
        recentActivity,
        aiRecommendation,
        customerSnapshot,
        campaigns,
        teamSummary,
      },
      computed: {
        usage: {
          cardsPercent: percent(cardsUsed, cardsLimit),
          customersPercent: percent(customersUsed, customersLimit),
          campaignsPercent: percent(campaignsUsed, campaignsLimit),
          retentionPercent: percent(retentionUsed, retentionLimit),
          aiPercent: percent(aiUsed, aiLimit),
        },
      },
    };
  },
});
