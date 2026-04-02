import { Ionicons } from '@expo/vector-icons';
import { useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { BackButton } from '@/components/BackButton';
import { ContinueButton } from '@/components/ContinueButton';
import { OnboardingChoiceButton } from '@/components/OnboardingChoiceButton';
import { OnboardingProgress } from '@/components/OnboardingProgress';
import { safeBack, safePush } from '@/lib/navigation';
import { useOnboardingTracking } from '@/lib/onboarding/useOnboardingTracking';

type BusinessTypeId =
  | 'coffee'
  | 'restaurants'
  | 'groceries'
  | 'beauty'
  | 'fitness'
  | 'family';

const BUSINESS_TYPES: Array<{
  id: BusinessTypeId;
  title: string;
  icon: keyof typeof Ionicons.glyphMap;
}> = [
  { id: 'coffee', title: 'קפה ומאפים', icon: 'cafe-outline' },
  { id: 'restaurants', title: 'מסעדות ואוכל מהיר', icon: 'restaurant-outline' },
  { id: 'groceries', title: 'סופר וקניות יום יומיות', icon: 'cart-outline' },
  { id: 'beauty', title: 'טיפוח ויופי', icon: 'cut-outline' },
  { id: 'fitness', title: 'כושר ובריאות', icon: 'barbell-outline' },
  { id: 'family', title: 'ילדים ומשפחה', icon: 'happy-outline' },
];

export default function OnboardingInterestsScreen() {
  const [selected, setSelected] = useState<BusinessTypeId[]>([]);
  const { completeStep, trackChoice, trackContinue } = useOnboardingTracking({
    screen: 'onboarding_client_interests',
    role: 'client',
  });

  const canContinue = selected.length > 0;

  const toggleType = (id: BusinessTypeId) => {
    setSelected((prev) => {
      if (prev.includes(id)) {
        trackChoice('interest', id, { selected: false });
        return prev.filter((item) => item !== id);
      }
      if (prev.length >= 3) {
        return prev;
      }
      trackChoice('interest', id, { selected: true });
      return [...prev, id];
    });
  };

  const handleContinue = () => {
    if (!canContinue) {
      return;
    }
    trackContinue();
    completeStep({
      interests_count: selected.length,
      interests_values: selected,
    });
    safePush('/(auth)/onboarding-client-usage-area');
  };

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.content}>
        <View style={styles.header}>
          <BackButton
            onPress={() => safeBack('/(auth)/onboarding-client-otp')}
          />
          <OnboardingProgress total={7} current={1} />
        </View>

        <View style={styles.titleContainer}>
          <Text style={styles.title}>
            באילו סוגי עסקים אתה הכי{'\n'}משתמש בשגרה?
          </Text>
        </View>

        <View style={styles.optionsContainer}>
          {BUSINESS_TYPES.map((type) => {
            const isSelected = selected.includes(type.id);
            return (
              <OnboardingChoiceButton
                key={type.id}
                selected={isSelected}
                label={type.title}
                onPress={() => toggleType(type.id)}
                labelNumberOfLines={1}
                labelAdjustsFontSizeToFit={true}
                labelMinimumFontScale={0.82}
                icon={
                  <Ionicons
                    name={type.icon}
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
