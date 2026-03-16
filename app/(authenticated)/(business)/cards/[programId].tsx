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
import ProgramCustomerCardPreview from '@/components/business/ProgramCustomerCardPreview';
import StickyScrollHeader from '@/components/StickyScrollHeader';
import { CARD_THEMES } from '@/constants/cardThemes';
import { api } from '@/convex/_generated/api';
import type { Id } from '@/convex/_generated/dataModel';
import { useActiveBusiness } from '@/hooks/useActiveBusiness';
import { tw } from '@/lib/rtl';

type ProgramLifecycle = 'draft' | 'active' | 'archived';

type ProgramDetails = {
  loyaltyProgramId: Id<'loyaltyPrograms'>;
  businessId: Id<'businesses'>;
  title: string;
  description: string | null;
  imageUrl: string | null;
  rewardName: string;
  maxStamps: number;
  cardTerms: string | null;
  rewardConditions: string | null;
  stampIcon: string;
  cardThemeId: string;
  lifecycle: ProgramLifecycle;
  status: ProgramLifecycle;
  isRuleLocked: boolean;
  canDelete: boolean;
  membershipCount: number;
  metrics: {
    activeMembers: number;
    totalMembers: number;
    stamps7d: number;
    redemptions30d: number;
    lastActivityAt: number | null;
  };
};

const formatNumber = (value: number) =>
  new Intl.NumberFormat('he-IL', { maximumFractionDigits: 0 }).format(value);

const TEXT = {
  missingData: 'נתוני כרטיסיה חסרים.',
  savedTitle: 'נשמר',
  savedMessage: 'שינויי הכרטיסיה נשמרו בהצלחה.',
  errorTitle: 'שגיאה',
  saveFailed: 'שמירה נכשלה.',
  publishDoneTitle: 'הכרטיסיה פורסמה',
  publishDoneMessage: 'הכרטיסיה עברה למצב פעיל והחוקים ננעלו.',
  archiveDoneTitle: 'הכרטיסיה הועברה לארכיון',
  archiveDoneMessage: 'הכרטיסיה זמינה רק להמשך צבירה ללקוחות קיימים.',
  deleteConfirmTitle: 'מחיקת כרטיסיה',
  deleteConfirmMessage: 'הכרטיסיה תימחק לצמיתות. להמשיך?',
  deleteDoneTitle: 'הכרטיסיה נמחקה',
  deleteDoneMessage: 'הכרטיסיה הוסרה בהצלחה.',
  lockDraft: 'טיוטה: שדות חוקי הכרטיס ניתנים לעריכה.',
  lockActive: 'פעיל: שדות חוקי הכרטיס נעולים לאחר פרסום.',
  lockArchived: 'ארכיון: שדות חוקי הכרטיס נשארים נעולים.',
  statusDraft: 'טיוטה',
  statusActive: 'פעיל',
  statusArchived: 'בארכיון',
} as const;

export default function ProgramDetailsScreen() {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const params = useLocalSearchParams<{
    programId?: string;
    businessId?: string;
  }>();
  const programId = params.programId as Id<'loyaltyPrograms'> | undefined;
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

  const canManage =
    selectedBusiness?.staffRole === 'owner' ||
    selectedBusiness?.staffRole === 'manager';

  const details = useQuery(
    api.loyaltyPrograms.getProgramDetailsForManagement,
    selectedBusinessId && programId
      ? { businessId: selectedBusinessId, programId }
      : 'skip'
  ) as ProgramDetails | undefined;

  const updateProgram = useMutation(
    api.loyaltyPrograms.updateProgramForManagement
  );
  const publishProgram = useMutation(api.loyaltyPrograms.publishProgram);
  const archiveProgram = useMutation(api.loyaltyPrograms.archiveProgram);
  const deleteProgram = useMutation(api.loyaltyPrograms.deleteProgram);

  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [imageUrl, setImageUrl] = useState('');
  const [rewardName, setRewardName] = useState('');
  const [maxStamps, setMaxStamps] = useState('10');
  const [cardTerms, setCardTerms] = useState('');
  const [rewardConditions, setRewardConditions] = useState('');
  const [stampIcon, setStampIcon] = useState('star');
  const [cardThemeId, setCardThemeId] = useState(CARD_THEMES[0].id);
  const [isSubmitting, setIsSubmitting] = useState(false);

  useEffect(() => {
    if (!details) {
      return;
    }
    setTitle(details.title);
    setDescription(details.description ?? '');
    setImageUrl(details.imageUrl ?? '');
    setRewardName(details.rewardName);
    setMaxStamps(String(details.maxStamps));
    setCardTerms(details.cardTerms ?? '');
    setRewardConditions(details.rewardConditions ?? '');
    setStampIcon(details.stampIcon);
    setCardThemeId(details.cardThemeId);
  }, [details]);

  if (!programId || !selectedBusinessId) {
    return (
      <SafeAreaView className="flex-1 items-center justify-center bg-[#E9F0FF]">
        <Text className="text-sm text-[#64748B]">{TEXT.missingData}</Text>
      </SafeAreaView>
    );
  }

  const lifecycle = details?.lifecycle ?? 'draft';
  const isRuleLocked = lifecycle !== 'draft';
  const parsedMaxStamps = Number(maxStamps);
  const canEditGeneralFields = canManage && !isSubmitting;
  const canEditRuleFields = canManage && !isSubmitting && !isRuleLocked;
  const canSave =
    canEditGeneralFields &&
    title.trim().length > 0 &&
    rewardName.trim().length > 0 &&
    stampIcon.trim().length > 0 &&
    Number.isFinite(parsedMaxStamps) &&
    parsedMaxStamps > 0;

  const lockMessage =
    lifecycle === 'draft'
      ? TEXT.lockDraft
      : lifecycle === 'active'
        ? TEXT.lockActive
        : TEXT.lockArchived;

  const statusLabel =
    lifecycle === 'draft'
      ? TEXT.statusDraft
      : lifecycle === 'active'
        ? TEXT.statusActive
        : TEXT.statusArchived;

  const handleSave = async () => {
    if (!canSave) {
      return;
    }

    setIsSubmitting(true);
    try {
      await updateProgram({
        businessId: selectedBusinessId,
        programId,
        title: title.trim(),
        description: description.trim() || undefined,
        imageUrl: imageUrl.trim() || undefined,
        rewardName: rewardName.trim(),
        maxStamps: parsedMaxStamps,
        cardTerms: cardTerms.trim() || undefined,
        rewardConditions: rewardConditions.trim() || undefined,
        stampIcon: stampIcon.trim(),
        cardThemeId,
      });
      Alert.alert(TEXT.savedTitle, TEXT.savedMessage);
    } catch (error) {
      Alert.alert(
        TEXT.errorTitle,
        error instanceof Error ? error.message : TEXT.saveFailed
      );
    } finally {
      setIsSubmitting(false);
    }
  };

  const handlePublish = async () => {
    if (!canManage || lifecycle !== 'draft' || isSubmitting) {
      return;
    }

    setIsSubmitting(true);
    try {
      await publishProgram({ businessId: selectedBusinessId, programId });
      Alert.alert(TEXT.publishDoneTitle, TEXT.publishDoneMessage);
    } catch (error) {
      Alert.alert(
        TEXT.errorTitle,
        error instanceof Error ? error.message : TEXT.saveFailed
      );
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleArchive = async () => {
    if (!canManage || lifecycle !== 'active' || isSubmitting) {
      return;
    }

    setIsSubmitting(true);
    try {
      await archiveProgram({ businessId: selectedBusinessId, programId });
      Alert.alert(TEXT.archiveDoneTitle, TEXT.archiveDoneMessage);
    } catch (error) {
      Alert.alert(
        TEXT.errorTitle,
        error instanceof Error ? error.message : TEXT.saveFailed
      );
    } finally {
      setIsSubmitting(false);
    }
  };

  const runDelete = async () => {
    if (!canManage || !details?.canDelete || isSubmitting) {
      return;
    }
    setIsSubmitting(true);
    try {
      await deleteProgram({ businessId: selectedBusinessId, programId });
      Alert.alert(TEXT.deleteDoneTitle, TEXT.deleteDoneMessage, [
        {
          text: 'אישור',
          onPress: () => router.replace('/(authenticated)/(business)/cards'),
        },
      ]);
    } catch (error) {
      Alert.alert(
        TEXT.errorTitle,
        error instanceof Error ? error.message : TEXT.saveFailed
      );
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleDelete = () => {
    Alert.alert(TEXT.deleteConfirmTitle, TEXT.deleteConfirmMessage, [
      { text: 'ביטול', style: 'cancel' },
      {
        text: 'מחק',
        style: 'destructive',
        onPress: () => {
          void runDelete();
        },
      },
    ]);
  };

  return (
    <SafeAreaView className="flex-1 bg-[#E9F0FF]" edges={[]}>
      <ScrollView
        className="flex-1"
        stickyHeaderIndices={[0]}
        contentContainerStyle={{
          paddingHorizontal: 20,
          paddingBottom: 28,
        }}
      >
        <StickyScrollHeader
          topPadding={(insets.top || 0) + 12}
          backgroundColor="#E9F0FF"
        >
          <BusinessScreenHeader
            title="פרטי כרטיסיה"
            subtitle="עריכה, סטטוס ותפעול מחזור חיים"
            titleAccessory={
              <TouchableOpacity
                onPress={() => router.back()}
                className="h-10 w-10 items-center justify-center rounded-full bg-white"
              >
                <Text className="text-lg text-[#1A2B4A]">←</Text>
              </TouchableOpacity>
            }
          />
        </StickyScrollHeader>

        {details === undefined ? (
          <View className="mt-6 items-center justify-center">
            <ActivityIndicator color="#2F6BFF" />
          </View>
        ) : (
          <>
            <View className="mt-4 rounded-2xl border border-[#DBEAFE] bg-[#EFF6FF] p-4">
              <Text
                className={`text-sm font-black text-[#1E3A8A] ${tw.textStart}`}
              >
                סטטוס: {statusLabel}
              </Text>
              <Text className={`mt-1 text-xs text-[#1D4ED8] ${tw.textStart}`}>
                {lockMessage}
              </Text>
            </View>

            <View className="mt-5">
              <ProgramCustomerCardPreview
                businessName={selectedBusiness?.name ?? 'העסק שלך'}
                businessLogoUrl={selectedBusiness?.logoUrl ?? null}
                title={title || details.title}
                rewardName={rewardName || details.rewardName}
                maxStamps={parsedMaxStamps || details.maxStamps}
                previewCurrentStamps={Math.min(
                  3,
                  Math.max(1, parsedMaxStamps || details.maxStamps)
                )}
                cardThemeId={cardThemeId}
                stampIcon={stampIcon || details.stampIcon}
                status={lifecycle === 'archived' ? 'archived' : 'default'}
                variant="hero"
              />
            </View>

            <View className="mt-5 rounded-3xl border border-[#E3E9FF] bg-white p-5 gap-3">
              <Text
                className={`text-[11px] font-semibold text-[#64748B] ${tw.textStart}`}
              >
                שדות ניתנים לעריכה בכל סטטוס
              </Text>

              <TextInput
                value={title}
                onChangeText={setTitle}
                editable={canEditGeneralFields}
                placeholder="שם הכרטיסיה"
                placeholderTextColor="#94A3B8"
                className="rounded-2xl border border-[#E3E9FF] bg-[#F8FAFF] px-4 py-3 text-right text-sm font-semibold text-[#0F172A]"
              />
              <TextInput
                value={description}
                onChangeText={setDescription}
                editable={canEditGeneralFields}
                placeholder="תיאור"
                placeholderTextColor="#94A3B8"
                multiline={true}
                textAlignVertical="top"
                className="min-h-[80px] rounded-2xl border border-[#E3E9FF] bg-[#F8FAFF] px-4 py-3 text-right text-sm font-semibold text-[#0F172A]"
              />
              <TextInput
                value={imageUrl}
                onChangeText={setImageUrl}
                editable={canEditGeneralFields}
                placeholder="קישור תמונה"
                placeholderTextColor="#94A3B8"
                className="rounded-2xl border border-[#E3E9FF] bg-[#F8FAFF] px-4 py-3 text-right text-sm font-semibold text-[#0F172A]"
              />
              <TextInput
                value={stampIcon}
                onChangeText={setStampIcon}
                editable={canEditGeneralFields}
                placeholder="אייקון"
                placeholderTextColor="#94A3B8"
                className="rounded-2xl border border-[#E3E9FF] bg-[#F8FAFF] px-4 py-3 text-right text-sm font-semibold text-[#0F172A]"
              />

              <View className={`${tw.flexRow} flex-wrap gap-2`}>
                {CARD_THEMES.map((theme) => {
                  const selected = cardThemeId === theme.id;
                  return (
                    <TouchableOpacity
                      key={theme.id}
                      disabled={!canEditGeneralFields}
                      onPress={() => setCardThemeId(theme.id)}
                      className={`rounded-xl border px-3 py-2 ${
                        selected
                          ? 'border-[#2F6BFF] bg-[#EAF1FF]'
                          : 'border-[#DCE6F7] bg-[#F8FAFF]'
                      }`}
                    >
                      <Text className="text-xs font-bold text-[#1A2B4A]">
                        {theme.name}
                      </Text>
                    </TouchableOpacity>
                  );
                })}
              </View>
            </View>

            <View className="mt-5 rounded-3xl border border-[#E3E9FF] bg-white p-5 gap-3">
              <Text
                className={`text-[11px] font-semibold text-[#64748B] ${tw.textStart}`}
              >
                שדות חוקי כרטיס
              </Text>

              <TextInput
                value={rewardName}
                onChangeText={setRewardName}
                editable={canEditRuleFields}
                placeholder="שם ההטבה"
                placeholderTextColor="#94A3B8"
                className={`rounded-2xl border px-4 py-3 text-right text-sm font-semibold ${
                  canEditRuleFields
                    ? 'border-[#E3E9FF] bg-[#F8FAFF] text-[#0F172A]'
                    : 'border-[#E2E8F0] bg-[#F1F5F9] text-[#64748B]'
                }`}
              />

              <TextInput
                value={maxStamps}
                onChangeText={setMaxStamps}
                editable={canEditRuleFields}
                keyboardType="number-pad"
                placeholder="מספר ניקובים"
                placeholderTextColor="#94A3B8"
                className={`rounded-2xl border px-4 py-3 text-right text-sm font-semibold ${
                  canEditRuleFields
                    ? 'border-[#E3E9FF] bg-[#F8FAFF] text-[#0F172A]'
                    : 'border-[#E2E8F0] bg-[#F1F5F9] text-[#64748B]'
                }`}
              />

              <TextInput
                value={cardTerms}
                onChangeText={setCardTerms}
                editable={canEditRuleFields}
                placeholder="תנאי כרטיס"
                placeholderTextColor="#94A3B8"
                multiline={true}
                textAlignVertical="top"
                className={`min-h-[80px] rounded-2xl border px-4 py-3 text-right text-sm font-semibold ${
                  canEditRuleFields
                    ? 'border-[#E3E9FF] bg-[#F8FAFF] text-[#0F172A]'
                    : 'border-[#E2E8F0] bg-[#F1F5F9] text-[#64748B]'
                }`}
              />

              <TextInput
                value={rewardConditions}
                onChangeText={setRewardConditions}
                editable={canEditRuleFields}
                placeholder="תנאי מימוש הטבה"
                placeholderTextColor="#94A3B8"
                multiline={true}
                textAlignVertical="top"
                className={`min-h-[80px] rounded-2xl border px-4 py-3 text-right text-sm font-semibold ${
                  canEditRuleFields
                    ? 'border-[#E3E9FF] bg-[#F8FAFF] text-[#0F172A]'
                    : 'border-[#E2E8F0] bg-[#F1F5F9] text-[#64748B]'
                }`}
              />
            </View>

            <View className="mt-5 rounded-3xl border border-[#E3E9FF] bg-white p-5 gap-2">
              <Text
                className={`text-[11px] font-semibold text-[#64748B] ${tw.textStart}`}
              >
                ביצועי כרטיסיה
              </Text>
              <Text className={`text-sm text-[#1A2B4A] ${tw.textStart}`}>
                לקוחות פעילים: {formatNumber(details.metrics.activeMembers)}
              </Text>
              <Text className={`text-sm text-[#1A2B4A] ${tw.textStart}`}>
                סה"כ לקוחות: {formatNumber(details.metrics.totalMembers)}
              </Text>
              <Text className={`text-sm text-[#1A2B4A] ${tw.textStart}`}>
                ניקובים 7 ימים: {formatNumber(details.metrics.stamps7d)}
              </Text>
              <Text className={`text-sm text-[#1A2B4A] ${tw.textStart}`}>
                מימושים 30 ימים: {formatNumber(details.metrics.redemptions30d)}
              </Text>
              <Text className={`text-sm text-[#1A2B4A] ${tw.textStart}`}>
                ניתן למחוק: {details.canDelete ? 'כן' : 'לא'}
              </Text>
            </View>

            <View className="mt-5 gap-3">
              <TouchableOpacity
                disabled={!canSave}
                onPress={() => {
                  void handleSave();
                }}
                className={`rounded-2xl px-4 py-3 ${
                  canSave ? 'bg-[#2F6BFF]' : 'bg-[#CBD5E1]'
                }`}
              >
                {isSubmitting ? (
                  <ActivityIndicator color="#FFFFFF" />
                ) : (
                  <Text className="text-center text-sm font-bold text-white">
                    שמור שינויים
                  </Text>
                )}
              </TouchableOpacity>

              {lifecycle === 'draft' ? (
                <TouchableOpacity
                  disabled={!canManage || isSubmitting}
                  onPress={() => {
                    void handlePublish();
                  }}
                  className={`rounded-2xl px-4 py-3 ${
                    canManage && !isSubmitting ? 'bg-[#16A34A]' : 'bg-[#CBD5E1]'
                  }`}
                >
                  <Text className="text-center text-sm font-bold text-white">
                    פרסם כרטיסיה
                  </Text>
                </TouchableOpacity>
              ) : null}

              {lifecycle === 'active' ? (
                <TouchableOpacity
                  disabled={!canManage || isSubmitting}
                  onPress={() => {
                    void handleArchive();
                  }}
                  className={`rounded-2xl px-4 py-3 ${
                    canManage && !isSubmitting ? 'bg-[#F59E0B]' : 'bg-[#CBD5E1]'
                  }`}
                >
                  <Text className="text-center text-sm font-bold text-white">
                    העבר לארכיון
                  </Text>
                </TouchableOpacity>
              ) : null}

              {details.canDelete ? (
                <TouchableOpacity
                  disabled={!canManage || isSubmitting}
                  onPress={handleDelete}
                  className={`rounded-2xl px-4 py-3 ${
                    canManage && !isSubmitting ? 'bg-[#DC2626]' : 'bg-[#CBD5E1]'
                  }`}
                >
                  <Text className="text-center text-sm font-bold text-white">
                    מחק כרטיסיה
                  </Text>
                </TouchableOpacity>
              ) : null}
            </View>
          </>
        )}
      </ScrollView>
    </SafeAreaView>
  );
}
