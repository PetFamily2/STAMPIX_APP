import { useQuery } from 'convex/react';
import { useRouter } from 'expo-router';
import { useState } from 'react';
import {
  ActivityIndicator,
  Pressable,
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
import { UpgradeModal } from '@/components/subscription/UpgradeModal';
import { BILLING_PERIOD_LABELS } from '@/config/appConfig';
import { api } from '@/convex/_generated/api';
import { useActiveBusiness } from '@/hooks/useActiveBusiness';
import { useEntitlements } from '@/hooks/useEntitlements';
import { tw } from '@/lib/rtl';

const BUSINESS_PLAN_LABELS: Record<'starter' | 'pro' | 'unlimited', string> = {
  starter: 'Starter',
  pro: 'Pro AI',
  unlimited: 'Unlimited AI',
};

const SUBSCRIPTION_STATUS_LABELS: Record<
  'active' | 'trialing' | 'past_due' | 'canceled',
  string
> = {
  active: 'פעיל',
  trialing: 'ניסיון',
  past_due: 'תשלום נכשל',
  canceled: 'מבוטל',
};

function formatLimitValue(value: number | null | undefined) {
  if (value === null || value === undefined) {
    return '-';
  }
  if (value === -1) {
    return 'ללא הגבלה';
  }
  return String(value);
}

export default function BusinessSettingsSubscriptionScreen() {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { activeBusinessId } = useActiveBusiness();
  const {
    entitlements,
    limitStatus,
    isLoading: isEntitlementsLoading,
  } = useEntitlements(activeBusinessId);
  const programs =
    useQuery(
      api.loyaltyPrograms.listManagementByBusiness,
      activeBusinessId ? { businessId: activeBusinessId } : 'skip'
    ) ?? [];

  const activePrograms = programs.filter(
    (program) => program.lifecycle === 'active'
  );
  const cardLimit = limitStatus('maxCards', activePrograms.length);
  const customerLimit = limitStatus('maxCustomers');
  const aiLimit = limitStatus(
    'maxAiCampaignsPerMonth',
    entitlements?.usage.aiCampaignsUsedThisMonth
  );

  const [isUpgradeVisible, setIsUpgradeVisible] = useState(false);
  const [upgradePlan, setUpgradePlan] = useState<'pro' | 'unlimited'>('pro');
  const [upgradeReason, setUpgradeReason] = useState<
    'feature_locked' | 'limit_reached' | 'subscription_inactive'
  >('feature_locked');
  const [upgradeFeatureKey, setUpgradeFeatureKey] = useState<
    string | undefined
  >(undefined);

  const openPackageManager = () => {
    const initialPlan =
      entitlements?.plan === 'unlimited' ? 'unlimited' : 'pro';
    const reason =
      entitlements && !entitlements.isSubscriptionActive
        ? 'subscription_inactive'
        : 'feature_locked';

    setUpgradePlan(initialPlan);
    setUpgradeReason(reason);
    setUpgradeFeatureKey('business_subscription');
    setIsUpgradeVisible(true);
  };

  if (!activeBusinessId) {
    return (
      <SafeAreaView className="flex-1 items-center justify-center bg-[#E9F0FF] px-6">
        <Text className="text-center text-sm text-[#64748B]">
          לא נמצא עסק פעיל.
        </Text>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView className="flex-1 bg-[#E9F0FF]" edges={[]}>
      <ScrollView
        contentContainerStyle={{
          paddingHorizontal: 20,
          paddingTop: (insets.top || 0) + 12,
          paddingBottom: 30,
          gap: 12,
        }}
      >
        <BusinessScreenHeader
          title="מנוי וחבילה"
          subtitle="סטטוס מנוי, מגבלות שימוש ושדרוג"
          titleAccessory={
            <Pressable
              onPress={() => router.back()}
              style={({ pressed }) => ({
                width: 30,
                height: 30,
                borderRadius: 15,
                alignItems: 'center',
                justifyContent: 'center',
                backgroundColor: '#FFFFFF',
                borderWidth: 1,
                borderColor: '#E2E8F0',
                opacity: pressed ? 0.82 : 1,
              })}
            >
              <Text style={{ fontSize: 16, color: '#0F172A' }}>←</Text>
            </Pressable>
          }
        />

        <View className="rounded-3xl border border-[#E3E9FF] bg-white p-5">
          <Text
            className={`text-[10px] uppercase tracking-[0.3em] text-[#5B6475] ${tw.textStart}`}
          >
            סטטוס מנוי
          </Text>

          {isEntitlementsLoading ? (
            <View className="mt-4 items-center">
              <ActivityIndicator color="#2F6BFF" />
            </View>
          ) : (
            <View className="mt-4 gap-3">
              <View className={`${tw.flexRow} items-center justify-between`}>
                <Text className="text-sm font-bold text-[#1A2B4A]">
                  {entitlements
                    ? BUSINESS_PLAN_LABELS[entitlements.plan]
                    : 'Starter'}
                </Text>
                <Text className="text-xs text-[#64748B]">מסלול נוכחי</Text>
              </View>
              <View className={`${tw.flexRow} items-center justify-between`}>
                <Text className="text-sm font-bold text-[#1A2B4A]">
                  {entitlements
                    ? SUBSCRIPTION_STATUS_LABELS[
                        entitlements.subscriptionStatus
                      ]
                    : 'פעיל'}
                </Text>
                <Text className="text-xs text-[#64748B]">סטטוס מנוי</Text>
              </View>
              <View className={`${tw.flexRow} items-center justify-between`}>
                <Text className="text-sm font-bold text-[#1A2B4A]">
                  {entitlements?.billingPeriod
                    ? BILLING_PERIOD_LABELS[entitlements.billingPeriod]
                    : '-'}
                </Text>
                <Text className="text-xs text-[#64748B]">מחזור חיוב</Text>
              </View>
              <View className={`${tw.flexRow} items-center justify-between`}>
                <Text className="text-sm font-bold text-[#1A2B4A]">
                  {formatLimitValue(cardLimit.limitValue)} (
                  {activePrograms.length} בשימוש)
                </Text>
                <Text className="text-xs text-[#64748B]">כמות כרטיסים</Text>
              </View>
              <View className={`${tw.flexRow} items-center justify-between`}>
                <Text className="text-sm font-bold text-[#1A2B4A]">
                  {formatLimitValue(customerLimit.limitValue)}
                </Text>
                <Text className="text-xs text-[#64748B]">לקוחות</Text>
              </View>
              <View className={`${tw.flexRow} items-center justify-between`}>
                <Text className="text-sm font-bold text-[#1A2B4A]">
                  {formatLimitValue(aiLimit.limitValue)} (
                  {entitlements?.usage.aiCampaignsUsedThisMonth ?? 0} בשימוש)
                </Text>
                <Text className="text-xs text-[#64748B]">קמפייני AI / חודש</Text>
              </View>
            </View>
          )}
        </View>

        <TouchableOpacity
          onPress={openPackageManager}
          className="rounded-2xl bg-[#2F6BFF] px-4 py-3"
        >
          <Text className="text-center text-sm font-bold text-white">
            ניהול חבילה
          </Text>
        </TouchableOpacity>
      </ScrollView>

      <UpgradeModal
        visible={isUpgradeVisible}
        businessId={activeBusinessId}
        initialPlan={upgradePlan}
        reason={upgradeReason}
        featureKey={upgradeFeatureKey}
        onClose={() => setIsUpgradeVisible(false)}
      />
    </SafeAreaView>
  );
}
