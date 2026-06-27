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
import { useBusinessOnboardingDraftPersistence } from '@/lib/onboarding/useBusinessOnboardingDraftPersistence';
import { useOnboardingTracking } from '@/lib/onboarding/useOnboardingTracking';
import { alignItems, flexDirection } from '@/lib/rtl';

type DiscoverySourceId =
  | 'referral'
  | 'search'
  | 'social'
  | 'tiktok'
  | 'app_store'
  | 'in_app'
  | 'other';

const TEXT = {
  title: 'איך הגעתם אלינו?',
};

const DISCOVERY_SOURCES: Array<{
  id: DiscoverySourceId;
  title: string;
  icon: keyof typeof Ionicons.glyphMap;
}> = [
  {
    id: 'referral',
    title: 'המלצה מחבר או מבעל עסק',
    icon: 'people-outline',
  },
  {
    id: 'search',
    title: 'חיפוש בגוגל',
    icon: 'search-outline',
  },
  {
    id: 'social',
    title: 'רשתות חברתיות',
    icon: 'share-social-outline',
  },
  {
    id: 'tiktok',
    title: 'טיקטוק',
    icon: 'logo-tiktok',
  },
  {
    id: 'app_store',
    title: 'חנות האפליקציות',
    icon: 'apps-outline',
  },
  {
    id: 'in_app',
    title: 'דרך האפליקציה',
    icon: 'phone-portrait-outline',
  },
  { id: 'other', title: 'אחר', icon: 'ellipsis-horizontal' },
];

export default function OnboardingBusinessDiscoveryScreen() {
  const { businessOnboardingDraft, setBusinessOnboardingDraft } =
    useOnboarding();
  const { saveStep } = useBusinessOnboardingDraftPersistence();
  const didSyncStepRef = useRef(false);
  const selected =
    businessOnboardingDraft.discoverySource as DiscoverySourceId | null;
  const canContinue = Boolean(selected);
  const { completeStep, trackChoice, trackContinue } = useOnboardingTracking({
    screen: 'onboarding_business_discovery',
    role: 'business',
  });

  useEffect(() => {
    if (didSyncStepRef.current) {
      return;
    }
    didSyncStepRef.current = true;
    void saveStep({ step: 'discovery' }).catch(() => {});
  }, [saveStep]);

  const handleContinue = async () => {
    if (!canContinue) {
      return;
    }

    trackContinue();
    try {
      await saveStep({ step: 'discovery' });
    } catch {
      // Keep onboarding flow moving even if draft persistence fails.
    }
    completeStep({ discovery_source: selected });
    safePush(BUSINESS_ONBOARDING_ROUTES.reason);
  };

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.content}>
        <View style={styles.header}>
          <BackButton
            onPress={() => safeDismissTo(BUSINESS_ONBOARDING_ROUTES.role)}
          />
          <OnboardingProgress
            total={BUSINESS_ONBOARDING_TOTAL_STEPS}
            current={BUSINESS_ONBOARDING_PROGRESS.discovery}
          />
        </View>

        <View style={styles.titleContainer}>
          <Text style={styles.title} numberOfLines={1}>
            {TEXT.title}
          </Text>
        </View>

        <View style={styles.optionsContainer}>
          {DISCOVERY_SOURCES.map((source) => {
            const isSelected = selected === source.id;
            return (
              <OnboardingChoiceButton
                key={source.id}
                selected={isSelected}
                label={source.title}
                onPress={() => {
                  setBusinessOnboardingDraft((prev) => ({
                    ...prev,
                    discoverySource: source.id,
                  }));
                  trackChoice('discovery_source', source.id);
                }}
                icon={
                  <Ionicons
                    name={source.icon}
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
    alignItems: alignItems.start,
    width: '100%',
  },
  title: {
    fontSize: 24,
    fontWeight: '900',
    color: '#111827',
    width: '100%',
    textAlign: 'right',
    writingDirection: 'rtl',
    lineHeight: 32,
  },
  optionsContainer: {
    marginTop: 32,
    gap: 12,
  },
  footer: {
    marginTop: 'auto',
  },
});
