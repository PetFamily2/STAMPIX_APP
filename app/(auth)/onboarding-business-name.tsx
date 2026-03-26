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

const TEXT = {
  title: '\u05de\u05d4 \u05e9\u05dd \u05d4\u05e2\u05e1\u05e7?',
  subtitle:
    '\u05db\u05da \u05d4\u05dc\u05e7\u05d5\u05d7\u05d5\u05ea \u05d9\u05d6\u05d4\u05d5 \u05d0\u05ea\u05db\u05dd \u05d1\u05d0\u05e4\u05dc\u05d9\u05e7\u05e6\u05d9\u05d4',
  label: '\u05e9\u05dd \u05d4\u05e2\u05e1\u05e7',
  placeholder:
    '\u05dc\u05de\u05e9\u05dc: \u05de\u05d5\u05e2\u05d3\u05d5\u05df \u05dc\u05e7\u05d5\u05d7\u05d5\u05ea \u05d7\u05d5\u05d6\u05e8\u05d9\u05dd STAMPAIX',
  exitTitle:
    '\u05dc\u05e6\u05d0\u05ea \u05de\u05d4\u05e7\u05de\u05ea \u05d4\u05e2\u05e1\u05e7?',
  exitMessage:
    '\u05e0\u05e9\u05de\u05d5\u05e8 \u05dc\u05da \u05d0\u05ea \u05d4\u05d4\u05ea\u05e7\u05d3\u05de\u05d5\u05ea \u05d5\u05ea\u05d5\u05db\u05dc/\u05d9 \u05dc\u05d7\u05d6\u05d5\u05e8 \u05dc\u05d6\u05d4 \u05db\u05dc \u05d6\u05de\u05df.',
  exitConfirm: '\u05dc\u05e9\u05de\u05d5\u05e8 \u05d5\u05dc\u05e6\u05d0\u05ea',
  exitCancel: '\u05d4\u05de\u05e9\u05da \u05e2\u05e8\u05d9\u05db\u05d4',
  saveErrorTitle:
    '\u05e9\u05d2\u05d9\u05d0\u05d4 \u05d1\u05e9\u05de\u05d9\u05e8\u05d4',
  exitFailed:
    '\u05dc\u05d0 \u05d4\u05e6\u05dc\u05d7\u05e0\u05d5 \u05dc\u05e9\u05de\u05d5\u05e8 \u05d0\u05ea \u05d4\u05d8\u05d9\u05d5\u05d8\u05d4. \u05e0\u05e1\u05d5 \u05e9\u05d5\u05d1.',
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
    paddingHorizontal: 24,
    paddingTop: 16,
    paddingBottom: 32,
  },
  header: {
    flexDirection: 'row-reverse',
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
