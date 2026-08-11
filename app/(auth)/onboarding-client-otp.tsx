import { useAuthActions } from '@convex-dev/auth/react';
import { useConvexAuth } from 'convex/react';
import { type Href, useLocalSearchParams, useRouter } from 'expo-router';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator,
  type NativeSyntheticEvent,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  type TextInputKeyPressEventData,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { ContinueButton } from '@/components/ContinueButton';
import { StandaloneBackTitleHeader } from '@/components/StandaloneBackTitleHeader';
import { useSessionContext, useUser } from '@/contexts/UserContext';
import { useActiveBusiness } from '@/hooks/useActiveBusiness';
import { ANALYTICS_EVENTS } from '@/lib/analytics/events';
import {
  isPostAuthTransitionPending,
  resolvePostAuthRoute,
} from '@/lib/auth/postAuthRouting';
import { safeBack } from '@/lib/navigation';
import { useOnboardingTracking } from '@/lib/onboarding/useOnboardingTracking';
import { flexDirection, justifyContent } from '@/lib/rtl';

const CODE_LENGTH = 6;
const RESEND_COOLDOWN_SECONDS = 3 * 60;
const POST_AUTH_TIMEOUT_MS = 8000;

const TEXT = {
  title: 'מה הקוד שקיבלת?',
  noContactSubtitle: 'שלחנו קוד לאימות הפרטים שלך',
  resend: 'שלח שוב',
  resendSending: 'שולח',
  incompleteCode: 'אנא הזן את כל הקוד שקיבלת',
  editDetails: 'ערוך פרטים',
  continue: 'המשך',
  invalidCode: 'קוד לא תקין. בדקו את האימייל או שלחו שוב קוד אימות.',
  expiredCode: 'לא נמצא קוד פעיל בקשו קוד חדש',
  maxAttempts: 'חרגת ממספר הניסיונות בקשו קוד חדש',
  sendFailed: 'שליחת הקוד נכשלה נסו שוב',
  rateLimited: 'אפשר לבקש קוד חדש כל 3 דקות',
  missingConfig: 'אימות הקוד לא זמין כרגע. אפשר לנסות שוב מאוחר יותר.',
  missingSession: 'לא זוהתה התחברות פעילה. נסו שוב.',
};

export default function OnboardingOtpScreen() {
  const router = useRouter();
  const { contact, sent } = useLocalSearchParams<{
    contact?: string | string[];
    sent?: string | string[];
  }>();
  const { signIn } = useAuthActions();
  const { isAuthenticated, isLoading: isAuthLoading } = useConvexAuth();
  const { user: currentUser, isLoading: isUserLoading } = useUser();
  const sessionContext = useSessionContext();
  const { activeBusinessId } = useActiveBusiness();

  const [digits, setDigits] = useState<string[]>(
    Array.from({ length: CODE_LENGTH }, () => '')
  );
  const [secondsLeft, setSecondsLeft] = useState(RESEND_COOLDOWN_SECONDS);
  const [error, setError] = useState('');
  const [isSending, setIsSending] = useState(false);
  const [isVerifying, setIsVerifying] = useState(false);
  const [isAwaitingSession, setIsAwaitingSession] = useState(false);
  const inputsRef = useRef<Array<TextInput | null>>([]);
  const isSendingRef = useRef(false);
  const otpSentRef = useRef(false);
  const lastAutoSubmittedCodeRef = useRef<string | null>(null);
  const postAuthTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const hasNavigatedRef = useRef(false);
  const digitIndexes = useMemo(
    () => Array.from({ length: CODE_LENGTH }, (_, index) => index),
    []
  );
  const { completeStep, trackContinue, trackError, trackEvent } =
    useOnboardingTracking({
      screen: 'onboarding_client_otp',
      role: 'client',
    });

  const clearPostAuthTimeout = useCallback(() => {
    if (postAuthTimeoutRef.current) {
      clearTimeout(postAuthTimeoutRef.current);
      postAuthTimeoutRef.current = null;
    }
  }, []);

  const resolverUser = isUserLoading ? undefined : currentUser;
  const isTransitionPending = isPostAuthTransitionPending({
    user: resolverUser,
    sessionContext,
  });
  const postAuthResolution = resolvePostAuthRoute({
    isAuthLoading,
    isAuthenticated,
    user: resolverUser,
    sessionContext,
    activeBusinessId,
  });

  const contactValue = useMemo(() => {
    if (Array.isArray(contact)) {
      return contact[0] ?? '';
    }
    return contact ?? '';
  }, [contact]);

  const sentValue = useMemo(() => {
    if (Array.isArray(sent)) {
      return sent[0] ?? '';
    }
    return sent ?? '';
  }, [sent]);

  const shouldSkipInitialSend = useMemo(
    () => sentValue === '1' || sentValue.toLowerCase() === 'true',
    [sentValue]
  );

  const isEmailContact = useMemo(
    () => contactValue.includes('@'),
    [contactValue]
  );

  const otpChannel = isEmailContact ? 'email' : 'sms';

  const mapOtpError = useCallback((value: unknown) => {
    if (!(value instanceof Error)) {
      return TEXT.sendFailed;
    }
    if (value.message === 'OTP_INVALID') {
      return TEXT.invalidCode;
    }
    if (
      value.message.includes('Invalid verification code') ||
      value.message.includes('Could not verify code') ||
      value.message.includes('Invalid code')
    ) {
      return TEXT.invalidCode;
    }
    if (value.message === 'OTP_NOT_FOUND') {
      return TEXT.expiredCode;
    }
    if (value.message.includes('Expired verification code')) {
      return TEXT.expiredCode;
    }
    if (value.message === 'OTP_MAX_ATTEMPTS') {
      return TEXT.maxAttempts;
    }
    if (value.message.includes('Too many failed attempts')) {
      return TEXT.maxAttempts;
    }
    if (value.message === 'RATE_LIMITED') {
      return TEXT.rateLimited;
    }
    if (value.message.includes('TooManyRequests')) {
      return TEXT.rateLimited;
    }
    if (value.message === 'OTP_NOT_CONFIGURED') {
      return TEXT.missingConfig;
    }
    return TEXT.sendFailed;
  }, []);

  const sendCode = useCallback(
    async (resetFields: boolean) => {
      if (!isEmailContact || !contactValue || isSendingRef.current) {
        return;
      }

      isSendingRef.current = true;
      setIsSending(true);
      setError('');

      try {
        await signIn('email', {
          email: contactValue.trim().toLowerCase(),
        });
        if (resetFields) {
          setDigits(Array.from({ length: CODE_LENGTH }, () => ''));
          inputsRef.current[0]?.focus();
        }
        setSecondsLeft(RESEND_COOLDOWN_SECONDS);
      } catch (err: unknown) {
        setError(mapOtpError(err));
      } finally {
        isSendingRef.current = false;
        setIsSending(false);
      }
    },
    [contactValue, isEmailContact, signIn, mapOtpError]
  );

  useEffect(() => {
    if (otpSentRef.current || !isEmailContact || !contactValue) {
      return;
    }

    otpSentRef.current = true;

    if (shouldSkipInitialSend) {
      return;
    }

    trackEvent(ANALYTICS_EVENTS.otpSent, { channel: otpChannel });
    void sendCode(false);
  }, [
    contactValue,
    isEmailContact,
    otpChannel,
    sendCode,
    shouldSkipInitialSend,
    trackEvent,
  ]);

  useEffect(() => {
    const timer = setInterval(() => {
      setSecondsLeft((prev) => (prev > 0 ? prev - 1 : 0));
    }, 1000);

    return () => clearInterval(timer);
  }, []);

  const isComplete = useMemo(
    () => digits.every((digit) => digit.length === 1),
    [digits]
  );
  const otpCode = useMemo(() => digits.join(''), [digits]);

  const handleChange = (index: number, value: string) => {
    const sanitized = value.replace(/\D/g, '');
    lastAutoSubmittedCodeRef.current = null;

    if (error) {
      setError('');
    }

    if (sanitized.length === 0) {
      setDigits((prev) => {
        const next = [...prev];
        next[index] = '';
        return next;
      });
      return;
    }

    if (sanitized.length === 1) {
      setDigits((prev) => {
        const next = [...prev];
        next[index] = sanitized;
        return next;
      });

      if (index < CODE_LENGTH - 1) {
        inputsRef.current[index + 1]?.focus();
      }
      return;
    }

    setDigits((prev) => {
      const next = [...prev];
      for (let i = 0; i < sanitized.length && index + i < CODE_LENGTH; i += 1) {
        next[index + i] = sanitized[i];
      }
      return next;
    });

    const nextIndex = Math.min(index + sanitized.length, CODE_LENGTH - 1);
    inputsRef.current[nextIndex]?.focus();
  };

  const handleKeyPress = (
    index: number,
    event: NativeSyntheticEvent<TextInputKeyPressEventData>
  ) => {
    if (event.nativeEvent.key !== 'Backspace') {
      return;
    }

    if (digits[index]) {
      return;
    }

    if (index === 0) {
      return;
    }

    inputsRef.current[index - 1]?.focus();
  };

  const formattedTimer = useMemo(() => {
    const minutes = Math.floor(secondsLeft / 60)
      .toString()
      .padStart(2, '0');
    const seconds = (secondsLeft % 60).toString().padStart(2, '0');
    return `${minutes}:${seconds}`;
  }, [secondsLeft]);

  const resendLabel = useMemo(() => {
    if (isSending) {
      return TEXT.resendSending;
    }
    if (secondsLeft === 0) {
      return TEXT.resend;
    }
    return `${TEXT.resend} (${formattedTimer})`;
  }, [formattedTimer, isSending, secondsLeft]);

  const handleResend = () => {
    if (secondsLeft > 0 || isSending) {
      return;
    }

    trackEvent(ANALYTICS_EVENTS.otpResent, { channel: otpChannel });
    void sendCode(true);
  };

  const backRoute = '/(auth)/sign-up-email';

  useEffect(() => {
    if (
      !isAwaitingSession ||
      hasNavigatedRef.current ||
      (!isTransitionPending && postAuthResolution.status === 'route')
    ) {
      return;
    }

    if (!postAuthTimeoutRef.current) {
      postAuthTimeoutRef.current = setTimeout(() => {
        postAuthTimeoutRef.current = null;
        setIsAwaitingSession(false);
        setError(TEXT.missingSession);
      }, POST_AUTH_TIMEOUT_MS);
    }

    return clearPostAuthTimeout;
  }, [
    clearPostAuthTimeout,
    isAwaitingSession,
    isTransitionPending,
    postAuthResolution.status,
  ]);

  useEffect(() => {
    if (
      !isAwaitingSession ||
      hasNavigatedRef.current ||
      isTransitionPending ||
      postAuthResolution.status !== 'route'
    ) {
      return;
    }

    hasNavigatedRef.current = true;
    clearPostAuthTimeout();
    router.replace(postAuthResolution.href as Href);
  }, [
    clearPostAuthTimeout,
    isAwaitingSession,
    isTransitionPending,
    postAuthResolution,
    router,
  ]);

  const handleContinue = useCallback(async () => {
    if (!isComplete || isVerifying || isAwaitingSession) {
      if (!isComplete) {
        setError(TEXT.incompleteCode);
        trackError('otp', 'incomplete');
        trackEvent(ANALYTICS_EVENTS.otpFailed, { error_code: 'invalid' });
      }
      return;
    }

    setIsVerifying(true);
    setError('');

    try {
      if (isEmailContact && contactValue) {
        const result = await signIn('email', {
          email: contactValue.trim().toLowerCase(),
          code: otpCode,
        });
        if (!result.signingIn) {
          throw new Error('OTP_INVALID');
        }
      }

      trackContinue();
      trackEvent(ANALYTICS_EVENTS.otpVerified);
      completeStep();
      setIsAwaitingSession(true);
    } catch (err: unknown) {
      const mapped = mapOtpError(err);
      setError(mapped);
      trackError('otp', 'verification_failed');
      trackEvent(ANALYTICS_EVENTS.otpFailed, {
        error_code: err instanceof Error ? err.message : 'UNKNOWN',
      });
    } finally {
      setIsVerifying(false);
    }
  }, [
    contactValue,
    completeStep,
    isComplete,
    isAwaitingSession,
    isEmailContact,
    isVerifying,
    mapOtpError,
    signIn,
    trackContinue,
    trackError,
    trackEvent,
    otpCode,
  ]);

  useEffect(() => {
    if (!isComplete || isVerifying || isSending || isAwaitingSession) {
      return;
    }

    if (lastAutoSubmittedCodeRef.current === otpCode) {
      return;
    }

    lastAutoSubmittedCodeRef.current = otpCode;
    void handleContinue();
  }, [
    handleContinue,
    isAwaitingSession,
    isComplete,
    isSending,
    isVerifying,
    otpCode,
  ]);

  if (isAwaitingSession) {
    return (
      <SafeAreaView style={styles.container}>
        <View style={styles.postAuthContent}>
          <ActivityIndicator size="small" color="#2563eb" />
          <Text style={styles.postAuthText}>משלימים התחברות</Text>
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.content}>
        <StandaloneBackTitleHeader
          title={TEXT.title}
          subtitle={
            contactValue
              ? `שלחנו קוד אל ${contactValue}`
              : TEXT.noContactSubtitle
          }
          onBackPress={() => safeBack(backRoute)}
          style={styles.headerRow}
          titleStyle={styles.title}
          subtitleStyle={styles.subtitle}
        />

        <View style={styles.digitsContainer}>
          {digitIndexes.map((digitIndex) => (
            <TextInput
              key={`digit-${digitIndex}`}
              ref={(ref) => {
                inputsRef.current[digitIndex] = ref;
              }}
              value={digits[digitIndex]}
              onChangeText={(value) => handleChange(digitIndex, value)}
              onKeyPress={(event) => handleKeyPress(digitIndex, event)}
              keyboardType="number-pad"
              returnKeyType="done"
              textContentType="oneTimeCode"
              maxLength={CODE_LENGTH}
              style={styles.digitInput}
              accessibilityLabel={`ספרה ${digitIndex + 1} בקוד`}
            />
          ))}
        </View>

        {error ? <Text style={styles.errorText}>{error}</Text> : null}

        <View style={styles.actionsContainer}>
          <Pressable
            onPress={handleResend}
            disabled={secondsLeft > 0 || isSending}
          >
            <Text
              style={[
                styles.resendText,
                secondsLeft > 0 || isSending
                  ? styles.resendTextDisabled
                  : styles.resendTextActive,
              ]}
            >
              {resendLabel}
            </Text>
          </Pressable>

          <Pressable
            onPress={() => safeBack(backRoute)}
            style={styles.editButton}
          >
            <Text style={styles.editText}>{TEXT.editDetails}</Text>
          </Pressable>
        </View>

        <View style={styles.footer}>
          <ContinueButton
            onPress={() => {
              void handleContinue();
            }}
            disabled={
              !isComplete || isVerifying || isSending || isAwaitingSession
            }
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
    width: '100%',
    maxWidth: 560,
    alignSelf: 'center',
    paddingHorizontal: 20,
    paddingTop: 16,
    paddingBottom: 32,
  },
  headerRow: {
    marginBottom: 28,
  },
  title: {
    fontSize: 24,
    fontWeight: '900',
    color: '#111827',
    textAlign: 'right',
    marginBottom: 8,
  },
  subtitle: {
    marginTop: 5,
    fontSize: 14,
    fontWeight: '600',
    color: '#64748B',
    textAlign: 'right',
  },
  digitsContainer: {
    marginTop: 22,
    flexDirection: flexDirection.row,
    direction: 'ltr',
    justifyContent: 'space-between',
    gap: 6,
  },
  digitInput: {
    flex: 1,
    height: 48,
    minWidth: 38,
    maxWidth: 48,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: '#e5e7eb',
    backgroundColor: '#ffffff',
    fontSize: 18,
    fontWeight: '700',
    color: '#111827',
    textAlign: 'center',
    writingDirection: 'ltr',
  },
  errorText: {
    marginTop: 16,
    fontSize: 14,
    fontWeight: '600',
    color: '#dc2626',
    textAlign: 'right',
  },
  actionsContainer: {
    marginTop: 24,
    alignItems: 'center',
  },
  resendText: {
    fontSize: 16,
    fontWeight: '700',
    color: '#2563eb',
  },
  resendTextDisabled: {
    fontWeight: '700',
  },
  resendTextActive: {
    fontWeight: '900',
  },
  editButton: {
    marginTop: 12,
  },
  editText: {
    fontSize: 14,
    fontWeight: '600',
    color: '#d1d5db',
  },
  footer: {
    flex: 1,
    justifyContent: justifyContent.end,
    paddingBottom: 24,
  },
  postAuthContent: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 12,
    paddingHorizontal: 24,
  },
  postAuthText: {
    fontSize: 15,
    fontWeight: '700',
    color: '#1f2937',
    textAlign: 'center',
    writingDirection: 'rtl',
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
