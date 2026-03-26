import { Ionicons } from '@expo/vector-icons';
import { useLocalSearchParams } from 'expo-router';
import { useEffect, useRef } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
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

type UsageAreaId = 'nearby' | 'citywide' | 'online' | 'multiple';
type BusinessExampleId =
  | 'hair_salon'
  | 'cafe_restaurant'
  | 'greengrocer_retail_produce'
  | 'tire_shop_puncture'
  | 'clinic'
  | 'fitness_studio'
  | 'repair_maintenance'
  | 'other';

const TEXT = {
  title:
    '\u05d1\u05d0\u05d9\u05dc\u05d5 \u05d0\u05d6\u05d5\u05e8\u05d9\u05dd \u05d4\u05e2\u05e1\u05e7 \u05e4\u05e2\u05d9\u05dc?',
  subtitle:
    '\u05d6\u05d4 \u05e2\u05d5\u05d6\u05e8 \u05dc\u05e0\u05d5 \u05dc\u05d4\u05ea\u05d0\u05d9\u05dd \u05d0\u05ea \u05d4\u05d7\u05d5\u05d5\u05d9\u05d4 \u05dc\u05e2\u05e1\u05e7 \u05e9\u05dc\u05da',
  exampleTitle:
    '\u05d0\u05d9\u05d6\u05d4 \u05e2\u05e1\u05e7 \u05de\u05ea\u05d0\u05d9\u05dd \u05d4\u05db\u05d9 \u05d8\u05d5\u05d1?',
  exampleSubtitle:
    '\u05d4\u05de\u05d9\u05e4\u05d5\u05d9 \u05d4\u05d6\u05d4 \u05de\u05ea\u05e8\u05d2\u05dd \u05d0\u05ea \u05d4\u05e2\u05e1\u05e7 \u05dc-service type, business model \u05d5-cadence \u05dc\u05d7\u05d9\u05e9\u05d5\u05d1\u05d9 \u05dc\u05d9\u05d1\u05d4.',
  relevanceTitle:
    '\u05e8\u05dc\u05d5\u05d5\u05e0\u05d8\u05d9\u05d5\u05ea \u05e7\u05de\u05e4\u05d9\u05d9\u05e0\u05d9\u05dd',
  relevanceSubtitle:
    '\u05e0\u05d3\u05e8\u05e9 \u05dc\u05d0\u05e9\u05e8 \u05de\u05e4\u05d5\u05e8\u05e9\u05d5\u05ea \u05d0\u05dd \u05dc\u05d4\u05e6\u05d9\u05e2 \u05e7\u05de\u05e4\u05d9\u05d9\u05e0\u05d9 \u05d9\u05d5\u05dd \u05d4\u05d5\u05dc\u05d3\u05ea, \u05d9\u05d5\u05dd \u05d4\u05e6\u05d8\u05e8\u05e4\u05d5\u05ea \u05d5\u05e9\u05e2\u05d5\u05ea/\u05d9\u05de\u05d9\u05dd \u05d7\u05dc\u05e9\u05d9\u05dd.',
  yes: '\u05db\u05df',
  no: '\u05dc\u05d0',
};

const USAGE_AREAS: Array<{
  id: UsageAreaId;
  title: string;
  icon: keyof typeof Ionicons.glyphMap;
}> = [
  {
    id: 'nearby',
    title:
      '\u05d1\u05d0\u05d6\u05d5\u05e8 \u05d4\u05e2\u05e1\u05e7 \u05e9\u05dc\u05d9',
    icon: 'location-outline',
  },
  {
    id: 'citywide',
    title: '\u05d1\u05e8\u05d7\u05d1\u05d9 \u05d4\u05e2\u05d9\u05e8',
    icon: 'navigate-outline',
  },
  {
    id: 'online',
    title: '\u05d1\u05d0\u05d5\u05e0\u05dc\u05d9\u05d9\u05df',
    icon: 'phone-portrait-outline',
  },
  {
    id: 'multiple',
    title: '\u05d1\u05db\u05de\u05d4 \u05e1\u05e0\u05d9\u05e4\u05d9\u05dd',
    icon: 'business-outline',
  },
];

const BUSINESS_EXAMPLES: Array<{
  id: BusinessExampleId;
  title: string;
  mappingLabel: string;
  icon: keyof typeof Ionicons.glyphMap;
}> = [
  {
    id: 'hair_salon',
    title:
      '\u05de\u05e1\u05e4\u05e8\u05d4 / \u05e1\u05dc\u05d5\u05df \u05e9\u05d9\u05e2\u05e8',
    mappingLabel: 'beauty \u2022 service \u2022 monthly',
    icon: 'cut-outline',
  },
  {
    id: 'cafe_restaurant',
    title: '\u05e7\u05e4\u05d4 / \u05de\u05e1\u05e2\u05d3\u05d4',
    mappingLabel: 'food_drink \u2022 mixed \u2022 weekly',
    icon: 'restaurant-outline',
  },
  {
    id: 'greengrocer_retail_produce',
    title:
      '\u05d9\u05e8\u05e7\u05e0\u05d9\u05d9\u05d4 / \u05e7\u05de\u05e2\u05d5\u05e0\u05d0\u05d5\u05ea \u05ea\u05d5\u05e6\u05e8\u05ea',
    mappingLabel: 'retail \u2022 product \u2022 weekly',
    icon: 'leaf-outline',
  },
  {
    id: 'tire_shop_puncture',
    title:
      '\u05e4\u05e0\u05e6\u05e8\u05d9\u05d4 / \u05e6\u05de\u05d9\u05d2\u05d9\u05dd',
    mappingLabel: 'professional_services \u2022 service \u2022 irregular',
    icon: 'car-sport-outline',
  },
  {
    id: 'clinic',
    title: '\u05e7\u05dc\u05d9\u05e0\u05d9\u05e7\u05d4',
    mappingLabel: 'health_wellness \u2022 service \u2022 quarterly',
    icon: 'medkit-outline',
  },
  {
    id: 'fitness_studio',
    title: '\u05e1\u05d8\u05d5\u05d3\u05d9\u05d5 \u05db\u05d5\u05e9\u05e8',
    mappingLabel: 'fitness \u2022 service \u2022 weekly',
    icon: 'barbell-outline',
  },
  {
    id: 'repair_maintenance',
    title:
      '\u05e9\u05d9\u05e8\u05d5\u05ea\u05d9 \u05ea\u05d9\u05e7\u05d5\u05df / \u05ea\u05d7\u05d6\u05d5\u05e7\u05d4',
    mappingLabel: 'professional_services \u2022 service \u2022 quarterly',
    icon: 'construct-outline',
  },
  {
    id: 'other',
    title: '\u05e2\u05e1\u05e7 \u05d0\u05d7\u05e8',
    mappingLabel: 'other \u2022 mixed \u2022 monthly',
    icon: 'apps-outline',
  },
];

const BUSINESS_EXAMPLE_DEFAULTS: Record<
  BusinessExampleId,
  {
    birthdayCampaignRelevant: boolean;
    joinAnniversaryCampaignRelevant: boolean;
    weakTimePromosRelevant: boolean;
  }
> = {
  hair_salon: {
    birthdayCampaignRelevant: true,
    joinAnniversaryCampaignRelevant: true,
    weakTimePromosRelevant: true,
  },
  cafe_restaurant: {
    birthdayCampaignRelevant: true,
    joinAnniversaryCampaignRelevant: false,
    weakTimePromosRelevant: true,
  },
  greengrocer_retail_produce: {
    birthdayCampaignRelevant: false,
    joinAnniversaryCampaignRelevant: false,
    weakTimePromosRelevant: true,
  },
  tire_shop_puncture: {
    birthdayCampaignRelevant: false,
    joinAnniversaryCampaignRelevant: false,
    weakTimePromosRelevant: false,
  },
  clinic: {
    birthdayCampaignRelevant: false,
    joinAnniversaryCampaignRelevant: false,
    weakTimePromosRelevant: false,
  },
  fitness_studio: {
    birthdayCampaignRelevant: true,
    joinAnniversaryCampaignRelevant: true,
    weakTimePromosRelevant: true,
  },
  repair_maintenance: {
    birthdayCampaignRelevant: false,
    joinAnniversaryCampaignRelevant: false,
    weakTimePromosRelevant: false,
  },
  other: {
    birthdayCampaignRelevant: false,
    joinAnniversaryCampaignRelevant: false,
    weakTimePromosRelevant: true,
  },
};

function RelevanceToggleRow({
  title,
  subtitle,
  value,
  onSelect,
}: {
  title: string;
  subtitle: string;
  value: boolean | null;
  onSelect: (next: boolean) => void;
}) {
  return (
    <View style={styles.relevanceRow}>
      <Text style={styles.relevanceRowTitle}>{title}</Text>
      <Text style={styles.relevanceRowSubtitle}>{subtitle}</Text>
      <View style={styles.relevanceRowButtons}>
        <Pressable
          onPress={() => onSelect(false)}
          style={[
            styles.relevanceButton,
            value === false ? styles.relevanceButtonSelected : null,
          ]}
        >
          <Text
            style={[
              styles.relevanceButtonLabel,
              value === false ? styles.relevanceButtonLabelSelected : null,
            ]}
          >
            {TEXT.no}
          </Text>
        </Pressable>
        <Pressable
          onPress={() => onSelect(true)}
          style={[
            styles.relevanceButton,
            value === true ? styles.relevanceButtonSelected : null,
          ]}
        >
          <Text
            style={[
              styles.relevanceButtonLabel,
              value === true ? styles.relevanceButtonLabelSelected : null,
            ]}
          >
            {TEXT.yes}
          </Text>
        </Pressable>
      </View>
    </View>
  );
}

export default function OnboardingBusinessUsageAreaScreen() {
  const { businessName: businessNameFromParams } = useLocalSearchParams<{
    businessName?: string;
  }>();
  const { businessOnboardingDraft, setBusinessOnboardingDraft } =
    useOnboarding();
  const { saveStep } = useBusinessOnboardingDraftPersistence();
  const didSyncStepRef = useRef(false);
  const selected = businessOnboardingDraft.usageAreas as UsageAreaId[];
  const selectedBusinessExample =
    (businessOnboardingDraft.businessExample as BusinessExampleId | null) ??
    null;
  const birthdayCampaignRelevant =
    businessOnboardingDraft.birthdayCampaignRelevant;
  const joinAnniversaryCampaignRelevant =
    businessOnboardingDraft.joinAnniversaryCampaignRelevant;
  const weakTimePromosRelevant = businessOnboardingDraft.weakTimePromosRelevant;
  const canContinue =
    selected.length > 0 &&
    selectedBusinessExample !== null &&
    birthdayCampaignRelevant !== null &&
    joinAnniversaryCampaignRelevant !== null &&
    weakTimePromosRelevant !== null;
  const { completeStep, trackChoice, trackContinue } = useOnboardingTracking({
    screen: 'onboarding_business_usage_area',
    role: 'business',
  });

  useEffect(() => {
    if (didSyncStepRef.current) {
      return;
    }
    didSyncStepRef.current = true;
    void saveStep({ step: 'usageArea' }).catch(() => {});
  }, [saveStep]);

  useEffect(() => {
    if (businessOnboardingDraft.businessName.trim().length > 0) {
      return;
    }
    if (
      typeof businessNameFromParams !== 'string' ||
      businessNameFromParams.trim().length === 0
    ) {
      return;
    }
    setBusinessOnboardingDraft((prev) => ({
      ...prev,
      businessName: businessNameFromParams.trim(),
    }));
  }, [
    businessNameFromParams,
    businessOnboardingDraft.businessName,
    setBusinessOnboardingDraft,
  ]);

  const toggleArea = (id: UsageAreaId) => {
    setBusinessOnboardingDraft((prev) => {
      if (prev.usageAreas.includes(id)) {
        trackChoice('usage_area', id, { selected: false });
        return {
          ...prev,
          usageAreas: prev.usageAreas.filter((item) => item !== id),
        };
      }
      trackChoice('usage_area', id, { selected: true });
      return {
        ...prev,
        usageAreas: [...prev.usageAreas, id],
      };
    });
  };

  const selectBusinessExample = (id: BusinessExampleId) => {
    const defaults = BUSINESS_EXAMPLE_DEFAULTS[id];
    setBusinessOnboardingDraft((prev) => ({
      ...prev,
      businessExample: id,
      birthdayCampaignRelevant: defaults.birthdayCampaignRelevant,
      joinAnniversaryCampaignRelevant: defaults.joinAnniversaryCampaignRelevant,
      weakTimePromosRelevant: defaults.weakTimePromosRelevant,
    }));
    trackChoice('business_example', id);
  };

  const updateCampaignRelevance = (
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
      await saveStep({ step: 'usageArea' });
    } catch {
      // Keep onboarding flow moving even if draft persistence fails.
    }
    completeStep({
      areas_count: selected.length,
      areas_values: selected,
      business_example: selectedBusinessExample,
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
              safeDismissTo(BUSINESS_ONBOARDING_ROUTES.createBusiness)
            }
          />
          <OnboardingProgress
            total={BUSINESS_ONBOARDING_TOTAL_STEPS}
            current={BUSINESS_ONBOARDING_PROGRESS.usageArea}
          />
        </View>

        <View style={styles.titleContainer}>
          <Text style={styles.title}>{TEXT.title}</Text>
        </View>

        <View style={styles.optionsContainer}>
          {USAGE_AREAS.map((area) => {
            const isSelected = selected.includes(area.id);
            return (
              <OnboardingChoiceButton
                key={area.id}
                selected={isSelected}
                label={area.title}
                onPress={() => toggleArea(area.id)}
                icon={
                  <Ionicons
                    name={area.icon}
                    size={20}
                    color={isSelected ? '#FFFFFF' : '#2563EB'}
                  />
                }
              />
            );
          })}
        </View>

        <View style={styles.blockContainer}>
          <Text style={styles.blockTitle}>{TEXT.exampleTitle}</Text>
          <Text style={styles.blockSubtitle}>{TEXT.exampleSubtitle}</Text>
          <View style={styles.optionsContainer}>
            {BUSINESS_EXAMPLES.map((example) => {
              const isSelected = selectedBusinessExample === example.id;
              return (
                <OnboardingChoiceButton
                  key={example.id}
                  selected={isSelected}
                  label={`${example.title}\n${example.mappingLabel}`}
                  labelNumberOfLines={2}
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
        </View>

        <View style={styles.blockContainer}>
          <Text style={styles.blockTitle}>{TEXT.relevanceTitle}</Text>
          <Text style={styles.blockSubtitle}>{TEXT.relevanceSubtitle}</Text>
          <RelevanceToggleRow
            title="\u05e7\u05de\u05e4\u05d9\u05d9\u05df \u05d9\u05d5\u05dd \u05d4\u05d5\u05dc\u05d3\u05ea \u05e8\u05dc\u05d5\u05d5\u05e0\u05d8\u05d9 \u05dc\u05e2\u05e1\u05e7?"
            subtitle="\u05d0\u05dd \u05db\u05df, \u05d4\u05de\u05e2\u05e8\u05db\u05ea \u05ea\u05e6\u05d9\u05e2 Birthday opportunities."
            value={birthdayCampaignRelevant}
            onSelect={(value) =>
              updateCampaignRelevance('birthdayCampaignRelevant', value)
            }
          />
          <RelevanceToggleRow
            title="\u05e7\u05de\u05e4\u05d9\u05d9\u05df \u05d9\u05d5\u05dd \u05d4\u05e6\u05d8\u05e8\u05e4\u05d5\u05ea \u05e8\u05dc\u05d5\u05d5\u05e0\u05d8\u05d9 \u05dc\u05e2\u05e1\u05e7?"
            subtitle="\u05d0\u05dd \u05db\u05df, \u05d4\u05de\u05e2\u05e8\u05db\u05ea \u05ea\u05e6\u05d9\u05e2 Join Anniversary opportunities."
            value={joinAnniversaryCampaignRelevant}
            onSelect={(value) =>
              updateCampaignRelevance('joinAnniversaryCampaignRelevant', value)
            }
          />
          <RelevanceToggleRow
            title="\u05e7\u05de\u05e4\u05d9\u05d9\u05e0\u05d9 \u05e9\u05e2\u05d5\u05ea/\u05d9\u05de\u05d9\u05dd \u05d7\u05dc\u05e9\u05d9\u05dd \u05e8\u05dc\u05d5\u05d5\u05e0\u05d8\u05d9\u05d9\u05dd?"
            subtitle="\u05d0\u05dd \u05db\u05df, \u05d4\u05de\u05e2\u05e8\u05db\u05ea \u05ea\u05e6\u05d9\u05e2 Time-Based Promo opportunities."
            value={weakTimePromosRelevant}
            onSelect={(value) =>
              updateCampaignRelevance('weakTimePromosRelevant', value)
            }
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
  blockContainer: {
    marginTop: 28,
    gap: 8,
  },
  blockTitle: {
    fontSize: 17,
    fontWeight: '900',
    color: '#111827',
    textAlign: 'right',
  },
  blockSubtitle: {
    fontSize: 13,
    color: '#6b7280',
    textAlign: 'right',
    lineHeight: 18,
  },
  relevanceRow: {
    borderWidth: 1,
    borderColor: '#E5E7EB',
    borderRadius: 14,
    backgroundColor: '#FFFFFF',
    paddingHorizontal: 12,
    paddingVertical: 10,
    gap: 6,
  },
  relevanceRowTitle: {
    fontSize: 14,
    fontWeight: '800',
    color: '#111827',
    textAlign: 'right',
  },
  relevanceRowSubtitle: {
    fontSize: 12,
    color: '#6b7280',
    textAlign: 'right',
    lineHeight: 16,
  },
  relevanceRowButtons: {
    flexDirection: 'row-reverse',
    gap: 8,
  },
  relevanceButton: {
    flex: 1,
    borderWidth: 1,
    borderColor: '#D1D5DB',
    borderRadius: 10,
    paddingVertical: 8,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#F9FAFB',
  },
  relevanceButtonSelected: {
    borderColor: '#2563EB',
    backgroundColor: '#EAF1FF',
  },
  relevanceButtonLabel: {
    fontSize: 13,
    fontWeight: '800',
    color: '#334155',
  },
  relevanceButtonLabelSelected: {
    color: '#1D4ED8',
  },
  footer: {
    marginTop: 'auto',
  },
});
