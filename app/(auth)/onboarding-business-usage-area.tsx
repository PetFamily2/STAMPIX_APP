import { Ionicons } from '@expo/vector-icons';
import { useLocalSearchParams } from 'expo-router';
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

type UsageAreaId = 'nearby' | 'citywide' | 'online' | 'multiple';

const TEXT = {
  title:
    '\u05d1\u05d0\u05d9\u05dc\u05d5 \u05d0\u05d6\u05d5\u05e8\u05d9\u05dd \u05d4\u05e2\u05e1\u05e7 \u05e4\u05e2\u05d9\u05dc \u05d4\u05d9\u05d5\u05dd?\n\u05d1\u05d5\u05d7\u05e8\u05d9\u05dd \u05e2\u05d3 3 \u05d0\u05e4\u05e9\u05e8\u05d5\u05d9\u05d5\u05ea',
  subtitle:
    '\u05d6\u05d4 \u05e2\u05d5\u05d6\u05e8 \u05dc\u05e0\u05d5 \u05dc\u05d4\u05ea\u05d0\u05d9\u05dd \u05d0\u05ea \u05d4\u05d7\u05d5\u05d5\u05d9\u05d4 \u05dc\u05e2\u05e1\u05e7 \u05e9\u05dc\u05da.',
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
    title:
      '\u05d1\u05d0\u05d5\u05e0\u05dc\u05d9\u05d9\u05df \u05d1\u05dc\u05d1\u05d3',
    icon: 'phone-portrait-outline',
  },
  {
    id: 'multiple',
    title: '\u05d1\u05db\u05de\u05d4 \u05e1\u05e0\u05d9\u05e4\u05d9\u05dd',
    icon: 'business-outline',
  },
];

export default function OnboardingBusinessUsageAreaScreen() {
  const { businessName } = useLocalSearchParams<{ businessName?: string }>();
  const [selected, setSelected] = useState<UsageAreaId[]>([]);
  const canContinue = selected.length > 0;
  const { completeStep, trackChoice, trackContinue } = useOnboardingTracking({
    screen: 'onboarding_business_usage_area',
    role: 'business',
  });

  const toggleArea = (id: UsageAreaId) => {
    setSelected((prev) => {
      if (prev.includes(id)) {
        trackChoice('usage_area', id, { selected: false });
        return prev.filter((item) => item !== id);
      }
      if (prev.length >= 3) {
        return prev;
      }
      trackChoice('usage_area', id, { selected: true });
      return [...prev, id];
    });
  };

  const handleContinue = () => {
    if (!canContinue) {
      return;
    }
    trackContinue();
    completeStep({
      areas_count: selected.length,
      areas_values: selected,
    });

    const encodedName =
      typeof businessName === 'string' && businessName.trim().length > 0
        ? encodeURIComponent(businessName.trim())
        : '';
    const nextHref = encodedName
      ? `${BUSINESS_ONBOARDING_ROUTES.createBusiness}?businessName=${encodedName}`
      : BUSINESS_ONBOARDING_ROUTES.createBusiness;

    safePush(nextHref);
  };

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.content}>
        <View style={styles.header}>
          <BackButton
            onPress={() => safeBack(BUSINESS_ONBOARDING_ROUTES.name)}
          />
          <OnboardingProgress
            total={BUSINESS_ONBOARDING_TOTAL_STEPS}
            current={BUSINESS_ONBOARDING_PROGRESS.usageArea}
          />
        </View>

        <View style={styles.titleContainer}>
          <Text style={styles.title}>{TEXT.title}</Text>
          <Text style={styles.subtitle}>{TEXT.subtitle}</Text>
        </View>

        <View style={styles.optionsContainer}>
          {USAGE_AREAS.map((area) => {
            const isSelected = selected.includes(area.id);
            return (
              <Pressable
                key={area.id}
                onPress={() => toggleArea(area.id)}
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
                        name={area.icon}
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
                      {area.title}
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
    lineHeight: 20,
  },
  optionsContainer: {
    marginTop: 32,
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
