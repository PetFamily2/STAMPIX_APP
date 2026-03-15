import { Ionicons } from '@expo/vector-icons';
import { useMutation, useQuery } from 'convex/react';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  ScrollView,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import {
  SafeAreaView,
  useSafeAreaInsets,
} from 'react-native-safe-area-context';

import BusinessScreenHeader from '@/components/BusinessScreenHeader';
import { api } from '@/convex/_generated/api';
import type { Id } from '@/convex/_generated/dataModel';
import { useActiveBusiness } from '@/hooks/useActiveBusiness';
import { tw } from '@/lib/rtl';

type CampaignType =
  | 'welcome'
  | 'birthday'
  | 'anniversary'
  | 'winback'
  | 'promo';
type CampaignCreateMode = 'template' | 'custom';

const CAMPAIGN_TEMPLATES: Array<{
  type: CampaignType;
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
    title: 'מבצע כללי',
    subtitle: 'קמפיין שיווקי לכל הלקוחות הפעילים',
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
        subtitle: 'נשלח ללקוחות חדשים לפי טווח ימים מההצטרפות.',
        daysLabel: 'תוך כמה ימים מההצטרפות',
      };
    case 'winback':
      return {
        title: 'לקוחות לא פעילים',
        subtitle: 'נשלח ללקוחות שלא הגיעו בפרק הזמן שנבחר.',
        daysLabel: 'כמה ימים ללא ביקור',
      };
    case 'birthday':
      return {
        title: 'יום הולדת היום',
        subtitle: 'קהל קבוע לפי יום ההולדת של הלקוח.',
      };
    case 'anniversary':
      return {
        title: 'יום נישואין היום',
        subtitle: 'קהל קבוע לפי יום הנישואין של הלקוח.',
      };
    case 'promo':
      return {
        title: 'כל הלקוחות הפעילים',
        subtitle: 'קהל קבוע של כל חברי המועדון הפעילים עם Opt-in.',
      };
    default:
      return {
        title: 'קהל יעד',
        subtitle: 'קהל קבוע לפי סוג הקמפיין.',
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
        title: 'קמפיין השבת לקוחות',
        subtitle: 'פנייה ללקוחות שלא ביקרו לאחרונה',
        icon: 'refresh-outline',
        accentClass: 'text-[#0F766E]',
        accentBgClass: 'bg-[#CCFBF1]',
      };
    case 'promo':
      return {
        title: 'קמפיין מבצע כללי',
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

function formatDateTime(value: number): string {
  return new Date(value).toLocaleString('he-IL', {
    day: '2-digit',
    month: '2-digit',
    year: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  });
}

export default function CampaignDraftEditorScreen() {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const params = useLocalSearchParams<{
    campaignId?: string;
    businessId?: string;
  }>();

  const campaignIdParam = params.campaignId;
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

  const canManagePrograms =
    selectedBusiness?.staffRole === 'owner' ||
    selectedBusiness?.staffRole === 'manager';
  const programs =
    useQuery(
      api.loyaltyPrograms.listManagementByBusiness,
      selectedBusinessId ? { businessId: selectedBusinessId } : 'skip'
    ) ?? [];
  const activePrograms = useMemo(
    () => programs.filter((program) => program.lifecycle === 'active'),
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

  const [messageTitle, setMessageTitle] = useState('');
  const [messageBody, setMessageBody] = useState('');
  const [daysInput, setDaysInput] = useState('');
  const [selectedProgramId, setSelectedProgramId] = useState<string>('all');
  const [createMode, setCreateMode] = useState<CampaignCreateMode>('template');
  const [isCreatingDraft, setIsCreatingDraft] = useState<
    CampaignType | 'custom' | null
  >(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isTogglingAutomation, setIsTogglingAutomation] = useState(false);

  useEffect(() => {
    if (!campaignDraft) {
      return;
    }
    setMessageTitle(campaignDraft.messageTitle ?? '');
    setMessageBody(campaignDraft.messageBody ?? '');
    setDaysInput(
      rulesInputFromDraft(
        campaignDraft.type as CampaignType,
        campaignDraft.rules
      )
    );
    setSelectedProgramId(
      campaignDraft.programId ? String(campaignDraft.programId) : 'all'
    );
  }, [campaignDraft]);

  const goBackToCampaignList = () => {
    router.replace('/(authenticated)/(business)/cards/campaigns');
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

  const handleCreateFromTemplate = async (type: CampaignType) => {
    if (!selectedBusinessId || !canManagePrograms || isCreatingDraft) {
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
      Alert.alert(
        'שגיאה',
        error instanceof Error ? error.message : 'יצירת קמפיין נכשלה.'
      );
    } finally {
      setIsCreatingDraft(null);
    }
  };

  const handleCreateCustomCampaign = async () => {
    if (!selectedBusinessId || !canManagePrograms || isCreatingDraft) {
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
      Alert.alert(
        'שגיאה',
        error instanceof Error ? error.message : 'יצירת קמפיין נכשלה.'
      );
    } finally {
      setIsCreatingDraft(null);
    }
  };

  const confirmSendNow = (totalRecipients: number): Promise<boolean> =>
    new Promise((resolve) => {
      Alert.alert(
        'אישור שליחה',
        `הקמפיין ישלח ל-${totalRecipients} לקוחות. להמשיך?`,
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
        <Text className="text-center text-sm text-[#64748B]">
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
          className="flex-1"
          contentContainerStyle={{
            paddingHorizontal: 20,
            paddingTop: (insets.top || 0) + 12,
            paddingBottom: 28,
          }}
        >
          <BusinessScreenHeader
            title="יצירת קמפיין"
            subtitle="בחרו תבנית מוכנה או צרו קמפיין מותאם אישית"
            titleAccessory={
              <TouchableOpacity
                onPress={goBackToCampaignList}
                className="h-10 w-10 items-center justify-center rounded-full bg-white"
              >
                <Text className="text-lg text-[#1A2B4A]">←</Text>
              </TouchableOpacity>
            }
          />

          {!canManagePrograms ? (
            <View className="mt-4 rounded-2xl border border-red-300 bg-red-50 p-4">
              <Text className="text-right text-sm font-semibold text-red-700">
                רק בעלים או מנהל יכולים ליצור קמפיינים.
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
                  const meta = campaignMeta(template.type);
                  const isBusy = isCreatingDraft === template.type;
                  const disabled =
                    !canManagePrograms || isCreatingDraft != null;
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
                        <View className="flex-1 items-end">
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
                disabled={!canManagePrograms || isCreatingDraft != null}
                onPress={() => {
                  void handleCreateCustomCampaign();
                }}
                className={`mt-4 rounded-2xl px-4 py-3 ${
                  !canManagePrograms || isCreatingDraft != null
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
      </SafeAreaView>
    );
  }

  if (!campaignId) {
    return (
      <SafeAreaView className="flex-1 items-center justify-center bg-[#E9F0FF] px-6">
        <Text className="text-center text-sm text-[#64748B]">
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
        <Text className="text-center text-sm text-[#64748B]">
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
  const automationEnabled = campaignDraft.automationEnabled === true;
  const isRulesLocked =
    (campaignDraft.isRulesLocked ?? automationEnabled) === true;

  const canEditContent = canManagePrograms;
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
      messageTitle: string;
      messageBody: string;
      rules?: EditableCampaignRules;
      programId?: Id<'loyaltyPrograms'>;
    } = {
      businessId: selectedBusinessId,
      campaignId,
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

    await updateCampaignDraft(payload);
  };

  const handleToggleAutomation = async () => {
    if (!canManagePrograms || isTogglingAutomation) {
      return;
    }
    setIsTogglingAutomation(true);
    try {
      await setCampaignAutomationEnabled({
        businessId: selectedBusinessId,
        campaignId,
        enabled: !automationEnabled,
      });
    } catch (error) {
      Alert.alert(
        'שגיאה',
        error instanceof Error ? error.message : 'לא הצלחנו לעדכן מצב אוטומציה.'
      );
    } finally {
      setIsTogglingAutomation(false);
    }
  };

  const handleSaveOnly = async () => {
    if (!canEditContent || isSubmitting) {
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

    setIsSubmitting(true);
    try {
      await saveDraftMutation(rulesPayload);
      Alert.alert('נשמר', 'הטיוטה נשמרה בהצלחה.', [
        { text: 'אישור', onPress: goBackToCampaignList },
      ]);
    } catch (error) {
      Alert.alert(
        'שגיאה',
        error instanceof Error ? error.message : 'שמירת טיוטה נכשלה.'
      );
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleSaveAndSend = async () => {
    if (!canEditContent || isSubmitting) {
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

    setIsSubmitting(true);
    try {
      await saveDraftMutation(rulesPayload);

      const estimate = await estimateCampaignAudience({
        businessId: selectedBusinessId,
        campaignId,
      });

      if (estimate.total === 0) {
        Alert.alert('אין נמענים', 'לא נמצאו לקוחות זכאים (Opt-in) לקמפיין זה.');
        return;
      }

      const confirmed = await confirmSendNow(estimate.total);
      if (!confirmed) {
        return;
      }

      const result = await sendCampaignNow({
        businessId: selectedBusinessId,
        campaignId,
      });

      Alert.alert(
        'נשלח',
        `נשלחו ${result.sentCount} הודעות. דולגו ${result.skippedCount}.`,
        [{ text: 'אישור', onPress: goBackToCampaignList }]
      );
    } catch (error) {
      Alert.alert(
        'שגיאה',
        error instanceof Error ? error.message : 'שמירה או שליחה נכשלו.'
      );
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <SafeAreaView className="flex-1 bg-[#E9F0FF]" edges={[]}>
      <ScrollView
        className="flex-1"
        contentContainerStyle={{
          paddingHorizontal: 20,
          paddingTop: (insets.top || 0) + 12,
          paddingBottom: 28,
        }}
      >
        <BusinessScreenHeader
          title="עריכת קמפיין"
          titleAccessory={
            <TouchableOpacity
              onPress={goBackToCampaignList}
              className="h-10 w-10 items-center justify-center rounded-full bg-white"
            >
              <Text className="text-lg text-[#1A2B4A]">←</Text>
            </TouchableOpacity>
          }
        />

        {!canManagePrograms ? (
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

        <View className="mt-4 rounded-3xl border border-[#DCE7FF] bg-white p-5">
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
            <View className="flex-1 items-end">
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

          <View className="my-5 h-px bg-[#E7EEFF]" />

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
              className={`${tw.flexRow} items-center justify-between gap-3`}
            >
              <Text className={`flex-1 text-xs text-[#64748B] ${tw.textStart}`}>
                {automationEnabled
                  ? 'הקמפיין ירוץ אוטומטית בכל יום.'
                  : 'הקמפיין לא ירוץ אוטומטית עד להפעלה.'}
              </Text>
              <TouchableOpacity
                disabled={!canManagePrograms || isTogglingAutomation}
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
                      automationEnabled ? 'text-[#166534]' : 'text-[#475569]'
                    }`}
                  >
                    {automationEnabled ? 'פעיל' : 'כבוי'}
                  </Text>
                )}
              </TouchableOpacity>
            </View>
          </View>

          <View className="my-5 h-px bg-[#E7EEFF]" />

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

          <View className="my-5 h-px bg-[#E7EEFF]" />

          <View className="gap-3">
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

          <View className="my-5 h-px bg-[#E7EEFF]" />

          <View className="gap-3">
            <Text
              className={`text-[11px] font-semibold text-[#64748B] ${tw.textStart}`}
            >
              קהל יעד
            </Text>
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
          </View>
        </View>

        <View className="mt-6 gap-3">
          <TouchableOpacity
            disabled={!canEditContent || isSubmitting}
            onPress={() => {
              void handleSaveOnly();
            }}
            className={`rounded-2xl px-4 py-3 ${
              canEditContent && !isSubmitting ? 'bg-[#2F6BFF]' : 'bg-[#CBD5E1]'
            }`}
          >
            {isSubmitting ? (
              <ActivityIndicator color="#FFFFFF" />
            ) : (
              <Text className="text-center text-sm font-bold text-white">
                שמור טיוטה
              </Text>
            )}
          </TouchableOpacity>

          <TouchableOpacity
            disabled={!canEditContent || isSubmitting}
            onPress={() => {
              void handleSaveAndSend();
            }}
            className={`rounded-2xl px-4 py-3 ${
              canEditContent && !isSubmitting ? 'bg-[#0F766E]' : 'bg-[#CBD5E1]'
            }`}
          >
            <Text className="text-center text-sm font-bold text-white">
              שמור ושלח עכשיו
            </Text>
          </TouchableOpacity>
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}
