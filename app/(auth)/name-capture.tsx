import { useAuthActions } from '@convex-dev/auth/react';
import { useConvexAuth, useMutation, useQuery } from 'convex/react';
import { useRouter } from 'expo-router';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { ContinueButton } from '@/components/ContinueButton';
import { OnboardingProgress } from '@/components/OnboardingProgress';
import { StandaloneBackTitleHeader } from '@/components/StandaloneBackTitleHeader';
import { api } from '@/convex/_generated/api';
import { safeBack } from '@/lib/navigation';

const TEXT = {
  title: 'ברוכים הבאים! איך לקרוא לך?',
  subtitle: '',
  firstNameLabel: 'שם פרטי',
  firstNamePlaceholder: 'ישראל',
  lastNameLabel: 'שם משפחה',
  lastNamePlaceholder: 'ישראלי',
  firstNameA11y: 'שדה שם פרטי',
  lastNameA11y: 'שדה שם משפחה',
  continue: 'המשך',
  saving: 'שומרים',
  loading: 'טוענים',
};

const RECOVERY_TEXT = {
  bootstrapFailed: 'לא הצלחנו להכין את החשבון. אפשר לנסות שוב.',
  retry: 'נסו שוב',
  returnToSignIn: 'חזרה להתחברות',
  signOutFailed: 'לא הצלחנו לחזור להתחברות. נסו שוב.',
  saveFailed: 'לא הצלחנו לשמור את השם. הפרטים נשמרו במסך ואפשר לנסות שוב.',
};

type BootstrapStatus =
  | 'checking'
  | 'bootstrapping'
  | 'awaiting-user'
  | 'failed';

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

function normalizeSuggestedName(value?: string | null) {
  if (typeof value !== 'string') {
    return '';
  }

  const normalized = value.trim();
  if (!normalized) {
    return '';
  }

  if (normalized.toLowerCase() === 'user') {
    return '';
  }

  return normalized;
}

function shouldAutofillFromOAuthProvider(externalId?: string | null) {
  if (!externalId) {
    return false;
  }

  return externalId.startsWith('google:') || externalId.startsWith('apple:');
}

export default function NameCaptureScreen() {
  const router = useRouter();
  const { signOut } = useAuthActions();
  const { isAuthenticated, isLoading: isAuthLoading } = useConvexAuth();
  const user = useQuery(api.users.getCurrentUser);
  const createOrUpdateUser = useMutation(api.auth.createOrUpdateUser);
  const setMyName = useMutation(api.users.setMyName);

  const [firstName, setFirstName] = useState('');
  const [lastName, setLastName] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [bootstrapStatus, setBootstrapStatus] =
    useState<BootstrapStatus>('checking');
  const [bootstrapError, setBootstrapError] = useState('');
  const [saveError, setSaveError] = useState('');
  const [isSigningOut, setIsSigningOut] = useState(false);
  const didPrefillRef = useRef(false);
  const canAutofillFromOAuth = useMemo(
    () => shouldAutofillFromOAuthProvider(user?.externalId),
    [user?.externalId]
  );

  const bootstrapUser = useCallback(async () => {
    if (!isAuthenticated || bootstrapStatus === 'bootstrapping') {
      return;
    }

    setBootstrapStatus('bootstrapping');
    setBootstrapError('');
    try {
      await createOrUpdateUser({});
      setBootstrapStatus('awaiting-user');
    } catch {
      setBootstrapError(RECOVERY_TEXT.bootstrapFailed);
      setBootstrapStatus('failed');
    }
  }, [bootstrapStatus, createOrUpdateUser, isAuthenticated]);

  useEffect(() => {
    if (isAuthLoading || user === undefined) {
      return;
    }

    if (!isAuthenticated) {
      router.replace('/(auth)/sign-up');
      return;
    }

    if (user !== null || bootstrapStatus !== 'checking') {
      return;
    }

    void bootstrapUser();
  }, [
    bootstrapStatus,
    bootstrapUser,
    isAuthenticated,
    isAuthLoading,
    router,
    user,
  ]);

  useEffect(() => {
    if (!user || didPrefillRef.current) {
      return;
    }

    if (!canAutofillFromOAuth) {
      didPrefillRef.current = true;
      return;
    }

    const fallbackFromFullName = splitFullName(user.fullName);
    const nextFirstName =
      normalizeSuggestedName(user.firstName) ||
      normalizeSuggestedName(fallbackFromFullName.firstName);
    const nextLastName =
      normalizeSuggestedName(user.lastName) ||
      normalizeSuggestedName(fallbackFromFullName.lastName);

    if (nextFirstName) {
      setFirstName(nextFirstName);
    }
    if (nextLastName) {
      setLastName(nextLastName);
    }

    didPrefillRef.current = true;
  }, [user, canAutofillFromOAuth]);

  const canContinue = useMemo(
    () => firstName.trim().length > 0 && lastName.trim().length > 0,
    [firstName, lastName]
  );

  const handleContinue = async () => {
    if (!canContinue || isSubmitting) {
      return;
    }

    setIsSubmitting(true);
    setSaveError('');
    try {
      await setMyName({
        firstName: firstName.trim(),
        lastName: lastName.trim(),
      });
      router.replace('/(auth)/onboarding-client-interests');
    } catch {
      setSaveError(RECOVERY_TEXT.saveFailed);
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleReturnToSignIn = async () => {
    if (isSigningOut) {
      return;
    }

    setIsSigningOut(true);
    setBootstrapError('');
    try {
      await signOut();
      router.replace('/(auth)/welcome');
    } catch {
      setBootstrapError(RECOVERY_TEXT.signOutFailed);
    } finally {
      setIsSigningOut(false);
    }
  };

  if (
    user === undefined ||
    isAuthLoading ||
    (user === null &&
      (bootstrapStatus === 'checking' ||
        bootstrapStatus === 'bootstrapping' ||
        bootstrapStatus === 'awaiting-user'))
  ) {
    return (
      <SafeAreaView style={styles.loadingContainer}>
        <ActivityIndicator size="small" color="#2563eb" />
        <Text style={styles.loadingText}>{TEXT.loading}</Text>
      </SafeAreaView>
    );
  }

  if (user === null && bootstrapStatus === 'failed') {
    return (
      <SafeAreaView style={styles.loadingContainer}>
        <Text style={styles.recoveryText}>{bootstrapError}</Text>
        <Pressable
          accessibilityRole="button"
          disabled={isSigningOut}
          onPress={() => {
            void bootstrapUser();
          }}
          style={styles.recoveryPrimaryButton}
        >
          <Text style={styles.recoveryPrimaryText}>{RECOVERY_TEXT.retry}</Text>
        </Pressable>
        <Pressable
          accessibilityRole="button"
          disabled={isSigningOut}
          onPress={() => {
            void handleReturnToSignIn();
          }}
          style={styles.recoverySecondaryButton}
        >
          <Text style={styles.recoverySecondaryText}>
            {RECOVERY_TEXT.returnToSignIn}
          </Text>
        </Pressable>
      </SafeAreaView>
    );
  }

  if (user === null) {
    return (
      <SafeAreaView style={styles.loadingContainer}>
        <Text style={styles.loadingText}>{TEXT.loading}</Text>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.container}>
      <KeyboardAvoidingView
        style={styles.content}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      >
        <StandaloneBackTitleHeader
          title={TEXT.title}
          onBackPress={() => safeBack('/(auth)/sign-up')}
          leftAccessory={<OnboardingProgress total={3} current={1} />}
          style={styles.header}
          titleStyle={styles.title}
        />

        <View style={styles.form}>
          <View style={styles.inputBlock}>
            <Text style={styles.inputLabel}>{TEXT.firstNameLabel}</Text>
            <TextInput
              value={firstName}
              onChangeText={(value) => {
                setFirstName(value);
                setSaveError('');
              }}
              placeholder={TEXT.firstNamePlaceholder}
              placeholderTextColor="#9CA3AF"
              autoCapitalize="words"
              returnKeyType="next"
              style={styles.input}
              textAlign="right"
              accessibilityLabel={TEXT.firstNameA11y}
            />
          </View>

          <View style={styles.inputBlock}>
            <Text style={styles.inputLabel}>{TEXT.lastNameLabel}</Text>
            <TextInput
              value={lastName}
              onChangeText={(value) => {
                setLastName(value);
                setSaveError('');
              }}
              placeholder={TEXT.lastNamePlaceholder}
              placeholderTextColor="#9CA3AF"
              autoCapitalize="words"
              returnKeyType="done"
              style={styles.input}
              textAlign="right"
              accessibilityLabel={TEXT.lastNameA11y}
            />
          </View>
        </View>

        {saveError ? <Text style={styles.errorText}>{saveError}</Text> : null}

        <View style={styles.footer}>
          <ContinueButton
            onPress={() => {
              void handleContinue();
            }}
            disabled={!canContinue || isSubmitting}
            label={isSubmitting ? TEXT.saving : TEXT.continue}
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
    width: '100%',
    maxWidth: 560,
    alignSelf: 'center',
    paddingHorizontal: 20,
    paddingTop: 20,
    paddingBottom: 32,
  },
  header: {
    marginBottom: 12,
  },
  loadingContainer: {
    flex: 1,
    backgroundColor: '#FBFAF7',
    justifyContent: 'center',
    alignItems: 'center',
    gap: 10,
  },
  loadingText: {
    fontSize: 14,
    fontWeight: '700',
    color: '#64748b',
    textAlign: 'center',
    writingDirection: 'rtl',
  },
  recoveryText: {
    maxWidth: 360,
    paddingHorizontal: 24,
    fontSize: 15,
    fontWeight: '700',
    color: '#B91C1C',
    textAlign: 'center',
    writingDirection: 'rtl',
    lineHeight: 22,
  },
  recoveryPrimaryButton: {
    minWidth: 180,
    borderRadius: 999,
    backgroundColor: '#2563EB',
    paddingHorizontal: 24,
    paddingVertical: 12,
    alignItems: 'center',
  },
  recoveryPrimaryText: {
    fontSize: 15,
    fontWeight: '800',
    color: '#FFFFFF',
    textAlign: 'center',
  },
  recoverySecondaryButton: {
    paddingHorizontal: 20,
    paddingVertical: 10,
  },
  recoverySecondaryText: {
    fontSize: 14,
    fontWeight: '700',
    color: '#2563EB',
    textAlign: 'center',
    writingDirection: 'rtl',
  },
  title: {
    fontSize: 24,
    fontWeight: '900',
    color: '#111827',
    textAlign: 'right',
    writingDirection: 'rtl',
    marginBottom: 8,
    lineHeight: 32,
    maxWidth: '100%',
    flexShrink: 1,
  },
  subtitle: {
    fontSize: 14,
    fontWeight: '600',
    color: '#6b7280',
    textAlign: 'right',
    writingDirection: 'rtl',
    lineHeight: 20,
    maxWidth: '100%',
  },
  form: {
    marginTop: 20,
    gap: 16,
  },
  inputBlock: {
    marginTop: 0,
  },
  inputLabel: {
    fontSize: 12,
    fontWeight: '700',
    color: '#9CA3AF',
    textAlign: 'right',
    writingDirection: 'rtl',
    marginBottom: 8,
  },
  input: {
    borderRadius: 16,
    borderWidth: 1,
    borderColor: '#E5E7EB',
    backgroundColor: '#FFFFFF',
    paddingHorizontal: 14,
    paddingVertical: 14,
    fontSize: 16,
    fontWeight: '600',
    color: '#111827',
  },
  errorText: {
    marginTop: 14,
    fontSize: 13,
    fontWeight: '700',
    color: '#B91C1C',
    textAlign: 'right',
    writingDirection: 'rtl',
    lineHeight: 20,
  },
  footer: {
    marginTop: 'auto',
  },
});
