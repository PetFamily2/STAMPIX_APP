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
import { LockedFeatureWrapper } from '@/components/subscription/LockedFeatureWrapper';
import { UpgradeModal } from '@/components/subscription/UpgradeModal';
import { IS_DEV_MODE } from '@/config/appConfig';
import { useAppMode } from '@/contexts/AppModeContext';
import { api } from '@/convex/_generated/api';
import type { Id } from '@/convex/_generated/dataModel';
import { useEntitlements } from '@/hooks/useEntitlements';
import {
  entitlementErrorToHebrewMessage,
  getEntitlementError,
} from '@/lib/entitlements/errors';
import { tw } from '@/lib/rtl';

const formatNumber = (value: number) =>
  new Intl.NumberFormat('he-IL', { maximumFractionDigits: 0 }).format(value);

export default function BusinessCardsScreen() {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { preview, map } = useLocalSearchParams<{
    preview?: string;
    map?: string;
  }>();
  const isPreviewMode = (IS_DEV_MODE && preview === 'true') || map === 'true';
  const { appMode, isLoading: isAppModeLoading } = useAppMode();

  const businesses = useQuery(api.scanner.myBusinesses) ?? [];
  const [selectedBusinessId, setSelectedBusinessId] =
    useState<Id<'businesses'> | null>(null);
  const selectedBusiness = useMemo(
    () => businesses.find((business) => business.businessId === selectedBusinessId),
    [businesses, selectedBusinessId]
  );

  const programs = useQuery(
    api.loyaltyPrograms.listByBusiness,
    selectedBusinessId ? { businessId: selectedBusinessId } : { businessId: undefined }
  );
  const createLoyaltyProgram = useMutation(api.loyaltyPrograms.createLoyaltyProgram);
  const { entitlements, limitStatus } = useEntitlements(selectedBusinessId);
  const cardLimit = limitStatus('maxCards', programs?.length ?? 0);
  const requiredPlanForCards =
    entitlements?.requiredPlanMap.byLimitFromCurrentPlan[entitlements.plan]
      .maxCards ?? 'pro';
  const isOwner = selectedBusiness?.staffRole === 'owner';

  const [title, setTitle] = useState('');
  const [rewardName, setRewardName] = useState('');
  const [maxStamps, setMaxStamps] = useState('10');
  const [isSubmitting, setIsSubmitting] = useState(false);

  const [isUpgradeVisible, setIsUpgradeVisible] = useState(false);
  const [upgradePlan, setUpgradePlan] = useState<'pro' | 'unlimited'>('pro');
  const [upgradeReason, setUpgradeReason] = useState<
    'feature_locked' | 'limit_reached' | 'subscription_inactive'
  >('limit_reached');
  const [upgradeFeatureKey, setUpgradeFeatureKey] = useState<string | undefined>(
    undefined
  );

  useEffect(() => {
    setSelectedBusinessId((current) => {
      if (!businesses.length) {
        return null;
      }
      if (current && businesses.some((business) => business.businessId === current)) {
        return current;
      }
      return businesses[0].businessId;
    });
  }, [businesses]);

  useEffect(() => {
    if (isPreviewMode || isAppModeLoading) {
      return;
    }
    if (appMode !== 'business') {
      router.replace('/(authenticated)/(customer)/wallet');
    }
  }, [appMode, isAppModeLoading, isPreviewMode, router]);

  const parsedMaxStamps = Number(maxStamps);
  const canCreate =
    Boolean(title.trim() && rewardName.trim()) &&
    Number.isFinite(parsedMaxStamps) &&
    parsedMaxStamps > 0 &&
    !isSubmitting;

  const openUpgradeForLimit = () => {
    const requiredPlan = requiredPlanForCards;
    setUpgradePlan(requiredPlan === 'unlimited' ? 'unlimited' : 'pro');
    setUpgradeReason('limit_reached');
    setUpgradeFeatureKey('maxCards');
    setIsUpgradeVisible(true);
  };

  const handleCreateProgram = async () => {
    if (!selectedBusinessId || !canCreate) {
      return;
    }

    if (!isOwner) {
      Alert.alert('הרשאה חסרה', 'רק בעל העסק יכול ליצור כרטיס נאמנות חדש.');
      return;
    }

    if (cardLimit.isAtLimit) {
      openUpgradeForLimit();
      return;
    }

    setIsSubmitting(true);
    try {
      await createLoyaltyProgram({
        businessId: selectedBusinessId,
        title: title.trim(),
        rewardName: rewardName.trim(),
        maxStamps: parsedMaxStamps,
        stampIcon: 'star',
      });

      setTitle('');
      setRewardName('');
      setMaxStamps('10');
      Alert.alert('נשמר', 'כרטיס הנאמנות נוצר בהצלחה.');
    } catch (error) {
      const entitlementError = getEntitlementError(error);
      if (entitlementError) {
        Alert.alert('שדרוג נדרש', entitlementErrorToHebrewMessage(entitlementError));
        setUpgradePlan(
          entitlementError.requiredPlan === 'unlimited' ? 'unlimited' : 'pro'
        );
        setUpgradeReason(
          entitlementError.code === 'SUBSCRIPTION_INACTIVE'
            ? 'subscription_inactive'
            : entitlementError.code === 'PLAN_LIMIT_REACHED'
              ? 'limit_reached'
              : 'feature_locked'
        );
        setUpgradeFeatureKey(entitlementError.limitKey ?? entitlementError.featureKey);
        setIsUpgradeVisible(true);
      } else {
        Alert.alert('שגיאה', 'לא הצלחנו ליצור כרטיס חדש. נסו שוב.');
      }
    } finally {
      setIsSubmitting(false);
    }
  };

  const createCardSection = (
    <View className="rounded-3xl border border-[#E3E9FF] bg-white p-5 gap-3">
      <Text className={`text-[10px] uppercase tracking-[0.4em] text-[#5B6475] ${tw.textStart}`}>
        יצירת כרטיס חדש
      </Text>
      <TextInput
        value={title}
        onChangeText={setTitle}
        placeholder="שם הכרטיס"
        placeholderTextColor="#94A3B8"
        className="rounded-2xl border border-[#E3E9FF] bg-[#F8FAFF] px-4 py-3 text-right text-sm font-semibold text-[#0F172A]"
      />
      <TextInput
        value={rewardName}
        onChangeText={setRewardName}
        placeholder="פרס ללקוח"
        placeholderTextColor="#94A3B8"
        className="rounded-2xl border border-[#E3E9FF] bg-[#F8FAFF] px-4 py-3 text-right text-sm font-semibold text-[#0F172A]"
      />
      <TextInput
        value={maxStamps}
        onChangeText={setMaxStamps}
        keyboardType="number-pad"
        placeholder="מספר ניקובים"
        placeholderTextColor="#94A3B8"
        className="rounded-2xl border border-[#E3E9FF] bg-[#F8FAFF] px-4 py-3 text-right text-sm font-semibold text-[#0F172A]"
      />
      <TouchableOpacity
        disabled={!canCreate || !isOwner || isSubmitting}
        onPress={() => {
          void handleCreateProgram();
        }}
        className={`rounded-2xl px-4 py-3 ${
          canCreate && isOwner && !isSubmitting
            ? 'bg-[#2F6BFF]'
            : 'bg-[#CBD5E1]'
        }`}
      >
        {isSubmitting ? (
          <ActivityIndicator color="#FFFFFF" />
        ) : (
          <Text className="text-center text-sm font-bold text-white">יצירת כרטיס</Text>
        )}
      </TouchableOpacity>
      {!isOwner ? (
        <Text className={`text-xs text-[#7B86A0] ${tw.textStart}`}>
          רק בעל העסק יכול להוסיף כרטיסי נאמנות חדשים.
        </Text>
      ) : null}
    </View>
  );

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
          title="ניהול כרטיסים"
          subtitle="ניהול כרטיסי נאמנות ומגבלות המסלול"
          titleAccessory={
            <TouchableOpacity
              onPress={() => router.replace('/(authenticated)/(business)/dashboard')}
              className="h-10 w-10 items-center justify-center rounded-full bg-white"
            >
              <Text className="text-lg text-[#1A2B4A]">←</Text>
            </TouchableOpacity>
          }
        />

        <View className="mt-4 rounded-3xl border border-[#E3E9FF] bg-white p-5 gap-3">
          <Text className={`text-[10px] uppercase tracking-[0.4em] text-[#5B6475] ${tw.textStart}`}>
            עסק נבחר
          </Text>
          <View className={`${tw.flexRow} flex-wrap gap-2`}>
            {businesses.map((business) => {
              const isActive = business.businessId === selectedBusinessId;
              return (
                <TouchableOpacity
                  key={business.businessId}
                  onPress={() => setSelectedBusinessId(business.businessId)}
                  className={`rounded-2xl border px-4 py-2 ${
                    isActive
                      ? 'border-[#A9C7FF] bg-[#E7F0FF]'
                      : 'border-[#E3E9FF] bg-[#F6F8FC]'
                  }`}
                >
                  <Text className="text-right text-sm font-semibold text-[#1A2B4A]">
                    {business.name}
                  </Text>
                  <Text className="text-right text-[11px] text-[#7B86A0]">
                    {business.externalId}
                  </Text>
                </TouchableOpacity>
              );
            })}
          </View>
          <Text className={`text-xs text-[#5B6475] ${tw.textStart}`}>
            כרטיסים קיימים: {formatNumber(programs?.length ?? 0)} /{' '}
            {cardLimit.isUnlimited ? 'ללא הגבלה' : formatNumber(cardLimit.limitValue ?? 0)}
          </Text>
        </View>

        <View className="mt-5">
          <LockedFeatureWrapper
            isLocked={cardLimit.isAtLimit}
            requiredPlan={requiredPlanForCards}
            onUpgradeClick={openUpgradeForLimit}
            title="הגעתם למכסת הכרטיסים"
            subtitle="שדרוג למסלול Pro או Unlimited יאפשר ליצור כרטיסים נוספים."
            benefits={[
              'עד 5 כרטיסים במסלול Pro',
              'ללא הגבלת כרטיסים במסלול Unlimited',
              'גישה לכלי AI מתקדמים',
            ]}
          >
            {createCardSection}
          </LockedFeatureWrapper>
        </View>

        <View className="mt-5 rounded-3xl border border-[#E3E9FF] bg-white p-5 gap-3">
          <Text className={`text-[10px] uppercase tracking-[0.4em] text-[#5B6475] ${tw.textStart}`}>
            כרטיסים פעילים
          </Text>
          {programs === undefined ? (
            <ActivityIndicator color="#2F6BFF" />
          ) : programs.length === 0 ? (
            <Text className={`text-sm text-[#7B86A0] ${tw.textStart}`}>
              עדיין לא נוצרו כרטיסים לעסק זה.
            </Text>
          ) : (
            programs.map((program) => (
              <View
                key={program.loyaltyProgramId}
                className="rounded-2xl border border-[#E3E9FF] bg-[#F8FAFF] px-4 py-3"
              >
                <Text className={`text-sm font-bold text-[#1A2B4A] ${tw.textStart}`}>
                  {program.title}
                </Text>
                <Text className={`mt-1 text-xs text-[#64748B] ${tw.textStart}`}>
                  פרס: {program.rewardName}
                </Text>
                <Text className={`mt-0.5 text-xs text-[#64748B] ${tw.textStart}`}>
                  ניקובים למימוש: {formatNumber(program.maxStamps)}
                </Text>
              </View>
            ))
          )}
        </View>
      </ScrollView>

      <UpgradeModal
        visible={isUpgradeVisible}
        businessId={selectedBusinessId}
        initialPlan={upgradePlan}
        reason={upgradeReason}
        featureKey={upgradeFeatureKey}
        onClose={() => setIsUpgradeVisible(false)}
      />
    </SafeAreaView>
  );
}
