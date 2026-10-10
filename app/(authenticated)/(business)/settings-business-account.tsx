import { useAuthActions } from '@convex-dev/auth/react';
import { useNavigation, usePreventRemove } from '@react-navigation/native';
import { useMutation } from 'convex/react';
import { type Href, useRouter } from 'expo-router';
import { useState } from 'react';
import { ActivityIndicator, StyleSheet, TextInput, View } from 'react-native';
import {
  BusinessSettingsSubpageHeader,
  SETTINGS_TOKENS,
  SettingsCard,
  SettingsField,
  SettingsGroup,
  SettingsNavRow,
  SettingsPageShell,
  SettingsPrimaryButton,
  SettingsSection,
} from '@/components/business-settings';
import { UserAvatar } from '@/components/UserAvatar';
import { useSessionContext } from '@/contexts/UserContext';
import { api } from '@/convex/_generated/api';
import { useActiveBusiness } from '@/hooks/useActiveBusiness';
import { Alert } from '@/lib/alert';
import {
  type AccountFormState,
  accountBaselines,
  accountSaveResultMessage,
  commitAccountSaveGroup,
  listDirtyAccountGroups,
} from '@/lib/businessSettings/accountFormSave';
import { safePush } from '@/lib/navigation';
import { BUSINESS_ROUTES } from '@/lib/navigation/businessRoutes';
import { alignItems, rtlBaseText } from '@/lib/rtl';

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
  const navigation = useNavigation();
  const router = useRouter();
  const sessionContext = useSessionContext();
  const { signOut } = useAuthActions();
  const { activeBusiness } = useActiveBusiness();
  const setMyName = useMutation(api.users.setMyName);
  const setMyPhone = useMutation(api.users.setMyPhone);
  const [isSigningOut, setIsSigningOut] = useState(false);
  const [firstNameDraft, setFirstNameDraft] = useState<string | null>(null);
  const [lastNameDraft, setLastNameDraft] = useState<string | null>(null);
  const [phoneDraft, setPhoneDraft] = useState<string | null>(null);
  const [committedFirstName, setCommittedFirstName] = useState<string | null>(
    null
  );
  const [committedLastName, setCommittedLastName] = useState<string | null>(
    null
  );
  const [committedPhone, setCommittedPhone] = useState<string | null>(null);
  const [isSaving, setIsSaving] = useState(false);

  const user = sessionContext?.user;
  const savedFirstName = user?.firstName?.trim() ?? '';
  const savedLastName = user?.lastName?.trim() ?? '';
  const canLeaveBusiness = activeBusiness
    ? activeBusiness.staffRole !== 'owner'
    : false;
  const canCloseBusiness = activeBusiness?.staffRole === 'owner';
  const canOpenAccountData = canLeaveBusiness || canCloseBusiness;
  const savedPhone = user?.phone?.trim() ?? '';
  const emailValue = user?.email?.trim() || 'לא הוגדר';
  const accountFormState: AccountFormState = {
    serverFirstName: savedFirstName,
    serverLastName: savedLastName,
    serverPhone: savedPhone,
    committedFirstName,
    committedLastName,
    committedPhone,
    firstNameDraft,
    lastNameDraft,
    phoneDraft,
  };
  const baselines = accountBaselines(accountFormState);
  const dirtyAccountGroups = listDirtyAccountGroups(accountFormState);
  const userFullName =
    [baselines.firstName, baselines.lastName]
      .filter(Boolean)
      .join(' ')
      .trim() ||
    user?.fullName?.trim() ||
    'ללא שם';
  const firstNameInput = firstNameDraft ?? baselines.firstName;
  const lastNameInput = lastNameDraft ?? baselines.lastName;
  const phoneInput = phoneDraft ?? baselines.phone;
  const trimmedFirstName = firstNameInput.trim();
  const trimmedLastName = lastNameInput.trim();
  const trimmedPhone = phoneInput.trim();
  const isNameDirty = dirtyAccountGroups.includes('name');
  const isPhoneDirty = dirtyAccountGroups.includes('phone');
  const hasUnsavedChanges = isNameDirty || isPhoneDirty;
  const isNameValid =
    !isNameDirty || (trimmedFirstName.length > 0 && trimmedLastName.length > 0);
  const isPhoneValid = !isPhoneDirty || trimmedPhone.length > 0;
  const canSave = !isSaving && hasUnsavedChanges && isNameValid && isPhoneValid;

  usePreventRemove(hasUnsavedChanges && !isSaving, ({ data }) => {
    Alert.alert(
      'יש שינויים שלא נשמרו',
      'אפשר להמשיך לערוך או לצאת ללא שמירה.',
      [
        { text: 'המשך עריכה', style: 'cancel' },
        {
          text: 'יציאה ללא שמירה',
          style: 'destructive',
          onPress: () => navigation.dispatch(data.action),
        },
      ]
    );
  });

  const applyAccountFormState = (next: AccountFormState) => {
    setCommittedFirstName(next.committedFirstName);
    setCommittedLastName(next.committedLastName);
    setCommittedPhone(next.committedPhone);
    setFirstNameDraft(next.firstNameDraft);
    setLastNameDraft(next.lastNameDraft);
    setPhoneDraft(next.phoneDraft);
  };

  const handleSave = async () => {
    if (!canSave) {
      return;
    }
    const savedGroups: Array<'name' | 'phone'> = [];
    let formState = accountFormState;
    const savedValues = {
      firstName: trimmedFirstName,
      lastName: trimmedLastName,
      phone: trimmedPhone,
    };
    setIsSaving(true);
    try {
      if (isNameDirty) {
        try {
          await setMyName({
            firstName: trimmedFirstName,
            lastName: trimmedLastName,
          });
          formState = commitAccountSaveGroup(formState, 'name', savedValues);
          applyAccountFormState(formState);
          savedGroups.push('name');
        } catch {
          const result = accountSaveResultMessage(savedGroups, 'name');
          Alert.alert(result.title, result.message);
          return;
        }
      }
      if (isPhoneDirty) {
        try {
          await setMyPhone({ phone: trimmedPhone });
          formState = commitAccountSaveGroup(formState, 'phone', savedValues);
          applyAccountFormState(formState);
          savedGroups.push('phone');
        } catch {
          const result = accountSaveResultMessage(savedGroups, 'phone');
          Alert.alert(result.title, result.message);
          return;
        }
      }
      const result = accountSaveResultMessage(savedGroups, null);
      Alert.alert(result.title, result.message);
    } finally {
      setIsSaving(false);
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
      keyboardAware={true}
      header={
        <BusinessSettingsSubpageHeader
          title="פרטי חשבון"
          fallbackHref={BUSINESS_ROUTES.settings}
        />
      }
      footer={
        <SettingsPrimaryButton
          label="שמירה"
          loading={isSaving}
          disabled={!canSave}
          onPress={() => {
            void handleSave();
          }}
          accessibilityLabel="שמירת פרטי החשבון"
        />
      }
    >
      <SettingsSection title="פרטים אישיים">
        <SettingsCard>
          <View style={styles.avatarWrap}>
            <UserAvatar
              avatarUrl={user?.avatarUrl}
              fullName={userFullName}
              size={64}
            />
          </View>
          <SettingsField
            label="שם פרטי"
            errorText={
              isNameDirty && trimmedFirstName.length === 0
                ? 'יש להזין שם פרטי.'
                : null
            }
          >
            <TextInput
              value={firstNameInput}
              onChangeText={setFirstNameDraft}
              editable={!isSaving}
              placeholder="הזינו שם פרטי"
              placeholderTextColor={SETTINGS_TOKENS.textTertiary}
              autoCapitalize="words"
              accessibilityLabel="שם פרטי"
              textAlignVertical="center"
              underlineColorAndroid="transparent"
              style={styles.inlineInput}
            />
          </SettingsField>
          <SettingsField
            label="שם משפחה"
            errorText={
              isNameDirty && trimmedLastName.length === 0
                ? 'יש להזין שם משפחה.'
                : null
            }
          >
            <TextInput
              value={lastNameInput}
              onChangeText={setLastNameDraft}
              editable={!isSaving}
              placeholder="הזינו שם משפחה"
              placeholderTextColor={SETTINGS_TOKENS.textTertiary}
              autoCapitalize="words"
              accessibilityLabel="שם משפחה"
              textAlignVertical="center"
              underlineColorAndroid="transparent"
              style={styles.inlineInput}
            />
          </SettingsField>
          <SettingsField
            label="אימייל"
            value={emailValue}
            readOnly={true}
            helpText="לקריאה בלבד. כתובת האימייל מנוהלת דרך ההתחברות."
          />
          <SettingsField
            label="טלפון אישי"
            helpText="הטלפון האישי נשמר בנפרד מהטלפון העסקי שמוצג בפרטי העסק"
            errorText={
              isPhoneDirty && trimmedPhone.length === 0
                ? 'יש להזין מספר טלפון.'
                : null
            }
          >
            <TextInput
              value={phoneInput}
              onChangeText={setPhoneDraft}
              editable={!isSaving}
              placeholder="הזינו מספר טלפון"
              placeholderTextColor={SETTINGS_TOKENS.textTertiary}
              keyboardType="phone-pad"
              accessibilityLabel="טלפון אישי"
              textAlignVertical="center"
              underlineColorAndroid="transparent"
              style={styles.inlineInput}
            />
          </SettingsField>
        </SettingsCard>
      </SettingsSection>

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
  avatarWrap: {
    width: '100%',
    alignItems: alignItems.start,
  },
  inlineInput: {
    width: '100%',
    minHeight: 52,
    borderRadius: 18,
    borderWidth: 1,
    borderColor: SETTINGS_TOKENS.border,
    backgroundColor: SETTINGS_TOKENS.surface,
    paddingHorizontal: 16,
    paddingVertical: 8,
    fontSize: 16,
    fontWeight: '500',
    color: SETTINGS_TOKENS.textPrimary,
    ...rtlBaseText,
  },
});
