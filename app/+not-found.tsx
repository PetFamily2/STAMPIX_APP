import { Stack, usePathname, useRouter } from 'expo-router';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

const TEXT = {
  title: 'לא נמצא מסלול תואם',
  subtitle:
    'הקישור שפתח את האפליקציה לא תואם למסך קיים. חוזרים להתחברות רגילה.',
  action: 'חזרה להתחברות',
  debugPrefix: 'מסלול שהתקבל:',
};

export default function NotFoundScreen() {
  const router = useRouter();
  const pathname = usePathname();

  return (
    <SafeAreaView style={styles.container}>
      <Stack.Screen options={{ title: 'Not Found' }} />

      <View style={styles.content}>
        <Text style={styles.title}>{TEXT.title}</Text>
        <Text style={styles.subtitle}>{TEXT.subtitle}</Text>

        <View style={styles.debugBox}>
          <Text style={styles.debugLabel}>{TEXT.debugPrefix}</Text>
          <Text style={styles.debugValue}>{pathname || '/'}</Text>
        </View>

        <Pressable
          onPress={() => router.replace('/(auth)/sign-up')}
          accessibilityRole="button"
          accessibilityLabel={TEXT.action}
        >
          <View style={styles.button}>
            <Text style={styles.buttonText}>{TEXT.action}</Text>
          </View>
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
  debugBox: {
    marginTop: 4,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#dbe3f4',
    backgroundColor: '#ffffff',
    paddingHorizontal: 12,
    paddingVertical: 10,
    gap: 4,
  },
  debugLabel: {
    fontSize: 12,
    color: '#6b7280',
    textAlign: 'right',
    writingDirection: 'rtl',
    fontWeight: '700',
  },
  debugValue: {
    fontSize: 12,
    color: '#0f172a',
    textAlign: 'left',
    writingDirection: 'ltr',
    fontWeight: '600',
  },
  button: {
    marginTop: 8,
    backgroundColor: '#2563eb',
    borderRadius: 999,
    paddingVertical: 14,
    alignItems: 'center',
  },
  buttonText: {
    color: '#ffffff',
    fontSize: 16,
    fontWeight: '800',
    writingDirection: 'rtl',
  },
});
