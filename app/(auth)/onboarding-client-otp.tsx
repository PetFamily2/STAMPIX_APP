import { useAction, useMutation } from 'convex/react';
import { useLocalSearchParams } from 'expo-router';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  type NativeSyntheticEvent,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  type TextInputKeyPressEventData,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { BackButton } from '@/components/BackButton';
import { ContinueButton } from '@/components/ContinueButton';
import { OnboardingProgress } from '@/components/OnboardingProgress';
import { api } from '@/convex/_generated/api';
import { ANALYTICS_EVENTS } from '@/lib/analytics/events';
import { safeBack, safePush } from '@/lib/navigation';
import { useOnboardingTracking } from '@/lib/onboarding/useOnboardingTracking';

const CODE_LENGTH = 6;

const TEXT = {
  title: 'מה הקוד שקיבלת?',
  noContactSubtitle: 'שלחנו קוד לאימות הפרטים שלך',
  resend: 'שלח שוב',
  resendSending: 'שולח...',
  incompleteCode: 'אנא הזן את כל הקוד שקיבלת.',
  editDetails: 'ערוך פרטים',
  continue: 'המשך',
  invalidCode: 'הקוד לא תקין. נסו שוב.',
  expiredCode: 'לא נמצא קוד פעיל. בקשו קוד חדש.',
  maxAttempts: 'חרגת ממספר הניסיונות. בקשו קוד חדש.',
  sendFailed: 'שליחת הקוד נכשלה. נסו שוב.',
  rateLimited: 'אפשר לבקש קוד חדש כל 30 שניות.',
  missingConfig: 'שירות האימייל לא מוגדר עדיין. בדקו את ההגדרות בסביבת Convex.',
};

export default function OnboardingOtpScreen() {
  const { contact, role, sent } = useLocalSearchParams<{
    contact?: string | string[];
    role?: string | string[];
    sent?: string | string[];
  }>();
  const sendEmailOtp = useAction(api.otp.sendEmailOtp);
  const verifyEmailOtp = useMutation(api.otp.verifyEmailOtp);

  const [digits, setDigits] = useState<string[]>(
    Array.from({ length: CODE_LENGTH }, () => '')
  );
  const [secondsLeft, setSecondsLeft] = useState(59);
  const [error, setError] = useState('');
  const [isSending, setIsSending] = useState(false);
  const [isVerifying, setIsVerifying] = useState(false);
  const inputsRef = useRef<Array<TextInput | null>>([]);
  const isSendingRef = useRef(false);
  const otpSentRef = useRef(false);
  const digitIndexes = useMemo(
    () => Array.from({ length: CODE_LENGTH }, (_, index) => index),
    []
  );
  const { completeStep, trackContinue, trackError, trackEvent } =
    useOnboardingTracking({
      screen: 'onboarding_client_otp',
      role: 'client',
    });

  const contactValue = useMemo(() => {
    if (Array.isArray(contact)) {
      return contact[0] ?? '';
    }
    return contact ?? '';
  }, [contact]);

  const roleValue = useMemo(() => {
    if (Array.isArray(role)) {
      return role[0] ?? '';
    }
    return role ?? '';
  }, [role]);

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

  const headerSubtitle = useMemo(() => {
    if (!contactValue) {
      return TEXT.noContactSubtitle;
    }
    return `שלחנו קוד ל-${contactValue}`;
  }, [contactValue]);

  const otpChannel = isEmailContact ? 'email' : 'sms';

  const mapOtpError = (value: unknown) => {
    if (!(value instanceof Error)) {
      return TEXT.sendFailed;
    }
    if (value.message === 'OTP_INVALID') {
      return TEXT.invalidCode;
    }
    if (value.message === 'OTP_NOT_FOUND') {
      return TEXT.expiredCode;
    }
    if (value.message === 'OTP_MAX_ATTEMPTS') {
      return TEXT.maxAttempts;
    }
    if (value.message === 'RATE_LIMITED') {
      return TEXT.rateLimited;
    }
    if (value.message === 'OTP_NOT_CONFIGURED') {
      return TEXT.missingConfig;
    }
    return TEXT.sendFailed;
  };

  const sendCode = useCallback(
    async (resetFields: boolean) => {
      if (!isEmailContact || !contactValue || isSendingRef.current) {
        return;
      }

      isSendingRef.current = true;
      setIsSending(true);
      setError('');

      try {
        await sendEmailOtp({ email: contactValue.trim().toLowerCase() });
        if (resetFields) {
          setDigits(Array.from({ length: CODE_LENGTH }, () => ''));
          inputsRef.current[0]?.focus();
        }
        setSecondsLeft(59);
      } catch (err: unknown) {
        setError(mapOtpError(err));
      } finally {
        isSendingRef.current = false;
        setIsSending(false);
      }
    },
    [contactValue, isEmailContact, sendEmailOtp]
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

  const handleChange = (index: number, value: string) => {
    const sanitized = value.replace(/\D/g, '');

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

  const nextRoute =
    roleValue === 'business'
      ? '/(auth)/onboarding-business-role'
      : '/(auth)/onboarding-client-interests';
  const backRoute = roleValue
    ? `/(auth)/sign-up-email?role=${encodeURIComponent(roleValue)}`
    : '/(auth)/onboarding-client-details';

  const handleContinue = async () => {
    if (!isComplete || isVerifying) {
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
        await verifyEmailOtp({
          email: contactValue.trim().toLowerCase(),
          code: digits.join(''),
        });
      }

      trackContinue();
      trackEvent(ANALYTICS_EVENTS.otpVerified);
      completeStep();
      safePush(nextRoute);
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
  };

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.content}>
        <View style={styles.headerRow}>
          <BackButton onPress={() => safeBack(backRoute)} />
          <OnboardingProgress total={8} current={3} />
        </View>

        <View style={styles.titleContainer}>
          <Text style={styles.title}>{TEXT.title}</Text>
          <Text style={styles.subtitle}>{headerSubtitle}</Text>
        </View>

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
            disabled={!isComplete || isVerifying || isSending}
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
    marginTop: 64,
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
    color: '#2563eb',
    textAlign: 'right',
  },
  digitsContainer: {
    marginTop: 40,
    flexDirection: 'row',
    direction: 'ltr',
    justifyContent: 'space-between',
  },
  digitInput: {
    height: 48,
    width: 48,
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
    marginTop: 32,
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
    justifyContent: 'flex-end',
    paddingBottom: 24,
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
