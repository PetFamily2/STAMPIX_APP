import { Ionicons } from '@expo/vector-icons';
import { useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { BackButton } from '@/components/BackButton';
import { ContinueButton } from '@/components/ContinueButton';
import { OnboardingProgress } from '@/components/OnboardingProgress';
import { safeBack, safePush } from '@/lib/navigation';
import { useOnboardingTracking } from '@/lib/onboarding/useOnboardingTracking';

type UsageAreaId = 'nearby' | 'citywide' | 'online' | 'multiple';

const USAGE_AREAS: Array<{
  id: UsageAreaId;
  title: string;
  icon: keyof typeof Ionicons.glyphMap;
}> = [
  { id: 'nearby', title: 'באזור העסק שלי', icon: 'location-outline' },
  { id: 'citywide', title: 'ברחבי העיר', icon: 'navigate-outline' },
  { id: 'online', title: 'באונליין בלבד', icon: 'phone-portrait-outline' },
  { id: 'multiple', title: 'בכמה סניפים', icon: 'business-outline' },
];

export default function OnboardingUsageAreaScreen() {
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
    safePush('/(auth)/paywall');
  };

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.content}>
        <View style={styles.header}>
          <BackButton
            onPress={() => safeBack('/(auth)/onboarding-business-name')}
          />
          <OnboardingProgress total={8} current={6} />
        </View>

        <View style={styles.titleContainer}>
          <Text style={styles.title}>
            באילו אזורים העסק פעיל היום?{'\n'}בוחרים עד 3 אפשרויות
          </Text>
          <Text style={styles.subtitle}>
            זה עוזר לנו להתאים את החוויה לעסק שלך.
          </Text>
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
          <ContinueButton
            onPress={handleContinue}
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
    backgroundColor: '#2563eb',
    borderColor: '#2563eb',
    shadowColor: '#93c5fd',
  },
  optionUnselected: {
    backgroundColor: '#ffffff',
    borderColor: '#e5e7eb',
    shadowColor: '#9ca3af',
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
    color: '#ffffff',
  },
  optionTextUnselected: {
    color: '#111827',
  },
  footer: {
    marginTop: 'auto',
  },
  button: {
    borderRadius: 999,
    paddingHorizontal: 40,
    paddingVertical: 16,
    alignItems: 'center',
  },
  buttonActive: {
    backgroundColor: '#2563eb',
    shadowColor: '#2563eb',
    shadowOffset: { width: 0, height: 10 },
    shadowOpacity: 0.25,
    shadowRadius: 30,
    elevation: 8,
  },
  buttonInactive: {
    backgroundColor: '#e5e7eb',
  },
  buttonText: {
    fontSize: 18,
    fontWeight: '700',
  },
  buttonTextActive: {
    color: '#ffffff',
  },
  buttonTextInactive: {
    color: '#6b7280',
  },
});
