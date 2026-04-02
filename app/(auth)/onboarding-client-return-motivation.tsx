import { useMutation } from 'convex/react';
import { useRouter } from 'expo-router';
import { useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { BackButton } from '@/components/BackButton';
import { ContinueButton } from '@/components/ContinueButton';
import { OnboardingChoiceButton } from '@/components/OnboardingChoiceButton';
import { OnboardingProgress } from '@/components/OnboardingProgress';
import { api } from '@/convex/_generated/api';
import { ANALYTICS_EVENTS } from '@/lib/analytics/events';
import { safeBack } from '@/lib/navigation';
import { useOnboardingTracking } from '@/lib/onboarding/useOnboardingTracking';

type ReturnMotivationId =
  | 'freebie'
  | 'percentage'
  | 'upgrade'
  | 'birthday'
  | 'gift';

const RETURN_MOTIVATIONS: Array<{ id: ReturnMotivationId; title: string }> = [
  { id: 'freebie', title: 'מבצע חינם אחרי X ביקורים' },
  { id: 'percentage', title: 'הנחה באחוזים' },
  { id: 'upgrade', title: 'שדרוג' },
  { id: 'birthday', title: 'הטבה ביום הולדת' },
  { id: 'gift', title: 'הטבות מתנה' },
];

export default function OnboardingReturnMotivationScreen() {
  const router = useRouter();
  const completeCustomerOnboarding = useMutation(
    api.users.completeCustomerOnboarding
  );
  const [selected, setSelected] = useState<ReturnMotivationId | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const canContinue = Boolean(selected);
  const { completeStep, trackChoice, trackContinue, trackEvent } =
    useOnboardingTracking({
      screen: 'onboarding_client_return_motivation',
      role: 'client',
    });

  const handleContinue = async () => {
    if (!canContinue || isSubmitting) {
      return;
    }
    trackContinue();
    completeStep({ return_motivation: selected });
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
        <View style={styles.header}>
          <BackButton
            onPress={() => safeBack('/(auth)/onboarding-client-frequency')}
          />
          <OnboardingProgress total={7} current={5} />
        </View>

        <View style={styles.titleContainer}>
          <Text style={styles.title}>איזה סוג הטבה הכי גורם לך לחזור?</Text>
        </View>

        <View style={styles.optionsContainer}>
          {RETURN_MOTIVATIONS.map((item) => {
            const isSelected = selected === item.id;
            return (
              <OnboardingChoiceButton
                key={item.id}
                selected={isSelected}
                label={item.title}
                onPress={() => {
                  setSelected(item.id);
                  trackChoice('return_motivation', item.id);
                }}
              />
            );
          })}
        </View>

        <View style={styles.footer}>
          <ContinueButton
            onPress={() => void handleContinue()}
            disabled={!canContinue || isSubmitting}
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
    flexDirection: 'row-reverse',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  titleContainer: {
    marginTop: 32,
    alignItems: 'flex-end',
  },
  title: {
    fontSize: 24,
    fontWeight: '900',
    color: '#111827',
    textAlign: 'right',
    marginBottom: 8,
    lineHeight: 30,
  },
  subtitle: {
    fontSize: 14,
    fontWeight: '600',
    color: '#6b7280',
    textAlign: 'right',
  },
  optionsContainer: {
    marginTop: 28,
    gap: 12,
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
