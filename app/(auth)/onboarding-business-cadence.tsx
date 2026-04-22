import { useEffect, useMemo, useRef } from 'react';
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
import {
  BUSINESS_EXAMPLE_CADENCE_OPTIONS,
  BUSINESS_EXAMPLES,
  type BusinessCadenceId,
  type BusinessExampleId,
  CADENCE_LABELS,
} from '@/lib/onboarding/businessOnboardingOptions';
import { useBusinessOnboardingDraftPersistence } from '@/lib/onboarding/useBusinessOnboardingDraftPersistence';
import { useOnboardingTracking } from '@/lib/onboarding/useOnboardingTracking';

const TEXT = {
  title: 'כל כמה זמן לקוחות חוזרים',
};

export default function OnboardingBusinessCadenceScreen() {
  const { businessOnboardingDraft, setBusinessOnboardingDraft } =
    useOnboarding();
  const { saveStep } = useBusinessOnboardingDraftPersistence();
  const didSyncStepRef = useRef(false);
  const selectedBusinessExample =
    (businessOnboardingDraft.businessExample as BusinessExampleId | null) ??
    null;
  const selectedCadence =
    (businessOnboardingDraft.cadenceBand as BusinessCadenceId | null) ?? null;
  const canContinue =
    selectedBusinessExample !== null && selectedCadence !== null;
  const { completeStep, trackChoice, trackContinue } = useOnboardingTracking({
    screen: 'onboarding_business_cadence',
    role: 'business',
  });

  useEffect(() => {
    if (didSyncStepRef.current) {
      return;
    }
    didSyncStepRef.current = true;
    void saveStep({ step: 'businessCadence' }).catch(() => {});
  }, [saveStep]);

  const cadenceOptions = useMemo(() => {
    if (!selectedBusinessExample) {
      return [] as BusinessCadenceId[];
    }
    return BUSINESS_EXAMPLE_CADENCE_OPTIONS[selectedBusinessExample];
  }, [selectedBusinessExample]);

  const businessTypeLabel = useMemo(() => {
    if (!selectedBusinessExample) {
      return '';
    }
    return (
      BUSINESS_EXAMPLES.find((item) => item.id === selectedBusinessExample)
        ?.title ?? ''
    );
  }, [selectedBusinessExample]);

  useEffect(() => {
    if (selectedBusinessExample) {
      return;
    }
    safePush(BUSINESS_ONBOARDING_ROUTES.businessType);
  }, [selectedBusinessExample]);

  const handleContinue = async () => {
    if (!canContinue) {
      return;
    }

    trackContinue();
    try {
      await saveStep({ step: 'businessCadence' });
    } catch {
      // Keep onboarding flow moving even if draft persistence fails.
    }

    completeStep({
      business_example: selectedBusinessExample,
      cadence_band: selectedCadence,
    });

    safePush(BUSINESS_ONBOARDING_ROUTES.businessCampaignRelevance);
  };

  if (!selectedBusinessExample) {
    return null;
  }

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.content}>
        <View style={styles.header}>
          <BackButton
            onPress={() =>
              safeDismissTo(BUSINESS_ONBOARDING_ROUTES.businessType)
            }
          />
          <OnboardingProgress
            total={BUSINESS_ONBOARDING_TOTAL_STEPS}
            current={BUSINESS_ONBOARDING_PROGRESS.businessCadence}
          />
        </View>

        <View style={styles.titleContainer}>
          <Text style={styles.title}>{TEXT.title}</Text>
          <Text style={styles.contextText}>{businessTypeLabel}</Text>
        </View>

        <View style={styles.optionsContainer}>
          {cadenceOptions.map((option) => {
            const isSelected = selectedCadence === option;
            return (
              <OnboardingChoiceButton
                key={option}
                selected={isSelected}
                label={CADENCE_LABELS[option]}
                labelNumberOfLines={1}
                onPress={() => {
                  setBusinessOnboardingDraft((prev) => ({
                    ...prev,
                    cadenceBand: option,
                  }));
                  trackChoice('cadence_band', option);
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
    flexDirection: 'row-reverse',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  titleContainer: {
    marginTop: 12,
    alignItems: 'flex-end',
    gap: 4,
  },
  title: {
    fontSize: 24,
    fontWeight: '900',
    color: '#111827',
    textAlign: 'right',
  },
  contextText: {
    fontSize: 13,
    fontWeight: '700',
    color: '#64748B',
    textAlign: 'right',
  },
  optionsContainer: {
    marginTop: 16,
    gap: 10,
  },
  footer: {
    marginTop: 'auto',
  },
});
