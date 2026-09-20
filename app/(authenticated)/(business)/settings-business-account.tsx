import { useAuthActions } from '@convex-dev/auth/react';
import { useMutation } from 'convex/react';
import { type Href, useRouter } from 'expo-router';
import { useEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';

import {
  BusinessSettingsSubpageHeader,
  SETTINGS_TOKENS,
  SettingsCard,
  SettingsField,
  SettingsGroup,
  SettingsNavRow,
  SettingsPageShell,
  SettingsSection,
} from '@/components/business-settings';
import { UserAvatar } from '@/components/UserAvatar';
import { useSessionContext } from '@/contexts/UserContext';
import { api } from '@/convex/_generated/api';
import { useActiveBusiness } from '@/hooks/useActiveBusiness';
import { safePush } from '@/lib/navigation';
import { BUSINESS_ROUTES } from '@/lib/navigation/businessRoutes';
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
  const setMyPhone = useMutation(api.users.setMyPhone);
  const [isSigningOut, setIsSigningOut] = useState(false);
  const [isEditingPhone, setIsEditingPhone] = useState(false);
  const [phoneInput, setPhoneInput] = useState('');
  const [isSavingPhone, setIsSavingPhone] = useState(false);

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
  const savedPhone = user?.phone?.trim() ?? '';
  const hasPhone = savedPhone.length > 0;

  useEffect(() => {
    if (!isEditingPhone) {
      setPhoneInput(savedPhone);
    }
  }, [isEditingPhone, savedPhone]);

  const canSavePhone = useMemo(() => {
    const trimmed = phoneInput.trim();
    return !isSavingPhone && trimmed.length > 0 && trimmed !== savedPhone;
  }, [isSavingPhone, phoneInput, savedPhone]);

  const handleSavePhone = async () => {
    try {
      setIsSavingPhone(true);
      await setMyPhone({ phone: phoneInput.trim() });
      setIsEditingPhone(false);
      Alert.alert('נשמר', 'מספר הטלפון נשמר בהצלחה.');
    } catch {
      Alert.alert('שגיאה', 'שמירת הטלפון נכשלה.');
    } finally {
      setIsSavingPhone(false);
    }
  };

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
      <SettingsCard>
        <View style={styles.identityRow}>
          <UserAvatar
            avatarUrl={user?.avatarUrl}
            fullName={userFullName}
            size={64}
          />
          <View style={styles.identityCopy}>
            <Text style={styles.identityName}>{userFullName}</Text>
            <Text style={styles.identityEmail}>
              {user?.email || 'לא הוגדר'}
            </Text>
          </View>
        </View>

        <SettingsField
          label="טלפון אישי לחשבון"
          helpText="הטלפון האישי נשמר בנפרד מהטלפון העסקי שמוצג בפרטי העסק"
        >
          <View style={styles.phoneEditWrap}>
            {isEditingPhone ? (
              <TextInput
                value={phoneInput}
                onChangeText={setPhoneInput}
                editable={!isSavingPhone}
                placeholder="הזינו מספר טלפון"
                placeholderTextColor="#94A3B8"
                keyboardType="phone-pad"
                style={styles.phoneInput}
                textAlign="right"
              />
            ) : hasPhone ? (
              <Text style={styles.propertyValue}>{savedPhone}</Text>
            ) : null}
            {isEditingPhone ? (
              <View style={styles.phoneActionRow}>
                <Pressable
                  onPress={() => setIsEditingPhone(false)}
                  disabled={isSavingPhone}
                  style={({ pressed }) => [
                    styles.smallButtonSecondary,
                    pressed ? styles.pressed : null,
                  ]}
                >
                  <Text style={styles.smallButtonSecondaryText}>ביטול</Text>
                </Pressable>
                <Pressable
                  onPress={() => {
                    void handleSavePhone();
                  }}
                  disabled={!canSavePhone}
                  style={({ pressed }) => [
                    styles.smallButtonPrimary,
                    !canSavePhone ? styles.buttonDisabled : null,
                    pressed ? styles.pressed : null,
                  ]}
                >
                  {isSavingPhone ? (
                    <ActivityIndicator color="#FFFFFF" size="small" />
                  ) : (
                    <Text style={styles.smallButtonPrimaryText}>שמור</Text>
                  )}
                </Pressable>
              </View>
            ) : (
              <Pressable
                onPress={() => setIsEditingPhone(true)}
                accessibilityRole="button"
                accessibilityLabel={hasPhone ? 'עריכת טלפון' : 'הוספת טלפון'}
                style={({ pressed }) => [
                  hasPhone
                    ? styles.smallButtonSecondary
                    : styles.smallButtonPrimary,
                  pressed ? styles.pressed : null,
                ]}
              >
                <Text
                  style={
                    hasPhone
                      ? styles.smallButtonSecondaryText
                      : styles.smallButtonPrimaryText
                  }
                >
                  {hasPhone ? 'עריכת טלפון' : 'הוספת טלפון'}
                </Text>
              </Pressable>
            )}
          </View>
        </SettingsField>
      </SettingsCard>

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

const styles = StyleSheet.create({
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
  propertyValue: {
    width: '100%',
    fontSize: 15,
    lineHeight: 21,
    fontWeight: '600',
    color: SETTINGS_TOKENS.textPrimary,
    textAlign: 'right',
    writingDirection: 'rtl',
  },
  phoneEditWrap: {
    width: '100%',
    minHeight: 52,
    borderRadius: SETTINGS_TOKENS.radius,
    borderWidth: 1,
    borderColor: SETTINGS_TOKENS.border,
    backgroundColor: SETTINGS_TOKENS.surfaceMuted,
    padding: 10,
    gap: 8,
    alignItems: 'stretch',
  },
  phoneInput: {
    width: '100%',
    minHeight: 52,
    borderRadius: SETTINGS_TOKENS.radius,
    borderWidth: 1,
    borderColor: SETTINGS_TOKENS.borderStrong,
    backgroundColor: SETTINGS_TOKENS.surface,
    paddingHorizontal: 16,
    fontSize: 15,
    fontWeight: '600',
    color: '#111827',
    textAlign: 'right',
    writingDirection: 'rtl',
  },
  phoneActionRow: {
    flexDirection: flexDirection.row,
    flexWrap: 'wrap',
    gap: 8,
  },
  smallButtonSecondary: {
    minHeight: 44,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#D1D5DB',
    backgroundColor: '#FFFFFF',
    paddingHorizontal: 10,
    alignItems: 'center',
    justifyContent: 'center',
  },
  smallButtonSecondaryText: {
    fontSize: 12,
    fontWeight: '700',
    color: '#475569',
    textAlign: 'center',
    writingDirection: 'rtl',
  },
  smallButtonPrimary: {
    minHeight: 44,
    borderRadius: 12,
    backgroundColor: '#2F6BFF',
    paddingHorizontal: 10,
    alignItems: 'center',
    justifyContent: 'center',
  },
  smallButtonPrimaryText: {
    fontSize: 12,
    fontWeight: '700',
    color: '#FFFFFF',
    textAlign: 'center',
    writingDirection: 'rtl',
  },
  pressed: { opacity: 0.88 },
  buttonDisabled: { opacity: 0.6 },
});
