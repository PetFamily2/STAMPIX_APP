import { StyleSheet, Text, View } from 'react-native';
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

const TEXT = {
  title: '\u05e0\u05e2\u05d9\u05dd \u05dc\u05d4\u05db\u05d9\u05e8!',
  subtitle:
    '\u05db\u05de\u05d4 \u05e9\u05d0\u05dc\u05d5\u05ea \u05e7\u05e6\u05e8\u05d5\u05ea \u05e2\u05dc \u05d4\u05e2\u05e1\u05e7 \u05db\u05d3\u05d9 \u05dc\u05d4\u05ea\u05d7\u05d9\u05dc \u05d1\u05d3\u05e8\u05da \u05de\u05ea\u05d0\u05d9\u05de\u05d4.',
};

export default function OnboardingBusinessRoleScreen() {
  const { completeStep, trackContinue } = useOnboardingTracking({
    screen: 'onboarding_business_role',
    role: 'business',
  });

  const handleContinue = () => {
    trackContinue();
    completeStep();
    safePush(BUSINESS_ONBOARDING_ROUTES.discovery);
  };

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.content}>
        <View style={styles.headerRow}>
          <BackButton
            onPress={() => safeBack('/(authenticated)/(customer)/settings')}
          />
          <OnboardingProgress
            total={BUSINESS_ONBOARDING_TOTAL_STEPS}
            current={BUSINESS_ONBOARDING_PROGRESS.role}
          />
        </View>

        <View style={styles.titleContainer}>
          <Text style={styles.title}>{TEXT.title}</Text>
          <Text style={styles.subtitle}>{TEXT.subtitle}</Text>
        </View>

        <View style={styles.footer}>
          <ContinueButton onPress={handleContinue} />
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
  footer: {
    marginTop: 'auto',
  },
});
