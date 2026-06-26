import { useLocalSearchParams } from 'expo-router';
import { useEffect, useMemo, useRef, useState } from 'react';
import {
  Alert,
  Keyboard,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { BackButton } from '@/components/BackButton';
import { ContinueButton } from '@/components/ContinueButton';
import { OnboardingProgress } from '@/components/OnboardingProgress';
import { useOnboarding } from '@/contexts/OnboardingContext';
import { safeDismissTo, safePush } from '@/lib/navigation';
import {
  BUSINESS_ONBOARDING_ROUTES,
  getBusinessOnboardingProgressStep,
  getBusinessOnboardingTotalSteps,
  isAdditionalBusinessFlow,
  withBusinessOnboardingFlow,
} from '@/lib/onboarding/businessOnboardingFlow';
import { useBusinessOnboardingDraftPersistence } from '@/lib/onboarding/useBusinessOnboardingDraftPersistence';
import { useOnboardingTracking } from '@/lib/onboarding/useOnboardingTracking';
import { flexDirection } from '@/lib/rtl';

const TEXT = {
  title: 'מה שם העסק?',
  subtitle: 'כך הלקוחות יזהו אתכם באפליקציה',
  label: 'שם העסק',
  placeholder: 'למשל: מועדון לקוחות חוזרים STAMPAIX',
  exitTitle: 'לצאת מהקמת העסק?',
  exitMessage: 'נשמור לך את ההתקדמות ותוכל/י לחזור לזה כל זמן.',
  exitConfirm: 'לשמור ולצאת',
  exitCancel: 'המשך עריכה',
  saveErrorTitle: 'שגיאה בשמירה',
  exitFailed: 'לא הצלחנו לשמור את הטיוטה. נסו שוב.',
};

export default function OnboardingBusinessNameScreen() {
  const { flow } = useLocalSearchParams<{ flow?: string }>();
  const { businessOnboardingDraft, setBusinessOnboardingDraft } =
    useOnboarding();
  const { saveStep } = useBusinessOnboardingDraftPersistence();
  const didSyncStepRef = useRef(false);
  const businessName = businessOnboardingDraft.businessName;
  const isAdditionalFlow = isAdditionalBusinessFlow(flow);
  const [isLeaving, setIsLeaving] = useState(false);
  const { completeStep, trackContinue } = useOnboardingTracking({
    screen: 'onboarding_business_name',
    role: 'business',
  });

  const canContinue = useMemo(
    () => businessName.trim().length > 0,
    [businessName]
  );

  useEffect(() => {
    if (didSyncStepRef.current) {
      return;
    }
    didSyncStepRef.current = true;
    void saveStep({ step: 'name', flow }).catch(() => {});
  }, [flow, saveStep]);

  const handleLeave = async () => {
    if (!isAdditionalFlow || isLeaving) {
      return;
    }

    setIsLeaving(true);
    try {
      await saveStep({ step: 'name', flow, status: 'paused' });
      safeDismissTo('/(authenticated)/(business)/settings');
    } catch {
      Alert.alert(TEXT.saveErrorTitle, TEXT.exitFailed);
    } finally {
      setIsLeaving(false);
    }
  };

  const handleExitIntent = () => {
    if (!isAdditionalFlow || isLeaving) {
      return;
    }

    Alert.alert(TEXT.exitTitle, TEXT.exitMessage, [
      { text: TEXT.exitCancel, style: 'cancel' },
      {
        text: TEXT.exitConfirm,
        style: 'destructive',
        onPress: () => {
          void handleLeave();
        },
      },
    ]);
  };

  const handleContinue = async () => {
    if (!canContinue || isLeaving) {
      return;
    }

    const encodedName = encodeURIComponent(businessName.trim());
    trackContinue();
    try {
      await saveStep({ step: 'name', flow });
    } catch {
      // Keep onboarding flow moving even if draft persistence fails.
    }
    completeStep({ name_length: businessName.trim().length });
    safePush(
      withBusinessOnboardingFlow(
        `${BUSINESS_ONBOARDING_ROUTES.createBusiness}?businessName=${encodedName}`,
        flow
      )
    );
  };

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.content}>
        <View style={styles.header}>
          {isAdditionalFlow ? (
            <Pressable
              onPress={handleExitIntent}
              disabled={isLeaving}
              accessibilityRole="button"
              accessibilityLabel={TEXT.exitConfirm}
              style={({ pressed }) => [
                styles.closeButton,
                pressed ? styles.closeButtonPressed : null,
                isLeaving ? styles.closeButtonDisabled : null,
              ]}
            >
              <Text style={styles.closeButtonText}>X</Text>
            </Pressable>
          ) : null}
          <BackButton
            onPress={() =>
              isAdditionalFlow
                ? handleExitIntent()
                : safeDismissTo(BUSINESS_ONBOARDING_ROUTES.reason)
            }
          />
          <OnboardingProgress
            total={getBusinessOnboardingTotalSteps(flow)}
            current={getBusinessOnboardingProgressStep('name', flow)}
          />
        </View>

        <View style={styles.titleContainer}>
          <Text style={styles.title}>{TEXT.title}</Text>
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
          <ContinueButton
            onPress={() => {
              void handleContinue();
            }}
            disabled={!canContinue || isLeaving}
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
    flexDirection: flexDirection.row,
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  closeButton: {
    width: 42,
    height: 42,
    borderRadius: 21,
    borderWidth: 1,
    borderColor: '#E2E8F0',
    backgroundColor: '#FFFFFF',
    alignItems: 'center',
    justifyContent: 'center',
  },
  closeButtonPressed: {
    opacity: 0.86,
  },
  closeButtonDisabled: {
    opacity: 0.55,
  },
  closeButtonText: {
    fontSize: 14,
    fontWeight: '900',
    color: '#334155',
  },
  titleContainer: {
    marginTop: 12,
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
