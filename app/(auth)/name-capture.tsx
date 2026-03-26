import { useConvexAuth, useMutation, useQuery } from 'convex/react';
import { useRouter } from 'expo-router';
import { useEffect, useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { BackButton } from '@/components/BackButton';
import { ContinueButton } from '@/components/ContinueButton';
import { OnboardingProgress } from '@/components/OnboardingProgress';
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

const AUTH_REDIRECT_DELAY_MS = 1800;

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
  const { isAuthenticated, isLoading: isAuthLoading } = useConvexAuth();
  const user = useQuery(api.users.getCurrentUser);
  const createOrUpdateUser = useMutation(api.auth.createOrUpdateUser);
  const setMyName = useMutation(api.users.setMyName);

  const [firstName, setFirstName] = useState('');
  const [lastName, setLastName] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isBootstrappingUser, setIsBootstrappingUser] = useState(false);
  const [allowUnauthRedirect, setAllowUnauthRedirect] = useState(false);
  const didPrefillRef = useRef(false);
  const bootstrapAttemptedRef = useRef(false);
  const canAutofillFromOAuth = useMemo(
    () => shouldAutofillFromOAuthProvider(user?.externalId),
    [user?.externalId]
  );

  useEffect(() => {
    const timer = setTimeout(() => {
      setAllowUnauthRedirect(true);
    }, AUTH_REDIRECT_DELAY_MS);

    return () => clearTimeout(timer);
  }, []);

  useEffect(() => {
    if (isAuthLoading || user !== null) {
      return;
    }

    if (!isAuthenticated) {
      if (!allowUnauthRedirect) {
        return;
      }
      router.replace('/(auth)/sign-up');
      return;
    }

    if (isBootstrappingUser || bootstrapAttemptedRef.current) {
      return;
    }

    bootstrapAttemptedRef.current = true;
    setIsBootstrappingUser(true);
    const run = async () => {
      try {
        await createOrUpdateUser({});
      } catch {
        if (allowUnauthRedirect) {
          router.replace('/(auth)/sign-up');
        }
      } finally {
        setIsBootstrappingUser(false);
      }
    };

    void run();
  }, [
    createOrUpdateUser,
    isAuthenticated,
    isAuthLoading,
    isBootstrappingUser,
    allowUnauthRedirect,
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
    try {
      await setMyName({
        firstName: firstName.trim(),
        lastName: lastName.trim(),
      });
      router.replace('/(auth)/onboarding-client-interests');
    } finally {
      setIsSubmitting(false);
    }
  };

  if (
    user === undefined ||
    isAuthLoading ||
    isBootstrappingUser ||
    (isAuthenticated && user === null)
  ) {
    return (
      <SafeAreaView style={styles.loadingContainer}>
        <ActivityIndicator size="small" color="#2563eb" />
        <Text style={styles.loadingText}>{TEXT.loading}</Text>
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
        <View style={styles.header}>
          <BackButton onPress={() => safeBack('/(auth)/sign-up')} />
          <OnboardingProgress total={8} current={3} />
        </View>

        <View style={styles.titleContainer}>
          <Text style={styles.title}>{TEXT.title}</Text>
        </View>

        <View style={styles.form}>
          <View style={styles.inputBlock}>
            <Text style={styles.inputLabel}>{TEXT.firstNameLabel}</Text>
            <TextInput
              value={firstName}
              onChangeText={setFirstName}
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
              onChangeText={setLastName}
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
    paddingHorizontal: 24,
    paddingTop: 40,
    paddingBottom: 32,
  },
  header: {
    flexDirection: 'row-reverse',
    alignItems: 'center',
    justifyContent: 'space-between',
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
  titleContainer: {
    alignItems: 'flex-end',
    marginTop: 24,
    width: '100%',
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
    marginTop: 32,
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
  footer: {
    marginTop: 'auto',
  },
});
