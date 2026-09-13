import { useAuthActions } from '@convex-dev/auth/react';
import { Ionicons } from '@expo/vector-icons';
import { type Href, useRouter } from 'expo-router';
import { useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  StyleSheet,
  Text,
  View,
} from 'react-native';

import {
  BusinessSettingsSubpageHeader,
  SettingsGroup,
  SettingsNavRow,
  SettingsPageShell,
  SettingsSection,
  SETTINGS_TOKENS,
} from '@/components/business-settings';
import { UserAvatar } from '@/components/UserAvatar';
import { useSessionContext } from '@/contexts/UserContext';
import { useActiveBusiness } from '@/hooks/useActiveBusiness';
import { BUSINESS_ROUTES } from '@/lib/navigation/businessRoutes';
import { safePush } from '@/lib/navigation';
import { flexDirection, rtlBaseView } from '@/lib/rtl';

type LegalDocumentKey = 'privacy' | 'terms' | 'deletion';

const LEGAL_ROWS: Array<{
  document: LegalDocumentKey;
  title: string;
  subtitle: string;
}> = [
  {
    document: 'terms',
    title: 'תנאי שימוש',
    subtitle: 'כללי השימוש ב-StampAix לעסקים וללקוחות',
  },
  {
    document: 'privacy',
    title: 'מדיניות פרטיות',
    subtitle: 'איך נשמר ומנוהל המידע בחשבון',
  },
  {
    document: 'deletion',
    title: 'מדיניות מחיקת חשבון',
    subtitle: 'מידע בלבד: מה נמחק, מה נשמר ומגבלת בעלים יחיד',
  },
];

export default function BusinessSettingsAccountScreen() {
  const router = useRouter();
  const sessionContext = useSessionContext();
  const { signOut } = useAuthActions();
  const { activeBusiness } = useActiveBusiness();
  const [isSigningOut, setIsSigningOut] = useState(false);

  const user = sessionContext?.user;
  const userFullName =
    user?.fullName?.trim() ||
    [user?.firstName?.trim(), user?.lastName?.trim()]
      .filter(Boolean)
      .join(' ')
      .trim() ||
    'ללא שם';
  const canLeaveBusiness = activeBusiness
    ? activeBusiness.staffRole !== 'owner'
    : false;
  const canCloseBusiness = activeBusiness?.staffRole === 'owner';
  const canOpenAccountData = canLeaveBusiness || canCloseBusiness;

  const handleSignOut = () => {
    if (isSigningOut) {
      return;
    }
    Alert.alert('התנתקות מהמכשיר?', 'תצאו מהחשבון במכשיר זה בלבד.', [
      { text: 'ביטול', style: 'cancel' },
      {
        text: 'התנתקות',
        style: 'destructive',
        onPress: async () => {
          if (isSigningOut) {
            return;
          }
          try {
            setIsSigningOut(true);
            await signOut();
            router.replace('/(auth)/sign-in');
          } catch {
            Alert.alert('שגיאה', 'לא הצלחנו לבצע יציאה. נסו שוב.');
          } finally {
            setIsSigningOut(false);
          }
        },
      },
    ]);
  };

  const openLegalDocument = (document: LegalDocumentKey) => {
    safePush(
      `/(authenticated)/settings-legal?document=${document}&returnTo=business-account`
    );
  };

  return (
    <SettingsPageShell
      header={
        <BusinessSettingsSubpageHeader
          title="פרטי חשבון"
          fallbackHref={BUSINESS_ROUTES.settings}
        />
      }
    >
      <View style={styles.identityCard}>
        <View style={styles.identityRow}>
          <UserAvatar
            avatarUrl={user?.avatarUrl}
            fullName={userFullName}
            size={64}
          />
          <View style={styles.identityCopy}>
            <Text style={styles.identityName}>{userFullName}</Text>
            <Text style={styles.identityEmail}>
              {user?.email || 'לא מוגדר'}
            </Text>
          </View>
        </View>

        <View style={styles.identityDivider} />
        <AccountProperty
          label="טלפון לחשבון"
          value={user?.phone || 'לא מוגדר'}
          isMissing={!user?.phone}
        />
      </View>

      <SettingsSection title="מסמכים ומדיניות">
        <SettingsGroup>
          {LEGAL_ROWS.map((row, index) => (
            <SettingsNavRow
              key={row.document}
              title={row.title}
              subtitle={row.subtitle}
              onPress={() => openLegalDocument(row.document)}
              isLast={index === LEGAL_ROWS.length - 1}
            />
          ))}
        </SettingsGroup>
      </SettingsSection>

      <SettingsSection title="אפשרויות נוספות">
        <SettingsGroup>
          <SettingsNavRow
            title="התנתקות מהמכשיר"
            subtitle="יציאה מהחשבון במכשיר זה"
            icon="log-out-outline"
            showChevron={false}
            disabled={isSigningOut}
            onPress={handleSignOut}
            isLast={true}
            accessibilityHint="יציאה מהחשבון במכשיר זה בלי לשנות את העסק או המנוי"
          />
        </SettingsGroup>
      </SettingsSection>

      {canOpenAccountData ? (
        <SettingsSection title="אזור מתקדם">
          <SettingsGroup>
            <SettingsNavRow
              title="ניהול חשבון ונתונים"
              subtitle="פעולות נדירות לעסק ולנתונים"
              icon="options-outline"
              onPress={() => router.push(BUSINESS_ROUTES.accountData as Href)}
              isLast={true}
              accessibilityHint="פתיחת אזור נפרד לפעולות הרסניות. אינו יציאה מהמכשיר ואינו ביטול מנוי"
            />
          </SettingsGroup>
        </SettingsSection>
      ) : null}

      {isSigningOut ? (
        <ActivityIndicator color={SETTINGS_TOKENS.accent} />
      ) : null}
    </SettingsPageShell>
  );
}

function AccountProperty({
  label,
  value,
  isMissing = false,
}: {
  label: string;
  value: string;
  isMissing?: boolean;
}) {
  return (
    <View style={styles.property}>
      <Text style={styles.propertyLabel}>{label}</Text>
      <View style={styles.propertyValueRow}>
        <Text
          style={[
            styles.propertyValue,
            isMissing ? styles.propertyValueMissing : null,
          ]}
        >
          {value}
        </Text>
        {isMissing ? (
          <View style={styles.missingBadge}>
            <Ionicons name="alert-circle-outline" size={15} color="#92400E" />
            <Text style={styles.missingBadgeText}>פרט חסר</Text>
          </View>
        ) : null}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  identityCard: {
    width: '100%',
    borderRadius: SETTINGS_TOKENS.radiusLg,
    borderWidth: 1,
    borderColor: SETTINGS_TOKENS.border,
    backgroundColor: SETTINGS_TOKENS.surface,
    paddingHorizontal: 16,
    paddingVertical: 16,
    gap: 14,
  },
  identityRow: {
    width: '100%',
    flexDirection: flexDirection.row,
    alignItems: 'center',
    gap: 12,
    ...rtlBaseView,
  },
  identityCopy: {
    flex: 1,
    minWidth: 0,
    alignItems: 'stretch',
    gap: 3,
  },
  identityName: {
    width: '100%',
    fontSize: 18,
    lineHeight: 24,
    fontWeight: '700',
    color: SETTINGS_TOKENS.textPrimary,
    textAlign: 'right',
    writingDirection: 'rtl',
  },
  identityEmail: {
    width: '100%',
    fontSize: 13,
    lineHeight: 19,
    fontWeight: '500',
    color: SETTINGS_TOKENS.textSecondary,
    textAlign: 'right',
    writingDirection: 'rtl',
  },
  identityDivider: {
    width: '100%',
    height: StyleSheet.hairlineWidth,
    backgroundColor: SETTINGS_TOKENS.border,
  },
  property: {
    width: '100%',
    alignItems: 'stretch',
    gap: 5,
  },
  propertyLabel: {
    width: '100%',
    fontSize: 12,
    lineHeight: 17,
    fontWeight: '600',
    color: SETTINGS_TOKENS.textSecondary,
    textAlign: 'right',
    writingDirection: 'rtl',
  },
  propertyValueRow: {
    width: '100%',
    minHeight: 28,
    flexDirection: flexDirection.row,
    alignItems: 'center',
    gap: 8,
    ...rtlBaseView,
  },
  propertyValue: {
    flex: 1,
    minWidth: 0,
    fontSize: 15,
    lineHeight: 21,
    fontWeight: '600',
    color: SETTINGS_TOKENS.textPrimary,
    textAlign: 'right',
    writingDirection: 'rtl',
  },
  propertyValueMissing: {
    color: '#92400E',
    fontWeight: '700',
  },
  missingBadge: {
    minHeight: 28,
    flexDirection: flexDirection.row,
    alignItems: 'center',
    gap: 4,
    borderRadius: 999,
    backgroundColor: '#FEF3C7',
    paddingHorizontal: 8,
  },
  missingBadgeText: {
    fontSize: 11,
    lineHeight: 15,
    fontWeight: '800',
    color: '#92400E',
    textAlign: 'right',
    writingDirection: 'rtl',
  },
});
