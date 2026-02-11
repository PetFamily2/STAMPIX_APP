import React, { useMemo, useState } from 'react';
import { Keyboard, StyleSheet, Text, TextInput, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { BackButton } from '@/components/BackButton';
import { ContinueButton } from '@/components/ContinueButton';
import { OnboardingProgress } from '@/components/OnboardingProgress';
import { safeBack, safePush } from '@/lib/navigation';
import { useOnboardingTracking } from '@/lib/onboarding/useOnboardingTracking';

export default function OnboardingBusinessNameScreen() {
  const [businessName, setBusinessName] = useState('');
  const { completeStep, trackContinue } = useOnboardingTracking({
    screen: 'onboarding_business_name',
    role: 'business',
  });

  const canContinue = useMemo(
    () => businessName.trim().length > 0,
    [businessName]
  );

  const handleContinue = () => {
    if (!canContinue) return;
    trackContinue();
    completeStep({ name_length: businessName.trim().length });
    safePush('/(auth)/onboarding-business-usage-area');
  };

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.content}>
        <View style={styles.header}>
          <BackButton
            onPress={() => safeBack('/(auth)/onboarding-business-reason')}
          />
          <OnboardingProgress total={8} current={5} />
        </View>

        <View style={styles.titleContainer}>
          <Text style={styles.title}>איך קוראים לעסק שלך?</Text>
          <Text style={styles.subtitle}>ככה הלקוחות יראו אותך באפליקציה</Text>
        </View>

        <View style={styles.inputContainer}>
          <Text style={styles.label}>שם העסק</Text>
          <TextInput
            value={businessName}
            onChangeText={setBusinessName}
            placeholder="קפה המרפסת"
            placeholderTextColor="#9CA3AF"
            returnKeyType="next"
            autoCapitalize="words"
            style={styles.input}
            accessibilityLabel="שם העסק"
            blurOnSubmit={true}
            onSubmitEditing={Keyboard.dismiss}
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
  },
  inputContainer: {
    marginTop: 24,
  },
  label: {
    fontSize: 12,
    fontWeight: '700',
    color: '#9CA3AF',
    textAlign: 'right',
    marginBottom: 8,
  },
  input: {
    backgroundColor: '#ffffff',
    borderWidth: 1,
    borderColor: '#e5e7eb',
    borderRadius: 16,
    paddingHorizontal: 16,
    paddingVertical: 12,
    fontSize: 16,
    fontWeight: '600',
    color: '#111827',
    textAlign: 'right',
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
