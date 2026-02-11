import { useRouter } from 'expo-router';
import React, { useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { BackButton } from '@/components/BackButton';
import { ContinueButton } from '@/components/ContinueButton';
import { OnboardingProgress } from '@/components/OnboardingProgress';
import { ANALYTICS_EVENTS } from '@/lib/analytics/events';
import { safeBack } from '@/lib/navigation';
import { clearOnboardingSessionId } from '@/lib/onboarding/session';
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
  const [selected, setSelected] = useState<ReturnMotivationId | null>(null);
  const canContinue = Boolean(selected);
  const { completeStep, trackChoice, trackContinue, trackEvent } =
    useOnboardingTracking({
      screen: 'onboarding_client_return_motivation',
      role: 'client',
    });

  const handleContinue = () => {
    if (!canContinue) return;
    trackContinue();
    completeStep({ return_motivation: selected });
    trackEvent(ANALYTICS_EVENTS.onboardingCompleted, { role: 'client' });
    void clearOnboardingSessionId();
    router.push('/(auth)/sign-in');
  };

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.content}>
        <View style={styles.header}>
          <BackButton
            onPress={() => safeBack('/(auth)/onboarding-client-frequency')}
          />
          <OnboardingProgress total={8} current={8} />
        </View>

        <View style={styles.titleContainer}>
          <Text style={styles.title}>איזה סוג הטבה הכי גורם לך לחזור?</Text>
          <Text style={styles.subtitle}>
            נעזור להציע לך עסקים עם הטבות שמתאימות לך
          </Text>
        </View>

        <View style={styles.optionsContainer}>
          {RETURN_MOTIVATIONS.map((item) => {
            const isSelected = selected === item.id;
            return (
              <Pressable
                key={item.id}
                onPress={() => {
                  setSelected(item.id);
                  trackChoice('return_motivation', item.id);
                }}
                accessibilityRole="button"
                accessibilityState={{ selected: isSelected }}
              >
                <View
                  style={
                    isSelected ? styles.optionSelected : styles.optionUnselected
                  }
                >
                  <Text
                    style={
                      isSelected
                        ? styles.optionTextSelected
                        : styles.optionTextUnselected
                    }
                  >
                    {item.title}
                  </Text>
                </View>
              </Pressable>
            );
          })}
        </View>

        <View style={styles.footer}>
          <ContinueButton onPress={handleContinue} disabled={!canContinue} />
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
    paddingHorizontal: 24,
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
  optionSelected: {
    backgroundColor: '#2563eb',
    borderRadius: 16,
    paddingHorizontal: 20,
    paddingVertical: 16,
    borderWidth: 1,
    borderColor: '#2563eb',
    shadowColor: '#93c5fd',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.1,
    shadowRadius: 2,
    elevation: 2,
  },
  optionUnselected: {
    backgroundColor: '#ffffff',
    borderRadius: 16,
    paddingHorizontal: 20,
    paddingVertical: 16,
    borderWidth: 1,
    borderColor: '#e5e7eb',
    shadowColor: '#9ca3af',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.1,
    shadowRadius: 2,
    elevation: 2,
  },
  optionTextSelected: {
    fontSize: 16,
    fontWeight: '900',
    color: '#ffffff',
    textAlign: 'center',
  },
  optionTextUnselected: {
    fontSize: 16,
    fontWeight: '900',
    color: '#111827',
    textAlign: 'center',
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
