import { useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { BackButton } from '@/components/BackButton';
import { ContinueButton } from '@/components/ContinueButton';
import { OnboardingProgress } from '@/components/OnboardingProgress';
import { safeBack, safePush } from '@/lib/navigation';
import {
  BUSINESS_ONBOARDING_PROGRESS,
  BUSINESS_ONBOARDING_ROUTES,
  BUSINESS_ONBOARDING_TOTAL_STEPS,
} from '@/lib/onboarding/businessOnboardingFlow';
import { useOnboardingTracking } from '@/lib/onboarding/useOnboardingTracking';

type ReasonId =
  | 'repeat'
  | 'replace_paper'
  | 'insights'
  | 'basket'
  | 'offers'
  | 'other';

const TEXT = {
  title:
    '\u05de\u05d4 \u05d4\u05de\u05d8\u05e8\u05d4 \u05d4\u05e2\u05d9\u05e7\u05e8\u05d9\u05ea \u05e9\u05dc\u05db\u05dd?',
  subtitle:
    '\u05d1\u05d7\u05d9\u05e8\u05d4 \u05d6\u05d5 \u05ea\u05e2\u05d6\u05d5\u05e8 \u05dc\u05e0\u05d5 \u05dc\u05d4\u05ea\u05d0\u05d9\u05dd \u05dc\u05db\u05dd \u05d4\u05de\u05dc\u05e6\u05d5\u05ea \u05d4\u05de\u05e9\u05da.',
};

const REASONS: Array<{ id: ReasonId; title: string }> = [
  {
    id: 'repeat',
    title:
      '\u05dc\u05d4\u05d2\u05d3\u05d9\u05dc \u05d7\u05d6\u05e8\u05d4 \u05e9\u05dc \u05dc\u05e7\u05d5\u05d7\u05d5\u05ea',
  },
  {
    id: 'replace_paper',
    title:
      '\u05dc\u05d4\u05d7\u05dc\u05d9\u05e3 \u05db\u05e8\u05d8\u05d9\u05e1\u05d9\u05d5\u05ea \u05e0\u05d9\u05d9\u05e8',
  },
  {
    id: 'insights',
    title:
      '\u05dc\u05d0\u05e1\u05d5\u05e3 \u05ea\u05d5\u05d1\u05e0\u05d5\u05ea \u05e2\u05dc \u05dc\u05e7\u05d5\u05d7\u05d5\u05ea',
  },
  {
    id: 'basket',
    title:
      '\u05dc\u05d4\u05d2\u05d3\u05d9\u05dc \u05e1\u05dc \u05e7\u05e0\u05d9\u05d4',
  },
  {
    id: 'offers',
    title:
      '\u05dc\u05d4\u05e4\u05e2\u05d9\u05dc \u05de\u05d1\u05e6\u05e2\u05d9\u05dd \u05dc\u05dc\u05e7\u05d5\u05d7\u05d5\u05ea \u05e7\u05d9\u05d9\u05de\u05d9\u05dd',
  },
  { id: 'other', title: '\u05d0\u05d7\u05e8' },
];

export default function OnboardingBusinessReasonScreen() {
  const [selected, setSelected] = useState<ReasonId | null>(null);
  const canContinue = Boolean(selected);
  const { completeStep, trackChoice, trackContinue } = useOnboardingTracking({
    screen: 'onboarding_business_reason',
    role: 'business',
  });

  const handleContinue = () => {
    if (!canContinue) {
      return;
    }

    trackContinue();
    completeStep({ reason: selected });
    safePush(BUSINESS_ONBOARDING_ROUTES.name);
  };

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.content}>
        <View style={styles.header}>
          <BackButton
            onPress={() => safeBack(BUSINESS_ONBOARDING_ROUTES.discovery)}
          />
          <OnboardingProgress
            total={BUSINESS_ONBOARDING_TOTAL_STEPS}
            current={BUSINESS_ONBOARDING_PROGRESS.reason}
          />
        </View>

        <View style={styles.titleContainer}>
          <Text style={styles.title}>{TEXT.title}</Text>
          <Text style={styles.subtitle}>{TEXT.subtitle}</Text>
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
    marginBottom: 8,
  },
  subtitle: {
    fontSize: 14,
    fontWeight: '600',
    color: '#6B7280',
    textAlign: 'right',
  },
  optionsContainer: {
    marginTop: 28,
    gap: 12,
  },
  optionSelected: {
    backgroundColor: '#2563EB',
    borderRadius: 16,
    paddingHorizontal: 20,
    paddingVertical: 16,
    borderWidth: 1,
    borderColor: '#2563EB',
    shadowColor: '#93C5FD',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.1,
    shadowRadius: 2,
    elevation: 2,
  },
  optionUnselected: {
    backgroundColor: '#FFFFFF',
    borderRadius: 16,
    paddingHorizontal: 20,
    paddingVertical: 16,
    borderWidth: 1,
    borderColor: '#E5E7EB',
    shadowColor: '#9CA3AF',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.1,
    shadowRadius: 2,
    elevation: 2,
  },
  optionTextSelected: {
    fontSize: 16,
    fontWeight: '900',
    color: '#FFFFFF',
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
});
