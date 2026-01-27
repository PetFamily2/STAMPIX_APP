import { Ionicons } from '@expo/vector-icons';
import { useLocalSearchParams } from 'expo-router';
import React, { useMemo, useState } from 'react';
import { Modal, Pressable, ScrollView, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { BackButton } from '@/components/BackButton';
import { safeBack } from '@/lib/navigation';

function range(n: number) {
  return Array.from({ length: n }, (_, i) => i);
}

function toInt(v: unknown, fallback: number) {
  const n = Number.parseInt(String(v ?? ''), 10);
  return Number.isFinite(n) ? n : fallback;
}

function clamp(n: number, min: number, max: number) {
  return Math.min(max, Math.max(min, n));
}

export default function CardDetailsScreen() {
  const params = useLocalSearchParams<{
    businessName?: string;
    subtitle?: string;
    stampsCurrent?: string;
    stampsGoal?: string;
  }>();

  const businessName = params.businessName ?? 'Cafe ניקוד+';
  const rewardText = params.subtitle ?? 'קבל מתנה לאחר 8 ניקובים';
  const stampsGoal = clamp(toInt(params.stampsGoal, 8), 1, 50);
  const stampsCurrent = clamp(toInt(params.stampsCurrent, 0), 0, stampsGoal);

  const [qrOpen, setQrOpen] = useState(false);

  const stamps = useMemo(() => {
    return range(stampsGoal).map((i) => i < stampsCurrent);
  }, [stampsGoal, stampsCurrent]);

  return (
    <SafeAreaView
      style={{ flex: 1, backgroundColor: '#F6F8FC' }}
      edges={['top']}
    >
      <ScrollView
        contentContainerStyle={{
          paddingHorizontal: 24,
          paddingTop: 12,
          paddingBottom: 28,
        }}
      >
        <View
          style={{
            flexDirection: 'row-reverse',
            alignItems: 'center',
            justifyContent: 'space-between',
          }}
        >
          <BackButton
            onPress={() => safeBack('/(authenticated)/(customer)/wallet')}
          />

          <Text
            style={{
              fontSize: 18,
              fontWeight: '800',
              color: '#0B1220',
              textAlign: 'right',
            }}
          >
            פרטי כרטיסיה
          </Text>

          <View style={{ width: 44 }} />
        </View>

        <View
          style={{
            marginTop: 14,
            backgroundColor: '#FFFFFF',
            borderRadius: 18,
            borderWidth: 1,
            borderColor: '#E6EBF5',
            padding: 14,
          }}
        >
          <View
            style={{
              flexDirection: 'row-reverse',
              alignItems: 'center',
              gap: 10,
            }}
          >
            <View
              style={{
                width: 42,
                height: 42,
                borderRadius: 14,
                backgroundColor: '#F3F6FF',
                alignItems: 'center',
                justifyContent: 'center',
                borderWidth: 1,
                borderColor: '#E3E9FF',
              }}
            >
              <Ionicons name="storefront-outline" size={20} color="#2F6BFF" />
            </View>

            <View style={{ flex: 1 }}>
              <Text
                style={{
                  fontSize: 16,
                  fontWeight: '800',
                  textAlign: 'right',
                  color: '#0B1220',
                }}
              >
                {businessName}
              </Text>
              <Text
                style={{
                  marginTop: 4,
                  fontSize: 12,
                  textAlign: 'right',
                  color: '#5B6475',
                }}
              >
                {rewardText}
              </Text>
            </View>

            <View
              style={{
                paddingHorizontal: 10,
                paddingVertical: 6,
                borderRadius: 999,
                backgroundColor: '#F3F6FF',
                borderWidth: 1,
                borderColor: '#E3E9FF',
              }}
            >
              <Text
                style={{ fontSize: 12, fontWeight: '800', color: '#2F6BFF' }}
              >
                {stampsCurrent}/{stampsGoal}
              </Text>
            </View>
          </View>
        </View>

        <View style={{ marginTop: 14 }}>
          <Text
            style={{
              fontSize: 14,
              fontWeight: '800',
              textAlign: 'right',
              color: '#0B1220',
            }}
          >
            חותמות
          </Text>

          <View
            style={{
              marginTop: 10,
              backgroundColor: '#FFFFFF',
              borderRadius: 18,
              borderWidth: 1,
              borderColor: '#E6EBF5',
              padding: 14,
              flexDirection: 'row-reverse',
              flexWrap: 'wrap',
              gap: 10,
              justifyContent: 'flex-start',
            }}
          >
            {stamps.map((filled, idx) => (
              <View
                key={idx}
                style={{
                  width: 56,
                  height: 56,
                  borderRadius: 16,
                  alignItems: 'center',
                  justifyContent: 'center',
                  backgroundColor: filled ? '#2F6BFF' : '#F1F4FA',
                  borderWidth: 1,
                  borderColor: filled ? '#2F6BFF' : '#E6EBF5',
                }}
              >
                <Ionicons
                  name={filled ? 'checkmark' : 'ellipse-outline'}
                  size={22}
                  color={filled ? '#FFFFFF' : '#9AA4B2'}
                />
              </View>
            ))}
          </View>
        </View>

        <Pressable
          onPress={() => setQrOpen(true)}
          style={({ pressed }) => ({
            marginTop: 14,
            backgroundColor: '#2F6BFF',
            borderRadius: 16,
            paddingVertical: 14,
            alignItems: 'center',
            opacity: pressed ? 0.9 : 1,
          })}
        >
          <Text style={{ color: '#FFFFFF', fontWeight: '900', fontSize: 14 }}>
            הצג קוד לניקוב
          </Text>
        </Pressable>
      </ScrollView>

      <Modal
        visible={qrOpen}
        transparent={true}
        animationType="fade"
        onRequestClose={() => setQrOpen(false)}
      >
        <View
          style={{
            flex: 1,
            backgroundColor: 'rgba(0,0,0,0.5)',
            justifyContent: 'center',
            padding: 16,
          }}
        >
          <View
            style={{
              backgroundColor: '#FFFFFF',
              borderRadius: 18,
              padding: 16,
            }}
          >
            <View
              style={{
                flexDirection: 'row-reverse',
                justifyContent: 'space-between',
                alignItems: 'center',
              }}
            >
              <Text
                style={{
                  fontSize: 16,
                  fontWeight: '900',
                  color: '#0B1220',
                  textAlign: 'right',
                }}
              >
                קוד לניקוב
              </Text>
              <Pressable onPress={() => setQrOpen(false)}>
                <Ionicons name="close" size={22} color="#5B6475" />
              </Pressable>
            </View>

            <View
              style={{
                marginTop: 12,
                height: 220,
                borderRadius: 16,
                backgroundColor: '#F6F8FC',
                borderWidth: 1,
                borderColor: '#E6EBF5',
                alignItems: 'center',
                justifyContent: 'center',
              }}
            >
              <Ionicons name="qr-code-outline" size={80} color="#2F6BFF" />
              <Text style={{ marginTop: 8, color: '#5B6475', fontSize: 12 }}>
                כאן יופיע QR אמיתי
              </Text>
            </View>

            <Pressable
              onPress={() => setQrOpen(false)}
              style={({ pressed }) => ({
                marginTop: 12,
                backgroundColor: '#2F6BFF',
                borderRadius: 14,
                paddingVertical: 12,
                alignItems: 'center',
                opacity: pressed ? 0.9 : 1,
              })}
            >
              <Text style={{ color: '#FFFFFF', fontWeight: '900' }}>סגור</Text>
            </Pressable>
          </View>
        </View>
      </Modal>
    </SafeAreaView>
  );
}
