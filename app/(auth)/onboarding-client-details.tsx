import { Ionicons } from '@expo/vector-icons';
import { useMemo, useState } from 'react';
import {
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { BackButton } from '@/components/BackButton';
import { OnboardingProgress } from '@/components/OnboardingProgress';
import { safeBack, safePush } from '@/lib/navigation';
import { useOnboardingTracking } from '@/lib/onboarding/useOnboardingTracking';

type GenderOption = 'male' | 'female';

const TEXT = {
  title: '\u05e0\u05e2\u05d9\u05dd \u05dc\u05d4\u05db\u05d9\u05e8',
  subtitle:
    '\u05db\u05de\u05d4 \u05e4\u05e8\u05d8\u05d9\u05dd \u05e7\u05e6\u05e8\u05d9\u05dd \u05d5\u05e0\u05de\u05e9\u05d9\u05da \u05dc\u05d0\u05d9\u05de\u05d5\u05ea \u05e7\u05d5\u05d3.',
  profileHint:
    '\u05d4\u05de\u05d9\u05d3\u05e2 \u05d9\u05e2\u05d6\u05d5\u05e8 \u05dc\u05e0\u05d5 \u05dc\u05d4\u05ea\u05d0\u05d9\u05dd \u05d0\u05ea \u05d4\u05d7\u05d5\u05d5\u05d9\u05d4 \u05e9\u05dc\u05da.',
  sectionGender:
    '\u05d1\u05d7\u05d9\u05e8\u05d4 \u05d0\u05d9\u05e9\u05d9\u05ea (\u05d0\u05d5\u05e4\u05e6\u05d9\u05d5\u05e0\u05dc\u05d9)',
  female: '\u05e0\u05e7\u05d1\u05d4',
  male: '\u05d6\u05db\u05e8',
  sectionDetails:
    '\u05e4\u05e8\u05d8\u05d9\u05dd \u05dc\u05d0\u05d9\u05de\u05d5\u05ea',
  firstNameLabel: '\u05e9\u05dd \u05e4\u05e8\u05d8\u05d9',
  firstNamePlaceholder: '\u05dc\u05de\u05e9\u05dc \u05d3\u05e0\u05d9',
  lastNameLabel: '\u05e9\u05dd \u05de\u05e9\u05e4\u05d7\u05d4',
  lastNamePlaceholder: '\u05dc\u05de\u05e9\u05dc \u05db\u05d4\u05df',
  contactLabel:
    '\u05de\u05e1\u05e4\u05e8 \u05d8\u05dc\u05e4\u05d5\u05df \u05d0\u05d5 \u05d0\u05d9\u05de\u05d9\u05d9\u05dc',
  contactPlaceholder: 'name@example.com / 0501234567',
  continue:
    '\u05d4\u05de\u05e9\u05da \u05dc\u05e7\u05d5\u05d3 \u05d0\u05d9\u05de\u05d5\u05ea',
  firstNameA11y: '\u05e9\u05d3\u05d4 \u05e9\u05dd \u05e4\u05e8\u05d8\u05d9',
  lastNameA11y:
    '\u05e9\u05d3\u05d4 \u05e9\u05dd \u05de\u05e9\u05e4\u05d7\u05d4',
  contactA11y: '\u05e9\u05d3\u05d4 \u05e4\u05e8\u05d8\u05d9 \u05e7\u05e9\u05e8',
};

export default function OnboardingCustomerScreen() {
  const [firstName, setFirstName] = useState('');
  const [lastName, setLastName] = useState('');
  const [contact, setContact] = useState('');
  const [gender, setGender] = useState<GenderOption | null>(null);
  const { completeStep, trackChoice, trackContinue } = useOnboardingTracking({
    screen: 'onboarding_client_details',
    role: 'client',
  });

  const canContinue = useMemo(
    () =>
      firstName.trim().length > 0 &&
      lastName.trim().length > 0 &&
      contact.trim().length > 0,
    [contact, firstName, lastName]
  );

  const contactKeyboardType = useMemo(() => {
    return contact.includes('@') ? 'email-address' : 'default';
  }, [contact]);

  const handleContinue = () => {
    if (!canContinue) {
      return;
    }
    const trimmedContact = contact.trim();
    const hasEmail = trimmedContact.includes('@');
    const hasPhone = !hasEmail && /\d/.test(trimmedContact);
    trackContinue();
    completeStep({
      has_email: hasEmail,
      has_phone: hasPhone,
      gender_selected: gender ?? 'none',
    });
    const query = trimmedContact
      ? `?contact=${encodeURIComponent(trimmedContact)}`
      : '';
    safePush(`/(auth)/onboarding-client-otp${query}`);
  };

  const handleSelectGender = (value: GenderOption) => {
    setGender(value);
    trackChoice('gender', value);
  };

  return (
    <SafeAreaView style={styles.container}>
      <KeyboardAvoidingView
        style={styles.keyboardContainer}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      >
        <ScrollView
          contentContainerStyle={styles.scrollContent}
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
        >
          <View style={styles.headerRow}>
            <BackButton
              onPress={() => safeBack('/(auth)/onboarding-client-role')}
            />
            <OnboardingProgress total={8} current={2} />
          </View>

          <View style={styles.titleContainer}>
            <Text style={styles.title}>{TEXT.title}</Text>
            <Text style={styles.subtitle}>{TEXT.subtitle}</Text>
            <Text style={styles.hint}>{TEXT.profileHint}</Text>
          </View>

          <View style={styles.section}>
            <Text style={styles.sectionTitle}>{TEXT.sectionGender}</Text>
            <View style={styles.genderRow}>
              <Pressable
                onPress={() => handleSelectGender('female')}
                style={({ pressed }) => [
                  styles.genderPressable,
                  pressed && styles.pressed,
                ]}
                accessibilityRole="button"
                accessibilityState={{ selected: gender === 'female' }}
              >
                <View
                  style={[
                    styles.genderCard,
                    gender === 'female'
                      ? styles.genderCardActive
                      : styles.genderCardInactive,
                  ]}
                >
                  <Ionicons
                    name="female-outline"
                    size={18}
                    color={gender === 'female' ? '#FFFFFF' : '#2563eb'}
                  />
                  <Text
                    style={[
                      styles.genderLabel,
                      gender === 'female'
                        ? styles.genderLabelActive
                        : styles.genderLabelInactive,
                    ]}
                  >
                    {TEXT.female}
                  </Text>
                </View>
              </Pressable>

              <Pressable
                onPress={() => handleSelectGender('male')}
                style={({ pressed }) => [
                  styles.genderPressable,
                  pressed && styles.pressed,
                ]}
                accessibilityRole="button"
                accessibilityState={{ selected: gender === 'male' }}
              >
                <View
                  style={[
                    styles.genderCard,
                    gender === 'male'
                      ? styles.genderCardActive
                      : styles.genderCardInactive,
                  ]}
                >
                  <Ionicons
                    name="male-outline"
                    size={18}
                    color={gender === 'male' ? '#FFFFFF' : '#2563eb'}
                  />
                  <Text
                    style={[
                      styles.genderLabel,
                      gender === 'male'
                        ? styles.genderLabelActive
                        : styles.genderLabelInactive,
                    ]}
                  >
                    {TEXT.male}
                  </Text>
                </View>
              </Pressable>
            </View>
          </View>

          <View style={styles.section}>
            <Text style={styles.sectionTitle}>{TEXT.sectionDetails}</Text>
            <View style={styles.inputContainer}>
              <View style={styles.inputBlock}>
                <Text style={styles.inputLabel}>{TEXT.firstNameLabel}</Text>
                <TextInput
                  value={firstName}
                  onChangeText={setFirstName}
                  placeholder={TEXT.firstNamePlaceholder}
                  placeholderTextColor="#9CA3AF"
                  returnKeyType="next"
                  autoCapitalize="words"
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
                  returnKeyType="next"
                  autoCapitalize="words"
                  style={styles.input}
                  textAlign="right"
                  accessibilityLabel={TEXT.lastNameA11y}
                />
              </View>

              <View style={styles.inputBlock}>
                <Text style={styles.inputLabel}>{TEXT.contactLabel}</Text>
                <TextInput
                  value={contact}
                  onChangeText={setContact}
                  placeholder={TEXT.contactPlaceholder}
                  placeholderTextColor="#9CA3AF"
                  returnKeyType="done"
                  keyboardType={contactKeyboardType}
                  autoCapitalize="none"
                  style={[styles.input, styles.inputLtr]}
                  textAlign="right"
                  accessibilityLabel={TEXT.contactA11y}
                />
              </View>
            </View>
          </View>
        </ScrollView>

        <View style={styles.footer}>
          <Pressable
            onPress={handleContinue}
            disabled={!canContinue}
            accessibilityRole="button"
            accessibilityState={{ disabled: !canContinue }}
          >
            <View
              style={[
                styles.button,
                canContinue ? styles.buttonActive : styles.buttonInactive,
              ]}
            >
              <Text
                style={[
                  styles.buttonText,
                  canContinue
                    ? styles.buttonTextActive
                    : styles.buttonTextInactive,
                ]}
              >
                {TEXT.continue}
              </Text>
            </View>
          </Pressable>
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
  scrollContent: {
    paddingHorizontal: 24,
    paddingTop: 16,
    paddingBottom: 24,
  },
  headerRow: {
    flexDirection: 'row-reverse',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  titleContainer: {
    marginTop: 32,
    alignItems: 'flex-end',
  },
  title: {
    fontSize: 24,
    fontWeight: '900',
    color: '#111827',
    textAlign: 'right',
  },
  subtitle: {
    marginTop: 4,
    fontSize: 14,
    fontWeight: '600',
    color: '#6b7280',
    textAlign: 'right',
    lineHeight: 20,
  },
  hint: {
    marginTop: 4,
    fontSize: 12,
    fontWeight: '600',
    color: '#64748b',
    textAlign: 'right',
    lineHeight: 18,
  },
  section: {
    marginTop: 24,
  },
  sectionTitle: {
    fontSize: 12,
    fontWeight: '700',
    color: '#9CA3AF',
    textAlign: 'right',
    marginBottom: 10,
  },
  genderRow: {
    flexDirection: 'row-reverse',
    gap: 12,
  },
  genderPressable: {
    flex: 1,
  },
  genderCard: {
    borderRadius: 16,
    borderWidth: 1,
    paddingVertical: 16,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.1,
    shadowRadius: 2,
    elevation: 2,
  },
  genderCardActive: {
    backgroundColor: '#2563eb',
    borderColor: '#2563eb',
    shadowColor: '#93c5fd',
  },
  genderCardInactive: {
    backgroundColor: '#FFFFFF',
    borderColor: '#e5e7eb',
    shadowColor: '#9ca3af',
  },
  genderLabel: {
    fontSize: 14,
    fontWeight: '800',
  },
  genderLabelActive: {
    color: '#FFFFFF',
  },
  genderLabelInactive: {
    color: '#475569',
  },
  inputContainer: {
    gap: 12,
  },
  inputBlock: {
    marginTop: 0,
  },
  inputLabel: {
    fontSize: 12,
    fontWeight: '700',
    color: '#9CA3AF',
    textAlign: 'right',
    marginBottom: 6,
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
  inputLtr: {
    writingDirection: 'ltr',
  },
  footer: {
    paddingHorizontal: 24,
    paddingBottom: 32,
    paddingTop: 12,
    backgroundColor: '#FBFAF7',
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
    shadowRadius: 28,
    elevation: 8,
  },
  buttonInactive: {
    backgroundColor: '#E5E7EB',
  },
  buttonText: {
    fontSize: 16,
    fontWeight: '800',
  },
  buttonTextActive: {
    color: '#FFFFFF',
  },
  buttonTextInactive: {
    color: '#6b7280',
  },
  pressed: {
    opacity: 0.9,
  },
});
