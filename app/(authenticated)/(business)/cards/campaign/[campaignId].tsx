import { Ionicons } from '@expo/vector-icons';
import { useNavigation, usePreventRemove } from '@react-navigation/native';
import { useMutation, useQuery } from 'convex/react';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useEffect, useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { CampaignCustomerPreview } from '@/components/campaigns/CampaignCustomerPreview';
import { useGuidedTargetRef } from '@/components/guidance/GuidedActionAnchor';
import { GuidedActionScreenOverlay } from '@/components/guidance/GuidedActionOverlay';
import {
  EditorPreviewSurface,
  EditorPrimaryActions,
  EditorSection,
  EditorStickyFooter,
  ManagementPageHeader,
} from '@/components/management';
import { PlanLimitModal } from '@/components/subscription/PlanLimitModal';
import { api } from '@/convex/_generated/api';
import type { Id } from '@/convex/_generated/dataModel';
import { useActiveBusiness } from '@/hooks/useActiveBusiness';
import { useEntitlements } from '@/hooks/useEntitlements';
import { resolveBusinessCapabilities } from '@/lib/domain/businessPermissions';
import {
  entitlementErrorToHebrewMessage,
  getEntitlementError,
} from '@/lib/entitlements/errors';
import { getEditConflictError } from '@/lib/errors/editConflicts';
import { safeBack } from '@/lib/navigation';
import { resolveCampaignDetailGuideTarget } from '@/lib/recommendations/guidance';
import { tw } from '@/lib/rtl';
import { openSubscriptionComparison } from '@/lib/subscription/upgradeNavigation';

type CampaignType =
  | 'welcome'
  | 'birthday'
  | 'anniversary'
  | 'winback'
  | 'promo';
type CampaignTemplateType = CampaignType | 'referral';
type CampaignCreateMode = 'template' | 'custom';
type LoyaltyProgramOption = {
  loyaltyProgramId: Id<'loyaltyPrograms'>;
  title: string;
  lifecycle: 'draft' | 'active' | 'archived';
};

const CAMPAIGN_TEMPLATES: Array<{
  type: CampaignTemplateType;
  title: string;
  subtitle: string;
}> = [
  {
    type: 'birthday',
    title: 'יום הולדת',
    subtitle: 'הטבה אישית ביום ההולדת של הלקוח',
  },
  {
    type: 'anniversary',
    title: 'יום נישואין',
    subtitle: 'מסר ייעודי ביום הנישואין',
  },
  {
    type: 'welcome',
    title: 'ברוכים הבאים',
    subtitle: 'הודעת פתיחה למצטרפים חדשים',
  },
  {
    type: 'winback',
    title: 'השבת לקוחות',
    subtitle: 'פנייה ללקוחות שלא ביקרו לאחרונה',
  },
  {
    type: 'promo',
    title: 'קמפיין כללי',
    subtitle: 'קמפיין לכל הלקוחות הפעילים',
  },
  {
    type: 'referral',
    title: 'חבר מביא חבר',
    subtitle: 'תגמול לקוחות שמפנים חברים חדשים לעסק',
  },
];

type EditableCampaignRules =
  | { audience: 'new_customers'; joinedWithinDays: number }
  | { audience: 'inactive_days'; daysInactive: number }
  | { audience: 'birthday_today' }
  | { audience: 'anniversary_today' }
  | { audience: 'all_active_members' };

function parsePositiveInt(value: string): number | null {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) {
    return null;
  }
  const normalized = Math.floor(parsed);
  if (normalized < 1) {
    return null;
  }
  return normalized;
}

function rulesInputFromDraft(type: CampaignType, rules: unknown): string {
  const source =
    typeof rules === 'object' && rules !== null
      ? (rules as Record<string, unknown>)
      : {};

  if (type === 'welcome') {
    const days =
      source.audience === 'new_customers' &&
      typeof source.joinedWithinDays === 'number' &&
      Number.isFinite(source.joinedWithinDays)
        ? Math.max(1, Math.floor(source.joinedWithinDays))
        : 14;
    return String(days);
  }

  if (type === 'winback') {
    const days =
      source.audience === 'inactive_days' &&
      typeof source.daysInactive === 'number' &&
      Number.isFinite(source.daysInactive)
        ? Math.max(1, Math.floor(source.daysInactive))
        : 30;
    return String(days);
  }

  return '';
}

function audienceCopy(type: CampaignType): {
  title: string;
  subtitle: string;
  daysLabel?: string;
} {
  switch (type) {
    case 'welcome':
      return {
        title: 'לקוחות חדשים',
        subtitle: 'נשלח ללקוחות חדשים לפי טווח ימים מההצטרפות',
        daysLabel: 'תוך כמה ימים מההצטרפות',
      };
    case 'winback':
      return {
        title: 'לקוחות לא פעילים',
        subtitle: 'נשלח ללקוחות שלא הגיעו בפרק הזמן שנבחר',
        daysLabel: 'כמה ימים ללא ביקור',
      };
    case 'birthday':
      return {
        title: 'יום הולדת היום',
        subtitle: 'קהל קבוע לפי יום ההולדת של הלקוח',
      };
    case 'anniversary':
      return {
        title: 'יום נישואין היום',
        subtitle: 'קהל קבוע לפי יום הנישואין של הלקוח',
      };
    case 'promo':
      return {
        title: 'כל הלקוחות הפעילים',
        subtitle: 'קהל קבוע של כל חברי המועדון הפעילים עם Opt-in',
      };
    default:
      return {
        title: 'קהל יעד',
        subtitle: 'קהל קבוע לפי סוג הקמפיין',
      };
  }
}

function campaignMeta(type: CampaignType): {
  title: string;
  subtitle: string;
  icon: keyof typeof Ionicons.glyphMap;
  accentClass: string;
  accentBgClass: string;
} {
  switch (type) {
    case 'welcome':
      return {
        title: 'קמפיין ברוכים הבאים',
        subtitle: 'הודעת פתיחה למצטרפים חדשים',
        icon: 'hand-left-outline',
        accentClass: 'text-[#1D4ED8]',
        accentBgClass: 'bg-[#DBEAFE]',
      };
    case 'birthday':
      return {
        title: 'קמפיין יום הולדת',
        subtitle: 'הטבה אישית ביום ההולדת',
        icon: 'gift-outline',
        accentClass: 'text-[#C2410C]',
        accentBgClass: 'bg-[#FFEDD5]',
      };
    case 'anniversary':
      return {
        title: 'קמפיין יום נישואין',
        subtitle: 'הודעה ייעודית ליום הנישואין',
        icon: 'heart-outline',
        accentClass: 'text-[#9D174D]',
        accentBgClass: 'bg-[#FCE7F3]',
      };
    case 'winback':
      return {
        title: 'קמפיין החזרת לקוחות',
        subtitle: 'פנייה ללקוחות שלא ביקרו לאחרונה',
        icon: 'refresh-outline',
        accentClass: 'text-[#0F766E]',
        accentBgClass: 'bg-[#CCFBF1]',
      };
    case 'promo':
      return {
        title: 'קמפיין כללי',
        subtitle: 'מסר שיווקי לכל הלקוחות הפעילים',
        icon: 'megaphone-outline',
        accentClass: 'text-[#4C1D95]',
        accentBgClass: 'bg-[#EDE9FE]',
      };
    default:
      return {
        title: 'קמפיין',
        subtitle: 'ניהול קמפיין',
        icon: 'megaphone-outline',
        accentClass: 'text-[#1D4ED8]',
        accentBgClass: 'bg-[#DBEAFE]',
      };
  }
}

function campaignTemplateMeta(type: CampaignTemplateType) {
  if (type === 'referral') {
    return {
      title: 'חבר מביא חבר',
      subtitle: 'תגמול לקוחות שמפנים חברים חדשים לעסק',
      icon: 'people-outline' as const,
      accentClass: 'text-[#1D4ED8]',
      accentBgClass: 'bg-[#DBEAFE]',
    };
  }
  return campaignMeta(type);
}

function formatDateTime(value: number): string {
  return new Date(value).toLocaleString('he-IL', {
    day: '2-digit',
    month: '2-digit',
    year: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  });
}

const DAY_MS = 24 * 60 * 60 * 1000;
const MIN_SCHEDULE_LEAD_MS = 5 * 60 * 1000;

function getScheduledTimestamp(daysFromNow: number, hour: number) {
  const now = new Date();
  const target = new Date(now.getTime());
  target.setDate(target.getDate() + Math.max(0, daysFromNow));
  target.setHours(hour, 0, 0, 0);
  if (target.getTime() < Date.now() + MIN_SCHEDULE_LEAD_MS) {
    target.setDate(target.getDate() + 1);
  }
  return target.getTime();
}

function buildCampaignEditorSignature({
  messageTitle,
  messageBody,
  daysInput,
  selectedProgramId,
  deliveryMode,
  scheduledForAt,
}: {
  messageTitle: string;
  messageBody: string;
  daysInput: string;
  selectedProgramId: string;
  deliveryMode: 'send_now' | 'one_time';
  scheduledForAt: number | null;
}) {
  return JSON.stringify({
    messageTitle: messageTitle.trim(),
    messageBody: messageBody.trim(),
    daysInput: daysInput.trim(),
    selectedProgramId,
    deliveryMode,
    scheduledForAt: deliveryMode === 'one_time' ? scheduledForAt : null,
  });
}

export default function CampaignDraftEditorScreen() {
  const campaignPublishTargetRef = useGuidedTargetRef();
  const campaignResumeTargetRef = useGuidedTargetRef();
  const campaignScheduleReviewTargetRef = useGuidedTargetRef();
  const guideScrollRef = useRef<ScrollView | null>(null);
  const navigation = useNavigation();
  const router = useRouter();
  const params = useLocalSearchParams<{
    campaignId?: string;
    businessId?: string;
    guideId?: string | string[];
  }>();

  const campaignIdParam = params.campaignId;
  const guideIdParam = Array.isArray(params.guideId)
    ? params.guideId[0]
    : params.guideId;
  const campaignGuideTarget = resolveCampaignDetailGuideTarget(guideIdParam);
  const isCreateFlow = !campaignIdParam || campaignIdParam === 'new';
  const campaignId = isCreateFlow
    ? undefined
    : (campaignIdParam as Id<'campaigns'>);
  const businessIdFromParams = params.businessId as
    | Id<'businesses'>
    | undefined;

  const { businesses, activeBusinessId, activeBusiness } = useActiveBusiness();
  const selectedBusinessId = useMemo(() => {
    if (
      businessIdFromParams &&
      businesses.some(
        (business) => business.businessId === businessIdFromParams
      )
    ) {
      return businessIdFromParams;
    }
    return activeBusinessId ?? null;
  }, [activeBusinessId, businessIdFromParams, businesses]);

  const selectedBusiness = useMemo(
    () =>
      businesses.find(
        (business) => business.businessId === selectedBusinessId
      ) ?? (activeBusinessId === selectedBusinessId ? activeBusiness : null),
    [activeBusiness, activeBusinessId, businesses, selectedBusinessId]
  );

  const selectedBusinessCapabilities = selectedBusiness
    ? resolveBusinessCapabilities(
        selectedBusiness.capabilities ?? null,
        selectedBusiness.staffRole
      )
    : null;
  const canCreateCampaigns =
    selectedBusinessCapabilities?.create_campaigns === true;
  const canEditCampaigns =
    selectedBusinessCapabilities?.edit_campaigns === true;
  const canActivateSendCampaigns =
    selectedBusinessCapabilities?.activate_send_campaigns === true;
  const canArchiveCampaign =
    selectedBusinessCapabilities?.delete_campaigns === true;
  const canManageSubscription =
    selectedBusinessCapabilities?.manage_subscription === true;
  const {
    entitlements,
    limitStatus,
    isLoading: isEntitlementsLoading,
  } = useEntitlements(selectedBusinessId);
  const campaignLimit = limitStatus('maxCampaigns');
  const recurringLimit = limitStatus('maxActiveRetentionActions');
  const requiredPlanForCampaigns =
    entitlements?.requiredPlanMap?.byLimitFromCurrentPlan?.[entitlements.plan]
      ?.maxCampaigns ?? 'pro';
  const requiredPlanForRecurring =
    entitlements?.requiredPlanMap?.byLimitFromCurrentPlan?.[entitlements.plan]
      ?.maxActiveRetentionActions ?? 'pro';
  const programs = (useQuery(
    api.loyaltyPrograms.listManagementByBusiness,
    selectedBusinessId ? { businessId: selectedBusinessId } : 'skip'
  ) ?? []) as LoyaltyProgramOption[];
  const activePrograms = useMemo(
    () =>
      programs.filter(
        (program: LoyaltyProgramOption) => program.lifecycle === 'active'
      ),
    [programs]
  );

  const campaignDraft = useQuery(
    api.campaigns.getManagementCampaignDraft,
    selectedBusinessId && campaignId
      ? { businessId: selectedBusinessId, campaignId }
      : 'skip'
  );

  const createCampaignDraft = useMutation(api.campaigns.createCampaignDraft);
  const updateCampaignDraft = useMutation(api.campaigns.updateCampaignDraft);
  const estimateCampaignAudience = useMutation(
    api.campaigns.estimateCampaignAudience
  );
  const sendCampaignNow = useMutation(api.campaigns.sendCampaignNow);
  const setCampaignAutomationEnabled = useMutation(
    api.campaigns.setCampaignAutomationEnabled
  );
  const scheduleCampaignOneTime = useMutation(
    api.campaigns.scheduleCampaignOneTime
  );
  const clearCampaignOneTimeSchedule = useMutation(
    api.campaigns.clearCampaignOneTimeSchedule
  );
  const archiveManagementCampaign = useMutation(
    api.campaigns.archiveManagementCampaign
  );
  const restoreManagementCampaign = useMutation(
    api.campaigns.restoreManagementCampaign
  );

  const [messageTitle, setMessageTitle] = useState('');
  const [messageBody, setMessageBody] = useState('');
  const [daysInput, setDaysInput] = useState('');
  const [selectedProgramId, setSelectedProgramId] = useState<string>('all');
  const [deliveryMode, setDeliveryMode] = useState<'send_now' | 'one_time'>(
    'send_now'
  );
  const [scheduledForAt, setScheduledForAt] = useState<number | null>(null);
  const [createMode, setCreateMode] = useState<CampaignCreateMode>('template');
  const [isCreatingDraft, setIsCreatingDraft] = useState<
    CampaignTemplateType | 'custom' | null
  >(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isTogglingAutomation, setIsTogglingAutomation] = useState(false);
  const [isArchiving, setIsArchiving] = useState(false);
  const [baseUpdatedAt, setBaseUpdatedAt] = useState<number | null>(null);
  const [conflictLocked, setConflictLocked] = useState(false);
  const [savedSignature, setSavedSignature] = useState<string | null>(null);
  const [pendingSubmitAction, setPendingSubmitAction] = useState<
    'save' | 'publish' | null
  >(null);
  const [showAdvancedSettings, setShowAdvancedSettings] = useState(false);
  const [planLimitNotice, setPlanLimitNotice] = useState<{
    blockedAction: string;
    reason: string;
    featureKey: 'maxCampaigns' | 'maxActiveRetentionActions';
    requiredPlan: 'starter' | 'pro' | 'premium' | null;
    navigationReason:
      | 'feature_locked'
      | 'limit_reached'
      | 'subscription_inactive';
  } | null>(null);

  const formSignature = buildCampaignEditorSignature({
    messageTitle,
    messageBody,
    daysInput,
    selectedProgramId,
    deliveryMode,
    scheduledForAt,
  });
  const isDirty = savedSignature !== null && formSignature !== savedSignature;

  usePreventRemove(isDirty && !isSubmitting && !isArchiving, ({ data }) => {
    Alert.alert(
      'יש שינויים שלא נשמרו',
      'אפשר להמשיך לערוך או לצאת בלי לשמור.',
      [
        { text: 'המשך עריכה', style: 'cancel' },
        {
          text: 'יציאה ללא שמירה',
          style: 'destructive',
          onPress: () => navigation.dispatch(data.action),
        },
      ]
    );
  });

  useEffect(() => {
    if (campaignGuideTarget === 'resume-action') {
      setShowAdvancedSettings(true);
    }
  }, [campaignGuideTarget]);

  const applyCampaignSnapshot = (snapshot: typeof campaignDraft) => {
    if (!snapshot) {
      return;
    }
    const nextMessageTitle = snapshot.messageTitle ?? '';
    const nextMessageBody = snapshot.messageBody ?? '';
    const nextDaysInput = rulesInputFromDraft(
      snapshot.type as CampaignType,
      snapshot.rules
    );
    const nextSelectedProgramId = snapshot.programId
      ? String(snapshot.programId)
      : 'all';
    const nextDeliveryMode =
      snapshot.scheduleMode === 'one_time' ? 'one_time' : 'send_now';
    const nextScheduledForAt =
      nextDeliveryMode === 'one_time'
        ? typeof snapshot.scheduledForAt === 'number'
          ? snapshot.scheduledForAt
          : Date.now() + DAY_MS
        : null;
    setMessageTitle(nextMessageTitle);
    setMessageBody(nextMessageBody);
    setDaysInput(nextDaysInput);
    setSelectedProgramId(nextSelectedProgramId);
    setDeliveryMode(nextDeliveryMode);
    setScheduledForAt(nextScheduledForAt);
    setBaseUpdatedAt(
      typeof snapshot.updatedAt === 'number' ? snapshot.updatedAt : null
    );
    setConflictLocked(false);
    setSavedSignature(
      buildCampaignEditorSignature({
        messageTitle: nextMessageTitle,
        messageBody: nextMessageBody,
        daysInput: nextDaysInput,
        selectedProgramId: nextSelectedProgramId,
        deliveryMode: nextDeliveryMode,
        scheduledForAt: nextScheduledForAt,
      })
    );
  };

  useEffect(() => {
    const screenKey = `${selectedBusinessId ?? 'none'}:${campaignId ?? 'none'}`;
    setBaseUpdatedAt(null);
    setConflictLocked(false);
    setSavedSignature(null);
    if (screenKey === 'none:none') {
      setScheduledForAt(null);
    }
  }, [campaignId, selectedBusinessId]);

  useEffect(() => {
    if (!campaignDraft || baseUpdatedAt !== null) {
      return;
    }
    const nextMessageTitle = campaignDraft.messageTitle ?? '';
    const nextMessageBody = campaignDraft.messageBody ?? '';
    const nextDaysInput = rulesInputFromDraft(
      campaignDraft.type as CampaignType,
      campaignDraft.rules
    );
    const nextSelectedProgramId = campaignDraft.programId
      ? String(campaignDraft.programId)
      : 'all';
    const nextDeliveryMode =
      campaignDraft.scheduleMode === 'one_time' ? 'one_time' : 'send_now';
    const nextScheduledForAt =
      nextDeliveryMode === 'one_time'
        ? typeof campaignDraft.scheduledForAt === 'number'
          ? campaignDraft.scheduledForAt
          : Date.now() + DAY_MS
        : null;
    setMessageTitle(nextMessageTitle);
    setMessageBody(nextMessageBody);
    setDaysInput(nextDaysInput);
    setSelectedProgramId(nextSelectedProgramId);
    setDeliveryMode(nextDeliveryMode);
    setScheduledForAt(nextScheduledForAt);
    setBaseUpdatedAt(
      typeof campaignDraft.updatedAt === 'number'
        ? campaignDraft.updatedAt
        : null
    );
    setConflictLocked(false);
    setSavedSignature(
      buildCampaignEditorSignature({
        messageTitle: nextMessageTitle,
        messageBody: nextMessageBody,
        daysInput: nextDaysInput,
        selectedProgramId: nextSelectedProgramId,
        deliveryMode: nextDeliveryMode,
        scheduledForAt: nextScheduledForAt,
      })
    );
  }, [baseUpdatedAt, campaignDraft]);

  const goBackToCampaignList = () => {
    safeBack('/(authenticated)/(business)/campaigns');
  };

  const openDraftEditor = (draftCampaignId: Id<'campaigns'>) => {
    if (!selectedBusinessId) {
      return;
    }
    router.replace({
      pathname: '/(authenticated)/(business)/cards/campaign/[campaignId]',
      params: {
        campaignId: String(draftCampaignId),
        businessId: String(selectedBusinessId),
      },
    });
  };

  const openCampaignsUpgrade = (
    requiredPlan:
      | 'starter'
      | 'pro'
      | 'premium'
      | null = requiredPlanForCampaigns,
    reason:
      | 'feature_locked'
      | 'limit_reached'
      | 'subscription_inactive' = 'limit_reached'
  ) => {
    openSubscriptionComparison(router, {
      featureKey: 'maxCampaigns',
      requiredPlan,
      reason,
    });
  };

  const openRecurringUpgrade = (
    requiredPlan:
      | 'starter'
      | 'pro'
      | 'premium'
      | null = requiredPlanForRecurring,
    reason:
      | 'feature_locked'
      | 'limit_reached'
      | 'subscription_inactive' = 'limit_reached'
  ) => {
    openSubscriptionComparison(router, {
      featureKey: 'maxActiveRetentionActions',
      requiredPlan,
      reason,
    });
  };

  const showPlanLimit = (
    blockedAction: string,
    reason: string,
    featureKey: 'maxCampaigns' | 'maxActiveRetentionActions',
    requiredPlan: 'starter' | 'pro' | 'premium' | null,
    navigationReason:
      | 'feature_locked'
      | 'limit_reached'
      | 'subscription_inactive' = 'limit_reached'
  ) => {
    setPlanLimitNotice({
      blockedAction,
      reason,
      featureKey,
      requiredPlan,
      navigationReason,
    });
  };

  const handleEntitlementError = (error: unknown) => {
    const entitlementError = getEntitlementError(error);
    if (!entitlementError) {
      return false;
    }
    const isRecurring =
      entitlementError.limitKey === 'maxActiveRetentionActions';
    showPlanLimit(
      isRecurring ? 'הפעלת אוטומציה נחסמה' : 'פעולת הקמפיין נחסמה',
      entitlementErrorToHebrewMessage(entitlementError),
      isRecurring ? 'maxActiveRetentionActions' : 'maxCampaigns',
      entitlementError.requiredPlan ??
        (isRecurring ? requiredPlanForRecurring : requiredPlanForCampaigns),
      entitlementError.code === 'SUBSCRIPTION_INACTIVE'
        ? 'subscription_inactive'
        : entitlementError.code === 'PLAN_LIMIT_REACHED'
          ? 'limit_reached'
          : 'feature_locked'
    );
    return true;
  };

  const planLimitModal = (
    <PlanLimitModal
      visible={planLimitNotice !== null}
      blockedAction={planLimitNotice?.blockedAction ?? ''}
      reason={planLimitNotice?.reason ?? ''}
      currentPlan={entitlements?.plan ?? null}
      limitSummary={
        planLimitNotice?.featureKey === 'maxActiveRetentionActions'
          ? `בשימוש ${recurringLimit.currentValue} מתוך ${recurringLimit.limitValue} אוטומציות פעילות`
          : `בשימוש ${campaignLimit.currentValue} מתוך ${campaignLimit.limitValue} הגדרות קמפיין`
      }
      canManageSubscription={canManageSubscription}
      onManageSubscription={
        planLimitNotice
          ? () => {
              const notice = planLimitNotice;
              setPlanLimitNotice(null);
              if (notice.featureKey === 'maxActiveRetentionActions') {
                openRecurringUpgrade(
                  notice.requiredPlan,
                  notice.navigationReason
                );
                return;
              }
              openCampaignsUpgrade(
                notice.requiredPlan,
                notice.navigationReason
              );
            }
          : undefined
      }
      onDismiss={() => setPlanLimitNotice(null)}
    />
  );

  const handleCreateFromTemplate = async (type: CampaignTemplateType) => {
    if (!selectedBusinessId || !canCreateCampaigns || isCreatingDraft) {
      return;
    }
    if (type === 'referral') {
      router.replace('/(authenticated)/(business)/settings-business-referrals');
      return;
    }
    setIsCreatingDraft(type);
    try {
      const created = await createCampaignDraft({
        businessId: selectedBusinessId,
        type,
      });
      openDraftEditor(created.campaignId);
    } catch (error) {
      if (handleEntitlementError(error)) {
        return;
      }
      Alert.alert('שגיאה', 'יצירת קמפיין נכשלה.');
    } finally {
      setIsCreatingDraft(null);
    }
  };

  const handleCreateCustomCampaign = async () => {
    if (!selectedBusinessId || !canCreateCampaigns || isCreatingDraft) {
      return;
    }
    setIsCreatingDraft('custom');
    try {
      const created = await createCampaignDraft({
        businessId: selectedBusinessId,
        type: 'promo',
        title: 'קמפיין מותאם אישית',
        messageTitle: 'עדכון מהעסק',
        messageBody: 'כתבו כאן את תוכן ההודעה ללקוחות.',
      });
      openDraftEditor(created.campaignId);
    } catch (error) {
      if (handleEntitlementError(error)) {
        return;
      }
      Alert.alert('שגיאה', 'יצירת קמפיין נכשלה.');
    } finally {
      setIsCreatingDraft(null);
    }
  };

  const confirmSendNow = (totalRecipients: number): Promise<boolean> =>
    new Promise((resolve) => {
      Alert.alert(
        'אישור שליחה',
        `ההודעה תישלח ל-${totalRecipients} לקוחות. להמשיך?`,
        [
          {
            text: 'ביטול',
            style: 'cancel',
            onPress: () => resolve(false),
          },
          {
            text: 'שלח עכשיו',
            style: 'default',
            onPress: () => resolve(true),
          },
        ],
        { cancelable: false }
      );
    });

  if (!selectedBusinessId) {
    return (
      <SafeAreaView className="flex-1 items-center justify-center bg-[#E9F0FF] px-6">
        <Text className="w-full text-right text-sm text-[#64748B]">
          חסרים פרטי עסק.
        </Text>
        <TouchableOpacity
          onPress={goBackToCampaignList}
          className="mt-4 rounded-xl bg-[#2F6BFF] px-4 py-2"
        >
          <Text className="text-sm font-bold text-white">חזרה לרשימה</Text>
        </TouchableOpacity>
      </SafeAreaView>
    );
  }

  if (isCreateFlow) {
    return (
      <SafeAreaView className="flex-1 bg-[#E9F0FF]" edges={[]}>
        <ScrollView
          stickyHeaderIndices={[0]}
          className="flex-1"
          contentContainerStyle={{
            paddingHorizontal: 20,
            paddingBottom: 28,
            width: '100%',
            maxWidth: 960,
            alignSelf: 'center',
          }}
        >
          <ManagementPageHeader
            title="קמפיין חדש"
            subtitle="בחרו תבנית מוכנה או צרו קמפיין מותאם אישית"
            fallbackHref="/(authenticated)/(business)/campaigns"
            onBackPress={goBackToCampaignList}
          />

          {!canCreateCampaigns ? (
            <View className="mt-4 rounded-2xl border border-red-300 bg-red-50 p-4">
              <Text className="text-right text-sm font-semibold text-red-700">
                רק בעלים או מנהל יכולים ליצור קמפיינים.
              </Text>
            </View>
          ) : null}
          {!isEntitlementsLoading && campaignLimit.isAtLimit ? (
            <View className="mt-4 rounded-2xl border border-amber-300 bg-amber-50 p-4">
              <Text className="text-right text-sm font-semibold text-amber-700">
                הגעתם למכסת הקמפיינים הפעילים. עדיין אפשר ליצור ולערוך טיוטות;
                המגבלה תיבדק רק בעת הפעלה.
              </Text>
            </View>
          ) : null}

          <View
            className={`mt-4 rounded-full border border-[#D6E2F8] bg-[#EEF3FF] p-1 ${tw.flexRow} gap-1`}
          >
            {[
              { key: 'template' as const, label: 'מתבנית' },
              { key: 'custom' as const, label: 'מותאם אישית' },
            ].map((option) => {
              const isActive = createMode === option.key;
              return (
                <TouchableOpacity
                  key={option.key}
                  onPress={() => setCreateMode(option.key)}
                  className={`flex-1 rounded-full py-2.5 ${
                    isActive ? 'bg-[#2F6BFF]' : 'bg-transparent'
                  }`}
                >
                  <Text
                    className={`text-center text-sm font-extrabold ${
                      isActive ? 'text-white' : 'text-[#51617F]'
                    }`}
                  >
                    {option.label}
                  </Text>
                </TouchableOpacity>
              );
            })}
          </View>

          {createMode === 'template' ? (
            <View className="mt-4 rounded-3xl border border-[#E3E9FF] bg-white p-5">
              <Text
                className={`text-[11px] font-semibold text-[#64748B] ${tw.textStart}`}
              >
                תבניות קמפיין
              </Text>
              <Text className={`mt-1 text-xs text-[#64748B] ${tw.textStart}`}>
                בחירת תבנית תיצור טיוטה מוכנה שאפשר לערוך לפני שמירה ושליחה.
              </Text>
              <View className="mt-3 gap-2">
                {CAMPAIGN_TEMPLATES.map((template) => {
                  const meta = campaignTemplateMeta(template.type);
                  const isBusy = isCreatingDraft === template.type;
                  const disabled =
                    !canCreateCampaigns || isCreatingDraft != null;
                  return (
                    <TouchableOpacity
                      key={template.type}
                      disabled={disabled}
                      onPress={() => {
                        void handleCreateFromTemplate(template.type);
                      }}
                      className="rounded-2xl border border-[#DCE7FF] bg-[#F8FAFF] p-4"
                    >
                      <View className={`${tw.flexRow} items-center gap-3`}>
                        <View
                          className={`h-10 w-10 items-center justify-center rounded-xl ${meta.accentBgClass}`}
                        >
                          <Ionicons
                            name={meta.icon}
                            size={18}
                            color="#1A2B4A"
                          />
                        </View>
                        <View className={`flex-1 ${tw.itemsStart}`}>
                          <Text
                            className={`text-sm font-black text-[#1A2B4A] ${tw.textStart}`}
                          >
                            {template.title}
                          </Text>
                          <Text
                            className={`mt-1 text-xs text-[#64748B] ${tw.textStart}`}
                          >
                            {template.subtitle}
                          </Text>
                        </View>
                        {isBusy ? (
                          <ActivityIndicator color="#1D4ED8" />
                        ) : (
                          <Ionicons
                            name="chevron-back"
                            size={18}
                            color="#94A3B8"
                          />
                        )}
                      </View>
                    </TouchableOpacity>
                  );
                })}
              </View>
            </View>
          ) : (
            <View className="mt-4 rounded-3xl border border-[#E3E9FF] bg-white p-5">
              <Text
                className={`text-[11px] font-semibold text-[#64748B] ${tw.textStart}`}
              >
                קמפיין מותאם אישית
              </Text>
              <Text className={`mt-1 text-sm text-[#475569] ${tw.textStart}`}>
                ניצור טיוטה פתוחה לעריכה מלאה של טקסט, קהל יעד ושיוך לתוכנית.
              </Text>
              <TouchableOpacity
                disabled={!canCreateCampaigns || isCreatingDraft != null}
                onPress={() => {
                  void handleCreateCustomCampaign();
                }}
                className={`mt-4 rounded-2xl px-4 py-3 ${
                  !canCreateCampaigns || isCreatingDraft != null
                    ? 'bg-[#CBD5E1]'
                    : 'bg-[#2F6BFF]'
                }`}
              >
                {isCreatingDraft === 'custom' ? (
                  <ActivityIndicator color="#FFFFFF" />
                ) : (
                  <Text className="text-center text-sm font-bold text-white">
                    התחל קמפיין מותאם אישית
                  </Text>
                )}
              </TouchableOpacity>
            </View>
          )}
        </ScrollView>
        {planLimitModal}
      </SafeAreaView>
    );
  }

  if (!campaignId) {
    return (
      <SafeAreaView className="flex-1 items-center justify-center bg-[#E9F0FF] px-6">
        <Text className="w-full text-right text-sm text-[#64748B]">
          חסרים פרטי קמפיין לעריכה.
        </Text>
        <TouchableOpacity
          onPress={goBackToCampaignList}
          className="mt-4 rounded-xl bg-[#2F6BFF] px-4 py-2"
        >
          <Text className="text-sm font-bold text-white">חזרה לרשימה</Text>
        </TouchableOpacity>
      </SafeAreaView>
    );
  }

  if (campaignDraft === undefined) {
    return (
      <SafeAreaView className="flex-1 items-center justify-center bg-[#E9F0FF]">
        <ActivityIndicator color="#2F6BFF" />
      </SafeAreaView>
    );
  }

  if (!campaignDraft) {
    return (
      <SafeAreaView className="flex-1 items-center justify-center bg-[#E9F0FF] px-6">
        <Text className="w-full text-right text-sm text-[#64748B]">
          לא נמצאה טיוטת קמפיין.
        </Text>
        <TouchableOpacity
          onPress={goBackToCampaignList}
          className="mt-4 rounded-xl bg-[#2F6BFF] px-4 py-2"
        >
          <Text className="text-sm font-bold text-white">חזרה לרשימה</Text>
        </TouchableOpacity>
      </SafeAreaView>
    );
  }

  const campaignType = campaignDraft.type as CampaignType;
  const audience = audienceCopy(campaignType);
  const campaignIdentity = campaignMeta(campaignType);
  const campaignLifecycle = campaignDraft.lifecycle ?? 'draft';
  const isArchivedCampaign = campaignLifecycle === 'archived';
  const automationEnabled = campaignDraft.automationEnabled === true;
  const isRulesLocked =
    !isArchivedCampaign &&
    (campaignDraft.isRulesLocked ?? automationEnabled) === true;

  const canEditContent = canEditCampaigns;
  const canEditRules = canEditContent && !isRulesLocked;

  const stats = campaignDraft.stats ?? {
    eligibleAudienceNow: 0,
    reachedUniqueAllTime: 0,
    reachedMessagesAllTime: 0,
    lastSentAt: null,
    missingBirthdayCount: null,
  };
  const selectedProgramLabel =
    selectedProgramId === 'all'
      ? 'כל העסק'
      : (activePrograms.find(
          (program) => String(program.loyaltyProgramId) === selectedProgramId
        )?.title ?? 'תוכנית לא זמינה');

  const resolvedScheduledForAt =
    typeof scheduledForAt === 'number'
      ? scheduledForAt
      : getScheduledTimestamp(1, 10);
  const isOneTimeMode = deliveryMode === 'one_time';
  const activeTimingMode = automationEnabled
    ? 'automation'
    : isOneTimeMode
      ? 'one_time'
      : 'send_now';
  const oneTimeScheduleDisplay = formatDateTime(resolvedScheduledForAt);

  const buildRulesPayload = (): EditableCampaignRules | null => {
    if (campaignType === 'welcome') {
      const days = parsePositiveInt(daysInput);
      if (!days) {
        Alert.alert('נתון חסר', 'יש להזין מספר ימים חיובי עבור לקוחות חדשים.');
        return null;
      }
      return {
        audience: 'new_customers',
        joinedWithinDays: days,
      };
    }

    if (campaignType === 'winback') {
      const days = parsePositiveInt(daysInput);
      if (!days) {
        Alert.alert(
          'נתון חסר',
          'יש להזין מספר ימים חיובי עבור לקוחות לא פעילים.'
        );
        return null;
      }
      return {
        audience: 'inactive_days',
        daysInactive: days,
      };
    }

    if (campaignType === 'birthday') {
      return { audience: 'birthday_today' };
    }
    if (campaignType === 'anniversary') {
      return { audience: 'anniversary_today' };
    }
    return { audience: 'all_active_members' };
  };

  const validateContent = (): boolean => {
    if (messageTitle.trim().length === 0) {
      Alert.alert('נתון חסר', 'יש להזין כותרת הודעה.');
      return false;
    }
    if (messageBody.trim().length === 0) {
      Alert.alert('נתון חסר', 'יש להזין תוכן הודעה.');
      return false;
    }
    return true;
  };

  const saveDraftMutation = async (rulesPayload?: EditableCampaignRules) => {
    const payload: {
      businessId: Id<'businesses'>;
      campaignId: Id<'campaigns'>;
      expectedUpdatedAt?: number;
      messageTitle: string;
      messageBody: string;
      rules?: EditableCampaignRules;
      programId?: Id<'loyaltyPrograms'>;
    } = {
      businessId: selectedBusinessId,
      campaignId,
      expectedUpdatedAt: baseUpdatedAt ?? undefined,
      messageTitle: messageTitle.trim(),
      messageBody: messageBody.trim(),
    };

    if (!isRulesLocked && rulesPayload) {
      const normalizedProgramId =
        selectedProgramId === 'all'
          ? undefined
          : (selectedProgramId as Id<'loyaltyPrograms'>);
      payload.rules = rulesPayload;
      payload.programId = normalizedProgramId;
    }

    const result = await updateCampaignDraft(payload);
    if (typeof result?.updatedAt === 'number') {
      setBaseUpdatedAt(result.updatedAt);
    }
    setSavedSignature(formSignature);
    setConflictLocked(false);
    return result;
  };

  const handleToggleAutomation = async () => {
    if (
      !canActivateSendCampaigns ||
      isTogglingAutomation ||
      isArchivedCampaign
    ) {
      return;
    }
    if (
      !automationEnabled &&
      !isEntitlementsLoading &&
      campaignLimit.isOverLimit
    ) {
      showPlanLimit(
        'הפעלת אוטומציה נחסמה',
        'לא ניתן להפעיל אוטומציה כשקיימת חריגה ממכסת הקמפיינים.',
        'maxCampaigns',
        requiredPlanForCampaigns
      );
      return;
    }
    if (
      !automationEnabled &&
      !isEntitlementsLoading &&
      recurringLimit.isAtLimit
    ) {
      showPlanLimit(
        'הפעלת אוטומציה נחסמה',
        'המסלול הנוכחי אינו מאפשר להפעיל הודעה חוזרת נוספת. עדיין אפשר לשלוח ידנית עכשיו.',
        'maxActiveRetentionActions',
        requiredPlanForRecurring
      );
      return;
    }
    setIsTogglingAutomation(true);
    try {
      const result = await setCampaignAutomationEnabled({
        businessId: selectedBusinessId,
        campaignId,
        enabled: !automationEnabled,
        expectedUpdatedAt: baseUpdatedAt ?? undefined,
      });
      if (typeof result?.updatedAt === 'number') {
        setBaseUpdatedAt(result.updatedAt);
      }
      setConflictLocked(false);
    } catch (error) {
      if (handleEntitlementError(error)) {
        return;
      }
      const conflict = getEditConflictError(error);
      if (conflict) {
        Alert.alert(
          'הנתונים השתנו',
          'נמצאה גרסה חדשה של הקמפיין. טענו אותה לפני שינוי האוטומציה.',
          [
            {
              text: 'טען גרסה עדכנית',
              onPress: () => {
                applyCampaignSnapshot(campaignDraft);
              },
            },
            {
              text: 'השאר טיוטה מקומית',
              onPress: () => {
                setConflictLocked(true);
              },
            },
          ]
        );
        return;
      }
      Alert.alert('שגיאה', 'לא הצלחנו לעדכן מצב אוטומציה.');
    } finally {
      setIsTogglingAutomation(false);
    }
  };

  const handleSaveOnly = async () => {
    if (!canEditContent || isSubmitting || conflictLocked) {
      return;
    }
    if (!validateContent()) {
      return;
    }

    let rulesPayload: EditableCampaignRules | undefined;
    if (!isRulesLocked) {
      const builtRules = buildRulesPayload();
      if (!builtRules) {
        return;
      }
      rulesPayload = builtRules;
    }

    setPendingSubmitAction('save');
    setIsSubmitting(true);
    try {
      await saveDraftMutation(rulesPayload);
      Alert.alert('נשמר', 'הטיוטה נשמרה בהצלחה.', [
        { text: 'אישור', onPress: goBackToCampaignList },
      ]);
    } catch (error) {
      if (handleEntitlementError(error)) {
        return;
      }
      const conflict = getEditConflictError(error);
      if (conflict) {
        Alert.alert(
          'הנתונים השתנו',
          'נמצאה גרסה חדשה של הקמפיין. אפשר לטעון אותה או להשאיר את הטיוטה המקומית.',
          [
            {
              text: 'טען גרסה עדכנית',
              onPress: () => {
                applyCampaignSnapshot(campaignDraft);
              },
            },
            {
              text: 'השאר טיוטה מקומית',
              onPress: () => {
                setConflictLocked(true);
              },
            },
          ]
        );
        return;
      }
      Alert.alert('שגיאה', 'שמירת טיוטה נכשלה.');
    } finally {
      setIsSubmitting(false);
      setPendingSubmitAction(null);
    }
  };

  const handleSaveAndSend = async () => {
    if (
      !canEditContent ||
      !canActivateSendCampaigns ||
      isSubmitting ||
      conflictLocked ||
      isArchivedCampaign
    ) {
      return;
    }
    if (!validateContent()) {
      return;
    }

    let rulesPayload: EditableCampaignRules | undefined;
    if (!isRulesLocked) {
      const builtRules = buildRulesPayload();
      if (!builtRules) {
        return;
      }
      rulesPayload = builtRules;
    }

    setPendingSubmitAction('publish');
    setIsSubmitting(true);
    try {
      const saved = await saveDraftMutation(rulesPayload);
      let currentUpdatedAt =
        typeof saved?.updatedAt === 'number'
          ? saved.updatedAt
          : (baseUpdatedAt ?? undefined);
      if (campaignDraft.scheduleMode === 'one_time') {
        const cleared = await clearCampaignOneTimeSchedule({
          businessId: selectedBusinessId,
          campaignId,
          expectedUpdatedAt: currentUpdatedAt,
        });
        if (typeof cleared?.updatedAt === 'number') {
          currentUpdatedAt = cleared.updatedAt;
          setBaseUpdatedAt(cleared.updatedAt);
        }
      }

      const estimate = await estimateCampaignAudience({
        businessId: selectedBusinessId,
        campaignId,
      });

      if (estimate.total === 0) {
        Alert.alert(
          'אין נמענים',
          'לא נמצאו לקוחות זכאים (Opt-in) לקמפיין הזה.'
        );
        return;
      }

      const confirmed = await confirmSendNow(estimate.total);
      if (!confirmed) {
        return;
      }

      const result = await sendCampaignNow({
        businessId: selectedBusinessId,
        campaignId,
        expectedUpdatedAt: currentUpdatedAt,
      });
      if (typeof result?.updatedAt === 'number') {
        setBaseUpdatedAt(result.updatedAt);
      }

      Alert.alert(
        'נשלח',
        `נשלחו ${result.sentCount} הודעות. דולגו ${result.skippedCount}.`,
        [{ text: 'אישור', onPress: goBackToCampaignList }]
      );
    } catch (error) {
      if (handleEntitlementError(error)) {
        return;
      }
      const conflict = getEditConflictError(error);
      if (conflict) {
        Alert.alert(
          'הנתונים השתנו',
          'נמצאה גרסה חדשה של הקמפיין. טענו אותה לפני השליחה.',
          [
            {
              text: 'טען גרסה עדכנית',
              onPress: () => {
                applyCampaignSnapshot(campaignDraft);
              },
            },
            {
              text: 'השאר טיוטה מקומית',
              onPress: () => {
                setConflictLocked(true);
              },
            },
          ]
        );
        return;
      }
      Alert.alert('שגיאה', 'שמירה או שליחה נכשלו.');
    } finally {
      setIsSubmitting(false);
      setPendingSubmitAction(null);
    }
  };

  const setOneTimePreset = (daysFromNow: number, hour: number) => {
    setDeliveryMode('one_time');
    setScheduledForAt(getScheduledTimestamp(daysFromNow, hour));
  };

  const handleSaveAndSchedule = async () => {
    if (
      !canEditContent ||
      !canActivateSendCampaigns ||
      isSubmitting ||
      conflictLocked ||
      isArchivedCampaign
    ) {
      return;
    }
    if (!isEntitlementsLoading && campaignLimit.isOverLimit) {
      showPlanLimit(
        'תזמון הקמפיין נחסם',
        'לא ניתן להפעיל קמפיין חדש כאשר קיימת חריגה ממכסת הקמפיינים.',
        'maxCampaigns',
        requiredPlanForCampaigns
      );
      return;
    }
    if (!validateContent()) {
      return;
    }

    const sendAt = resolvedScheduledForAt;
    if (sendAt < Date.now() + MIN_SCHEDULE_LEAD_MS) {
      Alert.alert('זמן לא תקין', 'יש לבחור זמן שליחה בעתיד.');
      return;
    }

    let rulesPayload: EditableCampaignRules | undefined;
    if (!isRulesLocked) {
      const builtRules = buildRulesPayload();
      if (!builtRules) {
        return;
      }
      rulesPayload = builtRules;
    }

    setPendingSubmitAction('publish');
    setIsSubmitting(true);
    try {
      const saved = await saveDraftMutation(rulesPayload);
      const scheduled = await scheduleCampaignOneTime({
        businessId: selectedBusinessId,
        campaignId,
        sendAt,
        expectedUpdatedAt:
          typeof saved?.updatedAt === 'number'
            ? saved.updatedAt
            : (baseUpdatedAt ?? undefined),
      });
      if (typeof scheduled?.updatedAt === 'number') {
        setBaseUpdatedAt(scheduled.updatedAt);
      }
      Alert.alert('נשמר והופעל', `הקמפיין יישלח ב-${oneTimeScheduleDisplay}.`, [
        {
          text: 'אישור',
          onPress: goBackToCampaignList,
        },
      ]);
    } catch (error) {
      if (handleEntitlementError(error)) {
        return;
      }
      const conflict = getEditConflictError(error);
      if (conflict) {
        Alert.alert(
          'הנתונים השתנו',
          'נמצאה גרסה חדשה של הקמפיין. טענו אותה לפני התזמון.',
          [
            {
              text: 'טען גרסה עדכנית',
              onPress: () => {
                applyCampaignSnapshot(campaignDraft);
              },
            },
            {
              text: 'השאר טיוטה מקומית',
              onPress: () => {
                setConflictLocked(true);
              },
            },
          ]
        );
        return;
      }
      Alert.alert('שגיאה', 'שמירה או תזמון נכשלו.');
    } finally {
      setIsSubmitting(false);
      setPendingSubmitAction(null);
    }
  };

  const handleMoveToArchive = () => {
    if (
      !selectedBusinessId ||
      !canArchiveCampaign ||
      isArchiving ||
      isSubmitting ||
      isArchivedCampaign
    ) {
      return;
    }
    if (automationEnabled) {
      Alert.alert(
        'לא ניתן להעביר לארכיון',
        'יש לכבות אוטומציה לפני העברה לארכיון.'
      );
      return;
    }

    Alert.alert('העברה לארכיון', 'להעביר את הקמפיין לארכיון?', [
      { text: 'ביטול', style: 'cancel' },
      {
        text: 'העבר לארכיון',
        style: 'destructive',
        onPress: () => {
          void (async () => {
            setIsArchiving(true);
            try {
              await archiveManagementCampaign({
                businessId: selectedBusinessId,
                campaignId,
                expectedUpdatedAt: baseUpdatedAt ?? undefined,
              });
              Alert.alert('הועבר לארכיון', 'הקמפיין הועבר לארכיון בהצלחה.', [
                { text: 'אישור', onPress: goBackToCampaignList },
              ]);
            } catch (error) {
              const conflict = getEditConflictError(error);
              if (conflict) {
                Alert.alert(
                  'הנתונים השתנו',
                  'נמצאה גרסה חדשה של הקמפיין. טענו אותה לפני העברה לארכיון.',
                  [
                    {
                      text: 'טען גרסה עדכנית',
                      onPress: () => {
                        applyCampaignSnapshot(campaignDraft);
                      },
                    },
                    {
                      text: 'השאר טיוטה מקומית',
                      onPress: () => {
                        setConflictLocked(true);
                      },
                    },
                  ]
                );
                return;
              }
              if (
                error instanceof Error &&
                error.message.includes(
                  'CAMPAIGN_MUST_BE_DISABLED_BEFORE_ARCHIVE'
                )
              ) {
                Alert.alert(
                  'לא ניתן להעביר לארכיון',
                  'יש לכבות קודם את הקמפיין ורק לאחר מכן להעביר לארכיון.'
                );
                return;
              }
              Alert.alert('שגיאה', 'העברה לארכיון נכשלה.');
            } finally {
              setIsArchiving(false);
            }
          })();
        },
      },
    ]);
  };

  const handleRestoreAsDraft = () => {
    if (
      !selectedBusinessId ||
      !canEditCampaigns ||
      isArchiving ||
      isSubmitting ||
      !isArchivedCampaign
    ) {
      return;
    }

    Alert.alert('שחזור כטיוטה', 'הקמפיין יחזור לטיוטות ולא יופעל אוטומטית.', [
      { text: 'ביטול', style: 'cancel' },
      {
        text: 'שחזור',
        onPress: () => {
          void (async () => {
            setIsArchiving(true);
            try {
              const result = await restoreManagementCampaign({
                businessId: selectedBusinessId,
                campaignId,
              });
              if (typeof result?.updatedAt === 'number') {
                setBaseUpdatedAt(result.updatedAt);
              }
              Alert.alert(
                'שוחזר',
                'הקמפיין שוחזר כטיוטה וניתן להמשיך לערוך אותו.'
              );
            } catch (error) {
              if (handleEntitlementError(error)) {
                return;
              }
              Alert.alert('שגיאה', 'שחזור הקמפיין נכשל.');
            } finally {
              setIsArchiving(false);
            }
          })();
        },
      },
    ]);
  };

  return (
    <SafeAreaView className="flex-1 bg-[#E9F0FF]" edges={[]}>
      <KeyboardAvoidingView
        className="flex-1"
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
      >
        <ScrollView
          ref={guideScrollRef}
          stickyHeaderIndices={[0]}
          keyboardShouldPersistTaps="handled"
          className="flex-1"
          contentContainerStyle={{
            paddingHorizontal: 20,
            paddingBottom: 220,
            width: '100%',
            maxWidth: 960,
            alignSelf: 'center',
          }}
        >
          <ManagementPageHeader
            title="עריכת קמפיין"
            fallbackHref="/(authenticated)/(business)/campaigns"
            onBackPress={goBackToCampaignList}
          />

          {!canEditContent ? (
            <View className="mt-4 rounded-2xl border border-red-300 bg-red-50 p-4">
              <Text className="text-right text-sm font-semibold text-red-700">
                רק בעלים או מנהל יכולים לערוך ולשלוח קמפיינים.
              </Text>
            </View>
          ) : null}

          {isRulesLocked ? (
            <View className="mt-4 rounded-2xl border border-blue-200 bg-blue-50 p-4">
              <Text className="text-right text-sm font-semibold text-blue-700">
                קמפיין פעיל: חוקים וקהל יעד נעולים. ניתן לערוך טקסט בלבד.
              </Text>
            </View>
          ) : null}
          {isArchivedCampaign ? (
            <View className="mt-4 rounded-2xl border border-[#CBD5E1] bg-[#F8FAFC] p-4">
              <Text className="text-right text-sm font-semibold text-[#475569]">
                הקמפיין בארכיון. אפשר לערוך ולשמור אותו, או לשחזר אותו כטיוטה
                לפני הפעלה מחדש.
              </Text>
            </View>
          ) : null}
          {!isEntitlementsLoading && campaignLimit.isOverLimit ? (
            <View className="mt-4 rounded-2xl border border-red-300 bg-red-50 p-4">
              <Text className="text-right text-sm font-semibold text-red-700">
                העסק כרגע בחריגה ממכסת קמפיינים. שליחה או הפעלה של קמפיין חסומות
                עד לחזרה למכסה.
              </Text>
              <TouchableOpacity
                onPress={() =>
                  showPlanLimit(
                    'פעולת הקמפיין נחסמה',
                    'יש חריגה ממכסת הקמפיינים במסלול הנוכחי. אפשר לארכב קמפיין קיים או לנהל את המסלול.',
                    'maxCampaigns',
                    requiredPlanForCampaigns
                  )
                }
                className={`mt-3 ${tw.selfStart} rounded-full bg-red-600 px-3 py-1.5`}
              >
                <Text className="text-xs font-black text-white">
                  שדרוג מסלול
                </Text>
              </TouchableOpacity>
            </View>
          ) : null}

          <View className="mt-4">
            <EditorPreviewSurface>
              <CampaignCustomerPreview
                businessName={selectedBusiness?.name ?? 'העסק שלך'}
                title={messageTitle}
                body={messageBody}
              />
            </EditorPreviewSurface>
          </View>

          <View className="mt-4 gap-4">
            <EditorSection
              title="תוכן הקמפיין"
              subtitle="הכותרת וההודעה שהלקוחות יראו."
            >
              <View className={`${tw.flexRow} items-center gap-3`}>
                <View
                  className={`h-12 w-12 items-center justify-center rounded-2xl ${campaignIdentity.accentBgClass}`}
                >
                  <Ionicons
                    name={campaignIdentity.icon}
                    size={22}
                    color="#1A2B4A"
                  />
                </View>
                <View className={`flex-1 ${tw.itemsStart}`}>
                  <Text
                    className={`mt-1 text-lg font-black ${campaignIdentity.accentClass} ${tw.textStart}`}
                  >
                    {campaignIdentity.title}
                  </Text>
                  <Text
                    className={`mt-1 text-xs text-[#64748B] ${tw.textStart}`}
                    numberOfLines={2}
                  >
                    {campaignIdentity.subtitle}
                  </Text>
                </View>
              </View>

              <View className={`${tw.flexRow} mt-4 flex-wrap gap-2`}>
                <View className="rounded-full bg-[#EEF3FF] px-3 py-1">
                  <Text className="text-xs font-bold text-[#1D4ED8]">
                    קהל יעד: {audience.title}
                  </Text>
                </View>
                <View className="rounded-full bg-[#F1F5F9] px-3 py-1">
                  <Text className="text-xs font-bold text-[#475569]">
                    שיוך: {selectedProgramLabel}
                  </Text>
                </View>
                <View
                  className={`rounded-full px-3 py-1 ${
                    automationEnabled ? 'bg-[#DCFCE7]' : 'bg-[#E2E8F0]'
                  }`}
                >
                  <Text
                    className={`text-xs font-bold ${
                      automationEnabled ? 'text-[#166534]' : 'text-[#475569]'
                    }`}
                  >
                    אוטומציה: {automationEnabled ? 'פעילה' : 'כבויה'}
                  </Text>
                </View>
              </View>

              <View className="mt-2 gap-3">
                <Text
                  className={`text-[11px] font-semibold text-[#64748B] ${tw.textStart}`}
                >
                  תוכן ההודעה
                </Text>
                <TextInput
                  value={messageTitle}
                  onChangeText={setMessageTitle}
                  editable={canEditContent}
                  placeholder="כותרת ההודעה"
                  placeholderTextColor="#94A3B8"
                  className="rounded-2xl border border-[#E3E9FF] bg-[#F8FAFF] px-4 py-3 text-right text-sm font-semibold text-[#0F172A]"
                />
                <TextInput
                  value={messageBody}
                  onChangeText={setMessageBody}
                  editable={canEditContent}
                  multiline={true}
                  textAlignVertical="top"
                  placeholder="מה המתנה? כתבו כאן את תוכן ההטבה ללקוח"
                  placeholderTextColor="#94A3B8"
                  className="min-h-[120px] rounded-2xl border border-[#E3E9FF] bg-[#F8FAFF] px-4 py-3 text-right text-sm font-semibold text-[#0F172A]"
                />
              </View>
            </EditorSection>

            <EditorSection
              title="קהל יעד"
              subtitle="הקהל מחושב מהנתונים האמיתיים של העסק."
            >
              <View className="gap-3">
                <Text
                  className={`text-sm font-bold text-[#1A2B4A] ${tw.textStart}`}
                >
                  {audience.title}
                </Text>
                <Text className={`text-xs text-[#64748B] ${tw.textStart}`}>
                  {audience.subtitle}
                </Text>

                {audience.daysLabel ? (
                  <TextInput
                    value={daysInput}
                    onChangeText={setDaysInput}
                    editable={canEditRules}
                    keyboardType="number-pad"
                    placeholder={audience.daysLabel}
                    placeholderTextColor="#94A3B8"
                    className="rounded-2xl border border-[#E3E9FF] bg-[#F8FAFF] px-4 py-3 text-right text-sm font-semibold text-[#0F172A]"
                  />
                ) : null}

                <Text
                  className={`mt-2 text-[11px] font-semibold text-[#64748B] ${tw.textStart}`}
                >
                  שיוך לתוכנית נאמנות
                </Text>
                <Text className={`text-xs text-[#64748B] ${tw.textStart}`}>
                  ברירת מחדל: כל העסק. אפשר לשייך לקמפיין תוכנית ספציפית.
                </Text>
                <View className={`${tw.flexRow} flex-wrap gap-2`}>
                  <TouchableOpacity
                    disabled={!canEditRules}
                    onPress={() => setSelectedProgramId('all')}
                    className={`rounded-full px-3 py-2 ${
                      selectedProgramId === 'all'
                        ? 'bg-[#DBEAFE]'
                        : 'border border-[#E2E8F0] bg-white'
                    }`}
                  >
                    <Text
                      className={`text-xs font-bold ${
                        selectedProgramId === 'all'
                          ? 'text-[#1D4ED8]'
                          : 'text-[#475569]'
                      }`}
                    >
                      כל העסק
                    </Text>
                  </TouchableOpacity>
                  {activePrograms.map((program) => {
                    const programId = String(program.loyaltyProgramId);
                    const isSelected = selectedProgramId === programId;
                    return (
                      <TouchableOpacity
                        key={programId}
                        disabled={!canEditRules}
                        onPress={() => setSelectedProgramId(programId)}
                        className={`rounded-full px-3 py-2 ${
                          isSelected
                            ? 'bg-[#DBEAFE]'
                            : 'border border-[#E2E8F0] bg-white'
                        }`}
                      >
                        <Text
                          className={`text-xs font-bold ${
                            isSelected ? 'text-[#1D4ED8]' : 'text-[#475569]'
                          }`}
                        >
                          {program.title}
                        </Text>
                      </TouchableOpacity>
                    );
                  })}
                </View>

                <Text
                  className={`text-xs font-semibold text-[#475569] ${tw.textStart}`}
                >
                  קהל זכאי עכשיו: {stats.eligibleAudienceNow}
                </Text>
              </View>
            </EditorSection>

            <EditorSection
              title="ערוצים"
              subtitle="מוצגים רק ערוצי שליחה הנתמכים כעת."
            >
              <View
                className={`${tw.flexRow} items-center gap-3 rounded-2xl border border-[#BFDBFE] bg-[#EFF6FF] px-3 py-3`}
              >
                <View className="h-9 w-9 items-center justify-center rounded-xl bg-white">
                  <Ionicons
                    name="phone-portrait-outline"
                    size={19}
                    color="#1D4ED8"
                  />
                </View>
                <View className="flex-1 items-stretch">
                  <Text
                    className={`text-sm font-bold text-[#1E3A8A] ${tw.textStart}`}
                  >
                    הודעה באפליקציה
                  </Text>
                  <Text
                    className={`mt-0.5 text-xs text-[#475569] ${tw.textStart}`}
                  >
                    זהו ערוץ השליחה הנתמך בקמפיין הזה.
                  </Text>
                </View>
                <Ionicons name="checkmark-circle" size={21} color="#2563EB" />
              </View>
            </EditorSection>

            <EditorSection
              title="תזמון"
              subtitle="בחרו מצב פעיל אחד: עכשיו, תזמון חד-פעמי או אוטומציה."
            >
              <View className="gap-3">
                <Text
                  className={`text-[11px] font-semibold text-[#64748B] ${tw.textStart}`}
                >
                  אופן שליחה חד-פעמית
                </Text>
                <View className={`${tw.flexRow} flex-wrap gap-2`}>
                  <TouchableOpacity
                    disabled={!canEditContent || automationEnabled}
                    onPress={() => {
                      setDeliveryMode('send_now');
                      setScheduledForAt(null);
                    }}
                    className={`rounded-full px-3 py-2 ${
                      activeTimingMode === 'send_now'
                        ? 'bg-[#DBEAFE]'
                        : 'border border-[#E2E8F0] bg-white'
                    }`}
                  >
                    <Text
                      className={`text-xs font-bold ${
                        activeTimingMode === 'send_now'
                          ? 'text-[#1D4ED8]'
                          : 'text-[#475569]'
                      }`}
                    >
                      שליחה עכשיו
                    </Text>
                  </TouchableOpacity>
                  <TouchableOpacity
                    disabled={!canEditContent || automationEnabled}
                    onPress={() => setOneTimePreset(1, 10)}
                    className={`rounded-full px-3 py-2 ${
                      activeTimingMode === 'one_time'
                        ? 'bg-[#DBEAFE]'
                        : 'border border-[#E2E8F0] bg-white'
                    }`}
                  >
                    <Text
                      className={`text-xs font-bold ${
                        activeTimingMode === 'one_time'
                          ? 'text-[#1D4ED8]'
                          : 'text-[#475569]'
                      }`}
                    >
                      תזמון חד-פעמי
                    </Text>
                  </TouchableOpacity>
                  <TouchableOpacity
                    disabled={!canActivateSendCampaigns}
                    onPress={() => setShowAdvancedSettings(true)}
                    className={`rounded-full px-3 py-2 ${
                      activeTimingMode === 'automation'
                        ? 'bg-[#DBEAFE]'
                        : 'border border-[#E2E8F0] bg-white'
                    }`}
                  >
                    <Text
                      className={`text-xs font-bold ${
                        activeTimingMode === 'automation'
                          ? 'text-[#1D4ED8]'
                          : 'text-[#475569]'
                      }`}
                    >
                      אוטומציה
                    </Text>
                  </TouchableOpacity>
                </View>
                {automationEnabled ? (
                  <Text className={`text-xs text-[#166534] ${tw.textStart}`}>
                    אוטומציה פעילה. כדי לעבור לשליחה ידנית או חד-פעמית, כבו אותה
                    בהגדרות המתקדמות.
                  </Text>
                ) : null}
                {isOneTimeMode ? (
                  <View
                    ref={
                      campaignGuideTarget === 'schedule-summary'
                        ? campaignScheduleReviewTargetRef
                        : undefined
                    }
                    collapsable={false}
                    className="gap-2 rounded-2xl border border-[#E5EAF2] bg-[#F8FAFF] p-3"
                  >
                    <Text className={`text-xs text-[#1E293B] ${tw.textStart}`}>
                      זמן שליחה נבחר: {oneTimeScheduleDisplay}
                    </Text>
                    <View className={`${tw.flexRow} flex-wrap gap-2`}>
                      <TouchableOpacity
                        disabled={!canEditContent}
                        onPress={() => setOneTimePreset(1, 10)}
                        className="rounded-full border border-[#CBD5E1] bg-white px-3 py-1.5"
                      >
                        <Text className="text-xs font-bold text-[#334155]">
                          מחר 10:00
                        </Text>
                      </TouchableOpacity>
                      <TouchableOpacity
                        disabled={!canEditContent}
                        onPress={() => setOneTimePreset(1, 18)}
                        className="rounded-full border border-[#CBD5E1] bg-white px-3 py-1.5"
                      >
                        <Text className="text-xs font-bold text-[#334155]">
                          מחר 18:00
                        </Text>
                      </TouchableOpacity>
                      <TouchableOpacity
                        disabled={!canEditContent}
                        onPress={() => setOneTimePreset(3, 10)}
                        className="rounded-full border border-[#CBD5E1] bg-white px-3 py-1.5"
                      >
                        <Text className="text-xs font-bold text-[#334155]">
                          +3 ימים 10:00
                        </Text>
                      </TouchableOpacity>
                    </View>
                  </View>
                ) : (
                  <Text className={`text-xs text-[#64748B] ${tw.textStart}`}>
                    שליחה ידנית עכשיו: הקמפיין נשמר ונשלח רק לאחר אישור.
                  </Text>
                )}
                <Text className={`text-[11px] text-[#64748B] ${tw.textStart}`}>
                  Starter יכול לשלוח עכשיו ולתזמן שליחה חד-פעמית. אוטומציה
                  מחזורית חסומה ב-Starter.
                </Text>
              </View>
            </EditorSection>

            <EditorSection
              title="הגדרות מתקדמות"
              subtitle="אוטומציה מחזורית נשארת סגורה כברירת מחדל."
            >
              <TouchableOpacity
                accessibilityRole="button"
                accessibilityState={{ expanded: showAdvancedSettings }}
                onPress={() => setShowAdvancedSettings((value) => !value)}
                className={`${tw.flexRow} min-h-[44px] items-center justify-between rounded-2xl border border-[#DCE6F7] bg-[#F8FAFF] px-3 py-2`}
              >
                <Text
                  className={`flex-1 text-sm font-bold text-[#1A2B4A] ${tw.textStart}`}
                >
                  אוטומציה מחזורית
                </Text>
                <Ionicons
                  name={showAdvancedSettings ? 'chevron-up' : 'chevron-down'}
                  size={19}
                  color="#64748B"
                />
              </TouchableOpacity>

              {showAdvancedSettings ? (
                <View className="gap-3">
                  <View className="gap-3">
                    <Text
                      className={`text-[11px] font-semibold text-[#64748B] ${tw.textStart}`}
                    >
                      הפעלה אוטומטית
                    </Text>
                    <Text
                      className={`text-sm font-bold text-[#1A2B4A] ${tw.textStart}`}
                    >
                      שליחה יומית ב-09:00 (ישראל)
                    </Text>
                    <View
                      ref={
                        campaignGuideTarget === 'resume-action'
                          ? campaignResumeTargetRef
                          : undefined
                      }
                      collapsable={false}
                      className={`${tw.flexRow} items-center justify-between gap-3`}
                    >
                      <Text
                        className={`flex-1 text-xs text-[#64748B] ${tw.textStart}`}
                      >
                        {automationEnabled
                          ? 'הקמפיין ירוץ אוטומטית בכל יום.'
                          : 'הקמפיין לא ירוץ אוטומטית עד להפעלה.'}
                      </Text>
                      <TouchableOpacity
                        disabled={
                          !canActivateSendCampaigns ||
                          isTogglingAutomation ||
                          isArchivedCampaign
                        }
                        onPress={() => {
                          void handleToggleAutomation();
                        }}
                        className={`rounded-full px-3 py-1 ${
                          automationEnabled ? 'bg-[#DCFCE7]' : 'bg-[#E2E8F0]'
                        }`}
                      >
                        {isTogglingAutomation ? (
                          <ActivityIndicator color="#1E293B" size="small" />
                        ) : (
                          <Text
                            className={`text-xs font-bold ${
                              automationEnabled
                                ? 'text-[#166534]'
                                : 'text-[#475569]'
                            }`}
                          >
                            {automationEnabled ? 'פעיל' : 'כבוי'}
                          </Text>
                        )}
                      </TouchableOpacity>
                    </View>
                  </View>
                </View>
              ) : (
                <Text className={`text-xs text-[#64748B] ${tw.textStart}`}>
                  אפשר לפתוח כדי להגדיר שליחה אוטומטית נתמכת.
                </Text>
              )}
            </EditorSection>

            <EditorSection
              title="ביצועים"
              subtitle="נתוני אמת מצטברים של הקמפיין."
            >
              <View className="gap-2">
                <Text
                  className={`text-[11px] font-semibold text-[#64748B] ${tw.textStart}`}
                >
                  נתונים ותוצאות
                </Text>
                <View className="gap-2 rounded-2xl border border-[#E5EAF2] bg-[#F8FAFF] p-3">
                  <Text className={`text-xs text-[#475569] ${tw.textStart}`}>
                    קהל זכאי עכשיו: {stats.eligibleAudienceNow}
                  </Text>
                  <Text className={`text-xs text-[#475569] ${tw.textStart}`}>
                    הגיע לייחודיים: {stats.reachedUniqueAllTime}
                  </Text>
                  <Text className={`text-xs text-[#475569] ${tw.textStart}`}>
                    סה"כ הודעות: {stats.reachedMessagesAllTime}
                  </Text>
                  <Text className={`text-xs text-[#475569] ${tw.textStart}`}>
                    נשלח לאחרונה:{' '}
                    {typeof stats.lastSentAt === 'number'
                      ? formatDateTime(stats.lastSentAt)
                      : 'טרם נשלח'}
                  </Text>
                  {campaignType === 'birthday' &&
                  typeof stats.missingBirthdayCount === 'number' ? (
                    <Text className={`text-xs text-[#475569] ${tw.textStart}`}>
                      חסר יום הולדת: {stats.missingBirthdayCount}
                    </Text>
                  ) : null}
                </View>
              </View>
            </EditorSection>
          </View>

          <View className="mt-6 gap-3">
            {conflictLocked ? (
              <View className="rounded-2xl border border-[#FCD34D] bg-[#FFFBEB] px-4 py-3">
                <Text className="text-right text-xs text-[#92400E]">
                  נמצאה גרסה חדשה של הקמפיין. השמירה נעולה עד לטעינת הגרסה
                  העדכנית.
                </Text>
                <TouchableOpacity
                  onPress={() => {
                    applyCampaignSnapshot(campaignDraft);
                  }}
                  className={`mt-2 ${tw.selfStart} rounded-full bg-[#F59E0B] px-3 py-1.5`}
                >
                  <Text className="text-xs font-bold text-white">
                    טען גרסה עדכנית
                  </Text>
                </TouchableOpacity>
              </View>
            ) : null}

            <Text
              accessibilityLiveRegion="polite"
              className={`text-xs font-semibold ${
                isDirty ? 'text-[#B45309]' : 'text-[#15803D]'
              } ${tw.textStart}`}
            >
              {isDirty ? 'יש שינויים שטרם נשמרו' : 'כל השינויים נשמרו'}
            </Text>
          </View>
        </ScrollView>
        <EditorStickyFooter>
          <View
            ref={
              campaignGuideTarget === 'publish-action'
                ? campaignPublishTargetRef
                : undefined
            }
            collapsable={false}
          >
            <EditorPrimaryActions
              primaryLabel={
                isOneTimeMode ? 'שמור והפעל תזמון' : 'שמור ושלח עכשיו'
              }
              primaryDisabled={
                !canEditContent ||
                !canActivateSendCampaigns ||
                isSubmitting ||
                isArchiving ||
                conflictLocked ||
                isArchivedCampaign
              }
              primaryLoading={pendingSubmitAction === 'publish'}
              onPrimaryPress={() => {
                if (isOneTimeMode) {
                  void handleSaveAndSchedule();
                  return;
                }
                void handleSaveAndSend();
              }}
              secondaryLabel="שמור טיוטה"
              secondaryDisabled={
                !canEditContent || isSubmitting || isArchiving || conflictLocked
              }
              secondaryLoading={pendingSubmitAction === 'save'}
              onSecondaryPress={() => {
                void handleSaveOnly();
              }}
              lifecycleLabel={
                isArchivedCampaign ? 'שחזור כטיוטה' : 'העבר לארכיון'
              }
              lifecycleDisabled={
                (isArchivedCampaign
                  ? !canEditCampaigns
                  : !canArchiveCampaign) ||
                isSubmitting ||
                isArchiving ||
                conflictLocked
              }
              lifecycleLoading={isArchiving}
              onLifecyclePress={
                isArchivedCampaign ? handleRestoreAsDraft : handleMoveToArchive
              }
            />
          </View>
        </EditorStickyFooter>
      </KeyboardAvoidingView>
      <GuidedActionScreenOverlay
        activeBusinessId={activeBusinessId}
        routeKey="campaign-detail"
        routeEntityId={campaignId}
        routeEntityKind="campaign"
        targetRefs={{
          'campaign-publish': campaignPublishTargetRef,
          'campaign-resume': campaignResumeTargetRef,
          'campaign-schedule-review': campaignScheduleReviewTargetRef,
        }}
        scrollTargetIntoView={() => {
          if (guideIdParam === 'campaign-publish') {
            guideScrollRef.current?.scrollToEnd({ animated: false });
            return;
          }
          guideScrollRef.current?.scrollTo({
            y: guideIdParam === 'campaign-resume' ? 1120 : 900,
            animated: false,
          });
        }}
      />
      {planLimitModal}
    </SafeAreaView>
  );
}
