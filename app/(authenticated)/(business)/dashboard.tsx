import { Ionicons } from '@expo/vector-icons';
import { useMutation, useQuery } from 'convex/react';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  ScrollView,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import {
  SafeAreaView,
  useSafeAreaInsets,
} from 'react-native-safe-area-context';

import BusinessScreenHeader from '@/components/BusinessScreenHeader';
import {
  DonutChartCard,
  HorizontalRankingChart,
} from '@/components/business-ui';
import StickyScrollHeader from '@/components/StickyScrollHeader';
import { IS_DEV_MODE } from '@/config/appConfig';
import { useAppMode } from '@/contexts/AppModeContext';
import { api } from '@/convex/_generated/api';
import { useActiveBusiness } from '@/hooks/useActiveBusiness';
import { useEntitlements } from '@/hooks/useEntitlements';
import { DASHBOARD_TOKENS } from '@/lib/design/dashboardTokens';
import { resolveBusinessCapabilities } from '@/lib/domain/businessPermissions';
import {
  entitlementErrorToHebrewMessage,
  getEntitlementError,
} from '@/lib/entitlements/errors';
import { tw } from '@/lib/rtl';
import { openSubscriptionComparison } from '@/lib/subscription/upgradeNavigation';

type BusinessRoute =
  | '/(authenticated)/(business)/scanner'
  | '/(authenticated)/(business)/analytics'
  | '/(authenticated)/(business)/customers'
  | '/(authenticated)/(business)/cards'
  | '/(authenticated)/(business)/team'
  | '/(authenticated)/(business)/qr'
  | '/(authenticated)/(business)/settings-business-profile'
  | '/(authenticated)/(business)/settings-business-subscription';

type CustomerRouteFilter =
  | 'near_reward'
  | 'at_risk'
  | 'new_customers'
  | 'reward_eligible';

type HeroStatus = {
  key: string;
  message: string;
  route?: BusinessRoute;
};

type AttentionItem = {
  key: string;
  priority: number;
  title: string;
  subtitle: string;
  route: BusinessRoute;
  tone: 'warn' | 'danger' | 'neutral';
};

type KpiItem = {
  key: string;
  label: string;
  value: string;
  route: BusinessRoute;
  filter?: CustomerRouteFilter;
};

type LoyaltyProgramSummary = {
  loyaltyProgramId: string;
  title: string;
  lifecycle: 'draft' | 'active' | 'archived';
  metrics: {
    activeMembers: number;
    totalMembers: number;
    stamps7d: number;
    redemptions30d: number;
    lastActivityAt: number | null;
  };
};

const DASHBOARD_TEXT = {
  joinQrTitle:
    '\u200EQR\u200E \u05dc\u05d4\u05e6\u05d8\u05e8\u05e4\u05d5\u05ea \u05dc\u05e7\u05d5\u05d7\u05d5\u05ea',
  joinQrSubtitle:
    '\u05e9\u05ea\u05e4\u05d5 \u05d0\u05ea \u05d4\u05e7\u05d5\u05d3 \u05dc\u05d4\u05e6\u05d8\u05e8\u05e4\u05d5\u05ea \u05de\u05d4\u05d9\u05e8\u05d4 \u05dc\u05de\u05d5\u05e2\u05d3\u05d5\u05df',
} as const;

function localizeAiCtaLabel(label: string) {
  const normalized = label.trim().toLowerCase();
  if (normalized === 'create first card') {
    return 'יצירת כרטיס ראשון';
  }
  if (normalized === 'finish setup') {
    return 'השלמת ההגדרה';
  }
  if (normalized === 'create first campaign') {
    return 'יצירת קמפיין ראשון';
  }
  if (normalized === 'create welcome campaign') {
    return 'יצירת קמפיין קבלת פנים';
  }
  if (normalized === 'add new-customer follow-up') {
    return 'הוספת מעקב ללקוחות חדשים';
  }
  if (normalized === 'create winback campaign') {
    return 'יצירת קמפיין החזרה';
  }
  if (normalized === 'view eligible customers') {
    return 'צפייה בלקוחות מתאימים';
  }
  if (normalized === 'review card setup') {
    return 'בדיקת הכרטיס';
  }
  if (normalized === 'add another card') {
    return 'הוספת כרטיס נוסף';
  }
  if (normalized === 'view campaign result') {
    return 'צפייה בתוצאות הקמפיין';
  }
  if (normalized === 'view insights') {
    return 'צפייה בתובנות';
  }
  if (normalized === 'create editable draft') {
    return 'יצירת טיוטה לעריכה';
  }
  if (normalized === 'view insight') {
    return 'צפייה בתובנה';
  }
  if (normalized === 'view summary') {
    return 'צפייה בסיכום';
  }
  if (normalized === 'view reason') {
    return 'צפייה בהסבר';
  }
  if (normalized === 'no action needed') {
    return 'אין צורך בפעולה';
  }
  if (normalized === 'view') {
    return 'צפייה';
  }
  return label;
}

function localizeLegacyAiTitle(title: string) {
  const normalized = title.trim();
  if (normalized === 'Activate one loyalty card first') {
    return 'צריך להפעיל קודם כרטיס נאמנות';
  }
  if (normalized === 'Not enough data yet') {
    return 'עדיין אין מספיק נתונים';
  }
  if (normalized === 'Business issue detected, AI unavailable') {
    return 'זוהתה הזדמנות, אבל הבינה המלאכותית לא זמינה';
  }
  if (normalized === 'Business issue detected, AI quota exhausted') {
    return 'מכסת הבינה המלאכותית החודשית הסתיימה';
  }
  if (normalized === 'AI limit reached for today') {
    return 'הגעתם למגבלת בינה מלאכותית יומית';
  }
  if (normalized === 'AI budget preserved for higher urgency') {
    return 'שומרים את תקציב הבינה המלאכותית למקרים דחופים';
  }
  if (normalized === 'Wait before another campaign') {
    return 'כדאי להמתין לפני פעולה נוספת';
  }
  if (normalized === 'Wait between campaigns') {
    return 'כדאי להמתין בין קמפיינים';
  }
  if (normalized === 'No action recommended right now') {
    return 'כרגע לא מומלצת פעולה';
  }
  if (normalized === 'Weekly recommendation limit reached') {
    return 'הגעתם למגבלת ההמלצות השבועית';
  }
  if (normalized === 'Repeated event suppressed') {
    return 'האירוע כבר טופל לאחרונה';
  }
  if (normalized === 'AI response unavailable') {
    return 'תשובת הבינה המלאכותית לא זמינה כרגע';
  }
  if (normalized === 'Campaign outcome is ready') {
    return 'סיכום הקמפיין מוכן';
  }
  if (normalized === 'Recommendation deferred') {
    return 'ההמלצה נדחתה';
  }
  return title;
}

function localizeLegacyAiMessage(message: string) {
  const normalized = message.trim().replace(/\s+/g, ' ');
  if (
    normalized ===
    'Recommendations run on one primary active loyalty card. No active card was found.'
  ) {
    return 'ההמלצות פועלות על כרטיס נאמנות פעיל אחד. כרגע לא נמצא כרטיס פעיל לעסק.';
  }
  if (
    normalized ===
    'We need at least 20 customers, 30 active days, and 10 visits in the last 30 days.'
  ) {
    return 'נדרשים לפחות 20 לקוחות, 30 ימי פעילות ו-10 ביקורים ב-30 הימים האחרונים.';
  }
  if (
    /^State: .*\. Your current plan does not include AI recommendations\.$/.test(
      normalized
    )
  ) {
    return 'המערכת זיהתה מצב עסקי שדורש תשומת לב, אבל המסלול הנוכחי לא כולל המלצות בינה מלאכותית.';
  }
  if (
    /^State: .*\. Monthly AI quota is exhausted\. You can still act manually\.$/.test(
      normalized
    )
  ) {
    return 'זוהתה הזדמנות עסקית, אבל מכסת הבינה המלאכותית החודשית נוצלה. עדיין אפשר לפעול ידנית.';
  }
  if (
    normalized ===
    'Two AI executions already ran today. The recommendation was deferred to the next scan.'
  ) {
    return 'כבר בוצעו היום שתי הרצות בינה מלאכותית. ההמלצה תיבדק שוב בסריקה הבאה.';
  }
  if (
    /^State: .*\. AI quota is near limit, so this recommendation is shown as fixed text\.$/.test(
      normalized
    )
  ) {
    return 'זוהתה הזדמנות עסקית, אבל מכסת הבינה המלאכותית קרובה לסיום ולכן מוצג הסבר קבוע.';
  }
  if (
    normalized ===
    'The loyalty card was changed recently. Wait a few more days before taking new action.'
  ) {
    return 'כרטיס הנאמנות עודכן לאחרונה. עדיף להמתין כמה ימים לפני פעולה נוספת.';
  }
  if (
    normalized ===
    'A campaign was sent recently. Wait for the cooldown window before sending another one.'
  ) {
    return 'נשלח קמפיין לאחרונה. עדיף להמתין לסיום חלון הצינון לפני קמפיין נוסף.';
  }
  if (
    normalized ===
    'A recent recommendation already covered this situation. Wait for new movement in customer behavior.'
  ) {
    return 'המערכת כבר הציגה המלצה דומה לאחרונה. כדאי להמתין לשינוי חדש בהתנהגות הלקוחות.';
  }
  if (
    normalized ===
    'Activity looks stable. Keep monitoring and avoid over-messaging customers.'
  ) {
    return 'הפעילות נראית יציבה כרגע. עדיף להמשיך לעקוב ולא להעמיס מסרים על הלקוחות.';
  }
  if (
    normalized ===
    'You already received the weekly recommendation limit. New items will resume next week.'
  ) {
    return 'כבר הוצגו השבוע מספיק המלצות. המלצות חדשות יחזרו בשבוע הבא.';
  }
  if (
    normalized ===
    'The same business event was already handled recently and has not materially changed.'
  ) {
    return 'אותו אירוע עסקי כבר זוהה וטופל לאחרונה, ולא חל בו שינוי מהותי.';
  }
  if (
    normalized ===
    'A deterministic fallback was shown because the AI request failed.'
  ) {
    return 'הוצג הסבר קבוע של המערכת כי בקשת הבינה המלאכותית נכשלה.';
  }
  const campaignSummaryMatch = normalized.match(
    /^Last campaign reached (\d+) visits in 30 days\. Review outcome before sending another campaign\.$/
  );
  if (campaignSummaryMatch) {
    return `הקמפיין האחרון הוביל ל-${campaignSummaryMatch[1]} ביקורים ב-30 הימים האחרונים. כדאי לבדוק תוצאות לפני קמפיין נוסף.`;
  }
  if (
    normalized ===
    'The engine decided to defer this recommendation in this cycle.'
  ) {
    return 'מנוע ההמלצות החליט לדחות את ההמלצה במחזור הסריקה הנוכחי.';
  }
  return message;
}

function formatNumber(value: number) {
  return new Intl.NumberFormat('he-IL', { maximumFractionDigits: 0 }).format(
    value
  );
}

function sumStampsLast7Days(
  daily: Array<{ stamps: number; redemptions: number }> | undefined
) {
  if (!daily) {
    return 0;
  }
  return daily.reduce((sum, day) => sum + (day.stamps ?? 0), 0);
}

function sumRedemptionsLast7Days(
  daily: Array<{ stamps: number; redemptions: number }> | undefined
) {
  if (!daily) {
    return 0;
  }
  return daily.reduce((sum, day) => sum + (day.redemptions ?? 0), 0);
}

function getToneClasses(tone: AttentionItem['tone']) {
  if (tone === 'danger') {
    return {
      card: 'border-[#FECACA] bg-[#FFF1F2]',
      title: 'text-[#B42318]',
      subtitle: 'text-[#9F1239]',
      iconWrap: 'bg-[#FEE2E2]',
      icon: '#B42318',
    };
  }
  if (tone === 'warn') {
    return {
      card: 'border-[#FED7AA] bg-[#FFF7ED]',
      title: 'text-[#B45309]',
      subtitle: 'text-[#9A3412]',
      iconWrap: 'bg-[#FFEDD5]',
      icon: '#B45309',
    };
  }
  return {
    card: 'border-[#DBEAFE] bg-[#EFF6FF]',
    title: 'text-[#1D4ED8]',
    subtitle: 'text-[#1E40AF]',
    iconWrap: 'bg-[#DBEAFE]',
    icon: '#1D4ED8',
  };
}

function getRecommendationCardTheme(input: {
  layer?: string;
  statusTone?: string;
}) {
  if (input.statusTone === 'wait') {
    return {
      card: 'border-[#D6E4FF] bg-[#F8FBFF]',
      badge: 'bg-[#E0F2FE] text-[#075985]',
      title: 'text-[#0F294B]',
      body: 'text-[#334155]',
      support: 'text-[#64748B]',
      chip: 'border-[#D6E4FF] bg-white text-[#1E3A8A]',
      button: 'bg-[#1D4ED8]',
    };
  }
  if (input.statusTone === 'stable') {
    return {
      card: 'border-[#BBF7D0] bg-[#F0FDF4]',
      badge: 'bg-[#DCFCE7] text-[#166534]',
      title: 'text-[#14532D]',
      body: 'text-[#166534]',
      support: 'text-[#3F6212]',
      chip: 'border-[#BBF7D0] bg-white text-[#166534]',
      button: 'bg-[#15803D]',
    };
  }
  if (input.layer === 'foundation') {
    return {
      card: 'border-[#BFDBFE] bg-[#EFF6FF]',
      badge: 'bg-[#DBEAFE] text-[#1D4ED8]',
      title: 'text-[#1E3A8A]',
      body: 'text-[#334155]',
      support: 'text-[#475569]',
      chip: 'border-[#BFDBFE] bg-white text-[#1D4ED8]',
      button: 'bg-[#1D4ED8]',
    };
  }
  if (input.layer === 'activation') {
    return {
      card: 'border-[#A7F3D0] bg-[#F0FDFA]',
      badge: 'bg-[#CCFBF1] text-[#0F766E]',
      title: 'text-[#115E59]',
      body: 'text-[#334155]',
      support: 'text-[#475569]',
      chip: 'border-[#A7F3D0] bg-white text-[#0F766E]',
      button: 'bg-[#0F766E]',
    };
  }
  if (input.layer === 'optimization') {
    return {
      card: 'border-[#FDE68A] bg-[#FFFBEB]',
      badge: 'bg-[#FEF3C7] text-[#B45309]',
      title: 'text-[#92400E]',
      body: 'text-[#44403C]',
      support: 'text-[#57534E]',
      chip: 'border-[#FDE68A] bg-white text-[#B45309]',
      button: 'bg-[#B45309]',
    };
  }
  return {
    card: 'border-[#FECACA] bg-[#FFF1F2]',
    badge: 'bg-[#FEE2E2] text-[#B42318]',
    title: 'text-[#9F1239]',
    body: 'text-[#475569]',
    support: 'text-[#64748B]',
    chip: 'border-[#FECACA] bg-white text-[#B42318]',
    button: 'bg-[#B42318]',
  };
}

function LoadingBlock({ height = 80 }: { height?: number }) {
  return (
    <View
      className="rounded-2xl border border-[#E5EAF2] bg-[#F1F5F9]"
      style={{ height }}
    />
  );
}

function UsageProgressRow({
  label,
  used,
  limit,
  color,
}: {
  label: string;
  used: number;
  limit: number;
  color: string;
}) {
  const percent =
    limit > 0
      ? Math.max(0, Math.min(100, Math.round((used / limit) * 100)))
      : 0;
  return (
    <View className="mt-2">
      <View className={`${tw.flexRow} items-center justify-between`}>
        <Text className={`text-xs text-[#64748B] ${tw.textStart}`}>
          {label}
        </Text>
        <Text className="text-xs font-bold text-[#1A2B4A]">
          {used}/{limit}
        </Text>
      </View>
      <View className="mt-1 h-2 overflow-hidden rounded-full bg-[#E6EDF7]">
        <View
          className="h-2 rounded-full"
          style={{ width: `${percent}%`, backgroundColor: color }}
        />
      </View>
    </View>
  );
}

export default function MerchantDashboardScreen() {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { preview, map } = useLocalSearchParams<{
    preview?: string;
    map?: string;
  }>();
  const isPreviewMode = (IS_DEV_MODE && preview === 'true') || map === 'true';
  const { appMode, isLoading: isAppModeLoading } = useAppMode();

  const { activeBusinessId, activeBusiness } = useActiveBusiness();
  const activeBusinessCapabilities = activeBusiness
    ? resolveBusinessCapabilities(
        activeBusiness.capabilities ?? null,
        activeBusiness.staffRole
      )
    : null;
  const canManageTeam = activeBusinessCapabilities?.manage_team === true;

  useEffect(() => {
    if (isPreviewMode || isAppModeLoading) {
      return;
    }
    if (appMode !== 'business') {
      router.replace('/(authenticated)/(customer)/wallet');
    }
  }, [appMode, isAppModeLoading, isPreviewMode, router]);

  const dashboardSummary = useQuery(
    api.dashboard.getBusinessDashboardSummary,
    activeBusinessId ? { businessId: activeBusinessId } : 'skip'
  );
  const businessSettings = dashboardSummary?.sources?.businessSettings;
  const usageSummary = dashboardSummary?.sources?.usageSummary;
  const activity = dashboardSummary?.sources?.activity;
  const programs = dashboardSummary?.sources?.programs as
    | LoyaltyProgramSummary[]
    | undefined;
  const rewardEligibilitySummary =
    dashboardSummary?.sources?.rewardEligibilitySummary;
  const recentActivity = dashboardSummary?.sources?.recentActivity as
    | Array<{
        id: string;
        type: 'reward' | 'stamp';
        customer: string;
        detail: string;
        time: string;
      }>
    | undefined;
  const aiRecommendation = dashboardSummary?.sources?.aiRecommendation;
  const campaignPerformanceSummary =
    dashboardSummary?.campaignPerformanceSummary;
  const teamSummary = dashboardSummary?.teamSummary;
  const planUsageSummary = dashboardSummary?.planUsageSummary;
  const executeRecommendationCta = useMutation(
    api.aiRecommendations.executeRecommendationPrimaryCta
  );
  const createCampaignDraft = useMutation(api.campaigns.createCampaignDraft);
  const [isApplyingRecommendation, setIsApplyingRecommendation] =
    useState(false);

  const {
    entitlements,
    gate,
    limitStatus,
    isLoading: isEntitlementsLoading,
  } = useEntitlements(activeBusinessId);
  const smartGate = gate('smartAnalytics');

  const customerSnapshot = useQuery(
    api.events.getCustomerManagementSnapshot,
    activeBusinessId &&
      entitlements &&
      !isEntitlementsLoading &&
      !smartGate.isLocked
      ? { businessId: activeBusinessId }
      : 'skip'
  );

  const activePrograms = useMemo(
    () =>
      (programs ?? []).filter(
        (program: LoyaltyProgramSummary) => program.lifecycle === 'active'
      ),
    [programs]
  );
  const draftPrograms = useMemo(
    () =>
      (programs ?? []).filter(
        (program: LoyaltyProgramSummary) => program.lifecycle === 'draft'
      ),
    [programs]
  );
  const archivedPrograms = useMemo(
    () =>
      (programs ?? []).filter(
        (program: LoyaltyProgramSummary) => program.lifecycle === 'archived'
      ),
    [programs]
  );

  const stamps7d = useMemo(
    () => sumStampsLast7Days(activity?.daily),
    [activity?.daily]
  );
  const redemptions7d = useMemo(
    () => sumRedemptionsLast7Days(activity?.daily),
    [activity?.daily]
  );

  const cardsUsed = usageSummary?.cardsUsed ?? 0;
  const customersUsed = usageSummary?.customersUsed ?? 0;
  const activeCampaignsUsed =
    usageSummary?.activeManagementCampaignsUsed ??
    entitlements?.usage.activeManagementCampaigns ??
    0;
  const activeRetentionActionsUsed =
    usageSummary?.activeRetentionActionsUsed ?? 0;
  const aiExecutionsUsed =
    usageSummary?.aiExecutionsThisMonthUsed ??
    entitlements?.usage.aiExecutionsThisMonth ??
    0;

  const cardsLimit = limitStatus('maxCards', cardsUsed);
  const customersLimit = limitStatus('maxCustomers', customersUsed);
  const campaignsLimit = limitStatus('maxCampaigns', activeCampaignsUsed);
  const retentionLimit = limitStatus(
    'maxActiveRetentionActions',
    activeRetentionActionsUsed
  );
  const aiExecutionsLimit = limitStatus(
    'maxAiExecutionsPerMonth',
    aiExecutionsUsed
  );

  const atLimitEntry = useMemo(() => {
    if (cardsLimit.isAtLimit) {
      return { label: 'כרטיסים', status: cardsLimit };
    }
    if (customersLimit.isAtLimit) {
      return { label: 'לקוחות', status: customersLimit };
    }
    if (campaignsLimit.isAtLimit) {
      return { label: 'קמפיינים', status: campaignsLimit };
    }
    if (retentionLimit.isAtLimit) {
      return { label: 'קמפיינים חוזרים', status: retentionLimit };
    }
    if (aiExecutionsLimit.isAtLimit) {
      return { label: 'AI חודשי', status: aiExecutionsLimit };
    }
    return null;
  }, [
    aiExecutionsLimit,
    campaignsLimit,
    cardsLimit,
    customersLimit,
    retentionLimit,
  ]);

  const nearLimitEntry = useMemo(() => {
    if (cardsLimit.isNearLimit) {
      return { label: 'כרטיסים', status: cardsLimit };
    }
    if (customersLimit.isNearLimit) {
      return { label: 'לקוחות', status: customersLimit };
    }
    if (campaignsLimit.isNearLimit) {
      return { label: 'קמפיינים', status: campaignsLimit };
    }
    if (retentionLimit.isNearLimit) {
      return { label: 'קמפיינים חוזרים', status: retentionLimit };
    }
    if (aiExecutionsLimit.isNearLimit) {
      return { label: 'AI חודשי', status: aiExecutionsLimit };
    }
    return null;
  }, [
    aiExecutionsLimit,
    campaignsLimit,
    cardsLimit,
    customersLimit,
    retentionLimit,
  ]);

  const displayAtLimitEntry = useMemo(() => {
    if (!atLimitEntry) {
      return null;
    }
    if (atLimitEntry.status === retentionLimit) {
      atLimitEntry.label = 'Recurring campaigns';
    }
    return atLimitEntry;
  }, [atLimitEntry, retentionLimit]);

  const displayNearLimitEntry = useMemo(() => {
    if (!nearLimitEntry) {
      return null;
    }
    if (nearLimitEntry.status === retentionLimit) {
      nearLimitEntry.label = 'Recurring campaigns';
    }
    return nearLimitEntry;
  }, [nearLimitEntry, retentionLimit]);

  const heroStatus = useMemo<HeroStatus>(() => {
    const missingFieldsCount =
      businessSettings?.profileCompletion?.missingFields?.length ?? 0;

    if (
      businessSettings?.profileCompletion &&
      !businessSettings.profileCompletion.isComplete
    ) {
      return {
        key: 'profile_incomplete',
        message: `חסרים עדיין ${missingFieldsCount} שדות בפרופיל העסק`,
        route: '/(authenticated)/(business)/settings-business-profile',
      };
    }

    if (programs !== undefined && activePrograms.length === 0) {
      if (draftPrograms.length > 0) {
        return {
          key: 'activate_draft_card',
          message:
            'יש כרטיסיות בטיוטה. כדאי להפעיל כרטיס קיים כדי להתחיל לצרף לקוחות',
          route: '/(authenticated)/(business)/cards',
        };
      }
      if (archivedPrograms.length > 0) {
        return {
          key: 'restore_archived_card',
          message:
            'כל הכרטיסיות בארכיון. כדאי לשחזר או ליצור כרטיס פעיל כדי להתחיל לצרף לקוחות',
          route: '/(authenticated)/(business)/cards',
        };
      }
      return {
        key: 'no_cards',
        message: 'כדאי ליצור כרטיס נאמנות ראשון כדי להתחיל לצרף לקוחות',
        route: '/(authenticated)/(business)/cards',
      };
    }

    if (displayAtLimitEntry) {
      const atLimitEntry = displayAtLimitEntry;
      return {
        key: 'limit_reached',
        message: `${atLimitEntry.label}: הגעתם למגבלה (${atLimitEntry.status.currentValue}/${atLimitEntry.status.limitValue})`,
        route: '/(authenticated)/(business)/settings-business-subscription',
      };
    }

    if (displayNearLimitEntry) {
      const nearLimitEntry = displayNearLimitEntry;
      return {
        key: 'limit_near',
        message: `${nearLimitEntry.label}: מתקרבים למגבלה (${nearLimitEntry.status.currentValue}/${nearLimitEntry.status.limitValue})`,
        route: '/(authenticated)/(business)/settings-business-subscription',
      };
    }

    if (activity !== undefined && stamps7d === 0) {
      return {
        key: 'no_activity',
        message: 'לא נרשמה פעילות ניקובים ב-7 הימים האחרונים',
        route: '/(authenticated)/(business)/analytics',
      };
    }

    if (
      !smartGate.isLocked &&
      customerSnapshot &&
      customerSnapshot.summary.atRiskCustomers > 0
    ) {
      return {
        key: 'at_risk',
        message: `${formatNumber(
          customerSnapshot.summary.atRiskCustomers
        )} לקוחות נמצאים בסיכון נטישה`,
        route: '/(authenticated)/(business)/customers',
      };
    }

    return {
      key: 'healthy',
      message: `השבוע נרשמו ${formatNumber(stamps7d)} ניקובים ו-${formatNumber(
        redemptions7d
      )} \u05db\u05e8\u05d8\u05d9\u05e1\u05d9\u05d5\u05ea \u05e9\u05de\u05d5\u05de\u05e9\u05d5`,
    };
  }, [
    activePrograms.length,
    archivedPrograms.length,
    activity,
    businessSettings?.profileCompletion,
    customerSnapshot,
    displayAtLimitEntry,
    displayNearLimitEntry,
    draftPrograms.length,
    programs,
    redemptions7d,
    smartGate.isLocked,
    stamps7d,
  ]);

  const attentionItems = useMemo<AttentionItem[]>(() => {
    const items: AttentionItem[] = [];

    const missingFieldsCount =
      businessSettings?.profileCompletion?.missingFields?.length ?? 0;
    if (
      businessSettings?.profileCompletion &&
      !businessSettings.profileCompletion.isComplete
    ) {
      items.push({
        key: 'profile_incomplete',
        priority: 1,
        title: 'השלמת פרופיל העסק',
        subtitle: `חסרים ${missingFieldsCount} שדות. השלמה תשפר את חוויית הניהול.`,
        route: '/(authenticated)/(business)/settings-business-profile',
        tone: 'warn',
      });
    }

    if (programs !== undefined && activePrograms.length === 0) {
      items.push({
        key: 'no_active_cards',
        priority: 2,
        title: 'אין כרטיס נאמנות פעיל',
        subtitle:
          draftPrograms.length > 0
            ? `יש ${formatNumber(draftPrograms.length)} טיוטות. הפעילו כרטיס קיים כדי להתחיל לצבור לקוחות.`
            : archivedPrograms.length > 0
              ? 'כל הכרטיסיות בארכיון. שחזרו או צרו כרטיס פעיל כדי להתחיל לצבור לקוחות.'
              : 'כדאי להקים כרטיס ראשון כדי להתחיל לצבור לקוחות.',
        route: '/(authenticated)/(business)/cards',
        tone: 'neutral',
      });
    }

    if (atLimitEntry) {
      items.push({
        key: 'limit_reached',
        priority: 3,
        title: `הגעתם למגבלה במסלול (${atLimitEntry.label})`,
        subtitle: `${atLimitEntry.status.currentValue}/${atLimitEntry.status.limitValue}. נדרש שדרוג או התאמה.`,
        route: '/(authenticated)/(business)/settings-business-subscription',
        tone: 'danger',
      });
    } else if (nearLimitEntry) {
      items.push({
        key: 'limit_near',
        priority: 4,
        title: `מתקרבים למגבלה (${nearLimitEntry.label})`,
        subtitle: `${nearLimitEntry.status.currentValue}/${nearLimitEntry.status.limitValue}. מומלץ לעקוב אחרי השימוש.`,
        route: '/(authenticated)/(business)/settings-business-subscription',
        tone: 'warn',
      });
    }

    if (
      !smartGate.isLocked &&
      customerSnapshot &&
      customerSnapshot.summary.atRiskCustomers > 0
    ) {
      items.push({
        key: 'at_risk_customers',
        priority: 5,
        title: `${formatNumber(
          customerSnapshot.summary.atRiskCustomers
        )} לקוחות בסיכון`,
        subtitle: 'כדאי לבדוק את מסך הלקוחות ולטפל בחזרה לפעילות.',
        route: '/(authenticated)/(business)/customers',
        tone: 'danger',
      });
    }

    if (
      !smartGate.isLocked &&
      customerSnapshot &&
      customerSnapshot.summary.nearRewardCustomers > 0
    ) {
      items.push({
        key: 'near_reward_customers',
        priority: 6,
        title: `${formatNumber(
          customerSnapshot.summary.nearRewardCustomers
        )} לקוחות קרובים להטבה`,
        subtitle: 'זה חלון טוב לעודד ביקור נוסף.',
        route: '/(authenticated)/(business)/customers',
        tone: 'neutral',
      });
    }

    if (activity !== undefined && stamps7d === 0) {
      items.push({
        key: 'no_activity_7d',
        priority: 7,
        title: 'אין פעילות ב-7 ימים',
        subtitle: 'כדאי לבדוק ביצועים בדוחות ולהפעיל מהלכים לחזרה לפעילות.',
        route: '/(authenticated)/(business)/analytics',
        tone: 'warn',
      });
    }

    return items.sort((a, b) => a.priority - b.priority).slice(0, 3);
  }, [
    activePrograms.length,
    archivedPrograms.length,
    activity,
    atLimitEntry,
    businessSettings?.profileCompletion,
    customerSnapshot,
    draftPrograms.length,
    nearLimitEntry,
    programs,
    smartGate.isLocked,
    stamps7d,
  ]);

  const isAttentionLoading =
    businessSettings === undefined ||
    programs === undefined ||
    activity === undefined ||
    isEntitlementsLoading ||
    (!smartGate.isLocked &&
      entitlements !== null &&
      customerSnapshot === undefined);

  const kpiLoading =
    activity === undefined ||
    usageSummary === undefined ||
    rewardEligibilitySummary === undefined;
  const kpiItems: KpiItem[] = [
    {
      key: 'stamps_7d',
      label: 'ניקובים 7 ימים',
      value: formatNumber(stamps7d),
      route: '/(authenticated)/(business)/analytics',
    },
    {
      key: 'redemptions_7d',
      label:
        '\u05db\u05e8\u05d8\u05d9\u05e1\u05d9\u05d5\u05ea \u05e9\u05de\u05d5\u05de\u05e9\u05d5 7 \u05d9\u05de\u05d9\u05dd',
      value: formatNumber(redemptions7d),
      route: '/(authenticated)/(business)/analytics',
    },
    {
      key: 'active_customers',
      label: 'לקוחות פעילים',
      value: formatNumber(customersUsed),
      route: '/(authenticated)/(business)/customers',
    },
    {
      key: 'reward_eligible_now',
      label:
        '\u05dc\u05e7\u05d5\u05d7\u05d5\u05ea \u05de\u05de\u05ea\u05d9\u05e0\u05d9\u05dd \u05dc\u05de\u05d9\u05de\u05d5\u05e9',
      value: formatNumber(rewardEligibilitySummary?.redeemableCustomers ?? 0),
      route: '/(authenticated)/(business)/customers',
      filter: 'reward_eligible',
    },
    {
      key: 'redeemable_cards_now',
      label:
        '\u05db\u05e8\u05d8\u05d9\u05e1\u05d9\u05d5\u05ea \u05de\u05dc\u05d0\u05d5\u05ea',
      value: formatNumber(rewardEligibilitySummary?.redeemableCards ?? 0),
      route: '/(authenticated)/(business)/customers',
      filter: 'reward_eligible',
    },
  ];

  const topPrograms = activePrograms.slice(0, 2);
  const programsSummary = useMemo(
    () => ({
      activeProgramsCount: activePrograms.length,
      activeMembers: activePrograms.reduce(
        (sum, program) => sum + program.metrics.activeMembers,
        0
      ),
      redemptions30d: activePrograms.reduce(
        (sum, program) => sum + program.metrics.redemptions30d,
        0
      ),
      redeemableCustomers: rewardEligibilitySummary?.redeemableCustomers ?? 0,
      redeemableCards: rewardEligibilitySummary?.redeemableCards ?? 0,
    }),
    [activePrograms, rewardEligibilitySummary]
  );

  const customerHealthChart = useMemo(() => {
    const summary = customerSnapshot?.summary;
    if (!summary) {
      return [
        { label: 'פעילים', value: 0, color: '#1E4ED8' },
        { label: 'בסיכון', value: 0, color: '#EF4444' },
        { label: 'חדשים', value: 0, color: '#06B6D4' },
        { label: 'VIP', value: 0, color: '#8B5CF6' },
      ];
    }
    return [
      { label: 'פעילים', value: summary.activeCustomers ?? 0, color: '#1E4ED8' },
      { label: 'בסיכון', value: summary.atRiskCustomers ?? 0, color: '#EF4444' },
      { label: 'חדשים', value: summary.newCustomers ?? 0, color: '#06B6D4' },
      { label: 'VIP', value: summary.vipCustomers ?? 0, color: '#8B5CF6' },
    ];
  }, [customerSnapshot]);

  const campaignReachChart = useMemo(() => {
    const list = (campaignPerformanceSummary?.topCampaigns ?? []) as Array<{
      title: string;
      reachedMessagesAllTime?: number;
      returnedCustomers14d?: number | null;
    }>;
    if (list.length > 0) {
      return list.slice(0, 5).map((campaign) => ({
        label: campaign.title,
        value: Number(campaign.reachedMessagesAllTime ?? campaign.returnedCustomers14d ?? 0),
      }));
    }
    return [
      {
        label: 'קמפיין 1',
        value: Number(campaignPerformanceSummary?.overview.totalMessagesSent ?? 0),
      },
    ];
  }, [campaignPerformanceSummary]);

  const loyaltyProgramChart = useMemo(
    () =>
      activePrograms
        .slice()
        .sort((a, b) => (b.metrics.stamps7d ?? 0) - (a.metrics.stamps7d ?? 0))
        .slice(0, 5)
        .map((program) => ({
          label: program.title,
          value: Number(program.metrics.stamps7d ?? 0),
        })),
    [activePrograms]
  );

  const openSmartUpgrade = () => {
    openSubscriptionComparison(router, {
      featureKey: 'smartAnalytics',
      requiredPlan: smartGate.requiredPlan,
      reason:
        smartGate.reason === 'subscription_inactive'
          ? 'subscription_inactive'
          : 'feature_locked',
    });
  };

  const openMarketingHub = (section: 'campaigns' | 'loyalty') => {
    router.push({
      pathname: '/(authenticated)/(business)/cards',
      params: { section },
    });
  };

  const openRoute = (route: BusinessRoute) => {
    if (route === '/(authenticated)/(business)/cards') {
      openMarketingHub('loyalty');
      return;
    }
    if (route === '/(authenticated)/(business)/customers') {
      router.push({
        pathname: '/(authenticated)/(business)/analytics',
        params: { tab: 'customers' },
      });
      return;
    }
    router.push(route);
  };

  const fallbackRecommendation = useMemo(() => {
    if (businessSettings === undefined || programs === undefined) {
      return null;
    }

    if (activePrograms.length === 0) {
      if (draftPrograms.length > 0) {
        return {
          sectionTitle: 'הצעד הבא לעסק',
          layer: 'foundation',
          statusTone: 'setup_needed',
          title: 'השלב הבא הוא להפעיל כרטיס נאמנות מטיוטה',
          body: 'כבר יש כרטיסיה במצב טיוטה. הפעלה של כרטיס קיים תאפשר להתחיל לצרף לקוחות ולייצר פעילות.',
          supportingText:
            'אחרי שכרטיס אחד לפחות יהיה פעיל, יהיה אפשר להתקדם לקמפיינים והמלצות מדויקות יותר.',
          evidenceTags: [
            'אין כרטיסיה פעילה',
            `טיוטות קיימות: ${formatNumber(draftPrograms.length)}`,
          ],
          primaryCta: { kind: 'open_cards', label: 'הפעלת כרטיס קיים' },
          packageNote: null,
          showNoCtaReason: false,
        };
      }
      if (archivedPrograms.length > 0) {
        return {
          sectionTitle: 'הצעד הבא לעסק',
          layer: 'foundation',
          statusTone: 'setup_needed',
          title: 'השלב הבא הוא להחזיר כרטיס פעיל מארכיון',
          body: 'כדי לצרף לקוחות ולמדוד פעילות צריך לפחות כרטיס פעיל אחד. ניתן לשחזר כרטיס מארכיון או ליצור חדש.',
          supportingText:
            'ברגע שיש כרטיס פעיל, ההמלצות והמדדים בדשבורד חוזרים לעבוד בצורה מלאה.',
          evidenceTags: [
            'אין כרטיסיה פעילה',
            `כרטיסיות בארכיון: ${formatNumber(archivedPrograms.length)}`,
          ],
          primaryCta: { kind: 'open_cards', label: 'ניהול כרטיסים' },
          packageNote: null,
          showNoCtaReason: false,
        };
      }
      return {
        sectionTitle: 'הצעד הבא לעסק',
        layer: 'foundation',
        statusTone: 'setup_needed',
        title: 'השלב הבא הוא להפעיל כרטיס נאמנות ראשון',
        body: 'ברגע שתהיה כרטיסיה פעילה, יהיה קל יותר להפעיל קמפיינים ולבנות חזרת לקוחות.',
        supportingText:
          'המערכת מתחילה מהבסיס ותתן המלצות מדויקות יותר אחרי שתהיה תוכנית פעילה.',
        evidenceTags: ['אין כרטיסיה פעילה'],
        primaryCta: { kind: 'open_cards', label: 'יצירת כרטיס ראשון' },
        packageNote: null,
        showNoCtaReason: false,
      };
    }

    if (
      businessSettings?.profileCompletion &&
      !businessSettings.profileCompletion.isComplete
    ) {
      return {
        sectionTitle: 'הצעד הבא לעסק',
        layer: 'foundation',
        statusTone: 'setup_needed',
        title: 'כדאי להשלים את הבסיס לפני מהלך שיווקי',
        body: 'יש התחלה טובה, אבל עדיף לוודא שהפרטים המרכזיים של העסק מסודרים לפני הצעד הבא.',
        supportingText:
          'כשהבסיס ברור יותר, גם ההמלצות והקמפיינים הופכים מדויקים יותר.',
        evidenceTags: [
          'יש עוד פרטים להשלים',
          `${activePrograms.length} כרטיסיה פעילה`,
        ],
        primaryCta: { kind: 'open_profile', label: 'השלמת ההגדרה' },
        packageNote: null,
        showNoCtaReason: false,
      };
    }

    return {
      sectionTitle: 'הצעד הבא לעסק',
      layer: 'activation',
      statusTone: 'opportunity',
      title: 'הצעד הבא שכדאי להתחיל ממנו: קמפיין ראשון',
      body: 'יש כבר בסיס ראשוני, ועכשיו קמפיין פשוט יעזור להבין מה מחזיר לקוחות לביקור הבא.',
      supportingText:
        'גם עם מעט נתונים המערכת יכולה לכוון לצעד המעשי הבא, בלי להמתין ל"מספיק דאטה".',
      evidenceTags: [`${activePrograms.length} כרטיסיה פעילה`],
      primaryCta: {
        kind: 'open_campaign_draft',
        label: 'יצירת קמפיין ראשון',
        draftType: 'promo',
      },
      packageNote: null,
      showNoCtaReason: false,
    };
  }, [
    activePrograms.length,
    archivedPrograms.length,
    businessSettings,
    draftPrograms.length,
    programs,
  ]);

  const shouldForceNoActiveProgramFallback =
    programs !== undefined &&
    activePrograms.length === 0 &&
    (draftPrograms.length > 0 || archivedPrograms.length > 0);

  const recommendationCard = shouldForceNoActiveProgramFallback
    ? fallbackRecommendation
    : aiRecommendation === undefined
      ? fallbackRecommendation
      : aiRecommendation
        ? {
            ...aiRecommendation,
            sectionTitle: aiRecommendation.sectionTitle ?? 'הצעד הבא לעסק',
            title: localizeLegacyAiTitle(aiRecommendation.title),
            body: localizeLegacyAiMessage(aiRecommendation.body ?? ''),
            supportingText: aiRecommendation.supportingText ?? '',
            evidenceTags: aiRecommendation.evidenceTags ?? [],
            primaryCta: aiRecommendation.primaryCta ?? {
              kind: 'none',
              label: 'ללא פעולה',
            },
            packageNote: aiRecommendation.packageNote ?? null,
            showNoCtaReason:
              aiRecommendation.showNoCtaReason ??
              aiRecommendation.primaryCta?.kind === 'none',
          }
        : fallbackRecommendation;

  const recommendationTheme = recommendationCard
    ? getRecommendationCardTheme({
        layer: recommendationCard.layer,
        statusTone: recommendationCard.statusTone,
      })
    : null;
  const hiddenLegacyHasCta = false;
  const hiddenLegacyCtaLabel = '';
  const localizedRecommendationTitle = recommendationCard?.title ?? '';
  const localizedRecommendationMessage = recommendationCard?.body ?? '';
  const recommendationHasCta = Boolean(
    recommendationCard?.primaryCta?.kind &&
      recommendationCard.primaryCta.kind !== 'none'
  );

  const openCustomersWithFilter = (
    customerFilter?: 'near_reward' | 'at_risk' | 'new_customers' | null
  ) => {
    if (customerFilter) {
      router.push({
        pathname: '/(authenticated)/(business)/analytics',
        params: { tab: 'customers', filter: customerFilter },
      });
      return;
    }

    openRoute('/(authenticated)/(business)/customers');
  };

  const openLocalCampaignDraft = async (
    draftType: 'promo' | 'welcome' | 'winback'
  ) => {
    if (!activeBusinessId) {
      return;
    }

    const draft = await createCampaignDraft({
      businessId: activeBusinessId,
      type: draftType,
      rules:
        draftType === 'welcome'
          ? { audience: 'new_customers', joinedWithinDays: 14 }
          : draftType === 'winback'
            ? { audience: 'inactive_days', daysInactive: 30 }
            : { audience: 'all_active_members' },
    });

    router.push({
      pathname: '/(authenticated)/(business)/cards/campaign/[campaignId]',
      params: {
        campaignId: String(draft.campaignId),
        businessId: String(activeBusinessId),
      },
    });
  };

  const openRecommendationTarget = async (primaryCta: {
    kind: string;
    draftType?: string | null;
    customerFilter?: string | null;
  }) => {
    switch (primaryCta.kind) {
      case 'open_campaign_draft': {
        const draftType =
          primaryCta.draftType === 'welcome' ||
          primaryCta.draftType === 'winback' ||
          primaryCta.draftType === 'promo'
            ? primaryCta.draftType
            : 'promo';
        await openLocalCampaignDraft(draftType);
        return;
      }
      case 'view_customers':
        openCustomersWithFilter(
          primaryCta.customerFilter === 'near_reward' ||
            primaryCta.customerFilter === 'at_risk' ||
            primaryCta.customerFilter === 'new_customers'
            ? primaryCta.customerFilter
            : null
        );
        return;
      case 'view_analytics':
        openRoute('/(authenticated)/(business)/analytics');
        return;
      case 'open_cards':
        openRoute('/(authenticated)/(business)/cards');
        return;
      case 'open_profile':
        openRoute('/(authenticated)/(business)/settings-business-profile');
        return;
      case 'view_subscription':
        openRoute('/(authenticated)/(business)/settings-business-subscription');
        return;
      default:
        return;
    }
  };

  const handleRecommendationCta = async () => {
    if (
      !activeBusinessId ||
      !recommendationCard ||
      !recommendationHasCta ||
      isApplyingRecommendation
    ) {
      return;
    }

    setIsApplyingRecommendation(true);
    try {
      if (!aiRecommendation) {
        await openRecommendationTarget(recommendationCard.primaryCta);
        return;
      }

      const result = await executeRecommendationCta({
        businessId: activeBusinessId,
        recommendationId: aiRecommendation.recommendationId,
      });

      if (result.kind === 'open_draft') {
        router.push({
          pathname: '/(authenticated)/(business)/cards/campaign/[campaignId]',
          params: {
            campaignId: String(result.campaignId),
            businessId: String(activeBusinessId),
          },
        });
        return;
      }
      if (result.kind === 'view_customers') {
        openCustomersWithFilter(result.customerFilter ?? null);
        return;
      }
      if (result.kind === 'view_analytics') {
        openRoute('/(authenticated)/(business)/analytics');
        return;
      }
      if (result.kind === 'open_cards') {
        openRoute('/(authenticated)/(business)/cards');
        return;
      }
      if (result.kind === 'open_profile') {
        openRoute('/(authenticated)/(business)/settings-business-profile');
        return;
      }
      if (result.kind === 'view_subscription') {
        openRoute('/(authenticated)/(business)/settings-business-subscription');
      }
    } catch (error) {
      const entitlementError = getEntitlementError(error);
      if (entitlementError) {
        Alert.alert(
          'מגבלת מסלול',
          entitlementErrorToHebrewMessage(entitlementError)
        );
        openSubscriptionComparison(router, {
          featureKey:
            entitlementError.limitKey ??
            entitlementError.featureKey ??
            'business_subscription',
          requiredPlan: entitlementError.requiredPlan ?? null,
          reason:
            entitlementError.code === 'PLAN_LIMIT_REACHED'
              ? 'limit_reached'
              : entitlementError.code === 'SUBSCRIPTION_INACTIVE'
                ? 'subscription_inactive'
                : 'feature_locked',
        });
        return;
      }
      Alert.alert(
        'שגיאה',
        error instanceof Error
          ? error.message
          : 'לא הצלחנו לפתוח את הפעולה המומלצת.'
      );
    } finally {
      setIsApplyingRecommendation(false);
    }
  };

  if (!activeBusinessId) {
    return (
      <SafeAreaView className="flex-1 items-center justify-center bg-[#E9F0FF] px-6">
        <Text className="text-center text-base font-semibold text-[#1A2B4A]">
          לא נמצא עסק פעיל עבור החשבון.
        </Text>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView className="flex-1 bg-[#E9F0FF]" edges={[]}>
      <ScrollView
        stickyHeaderIndices={[0]}
        className="flex-1"
        contentContainerStyle={{
          paddingHorizontal: 20,
          paddingBottom: (insets.bottom || 0) + 30,
        }}
      >
        <StickyScrollHeader
          topPadding={(insets.top || 0) + 12}
          backgroundColor="#E9F0FF"
        >
          <BusinessScreenHeader
            title={activeBusiness?.name ?? 'העסק שלי'}
            subtitle="תמונת על מהירה על מצב העסק"
          />
        </StickyScrollHeader>

        {businessSettings === undefined || programs === undefined ? (
          <View className="mt-4">
            <LoadingBlock height={52} />
          </View>
        ) : heroStatus.route ? (
          <TouchableOpacity
            onPress={() => openRoute(heroStatus.route as BusinessRoute)}
            className="mt-4 rounded-2xl border border-[#D8E5FF] bg-white px-4 py-3"
          >
            <Text
              className={`text-sm font-semibold text-[#1E3A8A] ${tw.textStart}`}
            >
              {heroStatus.message}
            </Text>
          </TouchableOpacity>
        ) : (
          <View className="mt-4 rounded-2xl border border-[#D8E5FF] bg-white px-4 py-3">
            <Text
              className={`text-sm font-semibold text-[#1E3A8A] ${tw.textStart}`}
            >
              {heroStatus.message}
            </Text>
          </View>
        )}

        <TouchableOpacity
          onPress={() => openRoute('/(authenticated)/(business)/qr')}
          className="mt-3 rounded-2xl border border-[#CFE0FF] bg-[#EEF4FF] px-4 py-3"
        >
          <View className={`${tw.flexRow} items-center gap-3`}>
            <View className="h-10 w-10 items-center justify-center rounded-xl border border-[#BFD2FF] bg-white">
              <Ionicons name="qr-code-outline" size={20} color="#1D4ED8" />
            </View>
            <View className="flex-1 items-end">
              <Text
                className={`text-sm font-black text-[#1A2B4A] ${tw.textStart}`}
              >
                {DASHBOARD_TEXT.joinQrTitle}
              </Text>
              <Text className={`mt-1 text-xs text-[#475569] ${tw.textStart}`}>
                {DASHBOARD_TEXT.joinQrSubtitle}
              </Text>
            </View>
            <Ionicons name="chevron-back" size={18} color="#94A3B8" />
          </View>
        </TouchableOpacity>

        {canManageTeam ? (
          <TouchableOpacity
            onPress={() => openRoute('/(authenticated)/(business)/team')}
            className="mt-3 rounded-2xl border border-[#DCE6FF] bg-white px-4 py-3"
          >
            <View className={`${tw.flexRow} items-center gap-3`}>
              <View className="h-10 w-10 items-center justify-center rounded-xl border border-[#D1DFFB] bg-[#F5F8FF]">
                <Ionicons name="people-outline" size={20} color="#1D4ED8" />
              </View>
              <View className="flex-1 items-end">
                <Text
                  className={`text-sm font-black text-[#1A2B4A] ${tw.textStart}`}
                >
                  ניהול עובדים
                </Text>
                <Text className={`mt-1 text-xs text-[#475569] ${tw.textStart}`}>
                  חזרה להוראות גישה וניהול צוות
                </Text>
              </View>
              <Ionicons name="chevron-back" size={18} color="#94A3B8" />
            </View>
          </TouchableOpacity>
        ) : null}

        {recommendationCard && recommendationTheme ? (
          <View
            className={`mt-4 rounded-3xl border p-5 ${recommendationTheme.card}`}
          >
            <View className="items-end">
              <Text
                className={`w-full text-xs font-black ${recommendationTheme.support} ${tw.textStart}`}
              >
                {recommendationCard.sectionTitle}
              </Text>
              <Text
                className={`mt-2 w-full text-lg font-black ${recommendationTheme.title} ${tw.textStart}`}
              >
                {recommendationCard.title}
              </Text>
              <Text
                className={`mt-2 w-full text-sm ${recommendationTheme.body} ${tw.textStart}`}
              >
                {recommendationCard.body}
              </Text>
            </View>

            {recommendationCard.supportingText ? (
              <Text
                className={`mt-3 w-full text-xs ${recommendationTheme.support} ${tw.textStart}`}
              >
                {recommendationCard.supportingText}
              </Text>
            ) : null}

            {recommendationCard.evidenceTags.length > 0 ? (
              <View className={`${tw.flexRow} mt-3 flex-wrap gap-2`}>
                {recommendationCard.evidenceTags
                  .slice(0, 3)
                  .map((tag: string, index: number) => (
                    <View
                      key={`evidence-${index}-${tag}`}
                      className={`rounded-full border px-3 py-1 ${recommendationTheme.chip}`}
                    >
                      <Text className="text-[11px] font-bold">{tag}</Text>
                    </View>
                  ))}
              </View>
            ) : null}

            {recommendationCard.packageNote ? (
              <Text className={`mt-3 text-xs text-[#64748B] ${tw.textStart}`}>
                {recommendationCard.packageNote}
              </Text>
            ) : null}

            {recommendationHasCta ? (
              <TouchableOpacity
                onPress={() => {
                  void handleRecommendationCta();
                }}
                disabled={isApplyingRecommendation}
                className={`mt-4 ${tw.selfStart} rounded-xl px-4 py-2.5 ${
                  isApplyingRecommendation
                    ? 'bg-[#CBD5E1]'
                    : recommendationTheme.button
                }`}
              >
                {isApplyingRecommendation ? (
                  <ActivityIndicator color="#FFFFFF" size="small" />
                ) : (
                  <Text className="text-sm font-bold text-white">
                    {localizeAiCtaLabel(recommendationCard.primaryCta.label)}
                  </Text>
                )}
              </TouchableOpacity>
            ) : (
              <Text className={`mt-4 text-xs text-[#64748B] ${tw.textStart}`}>
                {recommendationCard.statusTone === 'wait'
                  ? 'כרגע עדיף לתת לשינוי האחרון לעבוד.'
                  : 'כרגע אין צורך בפעולה נוספת.'}
              </Text>
            )}
          </View>
        ) : (
          <View className="mt-4">
            <LoadingBlock height={156} />
          </View>
        )}

        <View className="mt-4 rounded-3xl border border-[#E3E9FF] bg-white p-4">
          <Text className={`text-sm font-black text-[#1A2B4A] ${tw.textStart}`}>
            מדדים מרכזיים
          </Text>
          {kpiLoading ? (
            <View className="mt-3">
              <LoadingBlock height={176} />
            </View>
          ) : (
            <View className={`${tw.flexRow} mt-3 flex-wrap`}>
              {kpiItems.map((kpi, index) => (
                <TouchableOpacity
                  key={kpi.key}
                  onPress={() =>
                    kpi.filter
                      ? router.push({
                          pathname: kpi.route,
                          params: { filter: kpi.filter },
                        })
                      : openRoute(kpi.route)
                  }
                  className={`mb-3 w-1/2 px-1 ${index >= kpiItems.length - 1 && kpiItems.length % 2 === 1 ? 'self-center' : ''}`}
                >
                  <View className="min-h-[78px] rounded-2xl border border-[#EEF2F8] bg-[#F8FAFF] px-3 py-3">
                    <Text
                      numberOfLines={2}
                      className={`text-[11px] font-semibold text-[#64748B] ${tw.textStart}`}
                    >
                      {kpi.label}
                    </Text>
                    <Text
                      className={`mt-2 text-xl font-black text-[#0F294B] ${tw.textStart}`}
                    >
                      {kpi.value}
                    </Text>
                  </View>
                </TouchableOpacity>
              ))}
            </View>
          )}
        </View>

        <View className="mt-4 gap-4">
          <DonutChartCard
            title="הרכב בריאות לקוחות"
            subtitle="פילוח מצב הלקוחות לפי מצב פעילות"
            centerLabel="סה״כ לקוחות"
            centerValue={
              customerSnapshot?.summary
                ? formatNumber(customerSnapshot.summary.totalCustomers)
                : '--'
            }
            data={customerHealthChart}
          />
          <HorizontalRankingChart
            title="קמפיינים מובילים"
            subtitle="דירוג לפי reach בפועל"
            data={campaignReachChart}
            color={DASHBOARD_TOKENS.colors.teal}
          />
          <HorizontalRankingChart
            title="תוכניות נאמנות מובילות"
            subtitle="דירוג לפי ניקובים ב-7 ימים"
            data={loyaltyProgramChart}
            color={DASHBOARD_TOKENS.colors.violet}
          />
        </View>

        {!recommendationCard && isAttentionLoading ? (
          <View className="mt-4">
            <Text
              className={`text-sm font-black text-[#1A2B4A] ${tw.textStart}`}
            >
              דורש תשומת לב
            </Text>
            <View className="mt-3 gap-3">
              <LoadingBlock height={78} />
              <LoadingBlock height={78} />
            </View>
          </View>
        ) : !recommendationCard && attentionItems.length > 0 ? (
          <View className="mt-4">
            <Text
              className={`text-sm font-black text-[#1A2B4A] ${tw.textStart}`}
            >
              דורש תשומת לב
            </Text>
            <View className="mt-3 gap-3">
              {attentionItems.map((item) => {
                const tone = getToneClasses(item.tone);
                return (
                  <TouchableOpacity
                    key={item.key}
                    onPress={() => openRoute(item.route)}
                    className={`rounded-2xl border px-4 py-3 ${tone.card}`}
                  >
                    <View className={`${tw.flexRow} items-center gap-3`}>
                      <View
                        className={`h-10 w-10 items-center justify-center rounded-xl ${tone.iconWrap}`}
                      >
                        <Ionicons
                          name="alert-circle-outline"
                          size={18}
                          color={tone.icon}
                        />
                      </View>
                      <View className="flex-1 items-end">
                        <Text
                          className={`text-sm font-black ${tone.title} ${tw.textStart}`}
                        >
                          {item.title}
                        </Text>
                        <Text
                          className={`mt-1 text-xs ${tone.subtitle} ${tw.textStart}`}
                        >
                          {item.subtitle}
                        </Text>
                      </View>
                    </View>
                  </TouchableOpacity>
                );
              })}
            </View>
          </View>
        ) : null}

        {!recommendationCard &&
        aiRecommendation === null &&
        aiRecommendation === undefined ? (
          <View className="mt-4">
            <LoadingBlock height={124} />
          </View>
        ) : !recommendationCard &&
          Boolean(aiRecommendation) &&
          aiRecommendation === undefined ? (
          <View className="mt-4 items-end rounded-2xl border border-[#D6E2F8] bg-[#EEF3FF] p-4">
            <Text
              className={`w-full text-xs font-bold text-[#1D4ED8] ${tw.textStart}`}
            >
              המלצה חכמה
            </Text>
            <Text
              className={`mt-2 w-full text-sm font-black text-[#1A2B4A] ${tw.textStart}`}
            >
              {localizedRecommendationTitle}
            </Text>
            <Text
              className={`mt-1 w-full text-xs text-[#475569] ${tw.textStart}`}
            >
              {localizedRecommendationMessage}
            </Text>
            {hiddenLegacyHasCta ? (
              <TouchableOpacity
                onPress={() => {
                  void handleRecommendationCta();
                }}
                disabled={isApplyingRecommendation}
                className={`mt-3 ${tw.selfStart} rounded-xl px-3 py-2 ${
                  isApplyingRecommendation ? 'bg-[#CBD5E1]' : 'bg-[#1D4ED8]'
                }`}
              >
                {isApplyingRecommendation ? (
                  <ActivityIndicator color="#FFFFFF" size="small" />
                ) : (
                  <Text className="text-xs font-bold text-white">
                    {localizeAiCtaLabel(hiddenLegacyCtaLabel)}
                  </Text>
                )}
              </TouchableOpacity>
            ) : (
              <Text className={`mt-3 text-xs text-[#64748B] ${tw.textStart}`}>
                כרגע אין פעולה מומלצת.
              </Text>
            )}
          </View>
        ) : null}

        <View className="mt-5">
          <TouchableOpacity
            onPress={() => openRoute('/(authenticated)/(business)/customers')}
            className={`${tw.flexRow} items-center justify-between`}
          >
            <Text
              className={`text-lg font-black text-[#1A2B4A] ${tw.textStart}`}
            >
              בריאות לקוחות
            </Text>
            <Ionicons name="chevron-back" size={18} color="#94A3B8" />
          </TouchableOpacity>

          {isEntitlementsLoading ? (
            <View className="mt-3">
              <LoadingBlock height={164} />
            </View>
          ) : smartGate.isLocked ? (
            <View className="mt-3 rounded-3xl border border-[#D6E2F8] bg-[#EEF3FF] p-4">
              <Text
                className={`text-sm font-black text-[#1D4ED8] ${tw.textStart}`}
              >
                תמונת לקוחות חכמה זמינה במסלול מתקדם
              </Text>
              <Text className={`mt-1 text-xs text-[#475569] ${tw.textStart}`}>
                שדרוג יפתח customer state, value tier ותובנות בזמן אמת.
              </Text>
              <TouchableOpacity
                onPress={openSmartUpgrade}
                className={`mt-3 ${tw.selfStart} rounded-xl bg-[#1D4ED8] px-3 py-2`}
              >
                <Text className="text-xs font-bold text-white">שדרגו</Text>
              </TouchableOpacity>
            </View>
          ) : customerSnapshot === undefined ? (
            <View className="mt-3">
              <LoadingBlock height={164} />
            </View>
          ) : customerSnapshot.summary.totalCustomers === 0 ? (
            <View className="mt-3 rounded-3xl border border-[#E3E9FF] bg-white p-4">
              <Text className={`text-sm text-[#475569] ${tw.textStart}`}>
                עדיין אין לקוחות פעילים להצגת תמונת מצב.
              </Text>
              <TouchableOpacity
                onPress={() => openRoute('/(authenticated)/(business)/cards')}
                className={`mt-3 ${tw.selfStart} rounded-xl border border-[#2F6BFF] bg-white px-3 py-2`}
              >
                <Text className="text-xs font-bold text-[#2F6BFF]">
                  מעבר לניהול כרטיסים
                </Text>
              </TouchableOpacity>
            </View>
          ) : (
            <View className="mt-3 rounded-3xl border border-[#E5EAF2] bg-white p-4">
              <View className={`${tw.flexRow} flex-wrap gap-3`}>
                <TouchableOpacity
                  onPress={() =>
                    openRoute('/(authenticated)/(business)/customers')
                  }
                  className="w-[48%] rounded-2xl border border-[#E5EAF2] bg-[#F8FAFF] p-3"
                >
                  <Text className="text-right text-xs font-semibold text-[#64748B]">
                    פעילים
                  </Text>
                  <Text className="mt-1 text-right text-2xl font-black text-[#0F294B]">
                    {formatNumber(customerSnapshot.summary.activeCustomers)}
                  </Text>
                </TouchableOpacity>
                <TouchableOpacity
                  onPress={() =>
                    openRoute('/(authenticated)/(business)/customers')
                  }
                  className="w-[48%] rounded-2xl border border-[#FECACA] bg-[#FFF1F2] p-3"
                >
                  <Text className="text-right text-xs font-semibold text-[#B42318]">
                    בסיכון
                  </Text>
                  <Text className="mt-1 text-right text-2xl font-black text-[#B42318]">
                    {formatNumber(customerSnapshot.summary.atRiskCustomers)}
                  </Text>
                </TouchableOpacity>
                <TouchableOpacity
                  onPress={() =>
                    openRoute('/(authenticated)/(business)/customers')
                  }
                  className="w-[48%] rounded-2xl border border-[#FED7AA] bg-[#FFF7ED] p-3"
                >
                  <Text className="text-right text-xs font-semibold text-[#B45309]">
                    קרובים להטבה
                  </Text>
                  <Text className="mt-1 text-right text-2xl font-black text-[#C2410C]">
                    {formatNumber(customerSnapshot.summary.nearRewardCustomers)}
                  </Text>
                </TouchableOpacity>
                <TouchableOpacity
                  onPress={() =>
                    openRoute('/(authenticated)/(business)/customers')
                  }
                  className="w-[48%] rounded-2xl border border-[#C7D2FE] bg-[#EEF2FF] p-3"
                >
                  <Text className="text-right text-xs font-semibold text-[#4338CA]">
                    מובילים / חדשים
                  </Text>
                  <Text className="mt-1 text-right text-2xl font-black text-[#3730A3]">
                    {formatNumber(customerSnapshot.summary.vipCustomers)} /{' '}
                    {formatNumber(customerSnapshot.summary.newCustomers)}
                  </Text>
                </TouchableOpacity>
              </View>
              {customerSnapshot.insights[0] ? (
                <TouchableOpacity
                  onPress={() =>
                    openRoute('/(authenticated)/(business)/customers')
                  }
                  className="mt-3 rounded-2xl border border-[#E2E8F0] bg-[#F8FAFC] p-3"
                >
                  <Text
                    className={`text-xs leading-5 text-[#334155] ${tw.textStart}`}
                  >
                    {customerSnapshot.insights[0]}
                  </Text>
                </TouchableOpacity>
              ) : null}
            </View>
          )}
        </View>

        <View className="mt-5">
          <TouchableOpacity
            onPress={() => openRoute('/(authenticated)/(business)/cards')}
            className={`${tw.flexRow} items-center justify-between`}
          >
            <Text
              className={`text-lg font-black text-[#1A2B4A] ${tw.textStart}`}
            >
              תוכניות נאמנות
            </Text>
            <Ionicons name="chevron-back" size={18} color="#94A3B8" />
          </TouchableOpacity>

          {programs === undefined ? (
            <View className="mt-3">
              <LoadingBlock height={170} />
            </View>
          ) : activePrograms.length === 0 ? (
            <View className="mt-3 rounded-3xl border border-[#E3E9FF] bg-white p-4">
              <Text className={`text-sm text-[#475569] ${tw.textStart}`}>
                עדיין אין כרטיס נאמנות פעיל לעסק.
              </Text>
              <TouchableOpacity
                onPress={() => openRoute('/(authenticated)/(business)/cards')}
                className={`mt-3 ${tw.selfStart} rounded-xl bg-[#2F6BFF] px-3 py-2`}
              >
                <Text className="text-xs font-bold text-white">
                  לניהול כרטיסים
                </Text>
              </TouchableOpacity>
            </View>
          ) : (
            <View className="mt-3 rounded-3xl border border-[#E3E9FF] bg-white p-4">
              <View className={`${tw.flexRow} items-center justify-between`}>
                <Text className="text-xs font-semibold text-[#64748B]">
                  כרטיסים פעילים:{' '}
                  {formatNumber(programsSummary.activeProgramsCount)}
                </Text>
                <Text className="text-xs font-semibold text-[#64748B]">
                  לקוחות פעילים: {formatNumber(programsSummary.activeMembers)}
                </Text>
              </View>
              <Text
                className={`mt-1 text-xs font-semibold text-[#64748B] ${tw.textStart}`}
              >
                {
                  '\u05db\u05e8\u05d8\u05d9\u05e1\u05d9\u05d5\u05ea \u05e9\u05de\u05d5\u05de\u05e9\u05d5 \u05d1-30 \u05d9\u05de\u05d9\u05dd:'
                }{' '}
                {formatNumber(programsSummary.redemptions30d)}
              </Text>
              <Text
                className={`mt-1 text-xs font-semibold text-[#64748B] ${tw.textStart}`}
              >
                לקוחות זכאים להטבה:{' '}
                {formatNumber(programsSummary.redeemableCustomers)} · כרטיסיות
                מלאות: {formatNumber(programsSummary.redeemableCards)}
              </Text>

              <View className="mt-3 gap-2">
                {topPrograms.map((program) => (
                  <TouchableOpacity
                    key={program.loyaltyProgramId}
                    onPress={() =>
                      router.push({
                        pathname:
                          '/(authenticated)/(business)/cards/[programId]',
                        params: {
                          programId: program.loyaltyProgramId,
                          businessId: activeBusinessId,
                        },
                      })
                    }
                    className="rounded-2xl border border-[#E3E9FF] bg-[#F8FAFF] p-3"
                  >
                    <View
                      className={`${tw.flexRow} items-center justify-between`}
                    >
                      <Text className="rounded-full bg-[#DBEAFE] px-2 py-1 text-[10px] font-bold text-[#1D4ED8]">
                        {formatNumber(program.metrics.stamps7d)} ניקובים / 7
                        ימים
                      </Text>
                      <View className="flex-1 items-end px-3">
                        <Text
                          className={`text-sm font-black text-[#1A2B4A] ${tw.textStart}`}
                        >
                          {program.title}
                        </Text>
                        <Text
                          className={`mt-1 text-xs text-[#64748B] ${tw.textStart}`}
                        >
                          לקוחות פעילים:{' '}
                          {formatNumber(program.metrics.activeMembers)}
                        </Text>
                      </View>
                    </View>
                  </TouchableOpacity>
                ))}
              </View>
            </View>
          )}
        </View>

        <View className="mt-5">
          <TouchableOpacity
            onPress={() => openRoute('/(authenticated)/(business)/cards')}
            className={`${tw.flexRow} items-center justify-between`}
          >
            <Text
              className={`text-lg font-black text-[#1A2B4A] ${tw.textStart}`}
            >
              ביצועי קמפיינים
            </Text>
            <Ionicons name="chevron-back" size={18} color="#94A3B8" />
          </TouchableOpacity>
          {dashboardSummary === undefined ? (
            <View className="mt-3">
              <LoadingBlock height={160} />
            </View>
          ) : campaignPerformanceSummary == null ? (
            <View className="mt-3 rounded-3xl border border-[#E3E9FF] bg-white p-4">
              <Text className={`text-sm text-[#64748B] ${tw.textStart}`}>
                עדיין אין נתוני קמפיינים להצגה.
              </Text>
            </View>
          ) : (
            <View className="mt-3 rounded-3xl border border-[#E3E9FF] bg-white p-4">
              <View className={`${tw.flexRow} flex-wrap gap-2`}>
                <View className="w-[48%] rounded-2xl border border-[#E5EAF2] bg-[#F8FAFF] p-3">
                  <Text className="text-right text-xs font-semibold text-[#64748B]">
                    קמפיינים פעילים
                  </Text>
                  <Text className="mt-1 text-right text-2xl font-black text-[#0F294B]">
                    {formatNumber(
                      campaignPerformanceSummary.overview.activeCampaigns
                    )}
                  </Text>
                </View>
                <View className="w-[48%] rounded-2xl border border-[#E5EAF2] bg-[#F0FDF4] p-3">
                  <Text className="text-right text-xs font-semibold text-[#166534]">
                    אוטומציות פעילות
                  </Text>
                  <Text className="mt-1 text-right text-2xl font-black text-[#15803D]">
                    {formatNumber(
                      campaignPerformanceSummary.overview.automatedCampaigns
                    )}
                  </Text>
                </View>
              </View>
              <Text className={`mt-3 text-xs text-[#64748B] ${tw.textStart}`}>
                הודעות שנשלחו:{' '}
                {formatNumber(
                  campaignPerformanceSummary.overview.totalMessagesSent
                )}
              </Text>
              {campaignPerformanceSummary.bestReturnCampaign ? (
                <View className="mt-3 rounded-2xl border border-[#BBF7D0] bg-[#ECFDF3] p-3">
                  <Text
                    className={`text-xs font-semibold text-[#166534] ${tw.textStart}`}
                  >
                    קמפיין מוביל בחזרת לקוחות
                  </Text>
                  <Text
                    className={`mt-1 text-sm font-black text-[#14532D] ${tw.textStart}`}
                  >
                    {campaignPerformanceSummary.bestReturnCampaign.title}
                  </Text>
                  <Text
                    className={`mt-1 text-xs text-[#166534] ${tw.textStart}`}
                  >
                    חזרות 14 יום:{' '}
                    {formatNumber(
                      campaignPerformanceSummary.bestReturnCampaign
                        .returnedCustomers14d ?? 0
                    )}
                  </Text>
                </View>
              ) : null}
            </View>
          )}
        </View>

        <View
          className={`${tw.flexRow} mt-5 flex-wrap gap-3`}
          style={{ rowGap: DASHBOARD_TOKENS.spacingGridGap }}
        >
          <View className="w-[48%] rounded-3xl border border-[#E3E9FF] bg-white p-4">
            <TouchableOpacity
              onPress={() => openRoute('/(authenticated)/(business)/team')}
              className={`${tw.flexRow} items-center justify-between`}
            >
              <Text
                className={`text-base font-black text-[#1A2B4A] ${tw.textStart}`}
              >
                פעילות צוות
              </Text>
              <Ionicons name="chevron-back" size={16} color="#94A3B8" />
            </TouchableOpacity>
            {dashboardSummary === undefined ? (
              <View className="mt-3">
                <LoadingBlock height={88} />
              </View>
            ) : teamSummary?.isAvailable ? (
              <View className="mt-3">
                <Text className={`text-xs text-[#64748B] ${tw.textStart}`}>
                  אנשי צוות פעילים: {formatNumber(teamSummary.activeStaffCount)}
                </Text>
                <Text className={`mt-1 text-xs text-[#64748B] ${tw.textStart}`}>
                  הזמנות ממתינות:{' '}
                  {formatNumber(teamSummary.pendingInvitesCount)}
                </Text>
                <Text className={`mt-1 text-xs text-[#64748B] ${tw.textStart}`}>
                  מושעים: {formatNumber(teamSummary.suspendedCount)}
                </Text>
              </View>
            ) : (
              <Text className={`mt-3 text-xs text-[#64748B] ${tw.textStart}`}>
                נתוני צוות אינם זמינים במסלול הנוכחי.
              </Text>
            )}
          </View>

          <View className="w-[48%] rounded-3xl border border-[#E3E9FF] bg-white p-4">
            <TouchableOpacity
              onPress={() =>
                openRoute(
                  '/(authenticated)/(business)/settings-business-subscription'
                )
              }
              className={`${tw.flexRow} items-center justify-between`}
            >
              <Text
                className={`text-base font-black text-[#1A2B4A] ${tw.textStart}`}
              >
                שימוש בתוכנית
              </Text>
              <Ionicons name="chevron-back" size={16} color="#94A3B8" />
            </TouchableOpacity>
            {dashboardSummary === undefined || planUsageSummary == null ? (
              <View className="mt-3">
                <LoadingBlock height={88} />
              </View>
            ) : (
              <View className="mt-2">
                <UsageProgressRow
                  label="כרטיסים"
                  used={planUsageSummary.limits.cardsUsed}
                  limit={planUsageSummary.limits.cardsLimit}
                  color="#2F6BFF"
                />
                <UsageProgressRow
                  label="לקוחות"
                  used={planUsageSummary.limits.customersUsed}
                  limit={planUsageSummary.limits.customersLimit}
                  color="#0F766E"
                />
                <UsageProgressRow
                  label="קמפיינים"
                  used={planUsageSummary.limits.campaignsUsed}
                  limit={planUsageSummary.limits.campaignsLimit}
                  color="#D97706"
                />
              </View>
            )}
          </View>
        </View>

        <View className="mt-5">
          <TouchableOpacity
            onPress={() => openRoute('/(authenticated)/(business)/analytics')}
            className={`${tw.flexRow} items-center justify-between`}
          >
            <Text
              className={`text-lg font-black text-[#1A2B4A] ${tw.textStart}`}
            >
              פעילות אחרונה
            </Text>
            <Text className="text-xs font-bold text-[#2563EB]">
              לכל הפעילות
            </Text>
          </TouchableOpacity>

          {recentActivity === undefined ? (
            <View className="mt-3 gap-2">
              <LoadingBlock height={68} />
              <LoadingBlock height={68} />
              <LoadingBlock height={68} />
            </View>
          ) : recentActivity.length === 0 ? (
            <View className="mt-3 rounded-2xl border border-[#E3E9FF] bg-white p-4">
              <Text className={`text-sm text-[#64748B] ${tw.textStart}`}>
                עדיין אין פעילות אחרונה להצגה.
              </Text>
            </View>
          ) : (
            <View className="mt-3 gap-2">
              {recentActivity.map((item) => (
                <View
                  key={item.id}
                  className="rounded-2xl border border-[#E3E9FF] bg-white p-4"
                >
                  <View
                    className={`${tw.flexRow} items-center justify-between`}
                  >
                    <Text className="rounded-full bg-[#EEF3FF] px-3 py-1 text-[11px] font-bold text-[#2F6BFF]">
                      {item.time}
                    </Text>
                    <View className="flex-1 items-end px-3">
                      <Text
                        className={`text-sm font-black text-[#1A2B4A] ${tw.textStart}`}
                      >
                        {item.customer}
                      </Text>
                      <Text
                        className={`mt-1 text-xs text-[#64748B] ${tw.textStart}`}
                      >
                        {item.detail}
                      </Text>
                    </View>
                    <View className="h-10 w-10 items-center justify-center rounded-xl bg-[#F1F5F9]">
                      <Ionicons
                        name={
                          item.type === 'reward'
                            ? 'gift-outline'
                            : 'scan-outline'
                        }
                        size={18}
                        color="#475569"
                      />
                    </View>
                  </View>
                </View>
              ))}
            </View>
          )}
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}
