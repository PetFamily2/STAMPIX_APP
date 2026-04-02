import { useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { BackButton } from '@/components/BackButton';
import { ContinueButton } from '@/components/ContinueButton';
import { OnboardingChoiceButton } from '@/components/OnboardingChoiceButton';
import { OnboardingProgress } from '@/components/OnboardingProgress';
import { safeBack, safePush } from '@/lib/navigation';
import { useOnboardingTracking } from '@/lib/onboarding/useOnboardingTracking';

type FitOptionId = 'self' | 'couple' | 'kids' | 'pet' | 'home' | 'work';

const FIT_OPTIONS: Array<{ id: FitOptionId; title: string }> = [
  { id: 'self', title: 'לעצמי' },
  { id: 'couple', title: 'לי ולבן/בת זוג' },
  { id: 'kids', title: 'לילדים' },
  { id: 'pet', title: 'לחיית מחמד' },
  { id: 'home', title: 'לבית ולמשפחה' },
  { id: 'work', title: 'לעבודה (ליד העבודה / הפסקות)' },
];

export default function OnboardingClientFitScreen() {
  const [selected, setSelected] = useState<FitOptionId[]>([]);
  const canContinue = selected.length > 0;
  const { completeStep, trackChoice, trackContinue } = useOnboardingTracking({
    screen: 'onboarding_client_fit',
    role: 'client',
  });

  const toggleOption = (id: FitOptionId) => {
    setSelected((prev) => {
      if (prev.includes(id)) {
        trackChoice('fit_option', id, { selected: false });
        return prev.filter((item) => item !== id);
      }
      trackChoice('fit_option', id, { selected: true });
      return [...prev, id];
    });
  };

  const handleContinue = () => {
    if (!canContinue) {
      return;
    }
    trackContinue();
    completeStep({
      fit_count: selected.length,
      fit_values: selected,
    });
    safePush('/(auth)/onboarding-client-frequency');
  };

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.content}>
        <View style={styles.header}>
          <BackButton
            onPress={() => safeBack('/(auth)/onboarding-client-usage-area')}
          />
          <OnboardingProgress total={7} current={3} />
        </View>

        <View style={styles.titleContainer}>
          <Text style={styles.title}>למי אתה רוצה שההטבות יתאימו?</Text>
        </View>

        <View style={styles.optionsContainer}>
          {FIT_OPTIONS.map((option) => {
            const isSelected = selected.includes(option.id);
            return (
              <OnboardingChoiceButton
                key={option.id}
                selected={isSelected}
                label={option.title}
                onPress={() => toggleOption(option.id)}
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
  },
  subtitle: {
    fontSize: 14,
    fontWeight: '600',
    color: '#6b7280',
    textAlign: 'right',
    lineHeight: 20,
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
