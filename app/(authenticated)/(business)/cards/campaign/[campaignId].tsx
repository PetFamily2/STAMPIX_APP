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
import { tw } from '@/lib/rtl';

type CampaignType =
  | 'welcome'
  | 'birthday'
  | 'anniversary'
  | 'winback'
  | 'promo';

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

  const campaignId = params.campaignId as Id<'campaigns'> | undefined;
  const businessIdFromParams = params.businessId as
    | Id<'businesses'>
    | undefined;

  const businesses = useQuery(api.scanner.myBusinesses) ?? [];
  const selectedBusinessId = useMemo(() => {
    if (businessIdFromParams) {
      return businessIdFromParams;
    }
    return businesses[0]?.businessId;
  }, [businessIdFromParams, businesses]);

  const selectedBusiness = useMemo(
    () =>
      businesses.find((business) => business.businessId === selectedBusinessId),
    [businesses, selectedBusinessId]
  );

  const canManagePrograms =
    selectedBusiness?.staffRole === 'owner' ||
    selectedBusiness?.staffRole === 'manager';

  const campaignDraft = useQuery(
    api.campaigns.getManagementCampaignDraft,
    selectedBusinessId && campaignId
      ? { businessId: selectedBusinessId, campaignId }
      : 'skip'
  );

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
  }, [campaignDraft]);

  const goBackToCampaignList = () => {
    router.replace('/(authenticated)/(business)/cards?tab=campaigns');
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

  if (!campaignId || !selectedBusinessId) {
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
  const isSent = (campaignDraft.status ?? 'draft') === 'sent';
  const automationEnabled = campaignDraft.automationEnabled === true;
  const isRulesLocked =
    (campaignDraft.isRulesLocked ?? automationEnabled) === true;

  const canEditContent = canManagePrograms && !isSent;
  const canEditRules = canEditContent && !isRulesLocked;

  const stats = campaignDraft.stats ?? {
    eligibleAudienceNow: 0,
    reachedUniqueAllTime: 0,
    reachedMessagesAllTime: 0,
    lastSentAt: null,
    missingBirthdayCount: null,
  };

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
      payload.rules = rulesPayload;
      payload.programId = campaignDraft.programId ?? undefined;
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
        { text: 'אישור', onPress: () => router.back() },
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
          subtitle="תוכן, אוטומציה וסטטיסטיקות במקום אחד"
          titleAccessory={
            <TouchableOpacity
              onPress={() => router.back()}
              className="h-10 w-10 items-center justify-center rounded-full bg-white"
            >
              <Text className="text-lg text-[#1A2B4A]">←</Text>
            </TouchableOpacity>
          }
        />

        {isSent ? (
          <View className="mt-4 rounded-2xl border border-amber-300 bg-amber-50 p-4">
            <Text className="text-right text-sm font-semibold text-amber-800">
              הקמפיין הזה מסומן כנשלח, עריכת תוכן נעולה.
            </Text>
          </View>
        ) : null}

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

        <View className="mt-5 gap-3 rounded-3xl border border-[#E3E9FF] bg-white p-5">
          <Text
            className={`text-[10px] uppercase tracking-[0.3em] text-[#5B6475] ${tw.textStart}`}
          >
            מצב קמפיין
          </Text>
          <Text className={`text-sm font-bold text-[#1A2B4A] ${tw.textStart}`}>
            אוטומטי יומי בשעה 09:00 (ישראל)
          </Text>
          <View className={`${tw.flexRow} items-center justify-between`}>
            <Text className={`text-xs text-[#64748B] ${tw.textStart}`}>
              מצב נוכחי: {automationEnabled ? 'פעיל' : 'כבוי'}
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

        <View className="mt-5 gap-2 rounded-3xl border border-[#E3E9FF] bg-white p-5">
          <Text
            className={`text-[10px] uppercase tracking-[0.3em] text-[#5B6475] ${tw.textStart}`}
          >
            סטטיסטיקות
          </Text>
          <Text className={`text-xs text-[#64748B] ${tw.textStart}`}>
            קהל זכאי עכשיו: {stats.eligibleAudienceNow}
          </Text>
          <Text className={`text-xs text-[#64748B] ${tw.textStart}`}>
            הגיע לייחודיים: {stats.reachedUniqueAllTime}
          </Text>
          <Text className={`text-xs text-[#64748B] ${tw.textStart}`}>
            סה"כ הודעות: {stats.reachedMessagesAllTime}
          </Text>
          <Text className={`text-xs text-[#64748B] ${tw.textStart}`}>
            נשלח לאחרונה:{' '}
            {typeof stats.lastSentAt === 'number'
              ? formatDateTime(stats.lastSentAt)
              : 'טרם נשלח'}
          </Text>
          {campaignType === 'birthday' &&
          typeof stats.missingBirthdayCount === 'number' ? (
            <Text className={`text-xs text-[#64748B] ${tw.textStart}`}>
              חסר יום הולדת: {stats.missingBirthdayCount}
            </Text>
          ) : null}
        </View>

        <View className="mt-5 gap-3 rounded-3xl border border-[#E3E9FF] bg-white p-5">
          <Text
            className={`text-[10px] uppercase tracking-[0.3em] text-[#5B6475] ${tw.textStart}`}
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

        <View className="mt-5 gap-3 rounded-3xl border border-[#E3E9FF] bg-white p-5">
          <Text
            className={`text-[10px] uppercase tracking-[0.3em] text-[#5B6475] ${tw.textStart}`}
          >
            קהל יעד
          </Text>
          <Text className={`text-sm font-bold text-[#1A2B4A] ${tw.textStart}`}>
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
