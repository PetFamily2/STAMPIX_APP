import { Ionicons } from '@expo/vector-icons';
import { useState } from 'react';
import { ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { ContinueButton } from '@/components/ContinueButton';
import { OnboardingChoiceButton } from '@/components/OnboardingChoiceButton';
import { OnboardingProgress } from '@/components/OnboardingProgress';
import { StandaloneBackTitleHeader } from '@/components/StandaloneBackTitleHeader';
import { safeBack, safePush } from '@/lib/navigation';
import { useOnboardingTracking } from '@/lib/onboarding/useOnboardingTracking';
import { alignItems } from '@/lib/rtl';

type BusinessTypeId =
  | 'coffee'
  | 'restaurants'
  | 'groceries'
  | 'beauty'
  | 'fitness'
  | 'family';

type BenefitTypeId =
  | 'visit_gift'
  | 'purchase_discount'
  | 'small_upgrade'
  | 'birthday_benefit'
  | 'surprises';

const TEXT = {
  title: 'מה מעניין אותך?',
  description: 'זה עוזר לנו להבין אילו הטבות מעניינות אותך.',
  interestSectionTitle: 'סוגי עסקים',
  interestHelper: 'בחרו עד 3',
  benefitSectionTitle: 'איזה סוג הטבות כיף לך לקבל?',
  benefitHelper: 'בחרו עד 2',
  continue: 'המשך',
};

const BUSINESS_TYPES: Array<{
  id: BusinessTypeId;
  title: string;
  icon: keyof typeof Ionicons.glyphMap;
}> = [
  { id: 'coffee', title: 'קפה ומאפים', icon: 'cafe-outline' },
  { id: 'restaurants', title: 'מסעדות ואוכל מהיר', icon: 'restaurant-outline' },
  { id: 'groceries', title: 'סופר וקניות יומיומיות', icon: 'cart-outline' },
  { id: 'beauty', title: 'טיפוח ויופי', icon: 'cut-outline' },
  { id: 'fitness', title: 'כושר ובריאות', icon: 'barbell-outline' },
  { id: 'family', title: 'ילדים ומשפחה', icon: 'happy-outline' },
];

const BENEFIT_TYPES: Array<{
  id: BenefitTypeId;
  title: string;
  icon: keyof typeof Ionicons.glyphMap;
}> = [
  { id: 'visit_gift', title: 'מתנה אחרי כמה ביקורים', icon: 'gift-outline' },
  { id: 'purchase_discount', title: 'הנחה בקנייה', icon: 'pricetag-outline' },
  { id: 'small_upgrade', title: 'שדרוג קטן', icon: 'sparkles-outline' },
  { id: 'birthday_benefit', title: 'הטבה ביום הולדת', icon: 'balloon-outline' },
  {
    id: 'surprises',
    title: 'הפתעות ומבצעים מיוחדים',
    icon: 'ticket-outline',
  },
];

export default function OnboardingInterestsScreen() {
  const [selectedInterests, setSelectedInterests] = useState<BusinessTypeId[]>(
    []
  );
  const [selectedBenefits, setSelectedBenefits] = useState<BenefitTypeId[]>([]);
  const { completeStep, trackChoice, trackContinue } = useOnboardingTracking({
    screen: 'onboarding_client_interests',
    role: 'client',
  });

  const canContinue =
    selectedInterests.length > 0 && selectedBenefits.length > 0;

  const toggleType = (id: BusinessTypeId) => {
    setSelectedInterests((prev) => {
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

  const toggleBenefit = (id: BenefitTypeId) => {
    setSelectedBenefits((prev) => {
      if (prev.includes(id)) {
        trackChoice('benefit_preference', id, { selected: false });
        return prev.filter((item) => item !== id);
      }
      if (prev.length >= 2) {
        return prev;
      }
      trackChoice('benefit_preference', id, { selected: true });
      return [...prev, id];
    });
  };

  const handleContinue = () => {
    if (!canContinue) {
      return;
    }
    trackContinue();
    completeStep({
      interests_count: selectedInterests.length,
      interests_values: selectedInterests,
      benefit_preferences_count: selectedBenefits.length,
      benefit_preferences_values: selectedBenefits,
    });
    safePush('/(auth)/onboarding-client-return-motivation');
  };

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.content}>
        <StandaloneBackTitleHeader
          title={TEXT.title}
          subtitle={TEXT.description}
          onBackPress={() => safeBack('/(auth)/name-capture')}
          leftAccessory={<OnboardingProgress total={3} current={2} />}
          style={styles.header}
          titleStyle={styles.title}
          subtitleStyle={styles.description}
        />

        <ScrollView
          style={styles.scroll}
          contentContainerStyle={styles.scrollContent}
          showsVerticalScrollIndicator={false}
        >
          <View style={styles.section}>
            <View style={styles.sectionHeader}>
              <Text style={styles.sectionTitle}>{TEXT.interestSectionTitle}</Text>
              <Text style={styles.sectionHelper}>{TEXT.interestHelper}</Text>
            </View>

            <View style={styles.optionsContainer}>
              {BUSINESS_TYPES.map((type) => {
                const isSelected = selectedInterests.includes(type.id);
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
          </View>

          <View style={styles.section}>
            <View style={styles.sectionHeader}>
              <Text style={styles.sectionTitle}>{TEXT.benefitSectionTitle}</Text>
              <Text style={styles.sectionHelper}>{TEXT.benefitHelper}</Text>
            </View>

            <View style={styles.optionsContainer}>
              {BENEFIT_TYPES.map((type) => {
                const isSelected = selectedBenefits.includes(type.id);
                return (
                  <OnboardingChoiceButton
                    key={type.id}
                    selected={isSelected}
                    label={type.title}
                    onPress={() => toggleBenefit(type.id)}
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
          </View>
        </ScrollView>

        <View style={styles.footer}>
          <ContinueButton
            onPress={handleContinue}
            disabled={!canContinue}
            label={TEXT.continue}
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
    marginBottom: 4,
  },
  title: {
    fontSize: 24,
    fontWeight: '900',
    color: '#111827',
    textAlign: 'right',
    marginBottom: 8,
  },
  description: {
    fontSize: 14,
    fontWeight: '600',
    color: '#6b7280',
    textAlign: 'right',
    lineHeight: 20,
  },
  scroll: {
    flex: 1,
  },
  scrollContent: {
    paddingBottom: 16,
  },
  section: {
    marginTop: 28,
    gap: 12,
  },
  sectionHeader: {
    gap: 2,
    alignItems: alignItems.start,
  },
  sectionTitle: {
    fontSize: 17,
    fontWeight: '900',
    color: '#111827',
    textAlign: 'right',
  },
  sectionHelper: {
    fontSize: 12,
    fontWeight: '700',
    color: '#6b7280',
    textAlign: 'right',
  },
  optionsContainer: {
    gap: 12,
  },
  footer: {
    paddingTop: 12,
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
