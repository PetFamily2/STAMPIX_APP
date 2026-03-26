import { useRouter } from 'expo-router';
import { useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { BackButton } from '@/components/BackButton';
import { ContinueButton } from '@/components/ContinueButton';
import { OnboardingChoiceButton } from '@/components/OnboardingChoiceButton';
import { OnboardingProgress } from '@/components/OnboardingProgress';
import { safeBack } from '@/lib/navigation';
import { useOnboardingTracking } from '@/lib/onboarding/useOnboardingTracking';

type FrequencyId = 'daily' | 'weekly' | 'biweekly' | 'monthly' | 'rare';

const FREQUENCIES: Array<{ id: FrequencyId; title: string }> = [
  { id: 'daily', title: 'יומי' },
  { id: 'weekly', title: 'כמה פעמים בשבוע' },
  { id: 'biweekly', title: 'פעם בשבוע' },
  { id: 'monthly', title: 'כמה פעמים בחודש' },
  { id: 'rare', title: 'כמעט לא חוזר' },
];

export default function OnboardingClientFrequencyScreen() {
  const router = useRouter();
  const [selected, setSelected] = useState<FrequencyId | null>(null);
  const canContinue = Boolean(selected);
  const { completeStep, trackChoice, trackContinue } = useOnboardingTracking({
    screen: 'onboarding_client_frequency',
    role: 'client',
  });

  const handleContinue = () => {
    if (!canContinue) {
      return;
    }
    trackContinue();
    completeStep({
      frequency_selected: selected,
    });
    router.push('/(auth)/onboarding-client-return-motivation');
  };

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.content}>
        <View style={styles.header}>
          <BackButton
            onPress={() => safeBack('/(auth)/onboarding-client-fit')}
          />
          <OnboardingProgress total={7} current={4} />
        </View>

        <View style={styles.titleContainer}>
          <Text style={styles.title}>באיזו תדירות אתה חוזר לאותם מקומות?</Text>
        </View>

        <View style={styles.optionsContainer}>
          {FREQUENCIES.map((item) => {
            const isSelected = selected === item.id;
            return (
              <OnboardingChoiceButton
                key={item.id}
                selected={isSelected}
                label={item.title}
                onPress={() => {
                  setSelected(item.id);
                  trackChoice('frequency', item.id);
                }}
              />
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
    marginTop: 32,
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
