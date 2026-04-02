import { useEffect, useRef } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { BackButton } from '@/components/BackButton';
import { ContinueButton } from '@/components/ContinueButton';
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

const TEXT = {
  title: 'איזה קמפיינים רלוונטיים?',
  yes: 'כן',
  no: 'לא',
};

function ToggleRow({
  title,
  value,
  onSelect,
}: {
  title: string;
  value: boolean | null;
  onSelect: (next: boolean) => void;
}) {
  return (
    <View style={styles.toggleRow}>
      <Text style={styles.toggleTitle}>{title}</Text>
      <View style={styles.toggleButtons}>
        <Pressable
          onPress={() => onSelect(false)}
          style={[
            styles.toggleButton,
            value === false ? styles.toggleButtonSelected : null,
          ]}
        >
          <Text
            style={[
              styles.toggleButtonText,
              value === false ? styles.toggleButtonTextSelected : null,
            ]}
          >
            {TEXT.no}
          </Text>
        </Pressable>
        <Pressable
          onPress={() => onSelect(true)}
          style={[
            styles.toggleButton,
            value === true ? styles.toggleButtonSelected : null,
          ]}
        >
          <Text
            style={[
              styles.toggleButtonText,
              value === true ? styles.toggleButtonTextSelected : null,
            ]}
          >
            {TEXT.yes}
          </Text>
        </Pressable>
      </View>
    </View>
  );
}

export default function OnboardingBusinessCampaignRelevanceScreen() {
  const { businessOnboardingDraft, setBusinessOnboardingDraft } =
    useOnboarding();
  const { saveStep } = useBusinessOnboardingDraftPersistence();
  const didSyncStepRef = useRef(false);
  const birthdayCampaignRelevant =
    businessOnboardingDraft.birthdayCampaignRelevant;
  const joinAnniversaryCampaignRelevant =
    businessOnboardingDraft.joinAnniversaryCampaignRelevant;
  const weakTimePromosRelevant = businessOnboardingDraft.weakTimePromosRelevant;
  const canContinue =
    birthdayCampaignRelevant !== null &&
    joinAnniversaryCampaignRelevant !== null &&
    weakTimePromosRelevant !== null;
  const { completeStep, trackChoice, trackContinue } = useOnboardingTracking({
    screen: 'onboarding_business_campaign_relevance',
    role: 'business',
  });

  useEffect(() => {
    if (didSyncStepRef.current) {
      return;
    }
    didSyncStepRef.current = true;
    void saveStep({ step: 'businessCampaignRelevance' }).catch(() => {});
  }, [saveStep]);

  const updateField = (
    field:
      | 'birthdayCampaignRelevant'
      | 'joinAnniversaryCampaignRelevant'
      | 'weakTimePromosRelevant',
    value: boolean
  ) => {
    setBusinessOnboardingDraft((prev) => ({
      ...prev,
      [field]: value,
    }));
    trackChoice(field, value ? 'yes' : 'no');
  };

  const handleContinue = async () => {
    if (!canContinue) {
      return;
    }

    trackContinue();
    try {
      await saveStep({ step: 'businessCampaignRelevance' });
    } catch {
      // Keep onboarding flow moving even if draft persistence fails.
    }

    completeStep({
      birthday_relevant: birthdayCampaignRelevant,
      join_anniversary_relevant: joinAnniversaryCampaignRelevant,
      weak_time_relevant: weakTimePromosRelevant,
    });

    safePush(BUSINESS_ONBOARDING_ROUTES.plan);
  };

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.content}>
        <View style={styles.header}>
          <BackButton
            onPress={() =>
              safeDismissTo(BUSINESS_ONBOARDING_ROUTES.businessCadence)
            }
          />
          <OnboardingProgress
            total={BUSINESS_ONBOARDING_TOTAL_STEPS}
            current={BUSINESS_ONBOARDING_PROGRESS.businessCampaignRelevance}
          />
        </View>

        <View style={styles.titleContainer}>
          <Text style={styles.title}>{TEXT.title}</Text>
        </View>

        <View style={styles.rowsContainer}>
          <ToggleRow
            title="יום הולדת"
            value={birthdayCampaignRelevant}
            onSelect={(value) =>
              updateField('birthdayCampaignRelevant', value)
            }
          />
          <ToggleRow
            title="יום הצטרפות"
            value={joinAnniversaryCampaignRelevant}
            onSelect={(value) =>
              updateField('joinAnniversaryCampaignRelevant', value)
            }
          />
          <ToggleRow
            title="שעות / ימים חלשים"
            value={weakTimePromosRelevant}
            onSelect={(value) => updateField('weakTimePromosRelevant', value)}
          />
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
  rowsContainer: {
    marginTop: 16,
    gap: 10,
  },
  toggleRow: {
    borderWidth: 1,
    borderColor: '#E5E7EB',
    borderRadius: 14,
    backgroundColor: '#FFFFFF',
    paddingHorizontal: 12,
    paddingVertical: 10,
    gap: 8,
  },
  toggleTitle: {
    fontSize: 14,
    fontWeight: '800',
    color: '#111827',
    textAlign: 'right',
  },
  toggleButtons: {
    flexDirection: 'row-reverse',
    gap: 8,
  },
  toggleButton: {
    flex: 1,
    borderWidth: 1,
    borderColor: '#D1D5DB',
    borderRadius: 10,
    paddingVertical: 8,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#F9FAFB',
  },
  toggleButtonSelected: {
    borderColor: '#2563EB',
    backgroundColor: '#EAF1FF',
  },
  toggleButtonText: {
    fontSize: 13,
    fontWeight: '800',
    color: '#334155',
  },
  toggleButtonTextSelected: {
    color: '#1D4ED8',
  },
  footer: {
    marginTop: 'auto',
  },
});
