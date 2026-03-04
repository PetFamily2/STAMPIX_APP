import { useMemo } from 'react';
import { Keyboard, StyleSheet, Text, TextInput, View } from 'react-native';
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
import { useOnboardingTracking } from '@/lib/onboarding/useOnboardingTracking';

const TEXT = {
  title: '\u05de\u05d4 \u05e9\u05dd \u05d4\u05e2\u05e1\u05e7?',
  subtitle:
    '\u05db\u05da \u05d4\u05dc\u05e7\u05d5\u05d7\u05d5\u05ea \u05d9\u05d6\u05d4\u05d5 \u05d0\u05ea\u05db\u05dd \u05d1\u05d0\u05e4\u05dc\u05d9\u05e7\u05e6\u05d9\u05d4',
  label: '\u05e9\u05dd \u05d4\u05e2\u05e1\u05e7',
  placeholder:
    '\u05dc\u05de\u05e9\u05dc: \u05de\u05d5\u05e2\u05d3\u05d5\u05df \u05dc\u05e7\u05d5\u05d7\u05d5\u05ea \u05d7\u05d5\u05d6\u05e8\u05d9\u05dd STAMPAIX',
};

export default function OnboardingBusinessNameScreen() {
  const { businessOnboardingDraft, setBusinessOnboardingDraft } =
    useOnboarding();
  const businessName = businessOnboardingDraft.businessName;
  const { completeStep, trackContinue } = useOnboardingTracking({
    screen: 'onboarding_business_name',
    role: 'business',
  });

  const canContinue = useMemo(
    () => businessName.trim().length > 0,
    [businessName]
  );

  const handleContinue = () => {
    if (!canContinue) {
      return;
    }

    const encodedName = encodeURIComponent(businessName.trim());
    trackContinue();
    completeStep({ name_length: businessName.trim().length });
    safePush(
      `${BUSINESS_ONBOARDING_ROUTES.createBusiness}?businessName=${encodedName}`
    );
  };

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.content}>
        <View style={styles.header}>
          <BackButton
            onPress={() => safeDismissTo(BUSINESS_ONBOARDING_ROUTES.reason)}
          />
          <OnboardingProgress
            total={BUSINESS_ONBOARDING_TOTAL_STEPS}
            current={BUSINESS_ONBOARDING_PROGRESS.name}
          />
        </View>

        <View style={styles.titleContainer}>
          <Text style={styles.title}>{TEXT.title}</Text>
          <Text style={styles.subtitle}>{TEXT.subtitle}</Text>
        </View>

        <View style={styles.inputContainer}>
          <Text style={styles.label}>{TEXT.label}</Text>
          <TextInput
            value={businessName}
            onChangeText={(value) =>
              setBusinessOnboardingDraft((prev) => ({
                ...prev,
                businessName: value,
              }))
            }
            placeholder={TEXT.placeholder}
            placeholderTextColor="#C7CDD8"
            returnKeyType="next"
            autoCapitalize="words"
            style={styles.input}
            accessibilityLabel={TEXT.label}
            blurOnSubmit={true}
            onSubmitEditing={Keyboard.dismiss}
            textAlign="right"
          />
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
    color: '#6b7280',
    textAlign: 'right',
    lineHeight: 20,
  },
  inputContainer: {
    marginTop: 32,
  },
  label: {
    fontSize: 12,
    fontWeight: '700',
    color: '#6b7280',
    textAlign: 'right',
    marginBottom: 8,
    writingDirection: 'rtl',
  },
  input: {
    backgroundColor: '#FFFFFF',
    borderWidth: 1,
    borderColor: '#E5E7EB',
    borderRadius: 16,
    paddingHorizontal: 16,
    paddingVertical: 12,
    fontSize: 16,
    fontWeight: '600',
    color: '#111827',
    textAlign: 'right',
    writingDirection: 'rtl',
  },
  footer: {
    marginTop: 'auto',
  },
});
