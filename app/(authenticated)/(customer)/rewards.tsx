import { useBottomTabBarHeight } from '@react-navigation/bottom-tabs';
import { useQuery } from 'convex/react';
import { useMemo } from 'react';
import { ScrollView, StyleSheet, Text, View } from 'react-native';
import {
  SafeAreaView,
  useSafeAreaInsets,
} from 'react-native-safe-area-context';

import BusinessScreenHeader from '@/components/BusinessScreenHeader';
import StickyScrollHeader from '@/components/StickyScrollHeader';
import { api } from '@/convex/_generated/api';

const TEXT = {
  title: 'הטבות והודעות',
  subtitle: 'כאן תראו מבצעים ועדכונים שנשלחו אליכם מהעסקים',
  readyRewardsTitle: 'זכאים עכשיו למימוש',
  readyRewardsSubtitle: 'כרטיסיות שהושלמו ומחכות למימוש בבית העסק',
  emptyTitle: 'עדיין אין הודעות פעילות',
  emptySubtitle: 'כשתישלח אליכם הודעה עסקית או מבצע, היא תופיע כאן אוטומטית.',
  noMessages: 'אין הודעות חדשות כרגע.',
};

type CustomerMembershipRecord = {
  membershipId: string;
  businessName: string;
  programTitle: string;
  rewardName: string;
  currentStamps: number;
  maxStamps: number;
  canRedeem: boolean;
};

function formatDateTime(value: number) {
  return new Date(value).toLocaleString('he-IL', {
    day: '2-digit',
    month: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  });
}

export default function RewardsScreen() {
  const insets = useSafeAreaInsets();
  const tabBarHeight = useBottomTabBarHeight();
  const inboxQuery = useQuery(api.campaigns.listInboxForCustomer);
  const membershipsQuery = useQuery(api.memberships.byCustomer);
  const inbox = inboxQuery ?? [];
  const memberships = (membershipsQuery ?? []) as CustomerMembershipRecord[];
  const redeemableRewards = useMemo(
    () => memberships.filter((membership) => membership.canRedeem),
    [memberships]
  );
  const isLoading = inboxQuery === undefined || membershipsQuery === undefined;
  const isEmpty =
    !isLoading && redeemableRewards.length === 0 && inbox.length === 0;

  return (
    <SafeAreaView style={styles.safeArea} edges={[]}>
      <ScrollView
        stickyHeaderIndices={[0]}
        contentContainerStyle={[
          styles.scrollContent,
          {
            paddingBottom: tabBarHeight + 24,
          },
        ]}
      >
        <StickyScrollHeader
          topPadding={(insets.top || 0) + 12}
          backgroundColor="#E9F0FF"
        >
          <View style={styles.headerRow}>
            <BusinessScreenHeader title={TEXT.title} subtitle={TEXT.subtitle} />
          </View>
        </StickyScrollHeader>

        {isLoading ? (
          <View style={styles.emptyCard}>
            <Text style={styles.emptyTitle}>טוען הודעות...</Text>
          </View>
        ) : isEmpty ? (
          <View style={styles.emptyCard}>
            <Text style={styles.emptyTitle}>{TEXT.emptyTitle}</Text>
            <Text style={styles.emptySubtitle}>{TEXT.emptySubtitle}</Text>
          </View>
        ) : (
          <View style={styles.feedWrap}>
            {redeemableRewards.length > 0 ? (
              <View style={styles.readyRewardsSection}>
                <Text style={styles.readyRewardsTitle}>
                  {TEXT.readyRewardsTitle}
                </Text>
                <Text style={styles.readyRewardsSubtitle}>
                  {TEXT.readyRewardsSubtitle}
                </Text>
                <View style={styles.readyRewardsList}>
                  {redeemableRewards.map((reward) => (
                    <View
                      key={reward.membershipId}
                      style={styles.readyRewardCard}
                    >
                      <View style={styles.readyRewardHeader}>
                        <Text style={styles.readyRewardBadge}>
                          {reward.businessName}
                        </Text>
                        <Text style={styles.readyRewardProgram}>
                          {reward.programTitle}
                        </Text>
                      </View>
                      <Text style={styles.readyRewardName}>
                        {reward.rewardName}
                      </Text>
                      <Text style={styles.readyRewardHint}>
                        כרטיסיה מלאה ({reward.currentStamps}/{reward.maxStamps}
                        ). אפשר לממש בהצגה בקופה.
                      </Text>
                    </View>
                  ))}
                </View>
              </View>
            ) : null}

            {inbox.length === 0 ? (
              <View style={styles.messageCard}>
                <Text style={styles.messageBody}>{TEXT.noMessages}</Text>
              </View>
            ) : null}

            {inbox.map((item) => (
              <View key={item.messageId} style={styles.messageCard}>
                <View style={styles.metaRow}>
                  <Text style={styles.metaText}>
                    {formatDateTime(item.createdAt)}
                  </Text>
                  <Text style={styles.badge}>{item.businessName}</Text>
                </View>
                <Text style={styles.messageTitle}>{item.title}</Text>
                <Text style={styles.messageBody}>{item.body}</Text>
              </View>
            ))}
          </View>
        )}
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
  },
  headerRow: {
    alignItems: 'stretch',
    marginBottom: 4,
  },
  emptyCard: {
    marginTop: 18,
    backgroundColor: '#FFFFFF',
    borderRadius: 24,
    padding: 16,
    borderWidth: 1,
    borderColor: '#E3E9FF',
  },
  emptyTitle: {
    fontSize: 16,
    fontWeight: '800',
    color: '#0B1220',
    textAlign: 'right',
  },
  emptySubtitle: {
    marginTop: 6,
    fontSize: 13,
    color: '#5B6475',
    textAlign: 'right',
  },
  feedWrap: {
    marginTop: 18,
    gap: 10,
  },
  readyRewardsSection: {
    backgroundColor: '#FFFFFF',
    borderRadius: 18,
    borderWidth: 1,
    borderColor: '#D7E8FF',
    padding: 14,
    gap: 8,
  },
  readyRewardsTitle: {
    fontSize: 15,
    fontWeight: '900',
    color: '#1E3A8A',
    textAlign: 'right',
  },
  readyRewardsSubtitle: {
    fontSize: 12,
    color: '#475569',
    textAlign: 'right',
  },
  readyRewardsList: {
    gap: 8,
  },
  readyRewardCard: {
    borderRadius: 14,
    borderWidth: 1,
    borderColor: '#DBEAFE',
    backgroundColor: '#F8FBFF',
    padding: 12,
    gap: 6,
  },
  readyRewardHeader: {
    flexDirection: 'row-reverse',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 8,
  },
  readyRewardBadge: {
    fontSize: 11,
    fontWeight: '700',
    color: '#1D4ED8',
    backgroundColor: '#EEF3FF',
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 999,
    overflow: 'hidden',
    textAlign: 'center',
  },
  readyRewardProgram: {
    flex: 1,
    fontSize: 11,
    fontWeight: '700',
    color: '#475569',
    textAlign: 'right',
  },
  readyRewardName: {
    fontSize: 14,
    fontWeight: '800',
    color: '#111827',
    textAlign: 'right',
  },
  readyRewardHint: {
    fontSize: 12,
    color: '#475569',
    lineHeight: 18,
    textAlign: 'right',
  },
  messageCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: 18,
    borderWidth: 1,
    borderColor: '#E3E9FF',
    padding: 14,
    gap: 8,
  },
  metaRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  metaText: {
    fontSize: 11,
    color: '#6B7280',
    textAlign: 'left',
  },
  badge: {
    fontSize: 11,
    fontWeight: '700',
    color: '#1D4ED8',
    backgroundColor: '#EEF3FF',
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 999,
    overflow: 'hidden',
    textAlign: 'center',
  },
  messageTitle: {
    fontSize: 15,
    fontWeight: '800',
    color: '#111827',
    textAlign: 'right',
  },
  messageBody: {
    fontSize: 13,
    color: '#475569',
    lineHeight: 20,
    textAlign: 'right',
  },
});
