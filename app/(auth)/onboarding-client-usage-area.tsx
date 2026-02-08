import { useRouter } from 'expo-router';
import React, { useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { BackButton } from '@/components/BackButton';
import { ContinueButton } from '@/components/ContinueButton';
import { OnboardingProgress } from '@/components/OnboardingProgress';
import { safeBack } from '@/lib/navigation';
import { useOnboardingTracking } from '@/lib/onboarding/useOnboardingTracking';

type AreaId = 'center' | 'sharon' | 'north' | 'south' | 'jerusalem';

const AREAS: Array<{ id: AreaId; title: string }> = [
  { id: 'center', title: 'מרכז' },
  { id: 'sharon', title: 'שרון' },
  { id: 'north', title: 'צפון' },
  { id: 'south', title: 'דרום' },
  { id: 'jerusalem', title: 'ירושלים' },
];

export default function OnboardingUsageAreaScreen() {
  const router = useRouter();
  const [selected, setSelected] = useState<AreaId | null>(null);
  const canContinue = Boolean(selected);
  const { completeStep, trackChoice, trackContinue } = useOnboardingTracking({
    screen: 'onboarding_client_usage_area',
    role: 'client',
  });

  const handleContinue = () => {
    if (!canContinue) return;
    trackContinue();
    completeStep({
      areas_count: selected ? 1 : 0,
      areas_values: selected ? [selected] : [],
    });
    router.push('/(auth)/onboarding-client-fit');
  };

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.content}>
        <View style={styles.header}>
          <BackButton
            onPress={() => safeBack('/(auth)/onboarding-client-interests')}
          />
          <OnboardingProgress total={8} current={5} />
        </View>

        <View style={styles.titleContainer}>
          <Text style={styles.title}>איפה אתה נמצא בדרך כלל?</Text>
          <Text style={styles.subtitle}>כדי להציג עסקים רלוונטיים</Text>
        </View>

        <View style={styles.optionsContainer}>
          {AREAS.map((area) => {
            const isSelected = selected === area.id;
            return (
              <Pressable
                key={area.id}
                onPress={() => {
                  setSelected(area.id);
                  trackChoice('usage_area', area.id);
                }}
                accessibilityRole="button"
                accessibilityState={{ selected: isSelected }}
              >
                <View
                  style={[
                    styles.option,
                    isSelected
                      ? styles.optionSelected
                      : styles.optionUnselected,
                  ]}
                >
                  <Text
                    style={
                      isSelected
                        ? styles.optionTextSelected
                        : styles.optionTextUnselected
                    }
                  >
                    {area.title}
                  </Text>
                </View>
              </Pressable>
            );
          })}
        </View>

        <View style={styles.footer}>
          <ContinueButton
            onPress={handleContinue}
            disabled={!canContinue}
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
  option: {
    borderRadius: 16,
    paddingHorizontal: 20,
    paddingVertical: 16,
    borderWidth: 1,
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.1,
    shadowRadius: 2,
    elevation: 2,
  },
  optionSelected: {
    backgroundColor: '#2563eb',
    borderColor: '#2563eb',
    shadowColor: '#93c5fd',
  },
  optionUnselected: {
    backgroundColor: '#ffffff',
    borderColor: '#e5e7eb',
    shadowColor: '#9ca3af',
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
  button: {
    borderRadius: 999,
    paddingHorizontal: 40,
    paddingVertical: 16,
    alignItems: 'center',
  },
  buttonActive: {
    backgroundColor: '#2563eb',
    shadowColor: '#2563eb',
    shadowOffset: { width: 0, height: 10 },
    shadowOpacity: 0.25,
    shadowRadius: 30,
    elevation: 8,
  },
  buttonInactive: {
    backgroundColor: '#e5e7eb',
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
