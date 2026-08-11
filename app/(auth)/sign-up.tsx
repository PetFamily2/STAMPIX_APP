import { useAuthActions } from '@convex-dev/auth/react';
import { Ionicons } from '@expo/vector-icons';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useState } from 'react';
import { Alert, Pressable, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import Svg, { Path } from 'react-native-svg';

import { ContinueButton } from '@/components/ContinueButton';
import { PreviewModeBanner } from '@/components/PreviewModeBanner';
import { StandaloneBackTitleHeader } from '@/components/StandaloneBackTitleHeader';
import { signInWithApple, signInWithGoogle } from '@/lib/auth/googleOAuth';
import { safeBack } from '@/lib/navigation';
import { useOnboardingTracking } from '@/lib/onboarding/useOnboardingTracking';
import { resolvePreviewModeFromParams } from '@/lib/previewMode';
import { flexDirection, rtlBaseView } from '@/lib/rtl';

const TEXT = {
  title: 'איך תרצו להתחבר?',
  subtitle: 'בחרו את הדרך הנוחה לכם להתחיל',
  apple: 'Apple',
  google: 'Google',
  email: 'אימייל',
  extra: 'אפשרויות נוספות',
  termsIntro: 'בלחיצה על המשך, אתם מסכימים למסמך המשפטי המרוכז',
  legalLink: 'מסמך משפטי',
  continue: 'המשך',
  connectingToGoogle: 'מתחברים ל-Google',
  connectingToApple: 'מתחברים ל-Apple',
  authErrorTitle: 'שגיאה',
  googleNotConfigured:
    'ההתחברות דרך Google לא זמינה כרגע. אפשר להמשיך עם אימייל.',
  appleNotConfigured:
    'ההתחברות דרך Apple לא זמינה כרגע. אפשר להמשיך עם אימייל.',
  googleFailed: 'ההתחברות עם Google נכשלה נסו שוב',
  appleFailed: 'ההתחברות עם Apple נכשלה נסו שוב',
};

type AuthMethod = 'apple' | 'google' | 'email';

const TERMS_PREFIX = 'בלחיצה על המשך, אתם מסכימים ל';

function GoogleLogo({ size = 20 }: { size?: number }) {
  return (
    <Svg
      width={size}
      height={size}
      viewBox="0 0 533.5 544.3"
      accessible={false}
    >
      <Path
        fill="#4285F4"
        d="M533.5 278.4c0-17.4-1.6-34.1-4.6-50.2H272v95h146.9c-6.3 34-25 62.8-53.2 82v68h86.1c50.4-46.5 79.7-115.1 79.7-194.8z"
      />
      <Path
        fill="#34A853"
        d="M272 544.3c72.6 0 133.6-24.1 178.1-65.7l-86.1-68c-24 16.2-54.6 25.7-92 25.7-70.7 0-130.5-47.7-151.8-111.8h-89v70.4c44.3 87.3 134.9 149.7 240.8 149.7z"
      />
      <Path
        fill="#FBBC05"
        d="M120.2 324.5c-10.2-30.4-10.2-63.6 0-94l-89-70.4C-14.7 229.3-14.7 314.7 31.2 384.9l89-70.4z"
      />
      <Path
        fill="#EA4335"
        d="M272 107.7c39.5-.6 77.2 14.5 105.9 41.9l79.1-79.1C414.5 24.3 344.5-1.4 272 0 166.1 0 75.4 62.4 31.1 149.7l89 70.4C141.5 155.4 201.3 107.7 272 107.7z"
      />
    </Svg>
  );
}

export default function SignUpScreen() {
  const { signIn } = useAuthActions();
  const router = useRouter();
  const { preview, map } = useLocalSearchParams<{
    preview?: string;
    map?: string;
  }>();
  const isPreviewMode = resolvePreviewModeFromParams({ preview, map });
  const { completeStep, trackChoice, trackContinue } = useOnboardingTracking({
    screen: 'sign_up',
  });
  const [selectedMethod, setSelectedMethod] = useState<AuthMethod | null>(null);
  const [oauthLoadingMethod, setOauthLoadingMethod] = useState<
    'google' | 'apple' | null
  >(null);

  const handleBack = () => {
    safeBack('/(auth)/welcome');
  };

  const handleSelect = (method: AuthMethod) => {
    setSelectedMethod(method);
    trackChoice('auth_method', method, { method });
  };

  const handleEmailOptionPress = async () => {
    trackChoice('auth_method', 'email', { method: 'email' });
    router.push('/(auth)/sign-up-email');
  };

  const openLegalDocument = () => {
    router.push('/(auth)/legal?document=terms');
  };

  const mapOAuthError = (provider: 'google' | 'apple', value: unknown) => {
    const failedText =
      provider === 'google' ? TEXT.googleFailed : TEXT.appleFailed;
    if (!(value instanceof Error)) {
      return failedText;
    }

    if (
      value.message.includes('configured providers') ||
      value.message.includes(
        provider === 'google' ? 'AUTH_GOOGLE_ID' : 'AUTH_APPLE_ID'
      ) ||
      value.message.includes(
        provider === 'google' ? 'AUTH_GOOGLE_SECRET' : 'AUTH_APPLE_SECRET'
      )
    ) {
      return provider === 'google'
        ? TEXT.googleNotConfigured
        : TEXT.appleNotConfigured;
    }

    return failedText;
  };

  const handleOAuthAuth = async (provider: 'google' | 'apple') => {
    if (isPreviewMode || oauthLoadingMethod) {
      return;
    }

    setOauthLoadingMethod(provider);
    try {
      const result =
        provider === 'google'
          ? await signInWithGoogle(signIn, null)
          : await signInWithApple(signIn, null);
      if (result !== 'success') {
        return;
      }
      trackContinue({ method: provider });
      completeStep({ method: provider });
      router.replace('/(auth)/oauth-callback');
    } catch (error: unknown) {
      Alert.alert(TEXT.authErrorTitle, mapOAuthError(provider, error));
    } finally {
      setOauthLoadingMethod(null);
    }
  };

  const handleContinue = () => {
    if (!selectedMethod) {
      return;
    }

    if (selectedMethod === 'google' || selectedMethod === 'apple') {
      void handleOAuthAuth(selectedMethod);
      return;
    }

    trackContinue({ method: selectedMethod });
    completeStep({ method: selectedMethod });
    router.push('/(auth)/sign-up-email');
  };

  return (
    <SafeAreaView style={styles.container}>
      {isPreviewMode && <PreviewModeBanner onClose={() => safeBack()} />}

      <View style={styles.content}>
        <StandaloneBackTitleHeader
          title={TEXT.title}
          onBackPress={handleBack}
          style={styles.header}
          titleStyle={styles.title}
          titleNumberOfLines={2}
        />

        <View style={styles.optionsContainer}>
          <Pressable
            onPress={() => handleSelect('apple')}
            accessibilityRole="button"
            accessibilityLabel={TEXT.apple}
            accessibilityState={{ selected: selectedMethod === 'apple' }}
          >
            <View
              style={
                selectedMethod === 'apple'
                  ? styles.optionSelected
                  : styles.optionUnselected
              }
            >
              <Ionicons
                name="logo-apple"
                size={18}
                color={selectedMethod === 'apple' ? '#2563eb' : '#111827'}
              />
              <Text
                style={
                  selectedMethod === 'apple'
                    ? styles.optionTextSelected
                    : styles.optionTextUnselected
                }
              >
                {TEXT.apple}
              </Text>
            </View>
          </Pressable>

          <Pressable
            onPress={() => handleSelect('google')}
            accessibilityRole="button"
            accessibilityLabel={TEXT.google}
            accessibilityState={{ selected: selectedMethod === 'google' }}
          >
            <View
              style={
                selectedMethod === 'google'
                  ? styles.optionSelected
                  : styles.optionUnselected
              }
            >
              <GoogleLogo size={20} />
              <Text
                style={
                  selectedMethod === 'google'
                    ? styles.optionTextSelected
                    : styles.optionTextUnselected
                }
              >
                {TEXT.google}
              </Text>
            </View>
          </Pressable>

          <View style={styles.dividerRow}>
            <View style={styles.dividerLine} />
            <Text style={styles.dividerText}>{TEXT.extra}</Text>
            <View style={styles.dividerLine} />
          </View>

          <Pressable
            onPress={() => {
              void handleEmailOptionPress();
            }}
            accessibilityRole="button"
            accessibilityLabel={TEXT.email}
          >
            <View
              style={
                selectedMethod === 'email'
                  ? styles.optionSelected
                  : styles.optionUnselected
              }
            >
              <Ionicons
                name="mail-outline"
                size={20}
                color={selectedMethod === 'email' ? '#2563eb' : '#111827'}
              />
              <Text
                style={
                  selectedMethod === 'email'
                    ? styles.optionTextSelected
                    : styles.optionTextUnselected
                }
              >
                {TEXT.email}
              </Text>
            </View>
          </Pressable>
        </View>

        <View style={styles.footer}>
          <ContinueButton
            onPress={handleContinue}
            disabled={!selectedMethod || oauthLoadingMethod !== null}
            label={
              oauthLoadingMethod === 'google'
                ? TEXT.connectingToGoogle
                : oauthLoadingMethod === 'apple'
                  ? TEXT.connectingToApple
                  : TEXT.continue
            }
          />

          <Text style={styles.terms}>
            {TERMS_PREFIX}{' '}
            <Text
              style={styles.termsLink}
              accessibilityRole="link"
              onPress={openLegalDocument}
            >
              {TEXT.legalLink}
            </Text>
          </Text>
        </View>
      </View>
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
    width: '100%',
    maxWidth: 560,
    alignSelf: 'center',
    paddingHorizontal: 20,
    paddingTop: 20,
    paddingBottom: 32,
  },
  header: {
    marginBottom: 20,
  },
  title: {
    fontSize: 22,
    fontWeight: '900',
    color: '#111827',
    textAlign: 'right',
    writingDirection: 'rtl',
    lineHeight: 30,
    includeFontPadding: false,
  },
  subtitle: {
    marginTop: 8,
    fontSize: 13,
    fontWeight: '600',
    color: '#6b7280',
    textAlign: 'right',
    writingDirection: 'rtl',
  },
  optionsContainer: {
    marginTop: 20,
    gap: 12,
  },
  optionSelected: {
    flexDirection: flexDirection.row,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 12,
    ...rtlBaseView,
    backgroundColor: '#eff6ff',
    minHeight: 52,
    borderRadius: 14,
    paddingHorizontal: 20,
    paddingVertical: 13,
    borderWidth: 1,
    borderColor: '#93c5fd',
  },
  optionUnselected: {
    flexDirection: flexDirection.row,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 12,
    ...rtlBaseView,
    backgroundColor: '#ffffff',
    minHeight: 52,
    borderRadius: 14,
    paddingHorizontal: 20,
    paddingVertical: 13,
    borderWidth: 1,
    borderColor: '#e5e7eb',
  },
  optionTextSelected: {
    fontSize: 16,
    fontWeight: '700',
    color: '#2563eb',
    textAlign: 'center',
  },
  optionTextUnselected: {
    fontSize: 16,
    fontWeight: '700',
    color: '#111827',
    textAlign: 'center',
  },
  dividerRow: {
    flexDirection: flexDirection.row,
    alignItems: 'center',
    gap: 12,
    marginVertical: 4,
  },
  dividerLine: {
    flex: 1,
    height: 1,
    backgroundColor: '#e5e7eb',
  },
  dividerText: {
    fontSize: 11,
    fontWeight: '700',
    color: '#94A3B8',
    textAlign: 'center',
  },
  footer: {
    marginTop: 'auto',
  },
  terms: {
    marginTop: 16,
    fontSize: 10,
    color: '#64748B',
    textAlign: 'center',
    writingDirection: 'rtl',
  },
  termsLink: {
    color: '#2563eb',
    textDecorationLine: 'underline',
    fontWeight: '700',
  },
});
