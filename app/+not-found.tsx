import { Stack } from 'expo-router';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { safeBack } from '@/lib/navigation';

const TEXT = {
  title: 'העמוד לא נמצא',
  subtitle: 'הקישור שנפתח לא זמין או שהועבר למקום אחר.',
  action: 'חזרה',
};

export default function NotFoundScreen() {
  return (
    <SafeAreaView style={styles.container}>
      <Stack.Screen options={{ title: 'לא נמצא' }} />

      <View style={styles.content}>
        <Text style={styles.title}>{TEXT.title}</Text>
        <Text style={styles.subtitle}>{TEXT.subtitle}</Text>

        <Pressable
          onPress={() => safeBack('/(auth)/sign-up')}
          accessibilityRole="button"
          accessibilityLabel={TEXT.action}
          style={({ pressed }) => [
            styles.button,
            pressed ? styles.buttonPressed : null,
          ]}
        >
          <Text style={styles.buttonText}>{TEXT.action}</Text>
        </Pressable>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#F8F7F4',
  },
  content: {
    flex: 1,
    width: '100%',
    maxWidth: 560,
    alignSelf: 'center',
    justifyContent: 'center',
    paddingHorizontal: 24,
    gap: 14,
  },
  title: {
    fontSize: 24,
    fontWeight: '900',
    color: '#111827',
    textAlign: 'right',
    writingDirection: 'rtl',
  },
  subtitle: {
    fontSize: 14,
    fontWeight: '600',
    color: '#4b5563',
    textAlign: 'right',
    writingDirection: 'rtl',
    lineHeight: 20,
  },
  button: {
    marginTop: 8,
    minHeight: 48,
    backgroundColor: '#2563eb',
    borderRadius: 999,
    paddingHorizontal: 20,
    alignItems: 'center',
    justifyContent: 'center',
  },
  buttonPressed: {
    opacity: 0.9,
  },
  buttonText: {
    color: '#ffffff',
    fontSize: 16,
    fontWeight: '800',
    writingDirection: 'rtl',
  },
});
