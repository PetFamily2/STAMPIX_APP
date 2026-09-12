import { useLocalSearchParams, useRouter } from 'expo-router';
import { useEffect } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, Text, View } from 'react-native';

import { REFERRAL_COPY } from '@/lib/referrals/copy';
import { persistPendingReferralCode } from '@/lib/referrals/pendingCode';

export default function BusinessReferralIntakeScreen() {
  const { code } = useLocalSearchParams<{ code?: string }>();
  const router = useRouter();
  const normalized = typeof code === 'string' ? code.trim() : '';

  useEffect(() => {
    if (!normalized) {
      return;
    }
    void persistPendingReferralCode(normalized);
  }, [normalized]);

  return (
    <View style={styles.screen}>
      <Text style={styles.title}>{REFERRAL_COPY.landingTitle}</Text>
      <Text style={styles.body}>{REFERRAL_COPY.shareBenefit}</Text>
      {normalized ? (
        <Text style={styles.code}>
          {REFERRAL_COPY.inviteCodeFallback}: {normalized}
        </Text>
      ) : null}
      <Pressable
        accessibilityRole="button"
        accessibilityLabel="המשך להצטרפות"
        style={styles.cta}
        onPress={() => {
          router.replace('/(auth)/welcome');
        }}
      >
        <Text style={styles.ctaText}>המשך</Text>
      </Pressable>
      {!normalized ? <ActivityIndicator color="#2F6BFF" /> : null}
    </View>
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: '#F8FAFF',
    padding: 24,
    justifyContent: 'center',
    gap: 16,
  },
  title: {
    fontSize: 28,
    fontWeight: '800',
    textAlign: 'right',
    writingDirection: 'rtl',
    color: '#0F172A',
  },
  body: {
    fontSize: 16,
    lineHeight: 24,
    textAlign: 'right',
    writingDirection: 'rtl',
    color: '#334155',
  },
  code: {
    fontSize: 16,
    fontWeight: '700',
    textAlign: 'right',
    writingDirection: 'rtl',
    color: '#1D4ED8',
  },
  cta: {
    minHeight: 44,
    borderRadius: 16,
    backgroundColor: '#111827',
    alignItems: 'center',
    justifyContent: 'center',
  },
  ctaText: {
    color: '#FFFFFF',
    fontWeight: '700',
    fontSize: 16,
  },
});
