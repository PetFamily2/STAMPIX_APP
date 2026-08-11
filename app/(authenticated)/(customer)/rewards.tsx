import { Ionicons } from '@expo/vector-icons';
import { useBottomTabBarHeight } from '@react-navigation/bottom-tabs';
import { useQuery } from 'convex/react';
import { useRouter } from 'expo-router';
import { useMemo } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import {
  SafeAreaView,
  useSafeAreaInsets,
} from 'react-native-safe-area-context';

import BusinessScreenHeader from '@/components/BusinessScreenHeader';
import StickyScrollHeader from '@/components/StickyScrollHeader';
import { api } from '@/convex/_generated/api';
import { alignItems, flexDirection, selfStart } from '@/lib/rtl';

const TEXT = {
  title: 'הטבות והודעות',
  subtitle: 'כאן תראו מבצעים ועדכונים שנשלחו אליכם מהעסקים',
  readyRewardsTitle: 'זכאים עכשיו למימוש',
  readyRewardsSubtitle: 'כרטיסיות שהושלמו ומחכות למימוש בבית העסק',
  emptyTitle: 'עדיין אין הטבות פעילות',
  emptySubtitle:
    'הטבות ומבצעים יופיעו כאן אחרי שתצטרפו לכרטיסיות ותתקדמו בניקובים.',
  emptyCta: 'מציאת עסק להצטרפות',
  noMessages: 'אין הודעות חדשות כרגע.',
  messageAction: 'לפרטים',
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
  const router = useRouter();
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

  const handleInboxPress = (destinationHref: string | null) => {
    if (!destinationHref) {
      return;
    }
    router.push(destinationHref as any);
  };

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

        <View style={styles.referralCard}>
          <View style={styles.referralTextWrap}>
            <Text style={styles.referralTitle}>{'הזמנות חברים'}</Text>
            <Text style={styles.referralSubtitle}>
              {'מעקב אחר הזמנות ממתינות ומתנות שהתקבלו'}
            </Text>
          </View>
          <Pressable
            onPress={() => router.push('/(authenticated)/(customer)/referrals')}
            style={({ pressed }) => [
              styles.referralButton,
              pressed ? styles.referralButtonPressed : null,
            ]}
          >
            <Text style={styles.referralButtonText}>{'למסך ההזמנות'}</Text>
          </Pressable>
        </View>

        {isLoading ? (
          <View style={styles.emptyCard}>
            <Text style={styles.emptyTitle}>טוען הודעות...</Text>
          </View>
        ) : isEmpty ? (
          <View style={styles.emptyCard}>
            <Text style={styles.emptyTitle}>{TEXT.emptyTitle}</Text>
            <Text style={styles.emptySubtitle}>{TEXT.emptySubtitle}</Text>
            <Pressable
              onPress={() =>
                router.push('/(authenticated)/(customer)/discovery')
              }
              style={({ pressed }) => [
                styles.emptyButton,
                pressed ? styles.emptyButtonPressed : null,
              ]}
              accessibilityRole="button"
              accessibilityLabel={TEXT.emptyCta}
            >
              <Text style={styles.emptyButtonText}>{TEXT.emptyCta}</Text>
            </Pressable>
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
              <Pressable
                key={item.messageId}
                onPress={() => handleInboxPress(item.destinationHref)}
                disabled={!item.destinationHref}
                accessibilityRole={item.destinationHref ? 'button' : undefined}
                style={({ pressed }) => [
                  styles.messageCard,
                  item.destinationHref ? styles.messageCardWithAction : null,
                  pressed && item.destinationHref
                    ? styles.messageCardPressed
                    : null,
                ]}
              >
                <View style={styles.metaRow}>
                  <Text style={styles.metaText}>
                    {formatDateTime(item.createdAt)}
                  </Text>
                  <Text style={styles.badge}>{item.businessName}</Text>
                </View>
                <Text style={styles.messageTitle}>{item.title}</Text>
                <Text style={styles.messageBody}>{item.body}</Text>
                {item.destinationHref ? (
                  <View style={styles.messageActionRow}>
                    <Text style={styles.messageActionText}>
                      {TEXT.messageAction}
                    </Text>
                    <Ionicons name="chevron-back" size={14} color="#1D4ED8" />
                  </View>
                ) : null}
              </Pressable>
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
    width: '100%',
    maxWidth: 720,
    alignSelf: 'center',
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
    lineHeight: 20,
  },
  emptyButton: {
    marginTop: 14,
    alignSelf: selfStart,
    borderRadius: 999,
    backgroundColor: '#2F6BFF',
    paddingHorizontal: 16,
    paddingVertical: 10,
  },
  emptyButtonPressed: {
    opacity: 0.86,
  },
  emptyButtonText: {
    fontSize: 13,
    fontWeight: '900',
    color: '#FFFFFF',
    textAlign: 'center',
  },
  feedWrap: {
    marginTop: 18,
    gap: 10,
  },
  referralCard: {
    marginTop: 16,
    backgroundColor: '#FFFFFF',
    borderRadius: 18,
    borderWidth: 1,
    borderColor: '#D7E8FF',
    padding: 14,
    gap: 10,
  },
  referralTextWrap: {
    alignItems: alignItems.start,
    gap: 4,
  },
  referralTitle: {
    fontSize: 15,
    fontWeight: '900',
    color: '#1E3A8A',
    textAlign: 'right',
  },
  referralSubtitle: {
    fontSize: 12,
    color: '#475569',
    textAlign: 'right',
  },
  referralButton: {
    alignSelf: selfStart,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: '#BFD3FF',
    backgroundColor: '#EEF4FF',
    paddingHorizontal: 12,
    paddingVertical: 8,
  },
  referralButtonPressed: {
    opacity: 0.85,
  },
  referralButtonText: {
    fontSize: 12,
    fontWeight: '800',
    color: '#1D4ED8',
    textAlign: 'center',
  },
  readyRewardsSection: {
    borderTopWidth: 1,
    borderTopColor: '#C9D8F5',
    paddingTop: 14,
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
    borderBottomWidth: 1,
    borderBottomColor: '#DCE6F7',
    paddingVertical: 10,
    gap: 6,
  },
  readyRewardHeader: {
    flexDirection: flexDirection.row,
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
    borderBottomWidth: 1,
    borderBottomColor: '#DCE6F7',
    paddingHorizontal: 2,
    paddingVertical: 12,
    gap: 8,
  },
  messageCardWithAction: {
    borderBottomColor: '#BFD3FF',
  },
  messageCardPressed: {
    opacity: 0.88,
  },
  messageActionRow: {
    flexDirection: flexDirection.row,
    alignItems: 'center',
    gap: 4,
  },
  messageActionText: {
    fontSize: 12,
    fontWeight: '700',
    color: '#1D4ED8',
    textAlign: 'right',
    writingDirection: 'rtl',
  },
  metaRow: {
    flexDirection: flexDirection.row,
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  metaText: {
    fontSize: 11,
    color: '#6B7280',
    textAlign: 'right',
    writingDirection: 'rtl',
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
