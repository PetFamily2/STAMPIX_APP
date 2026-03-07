import { useMutation, useQuery } from 'convex/react';
import { LinearGradient } from 'expo-linear-gradient';
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
import { CARD_THEMES, resolveCardTheme } from '@/constants/cardThemes';
import { api } from '@/convex/_generated/api';
import type { Id } from '@/convex/_generated/dataModel';
import { useActiveBusiness } from '@/hooks/useActiveBusiness';
import { tw } from '@/lib/rtl';

const formatNumber = (value: number) =>
  new Intl.NumberFormat('he-IL', { maximumFractionDigits: 0 }).format(value);

function StampPreview({ maxStamps }: { maxStamps: number }) {
  const dots = Math.min(12, Math.max(3, maxStamps));
  const filled = Math.min(3, dots);
  return (
    <View className={`${tw.flexRow} mt-3 flex-wrap gap-2`}>
      {Array.from({ length: dots }, (_, index) => index + 1).map((id) => (
        <View
          key={id}
          className={`h-8 w-8 rounded-full border ${
            id <= filled
              ? 'border-white bg-white'
              : 'border-white/50 bg-white/10'
          }`}
        />
      ))}
      {maxStamps > dots ? (
        <Text className="self-center text-xs font-bold text-white">
          +{maxStamps - dots}
        </Text>
      ) : null}
    </View>
  );
}

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
      businesses.some((business) => business.businessId === businessIdFromParams)
    ) {
      return businessIdFromParams;
    }
    return activeBusinessId ?? null;
  }, [activeBusinessId, businessIdFromParams, businesses]);

  const selectedBusiness = useMemo(
    () =>
      businesses.find((business) => business.businessId === selectedBusinessId) ??
      (activeBusinessId === selectedBusinessId ? activeBusiness : null),
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
  );

  const updateProgram = useMutation(
    api.loyaltyPrograms.updateProgramForManagement
  );
  const archiveProgram = useMutation(api.loyaltyPrograms.archiveProgram);
  const unarchiveProgram = useMutation(api.loyaltyPrograms.unarchiveProgram);
  const createCampaignDraft = useMutation(api.campaigns.createCampaignDraft);

  const [title, setTitle] = useState('');
  const [rewardName, setRewardName] = useState('');
  const [maxStamps, setMaxStamps] = useState('10');
  const [stampIcon, setStampIcon] = useState('star');
  const [cardThemeId, setCardThemeId] = useState(CARD_THEMES[0].id);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isTriggeringCampaign, setIsTriggeringCampaign] = useState(false);

  useEffect(() => {
    if (!details) {
      return;
    }
    setTitle(details.title);
    setRewardName(details.rewardName);
    setMaxStamps(String(details.maxStamps));
    setStampIcon(details.stampIcon);
    setCardThemeId(details.cardThemeId);
  }, [details]);

  if (!programId || !selectedBusinessId) {
    return (
      <SafeAreaView className="flex-1 items-center justify-center bg-[#E9F0FF]">
        <Text className="text-sm text-[#64748B]">נתוני כרטיסיה חסרים.</Text>
      </SafeAreaView>
    );
  }

  const parsedMaxStamps = Number(maxStamps);
  const canSave =
    canManage &&
    title.trim().length > 0 &&
    rewardName.trim().length > 0 &&
    stampIcon.trim().length > 0 &&
    Number.isFinite(parsedMaxStamps) &&
    parsedMaxStamps > 0 &&
    !isSubmitting;

  const selectedTheme = resolveCardTheme(cardThemeId);
  const lifecycle = details?.lifecycle ?? 'active';

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
        rewardName: rewardName.trim(),
        maxStamps: parsedMaxStamps,
        stampIcon: stampIcon.trim(),
        cardThemeId,
      });
      Alert.alert('נשמר', 'שינויי הכרטיסיה נשמרו בהצלחה.');
    } catch (error) {
      Alert.alert(
        'שגיאה',
        error instanceof Error ? error.message : 'שמירה נכשלה.'
      );
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleArchiveToggle = async () => {
    if (!canManage) {
      return;
    }
    setIsSubmitting(true);
    try {
      if (lifecycle === 'active') {
        await archiveProgram({ businessId: selectedBusinessId, programId });
        Alert.alert('הועבר לארכיון', 'הכרטיסיה הועברה לרשימת ישנות.');
      } else {
        await unarchiveProgram({ businessId: selectedBusinessId, programId });
        Alert.alert('הוחזר לפעילות', 'הכרטיסיה חזרה לרשימת פעילות.');
      }
    } catch (error) {
      Alert.alert(
        'שגיאה',
        error instanceof Error ? error.message : 'עדכון סטטוס נכשל.'
      );
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleCreateProgramCampaign = async () => {
    if (!canManage || isTriggeringCampaign) {
      return;
    }
    setIsTriggeringCampaign(true);
    try {
      await createCampaignDraft({
        businessId: selectedBusinessId,
        type: 'promo',
        programId,
      });
      Alert.alert('נוצר', 'טיוטת קמפיין Promo נוצרה עבור כרטיסיה זו.');
      router.replace('/(authenticated)/(business)/cards?tab=campaigns');
    } catch (error) {
      Alert.alert(
        'שגיאה',
        error instanceof Error ? error.message : 'יצירת קמפיין נכשלה.'
      );
    } finally {
      setIsTriggeringCampaign(false);
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
          title="פרטי כרטיסיה"
          subtitle="עריכה, עיצוב וסטטוס פעילות"
          titleAccessory={
            <TouchableOpacity
              onPress={() => router.back()}
              className="h-10 w-10 items-center justify-center rounded-full bg-white"
            >
              <Text className="text-lg text-[#1A2B4A]">←</Text>
            </TouchableOpacity>
          }
        />

        {details === undefined ? (
          <View className="mt-6 items-center justify-center">
            <ActivityIndicator color="#2F6BFF" />
          </View>
        ) : (
          <>
            <LinearGradient
              colors={selectedTheme.gradient}
              start={{ x: 0, y: 0 }}
              end={{ x: 1, y: 1 }}
              className="mt-5 rounded-[28px] p-5"
            >
              <View
                style={{ backgroundColor: selectedTheme.glow }}
                className="absolute -left-8 -top-8 h-24 w-24 rounded-full"
              />
              <Text
                className={`text-[10px] uppercase tracking-[0.3em] ${tw.textStart}`}
                style={{ color: selectedTheme.subtitleColor }}
              >
                תצוגה מקדימה
              </Text>
              <Text
                className={`mt-2 text-xl font-black ${tw.textStart}`}
                style={{ color: selectedTheme.titleColor }}
              >
                {title || details.title}
              </Text>
              <Text
                className={`mt-1 text-xs ${tw.textStart}`}
                style={{ color: selectedTheme.subtitleColor }}
              >
                הטבה: {rewardName || details.rewardName} ·{' '}
                {parsedMaxStamps || details.maxStamps} ניקובים
              </Text>
              <StampPreview maxStamps={parsedMaxStamps || details.maxStamps} />
            </LinearGradient>

            <View className="mt-5 rounded-3xl border border-[#E3E9FF] bg-white p-5 gap-3">
              <Text
                className={`text-[10px] uppercase tracking-[0.3em] text-[#5B6475] ${tw.textStart}`}
              >
                נתוני כרטיסיה
              </Text>
              <TextInput
                value={title}
                onChangeText={setTitle}
                editable={canManage}
                placeholder="שם כרטיסיה"
                placeholderTextColor="#94A3B8"
                className="rounded-2xl border border-[#E3E9FF] bg-[#F8FAFF] px-4 py-3 text-right text-sm font-semibold text-[#0F172A]"
              />
              <TextInput
                value={rewardName}
                onChangeText={setRewardName}
                editable={canManage}
                placeholder="הטבה"
                placeholderTextColor="#94A3B8"
                className="rounded-2xl border border-[#E3E9FF] bg-[#F8FAFF] px-4 py-3 text-right text-sm font-semibold text-[#0F172A]"
              />
              <View className={`${tw.flexRow} gap-2`}>
                <TextInput
                  value={maxStamps}
                  onChangeText={setMaxStamps}
                  editable={canManage}
                  keyboardType="number-pad"
                  placeholder="ניקובים"
                  placeholderTextColor="#94A3B8"
                  className="flex-1 rounded-2xl border border-[#E3E9FF] bg-[#F8FAFF] px-4 py-3 text-right text-sm font-semibold text-[#0F172A]"
                />
                <TextInput
                  value={stampIcon}
                  onChangeText={setStampIcon}
                  editable={canManage}
                  placeholder="אייקון"
                  placeholderTextColor="#94A3B8"
                  className="flex-1 rounded-2xl border border-[#E3E9FF] bg-[#F8FAFF] px-4 py-3 text-right text-sm font-semibold text-[#0F172A]"
                />
              </View>
              <View className={`${tw.flexRow} flex-wrap gap-2`}>
                {CARD_THEMES.map((theme) => {
                  const selected = cardThemeId === theme.id;
                  return (
                    <TouchableOpacity
                      key={theme.id}
                      disabled={!canManage}
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

              <TouchableOpacity
                disabled={!canSave}
                onPress={() => {
                  void handleSave();
                }}
                className={`rounded-2xl px-4 py-3 ${canSave ? 'bg-[#2F6BFF]' : 'bg-[#CBD5E1]'}`}
              >
                {isSubmitting ? (
                  <ActivityIndicator color="#FFFFFF" />
                ) : (
                  <Text className="text-center text-sm font-bold text-white">
                    שמור שינויים
                  </Text>
                )}
              </TouchableOpacity>
            </View>

            <View className="mt-5 rounded-3xl border border-[#E3E9FF] bg-white p-5 gap-2">
              <Text
                className={`text-[10px] uppercase tracking-[0.3em] text-[#5B6475] ${tw.textStart}`}
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
                פעילות אחרונה:{' '}
                {details.metrics.lastActivityAt
                  ? new Date(details.metrics.lastActivityAt).toLocaleString(
                      'he-IL'
                    )
                  : 'אין עדיין פעילות'}
              </Text>
            </View>

            <View className="mt-5 rounded-3xl border border-[#E3E9FF] bg-white p-5 gap-3">
              <Text
                className={`text-[10px] uppercase tracking-[0.3em] text-[#5B6475] ${tw.textStart}`}
              >
                פעולות מהירות
              </Text>
              <TouchableOpacity
                disabled={!canManage || isTriggeringCampaign}
                onPress={() => {
                  void handleCreateProgramCampaign();
                }}
                className={`rounded-2xl px-4 py-3 ${
                  canManage && !isTriggeringCampaign
                    ? 'bg-[#1D4ED8]'
                    : 'bg-[#CBD5E1]'
                }`}
              >
                {isTriggeringCampaign ? (
                  <ActivityIndicator color="#FFFFFF" />
                ) : (
                  <Text className="text-center text-sm font-bold text-white">
                    צור קמפיין Promo
                  </Text>
                )}
              </TouchableOpacity>

              <TouchableOpacity
                disabled={!canManage || isSubmitting}
                onPress={() => {
                  void handleArchiveToggle();
                }}
                className={`rounded-2xl px-4 py-3 ${
                  canManage
                    ? lifecycle === 'active'
                      ? 'bg-[#F59E0B]'
                      : 'bg-[#16A34A]'
                    : 'bg-[#CBD5E1]'
                }`}
              >
                <Text className="text-center text-sm font-bold text-white">
                  {lifecycle === 'active'
                    ? 'העבר לישנה (ארכיון)'
                    : 'החזר לפעילות'}
                </Text>
              </TouchableOpacity>

              <Text className={`text-xs text-[#64748B] ${tw.textStart}`}>
                סטטוס נוכחי: {lifecycle === 'active' ? 'פעילה' : 'ישנה'}
              </Text>
            </View>
          </>
        )}
      </ScrollView>
    </SafeAreaView>
  );
}
