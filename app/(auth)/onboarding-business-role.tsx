import React from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { BackButton } from '@/components/BackButton';
import { ContinueButton } from '@/components/ContinueButton';
import { OnboardingProgress } from '@/components/OnboardingProgress';
import { safeBack, safePush } from '@/lib/navigation';
import { useOnboardingTracking } from '@/lib/onboarding/useOnboardingTracking';

export default function OnboardingBusinessScreen() {
  const { completeStep, trackContinue } = useOnboardingTracking({
    screen: 'onboarding_business_role',
    role: 'business',
  });

  const handleContinue = () => {
    trackContinue();
    completeStep();
    safePush('/(auth)/onboarding-business-discovery');
  };

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.content}>
        <View style={styles.headerRow}>
          <BackButton
            onPress={() => safeBack('/(auth)/onboarding-client-role')}
          />
          <OnboardingProgress total={8} current={2} />
        </View>

        <View style={styles.titleContainer}>
          <Text style={styles.title}>נעים להכיר!</Text>
          <Text style={styles.subtitle}>
            כמה שאלות קצרות על העסק כדי להתאים לך התחלה נכונה.
          </Text>
        </View>

        <View style={styles.footer}>
          <ContinueButton
            onPress={handleContinue}
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
  headerRow: {
    flexDirection: 'row-reverse',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  titleContainer: {
    marginTop: 48,
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
  footer: {
    marginTop: 'auto',
  },
  button: {
    borderRadius: 999,
    paddingHorizontal: 40,
    paddingVertical: 16,
    alignItems: 'center',
    backgroundColor: '#2563eb',
    shadowColor: '#2563eb',
    shadowOffset: { width: 0, height: 10 },
    shadowOpacity: 0.25,
    shadowRadius: 30,
    elevation: 8,
  },
  buttonText: {
    fontSize: 18,
    fontWeight: '700',
    color: '#ffffff',
  },
});
