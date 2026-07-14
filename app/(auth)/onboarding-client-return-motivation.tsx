import { useMutation } from 'convex/react';
import { useRouter } from 'expo-router';
import { useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { ContinueButton } from '@/components/ContinueButton';
import { OnboardingProgress } from '@/components/OnboardingProgress';
import { StandaloneBackTitleHeader } from '@/components/StandaloneBackTitleHeader';
import { api } from '@/convex/_generated/api';
import { ANALYTICS_EVENTS } from '@/lib/analytics/events';
import { safeBack } from '@/lib/navigation';
import { useOnboardingTracking } from '@/lib/onboarding/useOnboardingTracking';

const TEXT = {
  title: 'הארנק שלך מוכן',
  description:
    'אפשר להתחיל לצבור ניקובים, לשמור הטבות ולגלות עסקים בסביבה כשזה רלוונטי.',
  note: 'מיקום והרשאות נבקש רק כשצריך.',
  continue: 'כניסה לארנק',
};

export default function OnboardingReturnMotivationScreen() {
  const router = useRouter();
  const completeCustomerOnboarding = useMutation(
    api.users.completeCustomerOnboarding
  );
  const [isSubmitting, setIsSubmitting] = useState(false);
  const { completeStep, trackContinue, trackEvent } = useOnboardingTracking({
      screen: 'onboarding_client_return_motivation',
      role: 'client',
  });

  const handleContinue = async () => {
    if (isSubmitting) {
      return;
    }
    trackContinue();
    completeStep();
    trackEvent(ANALYTICS_EVENTS.onboardingCompleted, { role: 'client' });
    setIsSubmitting(true);
    try {
      await completeCustomerOnboarding({});
      router.replace('/(authenticated)/(customer)/wallet');
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.content}>
        <StandaloneBackTitleHeader
          title={TEXT.title}
          subtitle={TEXT.description}
          onBackPress={() => safeBack('/(auth)/onboarding-client-interests')}
          leftAccessory={<OnboardingProgress total={3} current={3} />}
          style={styles.header}
          titleStyle={styles.title}
          subtitleStyle={styles.description}
        />
        <Text style={styles.note}>{TEXT.note}</Text>

        <View style={styles.footer}>
          <ContinueButton
            onPress={() => void handleContinue()}
            disabled={isSubmitting}
            label={TEXT.continue}
          />
        </View>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#FBFAF7',
  },
  content: {
    flex: 1,
    paddingHorizontal: 20,
    paddingTop: 16,
    paddingBottom: 32,
  },
  header: {
    marginBottom: 0,
  },
  title: {
    fontSize: 24,
    fontWeight: '900',
    color: '#111827',
    textAlign: 'right',
    marginBottom: 8,
    lineHeight: 30,
  },
  description: {
    fontSize: 14,
    fontWeight: '600',
    color: '#6b7280',
    textAlign: 'right',
    lineHeight: 21,
  },
  note: {
    marginTop: 14,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: '#BFDBFE',
    backgroundColor: '#EFF6FF',
    paddingHorizontal: 12,
    paddingVertical: 10,
    fontSize: 13,
    fontWeight: '700',
    color: '#1E40AF',
    textAlign: 'right',
    lineHeight: 19,
  },
  footer: {
    marginTop: 'auto',
  },
  buttonActive: {
    backgroundColor: '#2563eb',
    borderRadius: 999,
    paddingHorizontal: 40,
    paddingVertical: 16,
    alignItems: 'center',
    shadowColor: '#2563eb',
    shadowOffset: { width: 0, height: 10 },
    shadowOpacity: 0.25,
    shadowRadius: 30,
    elevation: 8,
  },
  buttonInactive: {
    backgroundColor: '#e5e7eb',
    borderRadius: 999,
    paddingHorizontal: 40,
    paddingVertical: 16,
    alignItems: 'center',
  },
  buttonTextActive: {
    fontSize: 18,
    fontWeight: '700',
    color: '#ffffff',
  },
  buttonTextInactive: {
    fontSize: 18,
    fontWeight: '700',
    color: '#6b7280',
  },
});
