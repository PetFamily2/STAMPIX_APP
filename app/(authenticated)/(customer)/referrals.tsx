import { useBottomTabBarHeight } from '@react-navigation/bottom-tabs';
import { useQuery } from 'convex/react';
import { useRouter } from 'expo-router';
import { useMemo, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import {
  SafeAreaView,
  useSafeAreaInsets,
} from 'react-native-safe-area-context';

import { BackButton } from '@/components/BackButton';
import BusinessScreenHeader from '@/components/BusinessScreenHeader';
import StickyScrollHeader from '@/components/StickyScrollHeader';
import { api } from '@/convex/_generated/api';
import { alignItems, flexDirection } from '@/lib/rtl';

type ReferralTab = 'pending' | 'completed' | 'rewards';

const EMPTY_TITLE = 'עדיין אין הזמנות';
const EMPTY_BODY =
  'אחרי שתצטרפו לעסק עם כרטיסייה פעילה, תוכלו להזמין חברים ולעקוב כאן אחרי ההטבות.';
const EMPTY_ACTION = 'לגלות עסקים';

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
    return 'ממתין לניקוב ראשון';
  }
  if (referral.status === 'completed') {
    return 'הושלם';
  }
  if (referral.status === 'qualified') {
    return 'הושלם';
  }
  if (referral.status === 'skipped') {
    return 'לא הושלם';
  }
  if (referral.status === 'invalid') {
    return 'לא תקף';
  }
  if (referral.status === 'expired') {
    return 'פג תוקף';
  }
  return 'סטטוס לא ידוע';
}

function mapReferralHint(referral: any): string {
  if (referral.status === 'pending') {
    return 'מחכים לניקוב הראשון של החבר';
  }
  if (referral.status === 'completed' || referral.status === 'qualified') {
    return 'ההזמנה הושלמה';
  }
  if (referral.status === 'skipped') {
    return 'ההזמנה לא הושלמה';
  }
  if (referral.status === 'invalid') {
    return 'ההזמנה אינה תקפה';
  }
  if (referral.status === 'expired') {
    return 'ההזמנה פגה';
  }
  return 'לא הצלחנו לזהות את מצב ההזמנה';
}

function mapRewardState(reward: any): string {
  if (reward.status === 'granted') {
    return 'התגמול התקבל';
  }
  if (reward.status === 'redeemed') {
    return 'מומש';
  }
  if (reward.status === 'expired') {
    return 'פג תוקף';
  }
  if (reward.status === 'revoked') {
    return 'בוטל';
  }
  return 'סטטוס לא ידוע';
}

function mapRewardHint(reward: any): string {
  if (reward.status === 'granted') {
    return 'ההטבה נוספה לחשבון';
  }
  if (reward.status === 'redeemed') {
    return 'ההטבה מומשה';
  }
  if (reward.status === 'expired') {
    return 'תוקף ההטבה פג';
  }
  if (reward.status === 'revoked') {
    return 'ההטבה בוטלה';
  }
  return 'לא הצלחנו לזהות את מצב ההטבה';
}

function EmptyReferralState({ onPress }: { onPress: () => void }) {
  return (
    <View style={styles.emptyCard}>
      <Text style={styles.emptyTitle}>{EMPTY_TITLE}</Text>
      <Text style={styles.emptyBody}>{EMPTY_BODY}</Text>
      <Pressable
        onPress={onPress}
        style={({ pressed }) => [
          styles.emptyActionButton,
          pressed ? styles.emptyActionButtonPressed : null,
        ]}
        accessibilityRole="button"
        accessibilityLabel={EMPTY_ACTION}
      >
        <Text style={styles.emptyActionButtonText}>{EMPTY_ACTION}</Text>
      </Pressable>
    </View>
  );
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
                  onPress={() =>
                    router.push('/(authenticated)/(customer)/wallet')
                  }
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
              <EmptyReferralState
                onPress={() =>
                  router.push('/(authenticated)/(customer)/discovery')
                }
              />
            ) : (
              pendingReferrals.map((item) => (
                <View key={String(item.referralId)} style={styles.itemCard}>
                  <Text style={styles.itemTitle}>{item.businessName}</Text>
                  <Text style={styles.itemState}>{mapReferralState(item)}</Text>
                  <Text style={styles.itemHint}>{mapReferralHint(item)}</Text>
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
              <EmptyReferralState
                onPress={() =>
                  router.push('/(authenticated)/(customer)/discovery')
                }
              />
            ) : (
              completedReferrals.map((item) => (
                <View key={String(item.referralId)} style={styles.itemCard}>
                  <Text style={styles.itemTitle}>{item.businessName}</Text>
                  <Text style={styles.itemState}>{mapReferralState(item)}</Text>
                  <Text style={styles.itemHint}>{mapReferralHint(item)}</Text>
                  <Text style={styles.itemMeta}>
                    עודכן:{' '}
                    {formatDateTime(
                      item.completedAt ?? item.qualifiedAt ?? item.createdAt
                    )}
                  </Text>
                </View>
              ))
            )}
          </View>
        ) : null}

        {activeTab === 'rewards' ? (
          <View style={styles.section}>
            {(rewards ?? []).length === 0 ? (
              <EmptyReferralState
                onPress={() =>
                  router.push('/(authenticated)/(customer)/discovery')
                }
              />
            ) : (
              (rewards ?? []).map((item) => (
                <View key={String(item.rewardId)} style={styles.itemCard}>
                  <Text style={styles.itemTitle}>{item.businessName}</Text>
                  <Text style={styles.itemState}>{mapRewardState(item)}</Text>
                  <Text style={styles.itemHint}>{mapRewardHint(item)}</Text>
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
    width: '100%',
    maxWidth: 720,
    alignSelf: 'center',
  },
  headerRow: {
    alignItems: 'stretch',
  },
  summaryRow: {
    marginTop: 2,
    flexDirection: flexDirection.row,
    gap: 8,
    borderBottomWidth: 1,
    borderBottomColor: '#C9D8F5',
    paddingBottom: 12,
  },
  summaryCard: {
    flex: 1,
    paddingHorizontal: 6,
    paddingVertical: 4,
    alignItems: 'center',
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
    flexDirection: flexDirection.row,
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
    borderBottomWidth: 1,
    borderBottomColor: '#D9E6FF',
    paddingHorizontal: 2,
    paddingVertical: 12,
    gap: 4,
    alignItems: alignItems.start,
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
  emptyCard: {
    borderRadius: 14,
    borderWidth: 1,
    borderColor: '#D9E6FF',
    backgroundColor: '#FFFFFF',
    paddingHorizontal: 12,
    paddingVertical: 14,
    gap: 6,
  },
  emptyTitle: {
    textAlign: 'right',
    color: '#0F172A',
    fontWeight: '900',
    fontSize: 14,
  },
  emptyBody: {
    textAlign: 'right',
    color: '#64748B',
    fontWeight: '700',
    fontSize: 13,
    lineHeight: 19,
  },
  emptyActionButton: {
    marginTop: 4,
    alignSelf: 'flex-end',
    borderRadius: 999,
    backgroundColor: '#2F6BFF',
    paddingHorizontal: 14,
    paddingVertical: 8,
  },
  emptyActionButtonPressed: {
    opacity: 0.86,
  },
  emptyActionButtonText: {
    color: '#FFFFFF',
    fontSize: 12,
    fontWeight: '900',
    textAlign: 'center',
  },
});
