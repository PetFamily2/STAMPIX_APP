import React, { useMemo, useState } from 'react';
import { Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { BackButton } from '@/components/BackButton';
import { OnboardingProgress } from '@/components/OnboardingProgress';
import { safeBack, safePush } from '@/lib/navigation';

type GenderOption = 'male' | 'female';

export default function OnboardingCustomerScreen() {
  const [firstName, setFirstName] = useState('');
  const [lastName, setLastName] = useState('');
  const [contact, setContact] = useState('');
  const [gender, setGender] = useState<GenderOption | null>(null);

  const canContinue = useMemo(
    () =>
      firstName.trim().length > 0 &&
      lastName.trim().length > 0 &&
      contact.trim().length > 0,
    [contact, firstName, lastName]
  );

  const handleContinue = () => {
    if (!canContinue) return;
    const trimmedContact = contact.trim();
    const query = trimmedContact
      ? `?contact=${encodeURIComponent(trimmedContact)}`
      : '';
    safePush(`/(auth)/onboarding-client-otp${query}`);
  };

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.content}>
        <View style={styles.headerRow}>
          <BackButton onPress={() => safeBack('/(auth)/onboarding-client-role')} />
          <OnboardingProgress total={8} current={2} />
        </View>

        <View style={styles.titleContainer}>
          <Text style={styles.title}>נעים להכיר!</Text>
          <Text style={styles.subtitle}>
            נשמח לדעת איך לקרוא לך ונשלח קוד אימות.
          </Text>
        </View>

        <View style={styles.genderRow}>
          <Pressable
            onPress={() => setGender('female')}
            style={({ pressed }) => [styles.genderPressable, pressed && styles.pressed]}
            accessibilityRole="button"
            accessibilityLabel="בחירת נקבה"
            accessibilityState={{ selected: gender === 'female' }}
          >
            <View
              style={[
                styles.genderCard,
                gender === 'female' ? styles.genderCardActive : styles.genderCardInactive,
              ]}
            >
              <Text
                style={[
                  styles.genderIcon,
                  gender === 'female' ? styles.genderIconActive : styles.genderIconInactive,
                ]}
              >
                ♀
              </Text>
              <Text
                style={[
                  styles.genderLabel,
                  gender === 'female' ? styles.genderLabelActive : styles.genderLabelInactive,
                ]}
              >
                ׳ ׳§׳‘׳”
              </Text>
            </View>
          </Pressable>

          <Pressable
            onPress={() => setGender('male')}
            style={({ pressed }) => [styles.genderPressable, pressed && styles.pressed]}
            accessibilityRole="button"
            accessibilityLabel="בחירת זכר"
            accessibilityState={{ selected: gender === 'male' }}
          >
            <View
              style={[
                styles.genderCard,
                gender === 'male' ? styles.genderCardActive : styles.genderCardInactive,
              ]}
            >
              <Text
                style={[
                  styles.genderIcon,
                  gender === 'male' ? styles.genderIconActive : styles.genderIconInactive,
                ]}
              >
                ♂
              </Text>
              <Text
                style={[
                  styles.genderLabel,
                  gender === 'male' ? styles.genderLabelActive : styles.genderLabelInactive,
                ]}
              >
                ׳–׳›׳¨
              </Text>
            </View>
          </Pressable>
        </View>

        <View style={styles.inputsContainer}>
          <TextInput
            value={firstName}
            onChangeText={setFirstName}
            placeholder="שם פרטי"
            placeholderTextColor="#9CA3AF"
            returnKeyType="next"
            autoCapitalize="words"
            style={[styles.input, { textAlign: 'right' }]}
          />
          <TextInput
            value={lastName}
            onChangeText={setLastName}
            placeholder="שם משפחה"
            placeholderTextColor="#9CA3AF"
            returnKeyType="next"
            autoCapitalize="words"
            style={[styles.input, { textAlign: 'right' }]}
          />
          <TextInput
            value={contact}
            onChangeText={setContact}
            placeholder="מספר טלפון או אימייל"
            placeholderTextColor="#9CA3AF"
            returnKeyType="done"
            keyboardType="email-address"
            autoCapitalize="none"
            style={[styles.input, { textAlign: 'right' }]}
          />
        </View>

        <View style={styles.footer}>
          <Pressable
            onPress={handleContinue}
            disabled={!canContinue}
            accessibilityRole="button"
            accessibilityState={{ disabled: !canContinue }}
          >
            <View style={[styles.button, canContinue ? styles.buttonActive : styles.buttonInactive]}>
              <Text style={[styles.buttonText, canContinue ? styles.buttonTextActive : styles.buttonTextInactive]}>
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
  genderRow: {
    marginTop: 24,
    flexDirection: 'row-reverse',
    gap: 12,
  },
  genderPressable: {
    flex: 1,
  },
  genderCard: {
    borderRadius: 16,
    paddingVertical: 14,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.12,
    shadowRadius: 18,
    elevation: 4,
  },
  genderCardActive: {
    backgroundColor: '#2563eb',
    borderColor: '#2563eb',
    shadowColor: '#2563eb',
  },
  genderCardInactive: {
    backgroundColor: '#ffffff',
    borderColor: '#e5e7eb',
    shadowColor: '#94a3b8',
  },
  genderIcon: {
    fontSize: 20,
    fontWeight: '800',
    marginBottom: 6,
  },
  genderIconActive: {
    color: '#ffffff',
  },
  genderIconInactive: {
    color: '#94a3b8',
  },
  genderLabel: {
    fontSize: 14,
    fontWeight: '700',
  },
  genderLabelActive: {
    color: '#ffffff',
  },
  genderLabelInactive: {
    color: '#6b7280',
  },
  pressed: {
    opacity: 0.9,
  },
  inputsContainer: {
    marginTop: 24,
    gap: 16,
  },
  input: {
    backgroundColor: '#ffffff',
    borderWidth: 1,
    borderColor: '#e5e7eb',
    borderRadius: 16,
    paddingHorizontal: 16,
    paddingVertical: 12,
    fontSize: 16,
    fontWeight: '600',
    color: '#111827',
  },
  footer: {
    marginTop: 'auto',
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
