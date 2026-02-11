import { useAction } from 'convex/react';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useMemo, useState } from 'react';
import {
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
import { PreviewModeBanner } from '@/components/PreviewModeBanner';
import { IS_DEV_MODE } from '@/config/appConfig';
import { api } from '@/convex/_generated/api';
import { safeBack } from '@/lib/navigation';

const TEXT = {
  title: 'התחברות עם אימייל',
  subtitle: 'נשלח לך קוד אימות',
  label: 'אימייל',
  placeholder: 'name@example.com',
  submit: 'שלחו לי קוד',
  sending: 'שולח קוד...',
  back: 'חזרה',
  sendFailed: 'לא הצלחנו לשלוח קוד. נסו שוב.',
  invalidEmail: 'כתובת האימייל לא תקינה.',
  rateLimited: 'אפשר לבקש קוד חדש כל 30 שניות.',
  missingConfig:
    'שירות האימייל לא מוגדר עדיין. בדקו את ההגדרות בסביבת Convex.',
};

function isValidEmail(value: string) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value.trim());
}

export default function SignUpEmailScreen() {
  const router = useRouter();
  const sendEmailOtp = useAction(api.otp.sendEmailOtp);
  const { preview, map, role } = useLocalSearchParams<{
    preview?: string;
    map?: string;
    role?: string;
  }>();
  const isPreviewMode = (IS_DEV_MODE && preview === 'true') || map === 'true';
  const [email, setEmail] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  const canSubmit = useMemo(() => isValidEmail(email), [email]);

  const handleBack = () => {
    const query = role ? `?role=${encodeURIComponent(role)}` : '';
    safeBack(`/(auth)/sign-up${query}`);
  };

  const mapSendError = (value: unknown) => {
    if (!(value instanceof Error)) {
      return TEXT.sendFailed;
    }
    if (value.message === 'INVALID_EMAIL') {
      return TEXT.invalidEmail;
    }
    if (value.message === 'RATE_LIMITED') {
      return TEXT.rateLimited;
    }
    if (value.message === 'OTP_NOT_CONFIGURED') {
      return TEXT.missingConfig;
    }
    return TEXT.sendFailed;
  };

  const handleSendCode = async () => {
    if (!canSubmit || busy) {
      return;
    }

    const normalizedEmail = email.trim().toLowerCase();
    setError('');
    setBusy(true);

    try {
      await sendEmailOtp({ email: normalizedEmail });
      const roleQuery = role ? `&role=${encodeURIComponent(role)}` : '';
      router.push(
        `/(auth)/onboarding-client-otp?contact=${encodeURIComponent(normalizedEmail)}${roleQuery}`
      );
    } catch (err: unknown) {
      setError(mapSendError(err));
    } finally {
      setBusy(false);
    }
  };

  return (
    <SafeAreaView style={styles.container}>
      {isPreviewMode && <PreviewModeBanner onClose={() => safeBack()} />}

      <KeyboardAvoidingView
        style={styles.content}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      >
        <View style={styles.header}>
          <BackButton onPress={handleBack} />
        </View>

        <View style={styles.titleContainer}>
          <Text style={styles.title}>{TEXT.title}</Text>
          <Text style={styles.subtitle}>{TEXT.subtitle}</Text>
        </View>

        <View style={styles.form}>
          <Text style={styles.label}>{TEXT.label}</Text>
          <TextInput
            value={email}
            onChangeText={setEmail}
            placeholder={TEXT.placeholder}
            placeholderTextColor="#9CA3AF"
            keyboardType="email-address"
            autoCapitalize="none"
            autoCorrect={false}
            style={styles.input}
            textAlign="left"
          />
        </View>

        <View style={styles.footer}>
          <Pressable
            onPress={() => {
              void handleSendCode();
            }}
            disabled={!canSubmit || busy}
            accessibilityRole="button"
          >
            <View
              style={[
                styles.button,
                canSubmit && !busy ? styles.buttonActive : styles.buttonInactive,
              ]}
            >
              <Text
                style={[
                  styles.buttonText,
                  canSubmit && !busy
                    ? styles.buttonTextActive
                    : styles.buttonTextInactive,
                ]}
              >
                {busy ? TEXT.sending : TEXT.submit}
              </Text>
            </View>
          </Pressable>

          {error ? <Text style={styles.errorText}>{error}</Text> : null}

          <Pressable onPress={handleBack} accessibilityRole="button">
            <Text style={styles.backText}>{TEXT.back}</Text>
          </Pressable>
        </View>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#F8F7F4',
  },
  content: {
    flex: 1,
    paddingHorizontal: 24,
    paddingTop: 20,
    paddingBottom: 28,
  },
  header: {
    alignItems: 'flex-end',
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
    writingDirection: 'rtl',
    lineHeight: 32,
  },
  subtitle: {
    marginTop: 8,
    fontSize: 14,
    fontWeight: '600',
    color: '#6b7280',
    textAlign: 'right',
    writingDirection: 'rtl',
  },
  form: {
    marginTop: 28,
    width: '100%',
  },
  label: {
    fontSize: 12,
    fontWeight: '700',
    color: '#9CA3AF',
    textAlign: 'right',
    writingDirection: 'rtl',
    marginBottom: 8,
  },
  input: {
    backgroundColor: '#ffffff',
    borderWidth: 1,
    borderColor: '#e5e7eb',
    borderRadius: 16,
    paddingHorizontal: 16,
    paddingVertical: 14,
    fontSize: 16,
    fontWeight: '600',
    color: '#111827',
    writingDirection: 'ltr',
  },
  footer: {
    marginTop: 'auto',
    gap: 14,
  },
  button: {
    borderRadius: 999,
    paddingVertical: 16,
    alignItems: 'center',
  },
  buttonActive: {
    backgroundColor: '#2563eb',
  },
  buttonInactive: {
    backgroundColor: '#d8dce2',
  },
  buttonText: {
    fontSize: 18,
    fontWeight: '700',
    writingDirection: 'rtl',
  },
  buttonTextActive: {
    color: '#ffffff',
  },
  buttonTextInactive: {
    color: '#96a0ae',
  },
  errorText: {
    fontSize: 13,
    fontWeight: '600',
    color: '#dc2626',
    textAlign: 'center',
    writingDirection: 'rtl',
  },
  backText: {
    color: '#1d4ed8',
    fontSize: 15,
    fontWeight: '700',
    textAlign: 'center',
    writingDirection: 'rtl',
  },
});

