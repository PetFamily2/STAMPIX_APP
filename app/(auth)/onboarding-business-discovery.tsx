import { Ionicons } from '@expo/vector-icons';
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
import { useOnboardingTracking } from '@/lib/onboarding/useOnboardingTracking';

type DiscoverySourceId =
  | 'referral'
  | 'search'
  | 'social'
  | 'tiktok'
  | 'app_store'
  | 'in_app'
  | 'other';

const TEXT = {
  title:
    '\u05d0\u05d9\u05da \u05d4\u05d2\u05e2\u05ea\u05dd \u05d0\u05dc\u05d9\u05e0\u05d5?',
};

const DISCOVERY_SOURCES: Array<{
  id: DiscoverySourceId;
  title: string;
  icon: keyof typeof Ionicons.glyphMap;
}> = [
  {
    id: 'referral',
    title:
      '\u05d4\u05de\u05dc\u05e6\u05d4 \u05de\u05d7\u05d1\u05e8 \u05d0\u05d5 \u05de\u05d1\u05e2\u05dc \u05e2\u05e1\u05e7',
    icon: 'people-outline',
  },
  {
    id: 'search',
    title: '\u05d7\u05d9\u05e4\u05d5\u05e9 \u05d1\u05d2\u05d5\u05d2\u05dc',
    icon: 'search-outline',
  },
  {
    id: 'social',
    title:
      '\u05e8\u05e9\u05ea\u05d5\u05ea \u05d7\u05d1\u05e8\u05ea\u05d9\u05d5\u05ea',
    icon: 'share-social-outline',
  },
  {
    id: 'tiktok',
    title: '\u05d8\u05d9\u05e7\u05d8\u05d5\u05e7',
    icon: 'logo-tiktok',
  },
  {
    id: 'app_store',
    title:
      '\u05d7\u05e0\u05d5\u05ea \u05d4\u05d0\u05e4\u05dc\u05d9\u05e7\u05e6\u05d9\u05d5\u05ea',
    icon: 'apps-outline',
  },
  {
    id: 'in_app',
    title:
      '\u05d3\u05e8\u05da \u05d4\u05d0\u05e4\u05dc\u05d9\u05e7\u05e6\u05d9\u05d4',
    icon: 'phone-portrait-outline',
  },
  { id: 'other', title: '\u05d0\u05d7\u05e8', icon: 'ellipsis-horizontal' },
];

export default function OnboardingBusinessDiscoveryScreen() {
  const { businessOnboardingDraft, setBusinessOnboardingDraft } =
    useOnboarding();
  const selected =
    businessOnboardingDraft.discoverySource as DiscoverySourceId | null;
  const canContinue = Boolean(selected);
  const { completeStep, trackChoice, trackContinue } = useOnboardingTracking({
    screen: 'onboarding_business_discovery',
    role: 'business',
  });

  const handleContinue = () => {
    if (!canContinue) {
      return;
    }

    trackContinue();
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
    marginTop: 32,
    alignItems: 'flex-end',
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
