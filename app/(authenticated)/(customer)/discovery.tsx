import { Ionicons } from '@expo/vector-icons';
import React, { useMemo, useState } from 'react';
import { ScrollView, Text, TextInput, View } from 'react-native';
import {
  SafeAreaView,
  useSafeAreaInsets,
} from 'react-native-safe-area-context';

type Business = {
  id: string;
  name: string;
  subtitle: string;
  distanceKm: number;
};

const demoBusinesses: Business[] = [
  {
    id: 'l1',
    name: 'קפה לואיז',
    subtitle: 'הטבת הצטרפות: חותמת כפולה',
    distanceKm: 0.7,
  },
  {
    id: 'b1',
    name: 'ברגריה',
    subtitle: 'הטבת הצטרפות: תוספת חינם',
    distanceKm: 1.9,
  },
  {
    id: 'p1',
    name: 'פיצה שכונתית',
    subtitle: 'הטבת הצטרפות: שתייה חינם',
    distanceKm: 2.4,
  },
];

export default function DiscoveryScreen() {
  const insets = useSafeAreaInsets();
  const [q, setQ] = useState('');

  const filtered = useMemo(() => {
    const s = q.trim();
    if (!s) return demoBusinesses;
    return demoBusinesses.filter(
      (b) => b.name.includes(s) || b.subtitle.includes(s)
    );
  }, [q]);

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: '#E9F0FF' }} edges={[]}>
      <ScrollView
        contentContainerStyle={{
          paddingHorizontal: 20,
          paddingTop: (insets.top || 0) + 16,
          paddingBottom: 120,
        }}
        keyboardShouldPersistTaps="handled"
      >
        <Text
          style={{
            fontSize: 24,
            fontWeight: '800',
            color: '#1A2B4A',
            textAlign: 'right',
          }}
        >
          גילוי עסקים
        </Text>
        <Text
          style={{
            marginTop: 6,
            fontSize: 13,
            color: '#2F6BFF',
            textAlign: 'right',
            fontWeight: '600',
          }}
        >
          מצא מועדונים חדשים להצטרפות
        </Text>

        <View
          style={{
            marginTop: 14,
            flexDirection: 'row-reverse',
            gap: 10,
            alignItems: 'center',
          }}
        >
          <View
            style={{
              flex: 1,
              flexDirection: 'row-reverse',
              alignItems: 'center',
              backgroundColor: '#FFFFFF',
              borderRadius: 14,
              borderWidth: 1,
              borderColor: '#E3E9FF',
              paddingHorizontal: 12,
              height: 46,
            }}
          >
            <Ionicons name="search" size={18} color="#7B879C" />
            <TextInput
              value={q}
              onChangeText={setQ}
              placeholder="חפש עסק או קטגוריה"
              placeholderTextColor="#9AA4B2"
              style={{
                flex: 1,
                textAlign: 'right',
                marginRight: 8,
                color: '#0B1220',
                fontSize: 14,
              }}
            />
          </View>

          <View
            style={{
              width: 46,
              height: 46,
              borderRadius: 14,
              backgroundColor: '#FFFFFF',
              borderWidth: 1,
              borderColor: '#E3E9FF',
              alignItems: 'center',
              justifyContent: 'center',
            }}
          >
            <Ionicons name="options-outline" size={20} color="#2F6BFF" />
          </View>
        </View>

        <View style={{ marginTop: 14, gap: 12 }}>
          {filtered.length === 0 ? (
            <View
              style={{
                backgroundColor: '#FFFFFF',
                borderRadius: 24,
                padding: 16,
                borderWidth: 1,
                borderColor: '#E3E9FF',
              }}
            >
              <Text
                style={{
                  fontSize: 16,
                  fontWeight: '800',
                  color: '#0B1220',
                  textAlign: 'right',
                }}
              >
                לא נמצאו עסקים
              </Text>
              <Text
                style={{
                  marginTop: 6,
                  fontSize: 13,
                  color: '#5B6475',
                  textAlign: 'right',
                }}
              >
                נסה חיפוש אחר, או נקה את השדה.
              </Text>
            </View>
          ) : (
            filtered.map((b) => (
              <View
                key={b.id}
                style={{
                  backgroundColor: '#FFFFFF',
                  borderRadius: 24,
                  padding: 16,
                  borderWidth: 1,
                  borderColor: '#E3E9FF',
                }}
              >
                <View
                  style={{
                    flexDirection: 'row-reverse',
                    justifyContent: 'space-between',
                    alignItems: 'flex-start',
                  }}
                >
                  <View style={{ flex: 1 }}>
                    <Text
                      style={{
                        fontSize: 16,
                        fontWeight: '800',
                        color: '#0B1220',
                        textAlign: 'right',
                      }}
                    >
                      {b.name}
                    </Text>
                    <Text
                      style={{
                        marginTop: 6,
                        fontSize: 13,
                        color: '#5B6475',
                        textAlign: 'right',
                      }}
                    >
                      {b.subtitle}
                    </Text>
                  </View>
                  <View
                    style={{
                      paddingHorizontal: 10,
                      paddingVertical: 6,
                      borderRadius: 999,
                      backgroundColor: '#D4EDFF',
                    }}
                  >
                    <Text
                      style={{
                        fontSize: 12,
                        fontWeight: '800',
                        color: '#2F6BFF',
                      }}
                    >
                      {b.distanceKm.toFixed(1)} ק״מ
                    </Text>
                  </View>
                </View>

                <View
                  style={{
                    marginTop: 12,
                    alignSelf: 'flex-start',
                    paddingHorizontal: 14,
                    paddingVertical: 10,
                    borderRadius: 14,
                    backgroundColor: '#E3E9FF',
                  }}
                >
                  <Text style={{ color: '#2F6BFF', fontWeight: '900' }}>
                    הצטרף למועדון
                  </Text>
                </View>
              </View>
            ))
          )}
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}
