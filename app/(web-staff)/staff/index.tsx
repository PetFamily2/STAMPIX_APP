import { useAuthActions } from '@convex-dev/auth/react';
import { useRouter } from 'expo-router';
import { useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { PaintedPressable } from '@/components/ui/PaintedPressable';
import { useSessionContext } from '@/contexts/UserContext';

export default function WebStaffLanding() {
  const { signOut } = useAuthActions();
  const router = useRouter();
  const session = useSessionContext();
  const [isSigningOut, setIsSigningOut] = useState(false);
  const [error, setError] = useState('');
  const business = session?.businesses.find(
    (item) => item.id === session.activeBusinessId
  );

  const handleLogout = async () => {
    if (isSigningOut) {
      return;
    }
    setIsSigningOut(true);
    setError('');
    try {
      await signOut();
    } catch {
      setError('לא הצלחנו לצאת מהחשבון. נסו שוב.');
      setIsSigningOut(false);
    }
  };

  return (
    <View style={styles.screen}>
      <View style={styles.card}>
        <Text accessibilityRole="header" style={styles.title}>
          אזור הצוות
        </Text>
        {business ? <Text style={styles.business}>{business.name}</Text> : null}
        <Text style={styles.body}>
          {process.env.EXPO_PUBLIC_WEB_SCANNER_COMMANDS === 'true'
            ? 'סריקה זמינה למורשי בדיקה בסביבת Preview בלבד.'
            : 'אפשר להמשיך לסרוק באפליקציה.'}
        </Text>
        {process.env.EXPO_PUBLIC_WEB_SCANNER_COMMANDS === 'true' ? (
          <PaintedPressable
            accessibilityRole="button"
            accessibilityLabel="פתיחת סורק בדיקה"
            onPress={() => router.push('/staff/scanner-preview')}
            style={styles.button}
          >
            <Text style={styles.buttonText}>פתיחת סורק בדיקה</Text>
          </PaintedPressable>
        ) : null}
        <PaintedPressable
          accessibilityRole="button"
          accessibilityLabel="תיבת הודעות"
          onPress={() => router.push('/inbox')}
          style={styles.button}
        >
          <Text style={styles.buttonText}>תיבת הודעות</Text>
        </PaintedPressable>
        <PaintedPressable
          accessibilityRole="button"
          accessibilityLabel="הגדרות צוות"
          onPress={() => router.push('/staff/settings')}
          style={styles.button}
        >
          <Text style={styles.buttonText}>הגדרות צוות</Text>
        </PaintedPressable>
        {error ? (
          <Text accessibilityRole="alert" style={styles.error}>
            {error}
          </Text>
        ) : null}
        <PaintedPressable
          accessibilityLabel="יציאה מהחשבון"
          accessibilityRole="button"
          disabled={isSigningOut}
          onPress={handleLogout}
          style={styles.button}
        >
          <Text style={styles.buttonText}>
            {isSigningOut ? 'יוצאים מהחשבון…' : 'יציאה מהחשבון'}
          </Text>
        </PaintedPressable>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: '#F8FAFF',
    padding: 20,
    justifyContent: 'center',
    alignItems: 'center',
  },
  card: {
    width: '100%',
    maxWidth: 480,
    backgroundColor: '#FFFFFF',
    borderColor: '#D5E3FF',
    borderWidth: 1,
    borderRadius: 20,
    padding: 24,
    gap: 16,
  },
  title: {
    color: '#0F172A',
    fontSize: 28,
    fontWeight: '700',
    textAlign: 'right',
    writingDirection: 'rtl',
  },
  business: {
    color: '#0F172A',
    fontSize: 20,
    fontWeight: '600',
    textAlign: 'right',
    writingDirection: 'rtl',
  },
  body: {
    color: '#475569',
    fontSize: 17,
    lineHeight: 26,
    textAlign: 'right',
    writingDirection: 'rtl',
  },
  error: {
    color: '#B91C1C',
    textAlign: 'right',
    writingDirection: 'rtl',
  },
  button: {
    minHeight: 48,
    borderRadius: 12,
    backgroundColor: '#2F6BFF',
    justifyContent: 'center',
    alignItems: 'center',
  },
  buttonText: {
    color: '#FFFFFF',
    fontSize: 16,
    fontWeight: '600',
    textAlign: 'center',
  },
});
