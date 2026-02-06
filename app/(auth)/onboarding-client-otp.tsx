import { useLocalSearchParams } from 'expo-router';
import React, { useEffect, useMemo, useRef, useState } from 'react';
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
import { OnboardingProgress } from '@/components/OnboardingProgress';
import { safeBack, safePush } from '@/lib/navigation';

const CODE_LENGTH = 6;

export default function OnboardingOtpScreen() {
  const { contact } = useLocalSearchParams<{ contact?: string | string[] }>();
  const [digits, setDigits] = useState<string[]>(
    Array.from({ length: CODE_LENGTH }, () => '')
  );
  const [secondsLeft, setSecondsLeft] = useState(59);
  const [error, setError] = useState('');
  const inputsRef = useRef<Array<TextInput | null>>([]);

  const contactValue = useMemo(() => {
    if (Array.isArray(contact)) return contact[0] ?? '';
    return contact ?? '';
  }, [contact]);

  const headerSubtitle = useMemo(() => {
    if (!contactValue) return 'שלחנו קוד לאימות הפרטים שלך';
    return `שלחנו קוד ל-${contactValue}`;
  }, [contactValue]);

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
    if (error) setError('');
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
    if (event.nativeEvent.key !== 'Backspace') return;
    if (digits[index]) return;
    if (index === 0) return;
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
    if (secondsLeft === 0) return 'שלח שוב';
    return `שלח שוב (${formattedTimer})`;
  }, [formattedTimer, secondsLeft]);

  const handleResend = () => {
    if (secondsLeft > 0) return;
    setSecondsLeft(59);
    setDigits(Array.from({ length: CODE_LENGTH }, () => ''));
    setError('');
    inputsRef.current[0]?.focus();
  };

  const handleContinue = () => {
    if (!isComplete) {
      setError('אנא הזן את כל הקוד שקיבלת.');
      return;
    }
    safePush('/(auth)/onboarding-client-interests');
  };

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.content}>
        <View style={styles.headerRow}>
          <BackButton
            onPress={() => safeBack('/(auth)/onboarding-client-details')}
          />
          <OnboardingProgress total={8} current={3} />
        </View>

        <View style={styles.titleContainer}>
          <Text style={styles.title}>מה הקוד שקיבלת?</Text>
          <Text style={styles.subtitle}>{headerSubtitle}</Text>
        </View>

        <View style={styles.digitsContainer}>
          {digits.map((digit, index) => (
            <TextInput
              key={`digit-${index}`}
              ref={(ref) => {
                inputsRef.current[index] = ref;
              }}
              value={digit}
              onChangeText={(value) => handleChange(index, value)}
              onKeyPress={(event) => handleKeyPress(index, event)}
              keyboardType="number-pad"
              returnKeyType="done"
              textContentType="oneTimeCode"
              maxLength={CODE_LENGTH}
              style={[styles.digitInput, { textAlign: 'center' }]}
              accessibilityLabel={`ספרה ${index + 1} בקוד`}
            />
          ))}
        </View>

        {error ? <Text style={styles.errorText}>{error}</Text> : null}

        <View style={styles.actionsContainer}>
          <Pressable onPress={handleResend} disabled={secondsLeft > 0}>
            <Text
              style={[
                styles.resendText,
                secondsLeft > 0
                  ? styles.resendTextDisabled
                  : styles.resendTextActive,
              ]}
            >
              {resendLabel}
            </Text>
          </Pressable>

          <Pressable
            onPress={() => safeBack('/(auth)/onboarding-client-details')}
            style={styles.editButton}
          >
            <Text style={styles.editText}>ערוך פרטים</Text>
          </Pressable>
        </View>

        <View style={styles.footer}>
          <Pressable
            onPress={handleContinue}
            disabled={!isComplete}
            accessibilityRole="button"
            accessibilityState={{ disabled: !isComplete }}
          >
            <View
              style={[
                styles.button,
                isComplete ? styles.buttonActive : styles.buttonInactive,
              ]}
            >
              <Text
                style={[
                  styles.buttonText,
                  isComplete
                    ? styles.buttonTextActive
                    : styles.buttonTextInactive,
                ]}
              >
                המשך
              </Text>
            </View>
          </Pressable>
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
    flexDirection: 'row-reverse',
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
