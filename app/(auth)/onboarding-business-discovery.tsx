import { Ionicons } from '@expo/vector-icons';
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

type DiscoverySourceId =
  | 'referral'
  | 'search'
  | 'social'
  | 'tiktok'
  | 'app_store'
  | 'other';

const TEXT = {
  title:
    '\u05d0\u05d9\u05da \u05d4\u05d2\u05e2\u05ea\u05dd \u05d0\u05dc\u05d9\u05e0\u05d5?',
  subtitle:
    '\u05db\u05d3\u05d9 \u05e9\u05e0\u05e9\u05e4\u05e8 \u05d0\u05ea \u05d7\u05d5\u05d5\u05d9\u05d9\u05ea \u05d4\u05d4\u05ea\u05d7\u05dc\u05d4 \u05e9\u05dc\u05db\u05dd.',
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
  { id: 'other', title: '\u05d0\u05d7\u05e8', icon: 'ellipsis-horizontal' },
];

export default function OnboardingBusinessDiscoveryScreen() {
  const [selected, setSelected] = useState<DiscoverySourceId | null>(null);
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
            onPress={() => safeBack(BUSINESS_ONBOARDING_ROUTES.role)}
          />
          <OnboardingProgress
            total={BUSINESS_ONBOARDING_TOTAL_STEPS}
            current={BUSINESS_ONBOARDING_PROGRESS.discovery}
          />
        </View>

        <View style={styles.titleContainer}>
          <Text style={styles.title}>{TEXT.title}</Text>
          <Text style={styles.subtitle}>{TEXT.subtitle}</Text>
        </View>

        <View style={styles.optionsContainer}>
          {DISCOVERY_SOURCES.map((source) => {
            const isSelected = selected === source.id;
            return (
              <Pressable
                key={source.id}
                onPress={() => {
                  setSelected(source.id);
                  trackChoice('discovery_source', source.id);
                }}
                accessibilityRole="button"
                accessibilityState={{ selected: isSelected }}
              >
                <View
                  style={[
                    styles.option,
                    isSelected
                      ? styles.optionSelected
                      : styles.optionUnselected,
                  ]}
                >
                  <View style={styles.optionContent}>
                    <View style={styles.iconContainer}>
                      <Ionicons
                        name={source.icon}
                        size={20}
                        color={isSelected ? '#FFFFFF' : '#2563EB'}
                      />
                    </View>
                    <Text
                      style={[
                        styles.optionText,
                        isSelected
                          ? styles.optionTextSelected
                          : styles.optionTextUnselected,
                      ]}
                    >
                      {source.title}
                    </Text>
                  </View>
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
  option: {
    borderRadius: 16,
    paddingHorizontal: 20,
    paddingVertical: 16,
    borderWidth: 1,
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.1,
    shadowRadius: 2,
    elevation: 2,
  },
  optionSelected: {
    backgroundColor: '#2563EB',
    borderColor: '#2563EB',
    shadowColor: '#93C5FD',
  },
  optionUnselected: {
    backgroundColor: '#FFFFFF',
    borderColor: '#E5E7EB',
    shadowColor: '#9CA3AF',
  },
  optionContent: {
    flexDirection: 'row-reverse',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  iconContainer: {
    height: 32,
    width: 32,
    alignItems: 'center',
    justifyContent: 'center',
  },
  optionText: {
    flex: 1,
    fontSize: 16,
    fontWeight: '900',
    textAlign: 'right',
  },
  optionTextSelected: {
    color: '#FFFFFF',
  },
  optionTextUnselected: {
    color: '#111827',
  },
  footer: {
    marginTop: 'auto',
  },
});
