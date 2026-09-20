import { useBottomTabBarHeight } from '@react-navigation/bottom-tabs';
import { useMutation } from 'convex/react';
import { useEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import {
  SafeAreaView,
  useSafeAreaInsets,
} from 'react-native-safe-area-context';
import { BackButton } from '@/components/BackButton';
import BusinessScreenHeader from '@/components/BusinessScreenHeader';
import {
  SETTINGS_TOKENS,
  SettingsCard,
  SettingsField,
  SettingsPrimaryButton,
  SettingsSection,
} from '@/components/business-settings';
import StickyScrollHeader from '@/components/StickyScrollHeader';
import { UserAvatar } from '@/components/UserAvatar';
import { useSessionContext } from '@/contexts/UserContext';
import { api } from '@/convex/_generated/api';
import { safeBack } from '@/lib/navigation';
import { alignItems, flexDirection, justifyContent } from '@/lib/rtl';

const TEXT = {
  title: 'פרטי החשבון',
  accountInfo: 'פרטי חשבון',
  marketingInfo: 'העדפות שיווק והטבות',
  fullName: 'שם מלא',
  phone: 'טלפון',
  email: 'אימייל',
  mode: 'מצב פעיל',
  plan: 'מסלול',
  status: 'סטטוס',
  businessCount: 'עסקים מחוברים',
  customerMode: 'לקוח',
  businessMode: 'עסק',
  active: 'פעיל',
  inactive: 'לא פעיל',
  freePlan: 'חינם',
  starterPlan: 'Starter',
  proPlan: 'Pro',
  premiumPlan: 'Premium',
  missingValue: 'לא הוגדר',
  editPhone: 'עריכת טלפון',
  save: 'שמור',
  cancel: 'ביטול',
  phonePlaceholder: 'הזינו מספר טלפון',
  phoneSaved: 'מספר הטלפון נשמר בהצלחה',
  phoneError: 'שמירת הטלפון נכשלה',
  marketingOptIn: 'הסכמה לקבלת מבצעים',
  birthday: 'יום הולדת (יום/חודש)',
  anniversary: 'יום נישואין (יום/חודש)',
  day: 'יום',
  month: 'חודש',
  marketingSave: 'שמירת העדפות שיווק',
  marketingSaved: 'העדפות שיווק נשמרו',
  marketingError: 'שמירת העדפות שיווק נכשלה',
};

function resolvePlanLabel(plan?: 'starter' | 'pro' | 'premium') {
  switch (plan) {
    case 'starter':
      return TEXT.starterPlan;
    case 'pro':
      return TEXT.proPlan;
    case 'premium':
      return TEXT.premiumPlan;
    default:
      return TEXT.missingValue;
  }
}

function parseOptionalDatePart(value: string) {
  const normalized = value.trim();
  if (!normalized) {
    return undefined;
  }
  const parsed = Number(normalized);
  if (!Number.isFinite(parsed)) {
    return Number.NaN;
  }
  return Math.floor(parsed);
}

function DetailRow({
  label,
  value,
}: {
  label: string;
  value: string | number;
}) {
  return <SettingsField label={label} value={String(value)} readOnly={true} />;
}

export default function CustomerAccountDetailsScreen() {
  const insets = useSafeAreaInsets();
  const tabBarHeight = useBottomTabBarHeight();
  const sessionContext = useSessionContext();

  const setMyPhone = useMutation(api.users.setMyPhone);
  const setMyMarketingProfile = useMutation(api.users.setMyMarketingProfile);

  const user = sessionContext?.user;
  const businesses = sessionContext?.businesses ?? [];

  const [isEditingPhone, setIsEditingPhone] = useState(false);
  const [phoneInput, setPhoneInput] = useState(user?.phone?.trim() ?? '');
  const [isSavingPhone, setIsSavingPhone] = useState(false);

  const [marketingOptIn, setMarketingOptIn] = useState(
    user?.marketingOptIn === true
  );
  const [birthdayDay, setBirthdayDay] = useState(
    user?.birthdayDay ? String(user.birthdayDay) : ''
  );
  const [birthdayMonth, setBirthdayMonth] = useState(
    user?.birthdayMonth ? String(user.birthdayMonth) : ''
  );
  const [anniversaryDay, setAnniversaryDay] = useState(
    user?.anniversaryDay ? String(user.anniversaryDay) : ''
  );
  const [anniversaryMonth, setAnniversaryMonth] = useState(
    user?.anniversaryMonth ? String(user.anniversaryMonth) : ''
  );
  const [isSavingMarketing, setIsSavingMarketing] = useState(false);

  useEffect(() => {
    if (!isEditingPhone) {
      setPhoneInput(user?.phone?.trim() ?? '');
    }
  }, [isEditingPhone, user?.phone]);

  useEffect(() => {
    setMarketingOptIn(user?.marketingOptIn === true);
    setBirthdayDay(user?.birthdayDay ? String(user.birthdayDay) : '');
    setBirthdayMonth(user?.birthdayMonth ? String(user.birthdayMonth) : '');
    setAnniversaryDay(user?.anniversaryDay ? String(user.anniversaryDay) : '');
    setAnniversaryMonth(
      user?.anniversaryMonth ? String(user.anniversaryMonth) : ''
    );
  }, [
    user?.anniversaryDay,
    user?.anniversaryMonth,
    user?.birthdayDay,
    user?.birthdayMonth,
    user?.marketingOptIn,
  ]);

  const fullName =
    user?.fullName?.trim() ||
    [user?.firstName?.trim(), user?.lastName?.trim()]
      .filter(Boolean)
      .join(' ')
      .trim() ||
    TEXT.missingValue;
  const email = user?.email?.trim() || TEXT.missingValue;
  const phone = user?.phone?.trim() || TEXT.missingValue;
  const activeMode =
    sessionContext?.activeMode === 'business'
      ? TEXT.businessMode
      : TEXT.customerMode;
  const subscriptionPlan = resolvePlanLabel(user?.subscriptionPlan);
  const accountStatus = user?.isActive ? TEXT.active : TEXT.inactive;

  const canSavePhone = useMemo(() => {
    const trimmed = phoneInput.trim();
    return (
      !isSavingPhone &&
      trimmed.length > 0 &&
      trimmed !== (user?.phone?.trim() ?? '')
    );
  }, [isSavingPhone, phoneInput, user?.phone]);

  const handleSavePhone = async () => {
    try {
      setIsSavingPhone(true);
      await setMyPhone({ phone: phoneInput.trim() });
      setIsEditingPhone(false);
      Alert.alert('נשמר', TEXT.phoneSaved);
    } catch {
      Alert.alert('שגיאה', TEXT.phoneError);
    } finally {
      setIsSavingPhone(false);
    }
  };

  const handleSaveMarketing = async () => {
    const birthdayDayValue = parseOptionalDatePart(birthdayDay);
    const birthdayMonthValue = parseOptionalDatePart(birthdayMonth);
    const anniversaryDayValue = parseOptionalDatePart(anniversaryDay);
    const anniversaryMonthValue = parseOptionalDatePart(anniversaryMonth);

    if (
      Number.isNaN(birthdayDayValue) ||
      Number.isNaN(birthdayMonthValue) ||
      Number.isNaN(anniversaryDayValue) ||
      Number.isNaN(anniversaryMonthValue)
    ) {
      Alert.alert('שגיאה', 'יש להזין תאריכים תקינים.');
      return;
    }

    try {
      setIsSavingMarketing(true);
      await setMyMarketingProfile({
        marketingOptIn,
        birthdayDay: birthdayDayValue,
        birthdayMonth: birthdayMonthValue,
        anniversaryDay: anniversaryDayValue,
        anniversaryMonth: anniversaryMonthValue,
      });
      Alert.alert('נשמר', TEXT.marketingSaved);
    } catch {
      Alert.alert('שגיאה', TEXT.marketingError);
    } finally {
      setIsSavingMarketing(false);
    }
  };

  return (
    <SafeAreaView style={styles.safeArea} edges={[]}>
      <ScrollView
        stickyHeaderIndices={[0]}
        contentContainerStyle={[
          styles.scrollContent,
          {
            paddingBottom: tabBarHeight + 24,
          },
        ]}
        keyboardShouldPersistTaps="handled"
      >
        <StickyScrollHeader
          topPadding={(insets.top || 0) + 12}
          backgroundColor="#E9F0FF"
          style={styles.headerRow}
        >
          <BusinessScreenHeader
            title={TEXT.title}
            titleAccessory={
              <BackButton
                onPress={() => safeBack('/(authenticated)/(customer)/settings')}
              />
            }
          />
        </StickyScrollHeader>

        <SettingsSection title={TEXT.accountInfo}>
          <SettingsCard>
            <View style={styles.profileHero}>
              <UserAvatar
                avatarUrl={user?.avatarUrl}
                fullName={fullName === TEXT.missingValue ? undefined : fullName}
                size={72}
              />
              <View style={styles.profileHeroCopy}>
                <Text style={styles.profileHeroName}>{fullName}</Text>
                <Text style={styles.profileHeroEmail}>{email}</Text>
              </View>
            </View>

            <DetailRow label={TEXT.fullName} value={fullName} />

            <SettingsField
              label={TEXT.phone}
              helpText="הטלפון האישי של החשבון, בנפרד מטלפון העסק."
            >
              <View style={styles.phoneEditWrap}>
                {isEditingPhone ? (
                  <TextInput
                    value={phoneInput}
                    onChangeText={setPhoneInput}
                    editable={!isSavingPhone}
                    placeholder={TEXT.phonePlaceholder}
                    placeholderTextColor="#94A3B8"
                    keyboardType="phone-pad"
                    style={styles.phoneInput}
                    textAlign="right"
                  />
                ) : (
                  <Text style={styles.detailValue}>{phone}</Text>
                )}
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
                      <Text style={styles.smallButtonSecondaryText}>
                        {TEXT.cancel}
                      </Text>
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
                        <Text style={styles.smallButtonPrimaryText}>
                          {TEXT.save}
                        </Text>
                      )}
                    </Pressable>
                  </View>
                ) : (
                  <Pressable
                    onPress={() => setIsEditingPhone(true)}
                    style={({ pressed }) => [
                      styles.smallButtonSecondary,
                      pressed ? styles.pressed : null,
                    ]}
                  >
                    <Text style={styles.smallButtonSecondaryText}>
                      {TEXT.editPhone}
                    </Text>
                  </Pressable>
                )}
              </View>
            </SettingsField>

            <DetailRow label={TEXT.email} value={email} />
            <DetailRow label={TEXT.mode} value={activeMode} />
            <DetailRow label={TEXT.plan} value={subscriptionPlan} />
            <DetailRow label={TEXT.status} value={accountStatus} />
            <DetailRow label={TEXT.businessCount} value={businesses.length} />
          </SettingsCard>
        </SettingsSection>

        <SettingsSection title={TEXT.marketingInfo}>
          <SettingsCard>
            <SettingsField label={TEXT.marketingOptIn}>
              <Pressable
                onPress={() => setMarketingOptIn((prev) => !prev)}
                style={({ pressed }) => [
                  styles.marketingToggle,
                  marketingOptIn
                    ? styles.marketingToggleOn
                    : styles.marketingToggleOff,
                  pressed ? styles.pressed : null,
                ]}
              >
                <Text
                  style={[
                    styles.marketingToggleText,
                    marketingOptIn
                      ? styles.marketingToggleTextOn
                      : styles.marketingToggleTextOff,
                  ]}
                >
                  {marketingOptIn ? 'פעיל' : 'כבוי'}
                </Text>
              </Pressable>
            </SettingsField>

            <SettingsField label={TEXT.birthday}>
              <View style={styles.dateInputs}>
                <TextInput
                  value={birthdayMonth}
                  onChangeText={setBirthdayMonth}
                  keyboardType="number-pad"
                  placeholder={TEXT.month}
                  placeholderTextColor="#94A3B8"
                  style={styles.dateInput}
                  textAlign="center"
                />
                <TextInput
                  value={birthdayDay}
                  onChangeText={setBirthdayDay}
                  keyboardType="number-pad"
                  placeholder={TEXT.day}
                  placeholderTextColor="#94A3B8"
                  style={styles.dateInput}
                  textAlign="center"
                />
              </View>
            </SettingsField>

            <SettingsField label={TEXT.anniversary}>
              <View style={styles.dateInputs}>
                <TextInput
                  value={anniversaryMonth}
                  onChangeText={setAnniversaryMonth}
                  keyboardType="number-pad"
                  placeholder={TEXT.month}
                  placeholderTextColor="#94A3B8"
                  style={styles.dateInput}
                  textAlign="center"
                />
                <TextInput
                  value={anniversaryDay}
                  onChangeText={setAnniversaryDay}
                  keyboardType="number-pad"
                  placeholder={TEXT.day}
                  placeholderTextColor="#94A3B8"
                  style={styles.dateInput}
                  textAlign="center"
                />
              </View>
            </SettingsField>

            <SettingsPrimaryButton
              label={TEXT.marketingSave}
              onPress={() => void handleSaveMarketing()}
              disabled={isSavingMarketing}
              loading={isSavingMarketing}
            />
          </SettingsCard>
        </SettingsSection>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: { flex: 1, backgroundColor: '#E9F0FF' },
  scrollContent: {
    paddingHorizontal: 20,
    gap: SETTINGS_TOKENS.sectionGap,
    width: '100%',
    maxWidth: 720,
    alignSelf: 'center',
  },
  headerRow: { alignItems: 'stretch', marginBottom: 4 },
  pressed: { opacity: 0.88 },
  buttonDisabled: { opacity: 0.6 },
  backButton: {
    width: 30,
    height: 30,
    borderRadius: 15,
    backgroundColor: '#FFFFFF',
    borderWidth: 1,
    borderColor: '#E5E7EB',
    alignItems: 'center',
    justifyContent: 'center',
  },
  profileHero: {
    flexDirection: flexDirection.row,
    alignItems: 'center',
    justifyContent: justifyContent.start,
    gap: 12,
    paddingBottom: 16,
    borderBottomWidth: 1,
    borderBottomColor: '#F3F4F6',
  },
  profileHeroCopy: {
    flex: 1,
    alignItems: alignItems.start,
    gap: 2,
  },
  profileHeroName: {
    fontSize: 18,
    lineHeight: 22,
    fontWeight: '900',
    color: '#111827',
    textAlign: 'right',
  },
  profileHeroEmail: {
    fontSize: 12,
    lineHeight: 16,
    fontWeight: '600',
    color: '#64748B',
    textAlign: 'right',
  },
  detailValue: {
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
  marketingToggle: {
    width: '100%',
    minHeight: 48,
    borderRadius: 999,
    borderWidth: 1,
    paddingHorizontal: 14,
    alignItems: 'center',
    justifyContent: 'center',
  },
  marketingToggleOn: {
    borderColor: '#93C5FD',
    backgroundColor: '#DBEAFE',
  },
  marketingToggleOff: {
    borderColor: '#CBD5E1',
    backgroundColor: '#F1F5F9',
  },
  marketingToggleText: {
    fontSize: 12,
    fontWeight: '700',
    textAlign: 'center',
    writingDirection: 'rtl',
  },
  marketingToggleTextOn: {
    color: '#1D4ED8',
  },
  marketingToggleTextOff: {
    color: '#475569',
  },
  dateInputs: {
    width: '100%',
    flexDirection: flexDirection.rowReverse,
    flexWrap: 'wrap',
    gap: 8,
  },
  dateInput: {
    flex: 1,
    minWidth: 104,
    minHeight: 52,
    borderRadius: SETTINGS_TOKENS.radius,
    borderWidth: 1,
    borderColor: SETTINGS_TOKENS.borderStrong,
    backgroundColor: SETTINGS_TOKENS.surface,
    paddingHorizontal: 10,
    fontSize: 14,
    fontWeight: '600',
    color: '#111827',
  },
});
