import { Ionicons } from '@expo/vector-icons';
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
import {
  BUSINESS_EXAMPLE_DEFAULTS,
  BUSINESS_EXAMPLES,
  type BusinessExampleId,
} from '@/lib/onboarding/businessOnboardingOptions';
import { useBusinessOnboardingDraftPersistence } from '@/lib/onboarding/useBusinessOnboardingDraftPersistence';
import { useOnboardingTracking } from '@/lib/onboarding/useOnboardingTracking';

const TEXT = {
  title: 'איזה סוג עסק זה?',
};

export default function OnboardingBusinessTypeScreen() {
  const { businessOnboardingDraft, setBusinessOnboardingDraft } =
    useOnboarding();
  const { saveStep } = useBusinessOnboardingDraftPersistence();
  const didSyncStepRef = useRef(false);
  const selectedBusinessExample =
    (businessOnboardingDraft.businessExample as BusinessExampleId | null) ??
    null;
  const canContinue = selectedBusinessExample !== null;
  const { completeStep, trackChoice, trackContinue } = useOnboardingTracking({
    screen: 'onboarding_business_type',
    role: 'business',
  });

  useEffect(() => {
    if (didSyncStepRef.current) {
      return;
    }
    didSyncStepRef.current = true;
    void saveStep({ step: 'businessType' }).catch(() => {});
  }, [saveStep]);

  const selectBusinessExample = (id: BusinessExampleId) => {
    const defaults = BUSINESS_EXAMPLE_DEFAULTS[id];
    setBusinessOnboardingDraft((prev) => ({
      ...prev,
      businessExample: id,
      cadenceBand: defaults.cadenceBand,
      birthdayCampaignRelevant: defaults.birthdayCampaignRelevant,
      joinAnniversaryCampaignRelevant: defaults.joinAnniversaryCampaignRelevant,
      weakTimePromosRelevant: defaults.weakTimePromosRelevant,
    }));
    trackChoice('business_example', id);
  };

  const handleContinue = async () => {
    if (!canContinue) {
      return;
    }

    trackContinue();
    try {
      await saveStep({ step: 'businessType' });
    } catch {
      // Keep onboarding flow moving even if draft persistence fails.
    }

    completeStep({
      business_example: selectedBusinessExample,
    });

    safePush(BUSINESS_ONBOARDING_ROUTES.businessCadence);
  };

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.content}>
        <View style={styles.header}>
          <BackButton
            onPress={() =>
              safeDismissTo(BUSINESS_ONBOARDING_ROUTES.usageArea)
            }
          />
          <OnboardingProgress
            total={BUSINESS_ONBOARDING_TOTAL_STEPS}
            current={BUSINESS_ONBOARDING_PROGRESS.businessType}
          />
        </View>

        <View style={styles.titleContainer}>
          <Text style={styles.title}>{TEXT.title}</Text>
        </View>

        <View style={styles.optionsContainer}>
          {BUSINESS_EXAMPLES.map((example) => {
            const isSelected = selectedBusinessExample === example.id;
            return (
              <OnboardingChoiceButton
                key={example.id}
                selected={isSelected}
                label={example.title}
                pressableStyle={styles.optionPressable}
                labelNumberOfLines={2}
                labelAdjustsFontSizeToFit={true}
                labelMinimumFontScale={0.8}
                onPress={() => selectBusinessExample(example.id)}
                icon={
                  <Ionicons
                    name={example.icon}
                    size={20}
                    color={isSelected ? '#FFFFFF' : '#2563EB'}
                  />
                }
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
    marginTop: 12,
    alignItems: 'flex-end',
  },
  title: {
    fontSize: 24,
    fontWeight: '900',
    color: '#111827',
    textAlign: 'right',
  },
  optionsContainer: {
    marginTop: 16,
    flexDirection: 'row-reverse',
    flexWrap: 'wrap',
    justifyContent: 'space-between',
    gap: 10,
  },
  optionPressable: {
    width: '48%',
  },
  footer: {
    marginTop: 'auto',
  },
});
