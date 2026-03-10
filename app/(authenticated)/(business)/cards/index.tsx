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
import { IS_DEV_MODE } from '@/config/appConfig';
import { useAppMode } from '@/contexts/AppModeContext';
import { api } from '@/convex/_generated/api';
import type { Id } from '@/convex/_generated/dataModel';
import { useActiveBusiness } from '@/hooks/useActiveBusiness';
import { useEntitlements } from '@/hooks/useEntitlements';
import {
  entitlementErrorToHebrewMessage,
  getEntitlementError,
} from '@/lib/entitlements/errors';
import { tw } from '@/lib/rtl';
import { openSubscriptionComparison } from '@/lib/subscription/upgradeNavigation';

const formatNumber = (value: number) =>
  new Intl.NumberFormat('he-IL', { maximumFractionDigits: 0 }).format(value);

function formatLastActivity(value: number | null) {
  if (!value) {
    return 'אין פעילות עדיין';
  }
  return new Date(value).toLocaleString('he-IL', {
    day: '2-digit',
    month: '2-digit',
    year: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  });
}

export default function BusinessCardsManagementScreen() {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { preview, map } = useLocalSearchParams<{
    preview?: string;
    map?: string;
  }>();
  const isPreviewMode = (IS_DEV_MODE && preview === 'true') || map === 'true';
  const { appMode, isLoading: isAppModeLoading } = useAppMode();

  const { activeBusinessId, activeBusiness } = useActiveBusiness();
  const canManage =
    activeBusiness?.staffRole === 'owner' ||
    activeBusiness?.staffRole === 'manager';

  const { entitlements, limitStatus } = useEntitlements(activeBusinessId);

  useEffect(() => {
    if (isPreviewMode || isAppModeLoading) {
      return;
    }
    if (appMode !== 'business') {
      router.replace('/(authenticated)/(customer)/wallet');
    }
  }, [appMode, isAppModeLoading, isPreviewMode, router]);

  const programs =
    useQuery(
      api.loyaltyPrograms.listManagementByBusiness,
      activeBusinessId ? { businessId: activeBusinessId } : 'skip'
    ) ?? [];

  const createLoyaltyProgram = useMutation(
    api.loyaltyPrograms.createLoyaltyProgram
  );

  const [title, setTitle] = useState('');
  const [rewardName, setRewardName] = useState('');
  const [maxStamps, setMaxStamps] = useState('10');
  const [stampIcon, setStampIcon] = useState('star');
  const [isCreating, setIsCreating] = useState(false);

  const activePrograms = useMemo(
    () => programs.filter((program) => program.lifecycle === 'active'),
    [programs]
  );
  const archivedPrograms = useMemo(
    () => programs.filter((program) => program.lifecycle === 'archived'),
    [programs]
  );

  const cardLimit = limitStatus('maxCards', activePrograms.length);
  const requiredPlanForCards =
    entitlements?.requiredPlanMap?.byLimitFromCurrentPlan?.[entitlements.plan]
      ?.maxCards ?? 'pro';

  const openUpgradeForCards = () => {
    openSubscriptionComparison(router, {
      featureKey: 'maxCards',
      requiredPlan: requiredPlanForCards,
      reason: 'limit_reached',
    });
  };

  const parsedMaxStamps = Number(maxStamps);
  const canCreate =
    Boolean(activeBusinessId) &&
    canManage &&
    title.trim().length > 0 &&
    rewardName.trim().length > 0 &&
    stampIcon.trim().length > 0 &&
    Number.isFinite(parsedMaxStamps) &&
    parsedMaxStamps > 0 &&
    !isCreating;

  const handleCreate = async () => {
    if (!activeBusinessId || !canCreate) {
      return;
    }
    if (cardLimit.isAtLimit) {
      openUpgradeForCards();
      return;
    }

    setIsCreating(true);
    try {
      await createLoyaltyProgram({
        businessId: activeBusinessId,
        title: title.trim(),
        rewardName: rewardName.trim(),
        maxStamps: parsedMaxStamps,
        stampIcon: stampIcon.trim(),
      });
      setTitle('');
      setRewardName('');
      setMaxStamps('10');
      setStampIcon('star');
      Alert.alert('נשמר', 'כרטיסיה חדשה נוצרה בהצלחה.');
    } catch (error) {
      const entitlementError = getEntitlementError(error);
      if (entitlementError) {
        Alert.alert(
          'שדרוג נדרש',
          entitlementErrorToHebrewMessage(entitlementError)
        );
        openSubscriptionComparison(router, {
          featureKey: entitlementError.limitKey ?? 'maxCards',
          requiredPlan: entitlementError.requiredPlan ?? requiredPlanForCards,
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
        error instanceof Error ? error.message : 'יצירת כרטיסיה נכשלה.'
      );
    } finally {
      setIsCreating(false);
    }
  };

  const totalCustomers = activePrograms.reduce(
    (sum, program) => sum + program.metrics.activeMembers,
    0
  );
  const totalRedemptions30d = activePrograms.reduce(
    (sum, program) => sum + program.metrics.redemptions30d,
    0
  );

  return (
    <SafeAreaView className="flex-1 bg-[#E9F0FF]" edges={[]}>
      <ScrollView
        className="flex-1"
        contentContainerStyle={{
          paddingHorizontal: 20,
          paddingTop: (insets.top || 0) + 12,
          paddingBottom: (insets.bottom || 0) + 30,
        }}
      >
        <BusinessScreenHeader
          title="כרטיסיות נאמנות"
          subtitle="ניהול תוכניות נאמנות לעסק בצורה פשוטה וברורה"
          titleAccessory={
            <TouchableOpacity
              onPress={() =>
                router.replace('/(authenticated)/(business)/dashboard')
              }
              className="h-10 w-10 items-center justify-center rounded-full border border-[#E5EAF2] bg-white"
            >
              <Ionicons name="arrow-forward" size={18} color="#1A2B4A" />
            </TouchableOpacity>
          }
        />

        <View className="mt-4 rounded-3xl border border-[#E3E9FF] bg-white p-5">
          <Text
            className={`text-[11px] font-semibold text-[#64748B] ${tw.textStart}`}
          >
            שימוש במסלול
          </Text>
          <Text className={`mt-2 text-sm text-[#334155] ${tw.textStart}`}>
            כרטיסיות פעילות: {activePrograms.length}/{cardLimit.limitValue}
          </Text>
          <Text className={`mt-1 text-sm text-[#334155] ${tw.textStart}`}>
            לקוחות פעילים: {formatNumber(totalCustomers)}
          </Text>
          <Text className={`mt-1 text-sm text-[#334155] ${tw.textStart}`}>
            מימושים (30 יום): {formatNumber(totalRedemptions30d)}
          </Text>

          {cardLimit.isNearLimit || cardLimit.isAtLimit ? (
            <View className="mt-3 rounded-2xl border border-[#F59E0B] bg-[#FFF7ED] p-3">
              <Text
                className={`text-xs font-bold text-[#B45309] ${tw.textStart}`}
              >
                {cardLimit.isAtLimit
                  ? 'הגעתם למגבלת הכרטיסיות במסלול הנוכחי.'
                  : 'אתם מתקרבים למגבלת הכרטיסיות במסלול הנוכחי.'}
              </Text>
              <TouchableOpacity
                onPress={openUpgradeForCards}
                className="mt-2 self-start rounded-xl bg-[#1D4ED8] px-3 py-2"
              >
                <Text className="text-xs font-bold text-white">
                  שדרוג מסלול
                </Text>
              </TouchableOpacity>
            </View>
          ) : null}
        </View>

        <View className="mt-5 rounded-3xl border border-[#E3E9FF] bg-white p-5 gap-3">
          <Text
            className={`text-[11px] font-semibold text-[#64748B] ${tw.textStart}`}
          >
            יצירת כרטיסיה חדשה
          </Text>
          <TextInput
            value={title}
            onChangeText={setTitle}
            editable={canManage}
            placeholder="שם הכרטיסיה"
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
          <TouchableOpacity
            disabled={!canCreate}
            onPress={() => {
              void handleCreate();
            }}
            className={`rounded-2xl px-4 py-3 ${
              canCreate ? 'bg-[#2F6BFF]' : 'bg-[#CBD5E1]'
            }`}
          >
            {isCreating ? (
              <ActivityIndicator color="#FFFFFF" />
            ) : (
              <Text className="text-center text-sm font-bold text-white">
                צור כרטיסיה
              </Text>
            )}
          </TouchableOpacity>
        </View>

        <View className="mt-5 rounded-3xl border border-[#E3E9FF] bg-white p-5 gap-3">
          <Text
            className={`text-[11px] font-semibold text-[#64748B] ${tw.textStart}`}
          >
            כרטיסיות פעילות ({activePrograms.length})
          </Text>
          {activeBusinessId && programs.length === 0 ? (
            <Text className={`text-sm text-[#64748B] ${tw.textStart}`}>
              עדיין לא יצרתם כרטיסיות נאמנות.
            </Text>
          ) : activePrograms.length === 0 ? (
            <Text className={`text-sm text-[#64748B] ${tw.textStart}`}>
              אין כרגע כרטיסיות פעילות.
            </Text>
          ) : (
            activePrograms.map((program) => (
              <TouchableOpacity
                key={program.loyaltyProgramId}
                onPress={() =>
                  router.push({
                    pathname: '/(authenticated)/(business)/cards/[programId]',
                    params: {
                      programId: program.loyaltyProgramId,
                      businessId: activeBusinessId as Id<'businesses'>,
                    },
                  })
                }
                className="rounded-2xl border border-[#E3E9FF] bg-[#F8FAFF] p-4"
              >
                <View className={`${tw.flexRow} items-center justify-between`}>
                  <View className="rounded-full bg-[#DBEAFE] px-3 py-1">
                    <Text className="text-[11px] font-bold text-[#1D4ED8]">
                      {program.maxStamps} ניקובים
                    </Text>
                  </View>
                  <View className="flex-1 items-end px-3">
                    <Text
                      className={`text-sm font-black text-[#1A2B4A] ${tw.textStart}`}
                    >
                      {program.title}
                    </Text>
                    <Text
                      className={`mt-1 text-xs text-[#64748B] ${tw.textStart}`}
                    >
                      הטבה: {program.rewardName}
                    </Text>
                  </View>
                </View>
                <Text className={`mt-2 text-xs text-[#64748B] ${tw.textStart}`}>
                  לקוחות פעילים: {formatNumber(program.metrics.activeMembers)} ·
                  ניקובים 7 ימים: {formatNumber(program.metrics.stamps7d)}
                </Text>
              </TouchableOpacity>
            ))
          )}
        </View>

        <View className="mt-5 rounded-3xl border border-[#E3E9FF] bg-white p-5 gap-3">
          <Text
            className={`text-[11px] font-semibold text-[#64748B] ${tw.textStart}`}
          >
            כרטיסיות בארכיון ({archivedPrograms.length})
          </Text>
          {archivedPrograms.length === 0 ? (
            <Text className={`text-sm text-[#64748B] ${tw.textStart}`}>
              אין כרטיסיות בארכיון.
            </Text>
          ) : (
            archivedPrograms.map((program) => (
              <TouchableOpacity
                key={program.loyaltyProgramId}
                onPress={() =>
                  router.push({
                    pathname: '/(authenticated)/(business)/cards/[programId]',
                    params: {
                      programId: program.loyaltyProgramId,
                      businessId: activeBusinessId as Id<'businesses'>,
                    },
                  })
                }
                className="rounded-2xl border border-[#E2E8F0] bg-[#F8FAFC] p-4"
              >
                <Text
                  className={`text-sm font-black text-[#334155] ${tw.textStart}`}
                >
                  {program.title}
                </Text>
                <Text className={`mt-1 text-xs text-[#64748B] ${tw.textStart}`}>
                  פעילות אחרונה:{' '}
                  {formatLastActivity(program.metrics.lastActivityAt)}
                </Text>
              </TouchableOpacity>
            ))
          )}
        </View>

        <View className="mt-5 rounded-3xl border border-[#D6E2F8] bg-[#EEF3FF] p-5">
          <Text className={`text-sm font-black text-[#1A2B4A] ${tw.textStart}`}>
            פעולות שימור לקוחות
          </Text>
          <Text className={`mt-1 text-xs text-[#475569] ${tw.textStart}`}>
            פעולות Push, In-app והצעות AI זמינות ממרכז הניהול במסך הראשי.
          </Text>
          <TouchableOpacity
            onPress={() =>
              router.replace('/(authenticated)/(business)/dashboard')
            }
            className="mt-3 self-start rounded-xl border border-[#2F6BFF] bg-white px-4 py-2.5"
          >
            <Text className="text-xs font-bold text-[#2F6BFF]">
              פתיחת מרכז השימור
            </Text>
          </TouchableOpacity>
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}
