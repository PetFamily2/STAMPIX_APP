import { Ionicons } from '@expo/vector-icons';
import { useLocalSearchParams } from 'expo-router';
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
import { flexDirection } from '@/lib/rtl';

type UsageAreaId = 'nearby' | 'citywide' | 'online' | 'multiple';
const TEXT = {
  title: 'באילו אזורים העסק פעיל?',
  subtitle: 'זה עוזר לנו להתאים את החוויה לעסק שלך',
};

const USAGE_AREAS: Array<{
  id: UsageAreaId;
  title: string;
  icon: keyof typeof Ionicons.glyphMap;
}> = [
  {
    id: 'nearby',
    title: 'באזור העסק שלי',
    icon: 'location-outline',
  },
  {
    id: 'citywide',
    title: 'ברחבי העיר',
    icon: 'navigate-outline',
  },
  {
    id: 'online',
    title: 'באונליין',
    icon: 'phone-portrait-outline',
  },
  {
    id: 'multiple',
    title: 'בכמה סניפים',
    icon: 'business-outline',
  },
];

export default function OnboardingBusinessUsageAreaScreen() {
  const { businessName: businessNameFromParams } = useLocalSearchParams<{
    businessName?: string;
  }>();
  const { businessOnboardingDraft, setBusinessOnboardingDraft } =
    useOnboarding();
  const { saveStep } = useBusinessOnboardingDraftPersistence();
  const didSyncStepRef = useRef(false);
  const selected = businessOnboardingDraft.usageAreas as UsageAreaId[];
  const canContinue = selected.length > 0;
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
    });

    safePush(BUSINESS_ONBOARDING_ROUTES.businessType);
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
});
