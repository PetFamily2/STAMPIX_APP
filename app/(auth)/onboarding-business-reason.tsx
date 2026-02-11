import React, { useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { BackButton } from '@/components/BackButton';
import { ContinueButton } from '@/components/ContinueButton';
import { OnboardingProgress } from '@/components/OnboardingProgress';
import { safeBack, safePush } from '@/lib/navigation';
import { useOnboardingTracking } from '@/lib/onboarding/useOnboardingTracking';

type ReasonId =
  | 'repeat'
  | 'replacePaper'
  | 'insights'
  | 'basket'
  | 'offers'
  | 'other';

const REASONS: Array<{ id: ReasonId; title: string }> = [
  { id: 'repeat', title: 'להגדיל חזרה של לקוחות' },
  { id: 'replacePaper', title: 'להחליף כרטיסיות נייר' },
  { id: 'insights', title: 'לאסוף נתונים על לקוחות' },
  { id: 'basket', title: 'להגדיל סל קניה' },
  { id: 'offers', title: 'מבצעים ללקוחות קיימים' },
  { id: 'other', title: 'אחר' },
];

export default function OnboardingBusinessReasonScreen() {
  const [selected, setSelected] = useState<ReasonId | null>(null);
  const canContinue = Boolean(selected);
  const { completeStep, trackChoice, trackContinue } = useOnboardingTracking({
    screen: 'onboarding_business_reason',
    role: 'business',
  });

  const handleContinue = () => {
    if (!canContinue) return;
    trackContinue();
    completeStep({ reason: selected });
    safePush('/(auth)/onboarding-business-name');
  };

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.content}>
        <View style={styles.header}>
          <BackButton
            onPress={() => safeBack('/(auth)/onboarding-business-discovery')}
          />
          <OnboardingProgress total={8} current={4} />
        </View>

        <View style={styles.titleContainer}>
          <Text style={styles.title}>מה הסיבה המרכזית שבגללה אתה כאן?</Text>
        </View>

        <View style={styles.optionsContainer}>
          {REASONS.map((reason) => {
            const isSelected = selected === reason.id;
            return (
              <Pressable
                key={reason.id}
                onPress={() => {
                  setSelected(reason.id);
                  trackChoice('reason', reason.id);
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
                    {reason.title}
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
    color: '#9ca3af',
  },
});
