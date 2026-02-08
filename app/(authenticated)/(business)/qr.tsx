import { useQuery } from 'convex/react';
import React, { useMemo, useState } from 'react';
import {
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import QRCode from 'react-native-qrcode-svg';
import {
  SafeAreaView,
  useSafeAreaInsets,
} from 'react-native-safe-area-context';

import { api } from '@/convex/_generated/api';

const BASE_URL = 'https://stampix.app/join';

export default function BusinessJoinQrScreen() {
  const insets = useSafeAreaInsets();
  const businesses = useQuery(api.scanner.myBusinesses) ?? [];
  const selectedBusiness = businesses[0]; // first business for now
  const [source, setSource] = useState('');

  const qrValue = useMemo(() => {
    const pubId = selectedBusiness?.businessPublicId;
    if (!pubId) return null;
    const params = new URLSearchParams({ biz: pubId });
    if (source.trim()) {
      params.set('src', source.trim());
    }
    return `${BASE_URL}?${params.toString()}`;
  }, [selectedBusiness?.businessPublicId, source]);

  const joinCode = selectedBusiness?.joinCode ?? null;

  return (
    <SafeAreaView style={styles.safeArea} edges={[]}>
      <ScrollView
        style={styles.scrollBackground}
        contentContainerStyle={[
          styles.scrollContainer,
          {
            paddingTop: (insets.top || 0) + 16,
            paddingBottom: (insets.bottom || 0) + 24,
          },
        ]}
      >
        <View style={styles.header}>
          <Text style={styles.headerTitle}>QR להצטרפות לקוחות</Text>
          <Text style={styles.headerSubtitle}>
            {selectedBusiness
              ? `${selectedBusiness.name} · הצג ללקוח כדי להצטרף למועדון`
              : 'טוען עסק...'}
          </Text>
        </View>

        <View style={styles.card}>
          <Text style={styles.cardTitle}>קוד הצטרפות קבוע</Text>
          <View style={styles.qrFrame}>
            {qrValue ? (
              <QRCode
                value={qrValue}
                size={220}
                color="#1A2B4A"
                backgroundColor="#FFFFFF"
              />
            ) : (
              <Text style={styles.qrPlaceholderText}>
                {selectedBusiness
                  ? 'חסר businessPublicId — הריצו migration'
                  : 'טוען...'}
              </Text>
            )}
          </View>
          {qrValue ? (
            <Text style={styles.qrText}>{qrValue}</Text>
          ) : null}
        </View>

        {joinCode ? (
          <View style={styles.card}>
            <Text style={styles.cardTitle}>קוד הצטרפות ידני</Text>
            <Text style={styles.joinCodeText}>{joinCode}</Text>
            <Text style={styles.joinCodeHint}>
              לקוח יכול להזין קוד זה באפליקציה במקום לסרוק QR
            </Text>
          </View>
        ) : null}

        <View style={styles.card}>
          <Text style={styles.cardTitle}>מקור (src) — אופציונלי</Text>
          <Text style={styles.cardSubtitle}>
            הוסיפו מילת מפתח לזיהוי המקור, למשל: "קופה1", "כניסה", "פלייר"
          </Text>
          <TextInput
            value={source}
            onChangeText={setSource}
            placeholder='למשל: "register-1"'
            placeholderTextColor="#9AA4B2"
            style={styles.sourceInput}
            keyboardType="default"
            autoCapitalize="none"
            returnKeyType="done"
          />
          {source.trim() ? (
            <Text style={styles.sourceHint}>
              ה-QR למעלה כולל עכשיו src={source.trim()}
            </Text>
          ) : null}
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
    backgroundColor: '#E9F0FF',
  },
  scrollBackground: {
    backgroundColor: '#E9F0FF',
  },
  scrollContainer: {
    paddingHorizontal: 20,
    gap: 16,
  },
  header: {
    gap: 6,
  },
  headerTitle: {
    fontSize: 22,
    fontWeight: '900',
    color: '#1A2B4A',
    textAlign: 'right',
  },
  headerSubtitle: {
    fontSize: 13,
    fontWeight: '700',
    color: '#2F6BFF',
    textAlign: 'right',
  },
  card: {
    backgroundColor: '#FFFFFF',
    borderRadius: 24,
    borderWidth: 1,
    borderColor: '#E3E9FF',
    padding: 16,
    shadowColor: '#000',
    shadowOpacity: 0.03,
    shadowRadius: 10,
    elevation: 2,
  },
  cardTitle: {
    fontSize: 16,
    fontWeight: '800',
    color: '#0B1220',
    textAlign: 'right',
  },
  cardSubtitle: {
    marginTop: 4,
    fontSize: 12,
    fontWeight: '600',
    color: '#5B6475',
    textAlign: 'right',
  },
  qrFrame: {
    marginTop: 12,
    alignSelf: 'center',
    width: 240,
    height: 240,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: '#E3E9FF',
    backgroundColor: '#FFFFFF',
    alignItems: 'center',
    justifyContent: 'center',
  },
  qrPlaceholderText: {
    fontSize: 12,
    fontWeight: '700',
    color: '#5B6475',
    textAlign: 'center',
    paddingHorizontal: 12,
  },
  qrText: {
    marginTop: 10,
    fontSize: 11,
    color: '#5B6475',
    textAlign: 'center',
  },
  joinCodeText: {
    marginTop: 10,
    fontSize: 28,
    fontWeight: '900',
    color: '#2F6BFF',
    textAlign: 'center',
    letterSpacing: 4,
  },
  joinCodeHint: {
    marginTop: 6,
    fontSize: 12,
    color: '#5B6475',
    textAlign: 'center',
  },
  sourceInput: {
    height: 44,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: '#E3E9FF',
    paddingHorizontal: 12,
    textAlign: 'right',
    color: '#0B1220',
    backgroundColor: '#F6F8FC',
    fontWeight: '700',
    marginTop: 10,
  },
  sourceHint: {
    marginTop: 6,
    fontSize: 11,
    color: '#2F6BFF',
    fontWeight: '700',
    textAlign: 'right',
  },
});
