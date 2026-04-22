import { useBottomTabBarHeight } from '@react-navigation/bottom-tabs';
import { useQuery } from 'convex/react';
import { useRouter } from 'expo-router';
import { useMemo, useState } from 'react';
import {
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';

import { BackButton } from '@/components/BackButton';
import BusinessScreenHeader from '@/components/BusinessScreenHeader';
import StickyScrollHeader from '@/components/StickyScrollHeader';
import { api } from '@/convex/_generated/api';

type ReferralTab = 'pending' | 'completed' | 'rewards';

function formatDateTime(value: number | null) {
  if (!value) {
    return '—';
  }
  return new Date(value).toLocaleString('he-IL', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

function mapReferralState(referral: any): string {
  if (referral.status === 'pending') {
    return 'REFERRAL_PENDING';
  }
  if (referral.status === 'qualified') {
    return 'REFERRAL_COMPLETED';
  }
  if (referral.status === 'completed') {
    return referral.rewardGrantStatus === 'granted'
      ? 'REFERRAL_REWARD_GRANTED'
      : 'REFERRAL_COMPLETED';
  }
  if (referral.status === 'invalid') {
    return 'REFERRAL_EXPIRED';
  }
  return 'REFERRAL_COMPLETED';
}

function mapRewardState(reward: any): string {
  if (reward.status === 'granted') {
    return 'REFERRAL_REWARD_GRANTED';
  }
  if (reward.status === 'redeemed') {
    return 'REFERRAL_REWARD_REDEEMED';
  }
  if (reward.status === 'expired') {
    return 'REFERRAL_EXPIRED';
  }
  return 'REFERRAL_REWARD_GRANTED';
}

export default function CustomerReferralsScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const tabBarHeight = useBottomTabBarHeight();
  const [activeTab, setActiveTab] = useState<ReferralTab>('pending');

  const dashboard = useQuery(api.referrals.getMyReferralDashboard);
  const referrals = useQuery(api.referrals.listMyCustomerReferrals, {
    limit: 120,
  });
  const rewards = useQuery(api.referrals.listMyReferralRewards, {
    limit: 120,
  });

  const pendingReferrals = useMemo(
    () => (referrals ?? []).filter((row) => row.status === 'pending'),
    [referrals]
  );
  const completedReferrals = useMemo(
    () => (referrals ?? []).filter((row) => row.status !== 'pending'),
    [referrals]
  );

  return (
    <SafeAreaView style={styles.safeArea} edges={[]}>
      <ScrollView
        stickyHeaderIndices={[0]}
        contentContainerStyle={[
          styles.scrollContent,
          { paddingBottom: tabBarHeight + (insets.bottom || 0) + 24 },
        ]}
      >
        <StickyScrollHeader
          topPadding={(insets.top || 0) + 12}
          backgroundColor="#E9F0FF"
        >
          <View style={styles.headerRow}>
            <BusinessScreenHeader
              title="ההזמנות שלי"
              subtitle="סטטוס הזמנות, זכאויות ומימושים"
              titleAccessory={
                <BackButton
                  onPress={() => router.push('/(authenticated)/(customer)/wallet')}
                />
              }
            />
          </View>
        </StickyScrollHeader>

        <View style={styles.summaryRow}>
          <View style={styles.summaryCard}>
            <Text style={styles.summaryLabel}>ממתינות</Text>
            <Text style={styles.summaryValue}>{dashboard?.pending ?? 0}</Text>
          </View>
          <View style={styles.summaryCard}>
            <Text style={styles.summaryLabel}>הושלמו</Text>
            <Text style={styles.summaryValue}>{dashboard?.completed ?? 0}</Text>
          </View>
          <View style={styles.summaryCard}>
            <Text style={styles.summaryLabel}>תגמולים</Text>
            <Text style={styles.summaryValue}>{dashboard?.earned ?? 0}</Text>
          </View>
        </View>

        <View style={styles.tabRow}>
          <Pressable
            onPress={() => setActiveTab('pending')}
            style={[
              styles.tabButton,
              activeTab === 'pending' ? styles.tabButtonActive : null,
            ]}
          >
            <Text
              style={[
                styles.tabLabel,
                activeTab === 'pending' ? styles.tabLabelActive : null,
              ]}
            >
              ממתינות
            </Text>
          </Pressable>
          <Pressable
            onPress={() => setActiveTab('completed')}
            style={[
              styles.tabButton,
              activeTab === 'completed' ? styles.tabButtonActive : null,
            ]}
          >
            <Text
              style={[
                styles.tabLabel,
                activeTab === 'completed' ? styles.tabLabelActive : null,
              ]}
            >
              היסטוריית הזמנות
            </Text>
          </Pressable>
          <Pressable
            onPress={() => setActiveTab('rewards')}
            style={[
              styles.tabButton,
              activeTab === 'rewards' ? styles.tabButtonActive : null,
            ]}
          >
            <Text
              style={[
                styles.tabLabel,
                activeTab === 'rewards' ? styles.tabLabelActive : null,
              ]}
            >
              תגמולים
            </Text>
          </Pressable>
        </View>

        {activeTab === 'pending' ? (
          <View style={styles.section}>
            {pendingReferrals.length === 0 ? (
              <Text style={styles.emptyText}>אין הזמנות ממתינות כרגע.</Text>
            ) : (
              pendingReferrals.map((item) => (
                <View key={String(item.referralId)} style={styles.itemCard}>
                  <Text style={styles.itemTitle}>{item.businessName}</Text>
                  <Text style={styles.itemState}>{mapReferralState(item)}</Text>
                  <Text style={styles.itemHint}>
                    חבר שהזמנת עדיין לא ביצע ניקוב ראשון. ברגע שזה יקרה תקבלו מתנה.
                  </Text>
                  <Text style={styles.itemMeta}>
                    נוצר: {formatDateTime(item.createdAt)}
                  </Text>
                </View>
              ))
            )}
          </View>
        ) : null}

        {activeTab === 'completed' ? (
          <View style={styles.section}>
            {completedReferrals.length === 0 ? (
              <Text style={styles.emptyText}>עדיין אין היסטוריית הזמנות.</Text>
            ) : (
              completedReferrals.map((item) => (
                <View key={String(item.referralId)} style={styles.itemCard}>
                  <Text style={styles.itemTitle}>{item.businessName}</Text>
                  <Text style={styles.itemState}>{mapReferralState(item)}</Text>
                  <Text style={styles.itemMeta}>
                    הושלם: {formatDateTime(item.completedAt)}
                  </Text>
                </View>
              ))
            )}
          </View>
        ) : null}

        {activeTab === 'rewards' ? (
          <View style={styles.section}>
            {(rewards ?? []).length === 0 ? (
              <Text style={styles.emptyText}>אין תגמולי הזמנה כרגע.</Text>
            ) : (
              (rewards ?? []).map((item) => (
                <View key={String(item.rewardId)} style={styles.itemCard}>
                  <Text style={styles.itemTitle}>{item.businessName}</Text>
                  <Text style={styles.itemState}>{mapRewardState(item)}</Text>
                  <Text style={styles.itemHint}>
                    {item.actualRewardType === 'STAMP'
                      ? 'התקבל ניקוב מהזמנת חבר'
                      : item.benefitTitle ?? 'הטבת הזמנה'}
                  </Text>
                  <Text style={styles.itemMeta}>
                    עודכן: {formatDateTime(item.redeemedAt ?? item.createdAt)}
                  </Text>
                </View>
              ))
            )}
          </View>
        ) : null}
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
    backgroundColor: '#E9F0FF',
  },
  scrollContent: {
    paddingHorizontal: 20,
    gap: 10,
  },
  headerRow: {
    alignItems: 'stretch',
  },
  summaryRow: {
    marginTop: 2,
    flexDirection: 'row-reverse',
    gap: 8,
  },
  summaryCard: {
    flex: 1,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: '#D9E6FF',
    backgroundColor: '#FFFFFF',
    paddingHorizontal: 12,
    paddingVertical: 10,
    alignItems: 'flex-end',
  },
  summaryLabel: {
    fontSize: 12,
    fontWeight: '700',
    color: '#64748B',
    textAlign: 'right',
  },
  summaryValue: {
    marginTop: 4,
    fontSize: 22,
    fontWeight: '900',
    color: '#1E293B',
    textAlign: 'right',
  },
  tabRow: {
    marginTop: 6,
    flexDirection: 'row-reverse',
    gap: 8,
  },
  tabButton: {
    flex: 1,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#D5E3FF',
    backgroundColor: '#F4F8FF',
    paddingVertical: 10,
    alignItems: 'center',
    justifyContent: 'center',
  },
  tabButtonActive: {
    borderColor: '#7DA6FF',
    backgroundColor: '#E7F0FF',
  },
  tabLabel: {
    fontSize: 12,
    fontWeight: '800',
    color: '#3F4A5C',
    textAlign: 'center',
  },
  tabLabelActive: {
    color: '#1E3A8A',
  },
  section: {
    gap: 8,
  },
  itemCard: {
    borderRadius: 14,
    borderWidth: 1,
    borderColor: '#D9E6FF',
    backgroundColor: '#FFFFFF',
    paddingHorizontal: 12,
    paddingVertical: 12,
    gap: 4,
    alignItems: 'flex-end',
  },
  itemTitle: {
    fontSize: 15,
    fontWeight: '900',
    color: '#0F172A',
    textAlign: 'right',
  },
  itemState: {
    fontSize: 12,
    fontWeight: '800',
    color: '#1D4ED8',
    textAlign: 'right',
  },
  itemHint: {
    fontSize: 12,
    fontWeight: '600',
    color: '#475569',
    textAlign: 'right',
    lineHeight: 18,
  },
  itemMeta: {
    fontSize: 11,
    fontWeight: '600',
    color: '#64748B',
    textAlign: 'right',
  },
  emptyText: {
    borderRadius: 14,
    borderWidth: 1,
    borderColor: '#D9E6FF',
    backgroundColor: '#FFFFFF',
    paddingHorizontal: 12,
    paddingVertical: 14,
    textAlign: 'right',
    color: '#64748B',
    fontWeight: '700',
    fontSize: 13,
  },
});
