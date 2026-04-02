import { useConvexAuth, useMutation, useQuery } from 'convex/react';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  Alert,
  KeyboardAvoidingView,
  Platform,
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
import { useAppMode } from '@/contexts/AppModeContext';
import { useOnboarding } from '@/contexts/OnboardingContext';
import { api } from '@/convex/_generated/api';
import { safeDismissTo, safePush } from '@/lib/navigation';
import {
  BUSINESS_ONBOARDING_PROGRESS,
  BUSINESS_ONBOARDING_ROUTES,
  BUSINESS_ONBOARDING_TOTAL_STEPS,
} from '@/lib/onboarding/businessOnboardingFlow';
import { useBusinessOnboardingDraftPersistence } from '@/lib/onboarding/useBusinessOnboardingDraftPersistence';
import { useOnboardingTracking } from '@/lib/onboarding/useOnboardingTracking';

type AgeRangeId =
  | '18-24'
  | '25-34'
  | '35-44'
  | '45-54'
  | '55+'
  | 'not_specified';

const TEXT = {
  title:
    '\u05e0\u05e2\u05d9\u05dd \u05dc\u05d4\u05db\u05d9\u05e8 - \u05db\u05de\u05d4 \u05e4\u05e8\u05d8\u05d9\u05dd \u05e7\u05e6\u05e8\u05d9\u05dd',
  subtitle:
    '\u05d6\u05d4 \u05e2\u05d5\u05d6\u05e8 \u05dc\u05e0\u05d5 \u05dc\u05d4\u05ea\u05d0\u05d9\u05dd \u05d0\u05ea \u05d4\u05d4\u05d3\u05e8\u05db\u05d4 \u05d5\u05d4\u05d4\u05e6\u05e2\u05d5\u05ea \u05d0\u05dc\u05d9\u05da',
  firstNameLabel: '\u05e9\u05dd \u05e4\u05e8\u05d8\u05d9',
  firstNamePlaceholder: '\u05e9\u05dd \u05e4\u05e8\u05d8\u05d9',
  lastNameLabel: '\u05e9\u05dd \u05de\u05e9\u05e4\u05d7\u05d4',
  lastNamePlaceholder: '\u05e9\u05dd \u05de\u05e9\u05e4\u05d7\u05d4',
  ageLabel: '\u05d8\u05d5\u05d5\u05d7 \u05d2\u05d9\u05dc\u05d0\u05d9\u05dd',
  saveErrorTitle:
    '\u05e9\u05d2\u05d9\u05d0\u05d4 \u05d1\u05e9\u05de\u05d9\u05e8\u05d4',
  saveErrorMessage:
    '\u05dc\u05d0 \u05d4\u05e6\u05dc\u05d7\u05e0\u05d5 \u05dc\u05e9\u05de\u05d5\u05e8 \u05d0\u05ea \u05d4\u05e9\u05dd \u05e0\u05e1\u05d5 \u05e9\u05d5\u05d1',
  exitTitle:
    '\u05dc\u05e6\u05d0\u05ea \u05de\u05d4\u05e7\u05de\u05ea \u05d4\u05e2\u05e1\u05e7?',
  exitMessage:
    '\u05e0\u05e9\u05de\u05d5\u05e8 \u05dc\u05da \u05d0\u05ea \u05d4\u05d4\u05ea\u05e7\u05d3\u05de\u05d5\u05ea \u05d5\u05ea\u05d5\u05db\u05dc/\u05d9 \u05dc\u05d7\u05d6\u05d5\u05e8 \u05dc\u05d6\u05d4 \u05db\u05dc \u05d6\u05de\u05df.',
  exitConfirm: '\u05dc\u05e9\u05de\u05d5\u05e8 \u05d5\u05dc\u05e6\u05d0\u05ea',
  exitCancel: '\u05d4\u05de\u05e9\u05da \u05e2\u05e8\u05d9\u05db\u05d4',
  exitFailed:
    '\u05dc\u05d0 \u05d4\u05e6\u05dc\u05d7\u05e0\u05d5 \u05dc\u05e9\u05de\u05d5\u05e8 \u05d0\u05ea \u05d4\u05d8\u05d9\u05d5\u05d8\u05d4. \u05e0\u05e1\u05d5 \u05e9\u05d5\u05d1.',
};

const AGE_RANGES: Array<{ id: AgeRangeId; label: string }> = [
  { id: '18-24', label: '18-24' },
  { id: '25-34', label: '25-34' },
  { id: '35-44', label: '35-44' },
  { id: '45-54', label: '45-54' },
  { id: '55+', label: '+55' },
  { id: 'not_specified', label: '\u05dc\u05d0 \u05de\u05e6\u05d9\u05d9\u05df' },
];

function splitFullName(fullName?: string | null) {
  if (!fullName) {
    return { firstName: '', lastName: '' };
  }

  const parts = fullName
    .trim()
    .split(/\s+/)
    .map((part) => part.trim())
    .filter(Boolean);

  if (parts.length === 0) {
    return { firstName: '', lastName: '' };
  }

  if (parts.length === 1) {
    return { firstName: parts[0], lastName: '' };
  }

  return {
    firstName: parts[0],
    lastName: parts.slice(1).join(' '),
  };
}

function normalizeName(value?: string | null) {
  if (typeof value !== 'string') {
    return '';
  }

  return value.trim().replace(/\s+/g, ' ');
}

export default function OnboardingBusinessRoleScreen() {
  const { isAuthenticated } = useConvexAuth();
  const user = useQuery(api.users.getCurrentUser);
  const setMyName = useMutation(api.users.setMyName);
  const setActiveMode = useMutation(api.users.setActiveMode);
  const { setAppMode } = useAppMode();
  const { businessOnboardingDraft, setBusinessOnboardingDraft } =
    useOnboarding();
  const { saveStep } = useBusinessOnboardingDraftPersistence();
  const firstName = businessOnboardingDraft.firstName;
  const lastName = businessOnboardingDraft.lastName;
  const selectedAgeRange =
    businessOnboardingDraft.ageRange as AgeRangeId | null;
  const setFirstName = useCallback(
    (value: string) => {
      setBusinessOnboardingDraft((prev) => ({ ...prev, firstName: value }));
    },
    [setBusinessOnboardingDraft]
  );
  const setLastName = useCallback(
    (value: string) => {
      setBusinessOnboardingDraft((prev) => ({ ...prev, lastName: value }));
    },
    [setBusinessOnboardingDraft]
  );
  const setSelectedAgeRange = useCallback(
    (value: AgeRangeId | null) => {
      setBusinessOnboardingDraft((prev) => ({ ...prev, ageRange: value }));
    },
    [setBusinessOnboardingDraft]
  );
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isLeaving, setIsLeaving] = useState(false);
  const didPrefillRef = useRef(false);
  const didSyncStepRef = useRef(false);
  const lastNameInputRef = useRef<TextInput>(null);

  const { completeStep, trackChoice, trackContinue, trackError } =
    useOnboardingTracking({
      screen: 'onboarding_business_role',
      role: 'business',
    });

  useEffect(() => {
    if (didSyncStepRef.current) {
      return;
    }
    didSyncStepRef.current = true;
    void saveStep({ step: 'role' }).catch(() => {});
  }, [saveStep]);

  useEffect(() => {
    if (!user || didPrefillRef.current) {
      return;
    }
    if (firstName.trim().length > 0 || lastName.trim().length > 0) {
      didPrefillRef.current = true;
      return;
    }

    const fallbackFromFullName = splitFullName(user.fullName);
    const nextFirstName =
      normalizeName(user.firstName) ||
      normalizeName(fallbackFromFullName.firstName);
    const nextLastName =
      normalizeName(user.lastName) ||
      normalizeName(fallbackFromFullName.lastName);

    if (nextFirstName) {
      setFirstName(nextFirstName);
    }
    if (nextLastName) {
      setLastName(nextLastName);
    }

    didPrefillRef.current = true;
  }, [firstName, lastName, setFirstName, setLastName, user]);

  const canContinue = useMemo(
    () =>
      firstName.trim().length > 0 &&
      lastName.trim().length > 0 &&
      selectedAgeRange !== null,
    [firstName, lastName, selectedAgeRange]
  );

  const handleLeave = async () => {
    if (isLeaving || isSubmitting) {
      return;
    }

    setIsLeaving(true);
    try {
      await saveStep({ step: 'role', status: 'paused' });
      await setActiveMode({ mode: 'customer' });
      await setAppMode('customer');
      safeDismissTo('/(authenticated)/(customer)/settings');
    } catch {
      Alert.alert(TEXT.saveErrorTitle, TEXT.exitFailed);
    } finally {
      setIsLeaving(false);
    }
  };

  const handleExitIntent = () => {
    if (isLeaving || isSubmitting) {
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
    if (!canContinue || isSubmitting || isLeaving || !selectedAgeRange) {
      return;
    }

    const normalizedFirstName = normalizeName(firstName);
    const normalizedLastName = normalizeName(lastName);

    if (!normalizedFirstName || !normalizedLastName) {
      return;
    }

    setIsSubmitting(true);
    trackContinue();
    try {
      if (isAuthenticated) {
        await setMyName({
          firstName: normalizedFirstName,
          lastName: normalizedLastName,
        });
      }
      try {
        await saveStep({ step: 'role' });
      } catch {
        // Keep onboarding flow moving even if draft persistence fails.
      }

      completeStep({
        age_range: selectedAgeRange,
        first_name_length: normalizedFirstName.length,
        last_name_length: normalizedLastName.length,
      });
      safePush(BUSINESS_ONBOARDING_ROUTES.discovery);
    } catch {
      trackError('name', 'SAVE_FAILED', { age_range: selectedAgeRange });
      Alert.alert(TEXT.saveErrorTitle, TEXT.saveErrorMessage);
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <SafeAreaView style={styles.container}>
      <KeyboardAvoidingView
        style={styles.content}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      >
        <View style={styles.header}>
          <View style={styles.headerActions}>
            <Pressable
              onPress={handleExitIntent}
              disabled={isLeaving || isSubmitting}
              accessibilityRole="button"
              accessibilityLabel={TEXT.exitConfirm}
              style={({ pressed }) => [
                styles.closeButton,
                pressed ? styles.closeButtonPressed : null,
                isLeaving || isSubmitting ? styles.closeButtonDisabled : null,
              ]}
            >
              <Text style={styles.closeButtonText}>X</Text>
            </Pressable>
            <BackButton onPress={handleExitIntent} />
          </View>
          <OnboardingProgress
            total={BUSINESS_ONBOARDING_TOTAL_STEPS}
            current={BUSINESS_ONBOARDING_PROGRESS.role}
          />
        </View>

        <View style={styles.titleContainer}>
          <Text style={styles.title}>{TEXT.title}</Text>
        </View>

        <View style={styles.form}>
          <View>
            <Text style={styles.inputLabel}>{TEXT.firstNameLabel}</Text>
            <TextInput
              value={firstName}
              onChangeText={setFirstName}
              placeholder={TEXT.firstNamePlaceholder}
              placeholderTextColor="#B4BBC8"
              autoCapitalize="words"
              returnKeyType="next"
              blurOnSubmit={false}
              onSubmitEditing={() => lastNameInputRef.current?.focus()}
              style={styles.input}
              textAlign="right"
              accessibilityLabel={TEXT.firstNameLabel}
            />
          </View>

          <View>
            <Text style={styles.inputLabel}>{TEXT.lastNameLabel}</Text>
            <TextInput
              ref={lastNameInputRef}
              value={lastName}
              onChangeText={setLastName}
              placeholder={TEXT.lastNamePlaceholder}
              placeholderTextColor="#B4BBC8"
              autoCapitalize="words"
              returnKeyType="done"
              style={styles.input}
              textAlign="right"
              accessibilityLabel={TEXT.lastNameLabel}
            />
          </View>
        </View>

        <View style={styles.ageSection}>
          <Text style={styles.inputLabel}>{TEXT.ageLabel}</Text>
          <View style={styles.ageGrid}>
            {AGE_RANGES.map((range) => {
              const isSelected = selectedAgeRange === range.id;
              return (
                <Pressable
                  key={range.id}
                  onPress={() => {
                    setSelectedAgeRange(range.id);
                    trackChoice('age_range', range.id);
                  }}
                  accessibilityRole="button"
                  accessibilityState={{ selected: isSelected }}
                  style={styles.agePressable}
                >
                  <View
                    style={[
                      styles.ageChip,
                      isSelected ? styles.ageChipSelected : styles.ageChipIdle,
                    ]}
                  >
                    <Text
                      style={[
                        styles.ageChipText,
                        isSelected
                          ? styles.ageChipTextSelected
                          : styles.ageChipTextIdle,
                      ]}
                    >
                      {range.label}
                    </Text>
                  </View>
                </Pressable>
              );
            })}
          </View>
        </View>

        <View style={styles.footer}>
          <ContinueButton
            onPress={() => {
              void handleContinue();
            }}
            disabled={!canContinue || isSubmitting || isLeaving}
          />
        </View>
      </KeyboardAvoidingView>
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
  headerActions: {
    flexDirection: 'row-reverse',
    alignItems: 'center',
    gap: 10,
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
  form: {
    marginTop: 24,
    gap: 12,
  },
  inputLabel: {
    marginBottom: 6,
    fontSize: 12,
    fontWeight: '700',
    color: '#6b7280',
    textAlign: 'right',
    writingDirection: 'rtl',
  },
  input: {
    borderRadius: 16,
    borderWidth: 1,
    borderColor: '#E5E7EB',
    backgroundColor: '#FFFFFF',
    paddingHorizontal: 16,
    paddingVertical: 12,
    fontSize: 16,
    fontWeight: '600',
    color: '#111827',
    writingDirection: 'rtl',
  },
  ageSection: {
    marginTop: 24,
  },
  ageGrid: {
    flexDirection: 'row-reverse',
    flexWrap: 'wrap',
    columnGap: 8,
    rowGap: 8,
    justifyContent: 'space-between',
  },
  agePressable: {
    width: '31%',
  },
  ageChip: {
    minHeight: 42,
    borderRadius: 14,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 6,
  },
  ageChipIdle: {
    backgroundColor: '#F8FAFC',
    borderColor: '#E2E8F0',
  },
  ageChipSelected: {
    backgroundColor: '#2F66E8',
    borderColor: '#2F66E8',
    shadowColor: '#2F66E8',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.18,
    shadowRadius: 10,
    elevation: 3,
  },
  ageChipText: {
    fontSize: 13,
    fontWeight: '700',
  },
  ageChipTextIdle: {
    color: '#9AA4B8',
  },
  ageChipTextSelected: {
    color: '#FFFFFF',
  },
  footer: {
    marginTop: 'auto',
  },
});
