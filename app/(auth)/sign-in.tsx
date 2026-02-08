import { useAuthActions } from '@convex-dev/auth/react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { Link, useLocalSearchParams, useRouter } from 'expo-router';
import { Eye, EyeOff } from 'lucide-react-native';
import { useEffect, useState } from 'react';
import {
  ActivityIndicator,
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
import { PreviewModeBanner } from '@/components/PreviewModeBanner';
import { IS_DEV_MODE } from '@/config/appConfig';
import { useAppMode } from '@/contexts/AppModeContext';
import { safeBack } from '@/lib/navigation';

const REMEMBERED_EMAIL_KEY = 'remembered_email';
const TEXT = {
  errorTitle: '\u05e9\u05d2\u05d9\u05d0\u05d4',
  fillAllFields:
    '\u05d0\u05e0\u05d0 \u05de\u05dc\u05d0 \u05d0\u05ea \u05db\u05dc \u05d4\u05e9\u05d3\u05d5\u05ea',
  invalidPassword:
    '\u05d4\u05e1\u05d9\u05e1\u05de\u05d4 \u05e9\u05d4\u05d5\u05d6\u05e0\u05d4 \u05e9\u05d2\u05d5\u05d9\u05d4',
  accountNotFound:
    '\u05dc\u05d0 \u05e0\u05de\u05e6\u05d0 \u05d7\u05e9\u05d1\u05d5\u05df \u05e2\u05dd \u05db\u05ea\u05d5\u05d1\u05ea \u05d4\u05d0\u05d9\u05de\u05d9\u05d9\u05dc \u05d4\u05d6\u05d5',
  tooManyRequests:
    '\u05d9\u05d5\u05ea\u05e8 \u05de\u05d3\u05d9 \u05e0\u05d9\u05e1\u05d9\u05d5\u05e0\u05d5\u05ea \u05d4\u05ea\u05d7\u05d1\u05e8\u05d5\u05ea. \u05e0\u05e1\u05d5 \u05e9\u05d5\u05d1 \u05de\u05d0\u05d5\u05d7\u05e8 \u05d9\u05d5\u05ea\u05e8.',
  signInFailed:
    '\u05d4\u05d4\u05ea\u05d7\u05d1\u05e8\u05d5\u05ea \u05e0\u05db\u05e9\u05dc\u05d4. \u05d1\u05d3\u05e7\u05d5 \u05d0\u05ea \u05d4\u05e4\u05e8\u05d8\u05d9\u05dd \u05d5\u05e0\u05e1\u05d5 \u05e9\u05d5\u05d1.',
  previewMode:
    '\u05de\u05e6\u05d1 \u05ea\u05e6\u05d5\u05d2\u05d4 \u05de\u05e7\u05d3\u05d9\u05de\u05d4 - \u05d4\u05d4\u05ea\u05d7\u05d1\u05e8\u05d5\u05ea \u05de\u05d5\u05e9\u05d1\u05ea\u05ea',
  title: '\u05d4\u05ea\u05d7\u05d1\u05e8\u05d5\u05ea',
  subtitle:
    '\u05e9\u05de\u05d7\u05d9\u05dd \u05dc\u05e8\u05d0\u05d5\u05ea \u05d0\u05d5\u05ea\u05da \u05e9\u05d5\u05d1. \u05e0\u05db\u05e0\u05e1\u05d9\u05dd \u05dc\u05d7\u05e9\u05d1\u05d5\u05df \u05db\u05d3\u05d9 \u05dc\u05d4\u05de\u05e9\u05d9\u05da.',
  emailLabel:
    '\u05db\u05ea\u05d5\u05d1\u05ea \u05d0\u05d9\u05de\u05d9\u05d9\u05dc',
  emailA11y: '\u05e9\u05d3\u05d4 \u05d0\u05d9\u05de\u05d9\u05d9\u05dc',
  passwordLabel: '\u05e1\u05d9\u05e1\u05de\u05d4',
  passwordPlaceholder: '\u05d4\u05d6\u05df \u05e1\u05d9\u05e1\u05de\u05d4',
  passwordA11y: '\u05e9\u05d3\u05d4 \u05e1\u05d9\u05e1\u05de\u05d4',
  rememberMe: '\u05d6\u05db\u05d5\u05e8 \u05d0\u05d5\u05ea\u05d9',
  signIn: '\u05d4\u05ea\u05d7\u05d1\u05e8',
  noAccount: '\u05d0\u05d9\u05df \u05dc\u05da \u05d7\u05e9\u05d1\u05d5\u05df?',
  signUpHere: '\u05d4\u05d9\u05e8\u05e9\u05dd \u05db\u05d0\u05df',
};

export default function SignInScreen() {
  const { signIn } = useAuthActions();
  const { setAppMode } = useAppMode();
  const router = useRouter();
  const { preview, map } = useLocalSearchParams<{
    preview?: string;
    map?: string;
  }>();
  const isPreviewMode =
    (IS_DEV_MODE && preview === 'true') || map === 'true';

  useEffect(() => {
    // biome-ignore format: debug log
    fetch('http://127.0.0.1:7243/ingest/1ea5e66d-d528-4bae-a881-fff31ff26db7',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'app/(auth)/sign-in.tsx:render',message:'Sign-in screen rendered',data:{},timestamp:Date.now(),sessionId:'debug-session',hypothesisId:'A,E'})}).catch(()=>{});
  }, []);

  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [rememberMe, setRememberMe] = useState(false);
  const [showPassword, setShowPassword] = useState(false);

  useEffect(() => {
    const loadRememberedEmail = async () => {
      try {
        const rememberedEmail =
          await AsyncStorage.getItem(REMEMBERED_EMAIL_KEY);
        if (rememberedEmail) {
          setEmail(rememberedEmail);
          setRememberMe(true);
        }
      } catch {
        // Ignore storage errors.
      }
    };
    loadRememberedEmail();
  }, []);

  const onSignInPress = async () => {
    if (isPreviewMode) {
      return;
    }

    if (!email || !password) {
      Alert.alert(TEXT.errorTitle, TEXT.fillAllFields);
      return;
    }

    setLoading(true);

    try {
      await signIn('password', { email, password, flow: 'signIn' });

      if (rememberMe) {
        await AsyncStorage.setItem(REMEMBERED_EMAIL_KEY, email);
      } else {
        await AsyncStorage.removeItem(REMEMBERED_EMAIL_KEY);
      }

      await setAppMode('customer');
      router.replace('/(authenticated)/(customer)/wallet');
    } catch (err: unknown) {
      const error = err as { message?: string };
      const errorMessage = error.message || '';

      if (errorMessage.includes('InvalidSecret')) {
        Alert.alert(TEXT.errorTitle, TEXT.invalidPassword);
      } else if (
        errorMessage.includes('InvalidAccountId') ||
        errorMessage.includes('Could not find')
      ) {
        Alert.alert(TEXT.errorTitle, TEXT.accountNotFound);
      } else if (errorMessage.includes('TooManyRequests')) {
        Alert.alert(TEXT.errorTitle, TEXT.tooManyRequests);
      } else {
        Alert.alert(TEXT.errorTitle, TEXT.signInFailed);
      }
    } finally {
      setLoading(false);
    }
  };

  const handleBack = () => {
    safeBack('/(auth)/sign-up');
  };

  return (
    <SafeAreaView style={styles.container}>
      {isPreviewMode && <PreviewModeBanner onClose={() => safeBack()} />}

      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        style={styles.keyboardContainer}
      >
        {isPreviewMode && (
          <View style={styles.previewBanner}>
            <Text style={styles.previewText}>{TEXT.previewMode}</Text>
          </View>
        )}

        <View style={styles.content}>
          <View style={styles.headerRow}>
            <BackButton onPress={handleBack} />
            <View style={styles.headerSpacer} />
          </View>

          <View style={styles.titleContainer}>
            <Text style={styles.title}>{TEXT.title}</Text>
            <Text style={styles.subtitle}>{TEXT.subtitle}</Text>
          </View>

          <View style={styles.form}>
            <View>
              <Text style={styles.label}>{TEXT.emailLabel}</Text>
              <TextInput
                style={[styles.input, styles.inputLtr]}
                value={email}
                onChangeText={setEmail}
                placeholder="name@example.com"
                placeholderTextColor="#9ca3af"
                keyboardType="email-address"
                autoCapitalize="none"
                autoCorrect={false}
                textAlign="right"
                editable={!loading}
                accessibilityLabel={TEXT.emailA11y}
              />
            </View>

            <View>
              <Text style={styles.label}>{TEXT.passwordLabel}</Text>
              <View style={styles.passwordWrapper}>
                <TextInput
                  style={[styles.input, styles.inputLtr, styles.inputWithIcon]}
                  value={password}
                  onChangeText={setPassword}
                  placeholder={TEXT.passwordPlaceholder}
                  placeholderTextColor="#9ca3af"
                  secureTextEntry={!showPassword}
                  textAlign="right"
                  editable={!loading}
                  accessibilityLabel={TEXT.passwordA11y}
                />
                <Pressable
                  onPress={() => setShowPassword((prev) => !prev)}
                  style={styles.eyeButton}
                  hitSlop={8}
                >
                  {showPassword ? (
                    <EyeOff size={18} color="#6b7280" />
                  ) : (
                    <Eye size={18} color="#6b7280" />
                  )}
                </Pressable>
              </View>
            </View>

            <View style={styles.rememberRow}>
              <Pressable
                onPress={() => setRememberMe((prev) => !prev)}
                style={styles.rememberButton}
                disabled={loading}
              >
                <View
                  style={[
                    styles.checkbox,
                    rememberMe
                      ? styles.checkboxActive
                      : styles.checkboxInactive,
                  ]}
                >
                  {rememberMe && (
                    <Text style={styles.checkboxText}>{'\u2713'}</Text>
                  )}
                </View>
                <Text style={styles.rememberText}>{TEXT.rememberMe}</Text>
              </Pressable>
            </View>
          </View>

          <View style={styles.footer}>
            <Pressable
              onPress={onSignInPress}
              disabled={loading || isPreviewMode}
              accessibilityRole="button"
            >
              <View
                style={[
                  styles.button,
                  (loading || isPreviewMode) && styles.buttonDisabled,
                ]}
              >
                {loading ? (
                  <ActivityIndicator color="#ffffff" />
                ) : (
                  <Text style={styles.buttonText}>{TEXT.signIn}</Text>
                )}
              </View>
            </Pressable>

            <View style={styles.linkRow}>
              <Text style={styles.linkMuted}>{TEXT.noAccount}</Text>
              {isPreviewMode ? (
                <Text style={styles.linkDisabled}>{TEXT.signUpHere}</Text>
              ) : (
                <Link href="/(auth)/sign-up" asChild={true}>
                  <Pressable>
                    <Text style={styles.link}>{TEXT.signUpHere}</Text>
                  </Pressable>
                </Link>
              )}
            </View>
          </View>
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
  keyboardContainer: {
    flex: 1,
  },
  previewBanner: {
    paddingVertical: 10,
    paddingHorizontal: 16,
    backgroundColor: '#FEF3C7',
    borderBottomWidth: 1,
    borderBottomColor: '#FDE68A',
  },
  previewText: {
    color: '#92400E',
    fontSize: 12,
    fontWeight: '600',
    textAlign: 'center',
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
  headerSpacer: {
    width: 44,
    height: 44,
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
    marginTop: 32,
    gap: 16,
  },
  label: {
    fontSize: 12,
    fontWeight: '700',
    color: '#111827',
    textAlign: 'right',
    marginBottom: 8,
  },
  input: {
    borderRadius: 16,
    borderWidth: 1,
    borderColor: '#E5E7EB',
    backgroundColor: '#FFFFFF',
    paddingHorizontal: 16,
    paddingVertical: 14,
    fontSize: 16,
    color: '#111827',
    textAlign: 'right',
  },
  inputLtr: {
    writingDirection: 'ltr',
  },
  inputWithIcon: {
    paddingLeft: 44,
  },
  passwordWrapper: {
    position: 'relative',
    justifyContent: 'center',
  },
  eyeButton: {
    position: 'absolute',
    left: 14,
  },
  rememberRow: {
    alignItems: 'flex-end',
  },
  rememberButton: {
    flexDirection: 'row-reverse',
    alignItems: 'center',
    gap: 8,
  },
  rememberText: {
    fontSize: 13,
    fontWeight: '600',
    color: '#6b7280',
  },
  checkbox: {
    width: 22,
    height: 22,
    borderRadius: 6,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 2,
  },
  checkboxActive: {
    backgroundColor: '#2563eb',
    borderColor: '#2563eb',
  },
  checkboxInactive: {
    backgroundColor: '#ffffff',
    borderColor: '#CBD5F5',
  },
  checkboxText: {
    color: '#ffffff',
    fontWeight: '700',
  },
  footer: {
    marginTop: 'auto',
    gap: 16,
  },
  button: {
    borderRadius: 999,
    paddingHorizontal: 40,
    paddingVertical: 16,
    alignItems: 'center',
    backgroundColor: '#2563eb',
    shadowColor: '#2563eb',
    shadowOffset: { width: 0, height: 10 },
    shadowOpacity: 0.25,
    shadowRadius: 30,
    elevation: 8,
  },
  buttonDisabled: {
    opacity: 0.6,
  },
  buttonText: {
    fontSize: 18,
    fontWeight: '700',
    color: '#ffffff',
  },
  linkRow: {
    flexDirection: 'row-reverse',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
  },
  link: {
    color: '#2563eb',
    fontSize: 15,
    fontWeight: '700',
  },
  linkDisabled: {
    color: '#9ca3af',
    fontSize: 15,
    fontWeight: '700',
  },
  linkMuted: {
    color: '#6b7280',
    fontSize: 15,
    fontWeight: '600',
  },
});
