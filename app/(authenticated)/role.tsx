import { useMutation } from 'convex/react';
import { useRouter } from 'expo-router';
import React, { useState } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useAppMode } from '@/contexts/AppModeContext';
import { api } from '@/convex/_generated/api';

type RoleOption = 'customer' | 'business';

export default function RoleSelectionScreen() {
  const router = useRouter();
  const { setAppMode } = useAppMode();
  const setMyRole = useMutation(api.users.setMyRole);
  const [busy, setBusy] = useState<RoleOption | null>(null);

  const handleSelect = async (role: RoleOption) => {
    if (busy) return;
    setBusy(role);
    try {
      await setAppMode(role);
      await setMyRole({ role: role === 'business' ? 'merchant' : 'customer' });
    } catch {
      // Keep local app mode; server role can be updated later from settings.
    } finally {
      setBusy(null);
    }

    router.replace(
      role === 'customer'
        ? '/(authenticated)/(customer)/wallet'
        : '/(authenticated)/(business)/business/dashboard'
    );
  };

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.content}>
        <View style={styles.titleContainer}>
          <Text style={styles.title}>מה התפקיד שלך?</Text>
          <Text style={styles.subtitle}>בחר כדי להמשיך למסך המתאים</Text>
        </View>

        <View style={styles.cardsContainer}>
          <Pressable
            onPress={() => handleSelect('customer')}
            disabled={busy !== null}
            accessibilityRole="button"
            accessibilityState={{ disabled: busy !== null }}
          >
            <View style={[styles.card, busy === 'customer' && styles.cardSelected]}>
              <View style={styles.cardHeader}>
                <Text style={[styles.cardTitle, busy === 'customer' && styles.textWhite]}>
                  אני לקוח
                </Text>
                {busy === 'customer' ? (
                  <ActivityIndicator color="#ffffff" />
                ) : null}
              </View>
              <Text
                style={[
                  styles.cardSubtitle,
                  busy === 'customer' ? styles.textLight : styles.textGray,
                ]}
              >
                רוצה לצבור חתימות ולקבל מתנות
              </Text>
            </View>
          </Pressable>

          <Pressable
            onPress={() => handleSelect('business')}
            disabled={busy !== null}
            accessibilityRole="button"
            accessibilityState={{ disabled: busy !== null }}
          >
            <View style={[styles.card, busy === 'business' && styles.cardSelected]}>
              <View style={styles.cardHeader}>
                <Text style={[styles.cardTitle, busy === 'business' && styles.textWhite]}>
                  אני בעל עסק
                </Text>
                {busy === 'business' ? (
                  <ActivityIndicator color="#ffffff" />
                ) : null}
              </View>
              <Text
                style={[
                  styles.cardSubtitle,
                  busy === 'business' ? styles.textLight : styles.textGray,
                ]}
              >
                רוצה לנהל מועדון לקוחות חכם
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
    paddingTop: 24,
    paddingBottom: 32,
  },
  titleContainer: {
    marginTop: 24,
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
  cardsContainer: {
    marginTop: 32,
    gap: 16,
  },
  card: {
    borderRadius: 16,
    paddingHorizontal: 20,
    paddingVertical: 16,
    borderWidth: 1,
    backgroundColor: '#ffffff',
    borderColor: '#e5e7eb',
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
  cardHeader: {
    flexDirection: 'row-reverse',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  cardTitle: {
    fontSize: 16,
    fontWeight: '900',
    textAlign: 'right',
  },
  cardSubtitle: {
    marginTop: 6,
    fontSize: 14,
    textAlign: 'right',
    lineHeight: 20,
  },
  textWhite: {
    color: '#ffffff',
  },
  textLight: {
    color: '#eff6ff',
  },
  textGray: {
    color: '#6b7280',
  },
});
