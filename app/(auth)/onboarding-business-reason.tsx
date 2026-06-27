import { useEffect, useRef } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { BackButton } from '@/components/BackButton';
import { ContinueButton } from '@/components/ContinueButton';
import { OnboardingChoiceButton } from '@/components/OnboardingChoiceButton';
import { OnboardingProgress } from '@/components/OnboardingProgress';
import { useOnboarding } from '@/contexts/OnboardingContext';
import { safeDismissTo, safePush } from '@/lib/navigation';
import {
  BUSINESS_ONBOARDING_PROGRESS,
  BUSINESS_ONBOARDING_ROUTES,
  BUSINESS_ONBOARDING_TOTAL_STEPS,
} from '@/lib/onboarding/businessOnboardingFlow';
import { useBusinessOnboardingDraftPersistence } from '@/lib/onboarding/useBusinessOnboardingDraftPersistence';
import { useOnboardingTracking } from '@/lib/onboarding/useOnboardingTracking';
import { alignItems, flexDirection } from '@/lib/rtl';

type ReasonId =
  | 'repeat'
  | 'replace_paper'
  | 'insights'
  | 'basket'
  | 'offers'
  | 'other';

const TEXT = {
  title: 'מה המטרה העיקרית שלכם?',
  subtitle: 'בחירה זו תעזור לנו להתאים לכם המלצות המשך',
};

const REASONS: Array<{ id: ReasonId; title: string }> = [
  {
    id: 'repeat',
    title: 'להגדיל חזרה של לקוחות',
  },
  {
    id: 'replace_paper',
    title: 'להחליף כרטיסיות נייר',
  },
  {
    id: 'insights',
    title: 'לאסוף תובנות על לקוחות',
  },
  {
    id: 'basket',
    title: 'להגדיל סל קניה',
  },
  {
    id: 'offers',
    title: 'להפעיל מבצעים ללקוחות קיימים',
  },
  { id: 'other', title: 'אחר' },
];

export default function OnboardingBusinessReasonScreen() {
  const { businessOnboardingDraft, setBusinessOnboardingDraft } =
    useOnboarding();
  const { saveStep } = useBusinessOnboardingDraftPersistence();
  const didSyncStepRef = useRef(false);
  const selected = businessOnboardingDraft.reason as ReasonId | null;
  const canContinue = Boolean(selected);
  const { completeStep, trackChoice, trackContinue } = useOnboardingTracking({
    screen: 'onboarding_business_reason',
    role: 'business',
  });

  useEffect(() => {
    if (didSyncStepRef.current) {
      return;
    }
    didSyncStepRef.current = true;
    void saveStep({ step: 'reason' }).catch(() => {});
  }, [saveStep]);

  const handleContinue = async () => {
    if (!canContinue) {
      return;
    }

    trackContinue();
    try {
      await saveStep({ step: 'reason' });
    } catch {
      // Keep onboarding flow moving even if draft persistence fails.
    }
    completeStep({ reason: selected });
    safePush(BUSINESS_ONBOARDING_ROUTES.name);
  };

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.content}>
        <View style={styles.header}>
          <BackButton
            onPress={() => safeDismissTo(BUSINESS_ONBOARDING_ROUTES.discovery)}
          />
          <OnboardingProgress
            total={BUSINESS_ONBOARDING_TOTAL_STEPS}
            current={BUSINESS_ONBOARDING_PROGRESS.reason}
          />
        </View>

        <View style={styles.titleContainer}>
          <Text style={styles.title}>{TEXT.title}</Text>
        </View>

        <View style={styles.optionsContainer}>
          {REASONS.map((reason) => {
            const isSelected = selected === reason.id;
            return (
              <OnboardingChoiceButton
                key={reason.id}
                selected={isSelected}
                label={reason.title}
                onPress={() => {
                  setBusinessOnboardingDraft((prev) => ({
                    ...prev,
                    reason: reason.id,
                  }));
                  trackChoice('reason', reason.id);
                }}
              />
            );
          })}
        </View>

        <View style={styles.footer}>
          <ContinueButton
            onPress={() => {
              void handleContinue();
            }}
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
    paddingHorizontal: 20,
    paddingTop: 16,
    paddingBottom: 32,
  },
  header: {
    flexDirection: flexDirection.row,
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  titleContainer: {
    marginTop: 12,
    alignItems: alignItems.start,
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
});
