import React from 'react';
import { ScrollView, Text, View } from 'react-native';
import {
  SafeAreaView,
  useSafeAreaInsets,
} from 'react-native-safe-area-context';

export default function RewardsScreen() {
  const insets = useSafeAreaInsets();

  // דמו זמני - בשלב הבא נחבר ל-Convex ונציג רק הטבות זמינות
  const rewards: Array<{ id: string; title: string; subtitle: string }> = [];

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: '#E9F0FF' }} edges={[]}>
      <ScrollView
        contentContainerStyle={{
          paddingHorizontal: 20,
          paddingTop: (insets.top || 0) + 16,
          paddingBottom: 120,
        }}
      >
        <Text
          style={{
            fontSize: 24,
            fontWeight: '800',
            color: '#1A2B4A',
            textAlign: 'right',
          }}
        >
          הטבות
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
          כאן תראה הטבות שזמינות למימוש
        </Text>

        {rewards.length === 0 ? (
          <View
            style={{
              marginTop: 18,
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
              עדיין אין הטבות זמינות
            </Text>
            <Text
              style={{
                marginTop: 6,
                fontSize: 13,
                color: '#5B6475',
                textAlign: 'right',
              }}
            >
              כשתשלים כרטיסיה ותגיע ליעד, ההטבה תופיע כאן אוטומטית.
            </Text>
          </View>
        ) : null}
      </ScrollView>
    </SafeAreaView>
  );
}
