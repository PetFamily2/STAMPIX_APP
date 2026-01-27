import React from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { BackButton } from '@/components/BackButton';
import { OnboardingProgress } from '@/components/OnboardingProgress';
import { safeBack } from '@/lib/navigation';

export default function OnboardingBusinessScreen() {
  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.content}>
        <View style={styles.headerRow}>
          <BackButton onPress={() => safeBack('/(auth)/onboarding-client-role')} />
          <OnboardingProgress total={7} current={2} />
        </View>

        <View style={styles.centerContainer}>
          <Text style={styles.title}>׳ ׳¢׳™׳ ׳׳”׳›׳™׳¨ נ‘‹</Text>
          <Text style={styles.subtitle}>
            ׳׳¡׳ ׳”׳׳©׳ ׳׳‘׳¢׳׳™ ׳¢׳¡׳§׳™׳ ׳™׳×׳•׳•׳¡׳£ ׳›׳׳
          </Text>
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
  centerContainer: {
    marginTop: 48,
    alignItems: 'center',
  },
  title: {
    fontSize: 24,
    fontWeight: '900',
    color: '#111827',
    textAlign: 'center',
    marginBottom: 8,
  },
  subtitle: {
    fontSize: 14,
    fontWeight: '600',
    color: '#2563eb',
    textAlign: 'center',
  },
});




