import { AccessibilityInfo, Platform, StyleSheet, Text, View } from 'react-native';
import { useEffect } from 'react';

import { REFERRAL_COPY } from '@/lib/referrals/copy';

export function RewardEarnedCelebration({
  months,
  visible,
  mode = 'earned',
}: {
  months: number;
  visible: boolean;
  mode?: 'earned' | 'redeemed';
}) {
  const title =
    months === 2 ? REFERRAL_COPY.earnedTwoMonths : REFERRAL_COPY.earnedOneMonth;
  const body =
    mode === 'redeemed'
      ? REFERRAL_COPY.rewardActivated
      : REFERRAL_COPY.referredRewardWaiting;

  useEffect(() => {
    if (!visible) {
      return;
    }
    if (Platform.OS !== 'web') {
      AccessibilityInfo.announceForAccessibility(title);
    }
  }, [title, visible]);

  if (!visible) {
    return null;
  }

  return (
    <View
      accessibilityRole="text"
      accessibilityLabel={
        months === 2
          ? REFERRAL_COPY.earnedTwoMonths
          : REFERRAL_COPY.earnedOneMonth
      }
      style={styles.card}
    >
      <Text style={styles.emoji}>🎉</Text>
      <Text style={styles.title}>{title}</Text>
      <Text style={styles.body}>{body}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    borderRadius: 20,
    backgroundColor: '#ECFDF5',
    padding: 16,
    gap: 6,
  },
  emoji: {
    fontSize: 28,
    textAlign: 'right',
  },
  title: {
    fontSize: 18,
    fontWeight: '800',
    color: '#065F46',
    textAlign: 'right',
    writingDirection: 'rtl',
  },
  body: {
    fontSize: 14,
    color: '#047857',
    textAlign: 'right',
    writingDirection: 'rtl',
  },
});
