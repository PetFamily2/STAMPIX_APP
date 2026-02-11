import { Ionicons } from '@expo/vector-icons';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import Svg, { Path } from 'react-native-svg';

import { BackButton } from '@/components/BackButton';
import { ContinueButton } from '@/components/ContinueButton';
import { PreviewModeBanner } from '@/components/PreviewModeBanner';
import { IS_DEV_MODE } from '@/config/appConfig';
import { safeBack } from '@/lib/navigation';
import { useOnboardingTracking } from '@/lib/onboarding/useOnboardingTracking';

const TEXT = {
  title: 'איך תרצו להתחבר?',
  subtitle: 'בחרו את הדרך הנוחה לכם להתחיל',
  apple: 'Apple',
  google: 'Google',
  email: 'אימייל',
  extra: 'אפשרויות נוספות',
  termsIntro: 'בלחיצה על המשך, אתם מסכימים למסמך המשפטי המרוכז',
  legalLink: 'מסמך משפטי',
};

type AuthMethod = 'apple' | 'google' | 'email';

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
  const router = useRouter();
  const { preview, map, role } = useLocalSearchParams<{
    preview?: string;
    map?: string;
    role?: string;
  }>();
  const isPreviewMode = (IS_DEV_MODE && preview === 'true') || map === 'true';
  const { completeStep, trackChoice, trackContinue } = useOnboardingTracking({
    screen: 'sign_up',
  });
  const [selectedMethod, setSelectedMethod] = useState<AuthMethod | null>(null);

  const handleBack = () => {
    safeBack('/(auth)/onboarding-client-role');
  };

  const handleSelect = (method: AuthMethod) => {
    setSelectedMethod(method);
    trackChoice('auth_method', method, { method });
  };

  const handleEmailOptionPress = () => {
    trackChoice('auth_method', 'email', { method: 'email' });
    const query = role ? `?role=${encodeURIComponent(role)}` : '';
    router.push(`/(auth)/sign-up-email${query}` as any);
  };

  const handleContinue = () => {
    if (!selectedMethod) {
      return;
    }
    const selectedRole =
      role === 'business'
        ? 'business'
        : role === 'customer'
          ? 'customer'
          : null;
    trackContinue({ method: selectedMethod });
    completeStep({ method: selectedMethod, role: selectedRole ?? undefined });

    if (selectedRole === 'customer') {
      router.push('/(auth)/onboarding-client-details');
      return;
    }
    if (selectedRole === 'business') {
      router.push('/(auth)/onboarding-business-role');
      return;
    }

    router.push('/(auth)/onboarding-client-role');
  };

  return (
    <SafeAreaView style={styles.container}>
      {isPreviewMode && <PreviewModeBanner onClose={() => safeBack()} />}

      <View style={styles.content}>
        <View style={styles.header}>
          <BackButton onPress={handleBack} />
        </View>

        <View style={styles.titleContainer}>
          <Text style={styles.title} numberOfLines={2}>
            {TEXT.title}
          </Text>
          <Text style={styles.subtitle}>{TEXT.subtitle}</Text>
        </View>

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
            onPress={handleEmailOptionPress}
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
          <ContinueButton onPress={handleContinue} disabled={!selectedMethod} />

          <Text style={styles.terms}>
            {TEXT.termsIntro}{' '}
            <Text
              style={styles.termsLink}
              accessibilityRole="link"
              onPress={() => router.push('/(auth)/legal')}
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
    paddingHorizontal: 24,
    paddingTop: 20,
    paddingBottom: 32,
  },
  header: {
    alignItems: 'flex-end',
  },
  titleContainer: {
    marginTop: 40,
    width: '100%',
    alignItems: 'stretch',
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
    marginTop: 40,
    gap: 16,
  },
  optionSelected: {
    flexDirection: 'row-reverse',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 12,
    backgroundColor: '#eff6ff',
    borderRadius: 16,
    paddingHorizontal: 20,
    paddingVertical: 16,
    borderWidth: 1,
    borderColor: '#93c5fd',
    shadowColor: '#93c5fd',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.1,
    shadowRadius: 2,
    elevation: 2,
  },
  optionUnselected: {
    flexDirection: 'row-reverse',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 12,
    backgroundColor: '#ffffff',
    borderRadius: 16,
    paddingHorizontal: 20,
    paddingVertical: 16,
    borderWidth: 1,
    borderColor: '#e5e7eb',
    shadowColor: '#9ca3af',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.1,
    shadowRadius: 2,
    elevation: 2,
  },
  optionTextSelected: {
    fontSize: 16,
    fontWeight: '900',
    color: '#2563eb',
    textAlign: 'center',
  },
  optionTextUnselected: {
    fontSize: 16,
    fontWeight: '900',
    color: '#111827',
    textAlign: 'center',
  },
  dividerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    marginVertical: 8,
  },
  dividerLine: {
    flex: 1,
    height: 1,
    backgroundColor: '#e5e7eb',
  },
  dividerText: {
    fontSize: 11,
    fontWeight: '700',
    color: '#cbd5f2',
    textAlign: 'center',
  },
  footer: {
    marginTop: 'auto',
  },
  terms: {
    marginTop: 16,
    fontSize: 10,
    color: '#cbd5f2',
    textAlign: 'center',
  },
  termsLink: {
    color: '#2563eb',
    textDecorationLine: 'underline',
    fontWeight: '700',
  },
});
