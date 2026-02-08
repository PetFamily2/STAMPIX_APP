import React, { useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { BackButton } from '@/components/BackButton';
import { ContinueButton } from '@/components/ContinueButton';
import { OnboardingProgress } from '@/components/OnboardingProgress';
import { safeBack, safePush } from '@/lib/navigation';
import { useOnboardingTracking } from '@/lib/onboarding/useOnboardingTracking';

type RoleOption = 'customer' | 'business';

export default function OnboardingRoleScreen() {
  const [role, setRole] = useState<RoleOption | null>(null);
  const { completeStep, trackChoice, trackContinue } = useOnboardingTracking({
    screen: 'onboarding_client_role',
  });

  const mapRole = (value: RoleOption) =>
    value === 'customer' ? 'client' : 'business';

  const handleSelectRole = (value: RoleOption) => {
    setRole(value);
    const mappedRole = mapRole(value);
    trackChoice('role', mappedRole, { role: mappedRole });
  };

  const handleContinue = () => {
    if (!role) return;
    const mappedRole = mapRole(role);
    trackContinue({ role: mappedRole });
    completeStep({ role: mappedRole });
    if (role === 'customer') {
      safePush('/(auth)/onboarding-client-details');
      return;
    }
    if (role === 'business') {
      safePush('/(auth)/onboarding-business-role');
    }
  };

  const handleBack = () => {
    safeBack('/(auth)/sign-up');
  };

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.content}>
        <View style={styles.headerRow}>
          <BackButton onPress={handleBack} />
          <OnboardingProgress total={8} current={1} />
        </View>

        <View style={styles.titleContainer}>
          <Text style={styles.title}>מה התפקיד שלך?</Text>
          <Text style={styles.subtitle}>בחרו את סוג החשבון כדי להתחיל</Text>
        </View>

        <View style={styles.cardsContainer}>
          <Pressable onPress={() => handleSelectRole('customer')}>
            <View
              style={[
                styles.card,
                role === 'customer'
                  ? styles.cardSelected
                  : styles.cardUnselected,
              ]}
            >
              <Text
                style={[
                  styles.cardTitle,
                  role === 'customer' ? styles.textWhite : styles.textDark,
                ]}
              >
                אני לקוח
              </Text>
              <Text
                style={[
                  styles.cardSubtitle,
                  role === 'customer' ? styles.textLight : styles.textGray,
                ]}
              >
                רוצה לצבור חתימות ולקבל מתנות
              </Text>
            </View>
          </Pressable>

          <Pressable onPress={() => handleSelectRole('business')}>
            <View
              style={[
                styles.card,
                role === 'business'
                  ? styles.cardSelected
                  : styles.cardUnselected,
              ]}
            >
              <Text
                style={[
                  styles.cardTitle,
                  role === 'business' ? styles.textWhite : styles.textDark,
                ]}
              >
                אני בעל עסק
              </Text>
              <Text
                style={[
                  styles.cardSubtitle,
                  role === 'business' ? styles.textLight : styles.textGray,
                ]}
              >
                רוצה לנהל מועדון לקוחות חכם
              </Text>
            </View>
          </Pressable>
        </View>

        <View style={styles.footer}>
          <ContinueButton
            onPress={handleContinue}
            disabled={!role}
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
    color: '#2563eb',
    textAlign: 'right',
  },
  cardsContainer: {
    marginTop: 40,
    gap: 16,
  },
  card: {
    borderRadius: 16,
    paddingHorizontal: 20,
    paddingVertical: 16,
    borderWidth: 1,
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.1,
    shadowRadius: 2,
    elevation: 2,
  },
  cardSelected: {
    backgroundColor: '#2563eb',
    borderColor: '#2563eb',
    shadowColor: '#93c5fd',
  },
  cardUnselected: {
    backgroundColor: '#ffffff',
    borderColor: '#e5e7eb',
    shadowColor: '#9ca3af',
  },
  cardTitle: {
    fontSize: 16,
    fontWeight: '900',
    textAlign: 'center',
    marginBottom: 4,
  },
  cardSubtitle: {
    fontSize: 14,
    textAlign: 'center',
    lineHeight: 20,
  },
  textWhite: {
    color: '#ffffff',
  },
  textLight: {
    color: '#eff6ff',
  },
  textDark: {
    color: '#111827',
  },
  textGray: {
    color: '#6b7280',
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
});
