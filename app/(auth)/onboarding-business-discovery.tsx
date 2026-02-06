import { Ionicons } from '@expo/vector-icons';
import React, { useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { BackButton } from '@/components/BackButton';
import { OnboardingProgress } from '@/components/OnboardingProgress';
import { safeBack, safePush } from '@/lib/navigation';

type DiscoverySourceId =
  | 'referral'
  | 'search'
  | 'social'
  | 'tiktok'
  | 'appStore'
  | 'other';

const DISCOVERY_SOURCES: Array<{
  id: DiscoverySourceId;
  title: string;
  icon: keyof typeof Ionicons.glyphMap;
}> = [
  { id: 'referral', title: 'חבר או בעל עסק אחר', icon: 'people-outline' },
  { id: 'search', title: 'חיפוש בגוגל', icon: 'search-outline' },
  { id: 'social', title: 'פייסבוק / אינסטגרם', icon: 'share-social-outline' },
  { id: 'tiktok', title: 'טיקטוק', icon: 'logo-tiktok' },
  { id: 'appStore', title: 'חנות האפליקציות', icon: 'apps-outline' },
  { id: 'other', title: 'אחר', icon: 'ellipsis-horizontal' },
];

export default function OnboardingBusinessDiscoveryScreen() {
  const [selected, setSelected] = useState<DiscoverySourceId | null>(null);
  const canContinue = Boolean(selected);

  const handleContinue = () => {
    if (!canContinue) return;
    safePush('/(auth)/onboarding-business-reason');
  };

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.content}>
        <View style={styles.header}>
          <BackButton onPress={() => safeBack('/(auth)/onboarding-business-role')} />
          <OnboardingProgress total={8} current={3} />
        </View>

        <View style={styles.titleContainer}>
          <Text style={styles.title}>איך הגעת אלינו?</Text>
          <Text style={styles.subtitle}>
            נשמח לדעת כדי להתאים לך התחלה חלקה יותר
          </Text>
        </View>

        <View style={styles.optionsContainer}>
          {DISCOVERY_SOURCES.map((source) => {
            const isSelected = selected === source.id;
            return (
              <Pressable
                key={source.id}
                onPress={() => setSelected(source.id)}
                accessibilityRole="button"
                accessibilityState={{ selected: isSelected }}
              >
                <View style={[styles.option, isSelected ? styles.optionSelected : styles.optionUnselected]}>
                  <View style={styles.optionContent}>
                    <View style={styles.iconContainer}>
                      <Ionicons
                        name={source.icon}
                        size={20}
                        color={isSelected ? '#FFFFFF' : '#2563EB'}
                      />
                    </View>
                    <Text style={[styles.optionText, isSelected ? styles.optionTextSelected : styles.optionTextUnselected]}>
                      {source.title}
                    </Text>
                  </View>
                </View>
              </Pressable>
            );
          })}
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
  header: {
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
    marginBottom: 8,
  },
  subtitle: {
    fontSize: 14,
    fontWeight: '600',
    color: '#6b7280',
    textAlign: 'right',
  },
  optionsContainer: {
    marginTop: 28,
    gap: 12,
  },
  option: {
    borderRadius: 16,
    paddingHorizontal: 20,
    paddingVertical: 16,
    borderWidth: 1,
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.1,
    shadowRadius: 2,
    elevation: 2,
  },
  optionSelected: {
    backgroundColor: '#2563eb',
    borderColor: '#2563eb',
    shadowColor: '#93c5fd',
  },
  optionUnselected: {
    backgroundColor: '#ffffff',
    borderColor: '#e5e7eb',
    shadowColor: '#9ca3af',
  },
  optionContent: {
    flexDirection: 'row-reverse',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  iconContainer: {
    height: 32,
    width: 32,
    alignItems: 'center',
    justifyContent: 'center',
  },
  optionText: {
    flex: 1,
    fontSize: 16,
    fontWeight: '900',
    textAlign: 'right',
  },
  optionTextSelected: {
    color: '#ffffff',
  },
  optionTextUnselected: {
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
