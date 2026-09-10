import { useAuthActions } from '@convex-dev/auth/react';
import { type Href, useRouter } from 'expo-router';
import { useState } from 'react';
import { ActivityIndicator, Alert, Text, View } from 'react-native';

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
import { alignItems, flexDirection, rtlBaseView } from '@/lib/rtl';

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
      <View
        style={{
          borderRadius: 20,
          borderWidth: 1,
          borderColor: SETTINGS_TOKENS.border,
          backgroundColor: SETTINGS_TOKENS.surface,
          padding: 16,
          gap: 14,
        }}
      >
        <View
          style={{
            flexDirection: flexDirection.row,
            alignItems: 'center',
            gap: 12,
            ...rtlBaseView,
          }}
        >
          <UserAvatar
            avatarUrl={user?.avatarUrl}
            fullName={userFullName}
            size={64}
          />
          <View style={{ flex: 1, alignItems: alignItems.start, gap: 4 }}>
            <Text
              style={{
                width: '100%',
                fontSize: 18,
                lineHeight: 24,
                fontWeight: '700',
                color: SETTINGS_TOKENS.textPrimary,
                textAlign: 'right',
              }}
            >
              {userFullName}
            </Text>
            <Text
              style={{
                width: '100%',
                fontSize: 13,
                color: SETTINGS_TOKENS.textSecondary,
                textAlign: 'right',
              }}
            >
              {user?.email || 'לא מוגדר'}
            </Text>
          </View>
        </View>
        <InfoLine label="שם מלא" value={userFullName} />
        <InfoLine label="אימייל" value={user?.email || 'לא מוגדר'} />
        <InfoLine label="טלפון" value={user?.phone || 'לא מוגדר'} />
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

function InfoLine({ label, value }: { label: string; value: string }) {
  return (
    <View
      style={{
        flexDirection: flexDirection.row,
        alignItems: 'center',
        justifyContent: 'space-between',
        gap: 12,
        ...rtlBaseView,
      }}
    >
      <Text
        style={{
          flex: 1,
          fontSize: 15,
          fontWeight: '600',
          color: SETTINGS_TOKENS.textPrimary,
          textAlign: 'right',
        }}
      >
        {value}
      </Text>
      <Text
        style={{
          fontSize: 12,
          color: SETTINGS_TOKENS.textSecondary,
          textAlign: 'right',
        }}
      >
        {label}
      </Text>
    </View>
  );
}
