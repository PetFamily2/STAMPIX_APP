import { useAuthActions } from '@convex-dev/auth/react';
import { useRouter } from 'expo-router';
import { useState } from 'react';
import { Platform, StyleSheet, View } from 'react-native';
import { PwaButton } from '@/components/pwa-ui/PwaButton';
import { StaffWebFrame } from '@/components/pwa-ui/StaffWebFrame';
import { AppText as Text } from '@/components/ui/AppText';
import { useSessionContext } from '@/contexts/UserContext';
import { BUSINESS_WEB_TOKENS as TOKENS } from '@/lib/design/businessWebTokens';

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
    <StaffWebFrame>
    <View
      style={styles.screen}
      {...(Platform.OS === 'web' ? { role: 'main' as const } : {})}
    >
      <View style={styles.card}>
        <Text
          accessibilityRole="header"
          {...(Platform.OS === 'web' ? { 'aria-level': 1 } : {})}
          style={styles.title}
        >
          {business?.name ?? 'צוות'}
        </Text>
        <Text style={styles.body}>
          {process.env.EXPO_PUBLIC_WEB_SCANNER_COMMANDS === 'true'
            ? 'סרקו את קוד הלקוח כדי להוסיף חותמת או לממש הטבה.'
            : 'אפשר להמשיך לסרוק באפליקציה.'}
        </Text>
        {process.env.EXPO_PUBLIC_WEB_SCANNER_COMMANDS === 'true' ? (
          <PwaButton
            fullWidth={true}
            label="סריקה"
            onPress={() => router.push('/staff/scanner-preview')}
          />
        ) : null}
        <PwaButton
          fullWidth={true}
          label="תיבת הודעות"
          onPress={() => router.push('/inbox')}
          variant="secondary"
        />
        {error ? (
          <Text accessibilityRole="alert" style={styles.error}>
            {error}
          </Text>
        ) : null}
        <PwaButton
          disabled={isSigningOut}
          fullWidth={true}
          label={isSigningOut ? 'יוצאים מהחשבון' : 'יציאה מהחשבון'}
          onPress={handleLogout}
          variant="quiet"
        />
      </View>
    </View>
    </StaffWebFrame>
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: TOKENS.colors.pageBackground,
    padding: 20,
    justifyContent: 'center',
    alignItems: 'center',
  },
  card: {
    width: '100%',
    maxWidth: 480,
    gap: 16,
    backgroundColor: TOKENS.colors.elevatedSurface,
    borderColor: TOKENS.colors.border,
    borderWidth: 1,
    borderRadius: 16,
    padding: 24,
  },
  title: {
    color: TOKENS.colors.textPrimary,
    fontSize: 22,
    lineHeight: 28,
    fontWeight: '600',
    textAlign: 'right',
    writingDirection: 'rtl',
  },
  body: {
    color: TOKENS.colors.textSecondary,
    fontSize: 16,
    lineHeight: 24,
    textAlign: 'right',
    writingDirection: 'rtl',
  },
  error: {
    color: TOKENS.colors.danger,
    textAlign: 'right',
    writingDirection: 'rtl',
  },
});
