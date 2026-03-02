import { useBottomTabBarHeight } from '@react-navigation/bottom-tabs';
import { Ionicons } from '@expo/vector-icons';
import { useMutation } from 'convex/react';
import { router } from 'expo-router';
import { useEffect, useState } from 'react';
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

import { useSessionContext } from '@/contexts/UserContext';
import { api } from '@/convex/_generated/api';

const TEXT = {
  title: 'פרטי החשבון',
  add: 'הוסף',
  cancel: 'ביטול',
  save: 'שמירה',
  phonePlaceholder: 'הזינו מספר טלפון',
  phoneSaveSuccessTitle: 'נשמר',
  phoneSaveSuccessMessage: 'מספר הטלפון נשמר בהצלחה',
  phoneSaveErrorTitle: 'שגיאה',
  phoneRequired: 'יש להזין מספר טלפון',
  phoneInvalid: 'הזינו מספר טלפון תקין',
  phoneTooLong: 'מספר הטלפון ארוך מדי',
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
  proPlan: 'Pro',
  unlimitedPlan: 'Unlimited',
  missingValue: 'לא הוגדר',
  sectionReadonly: 'פרטי החשבון שלך',
};

function resolvePlanLabel(plan?: 'free' | 'pro' | 'unlimited') {
  switch (plan) {
    case 'pro':
      return TEXT.proPlan;
    case 'unlimited':
      return TEXT.unlimitedPlan;
    default:
      return TEXT.freePlan;
  }
}

function resolvePhoneErrorMessage(error: unknown) {
  if (!(error instanceof Error)) {
    return TEXT.phoneInvalid;
  }

  switch (error.message) {
    case 'PHONE_REQUIRED':
      return TEXT.phoneRequired;
    case 'PHONE_TOO_LONG':
      return TEXT.phoneTooLong;
    case 'PHONE_INVALID':
      return TEXT.phoneInvalid;
    default:
      return error.message.trim().length > 0
        ? error.message
        : TEXT.phoneInvalid;
  }
}

function DetailRow({
  label,
  value,
  isLast = false,
}: {
  label: string;
  value: string | number;
  isLast?: boolean;
}) {
  return (
    <View style={[styles.detailRow, isLast ? styles.detailRowLast : null]}>
      <Text style={styles.detailValue}>{String(value)}</Text>
      <Text style={styles.detailLabel}>{label}</Text>
    </View>
  );
}

type PhoneRowProps = {
  isEditing: boolean;
  isSaving: boolean;
  phoneValue: string;
  phoneInput: string;
  onChangePhone: (value: string) => void;
  onStartEdit: () => void;
  onCancelEdit: () => void;
  onSave: () => void;
};

function PhoneDetailRow({
  isEditing,
  isSaving,
  phoneValue,
  phoneInput,
  onChangePhone,
  onStartEdit,
  onCancelEdit,
  onSave,
}: PhoneRowProps) {
  const trimmedPhoneInput = phoneInput.trim();
  const isSaveDisabled =
    isSaving ||
    trimmedPhoneInput.length === 0 ||
    trimmedPhoneInput === phoneValue;

  return (
    <View style={styles.phoneRowWrap}>
      <View style={[styles.detailRow, styles.detailRowPlain]}>
        <View style={styles.phoneValueWrap}>
          {isEditing ? (
            <TextInput
              value={phoneInput}
              onChangeText={onChangePhone}
              editable={!isSaving}
              placeholder={TEXT.phonePlaceholder}
              placeholderTextColor="#9CA3AF"
              keyboardType="phone-pad"
              textContentType="telephoneNumber"
              style={styles.phoneInput}
              textAlign="left"
            />
          ) : (
            <View style={styles.phoneDisplayRow}>
              <View
                style={[
                  styles.phoneValueBadge,
                  !phoneValue ? styles.phoneValueBadgeEmpty : null,
                ]}
              >
                <Text
                  style={[
                    styles.phoneValueBadgeText,
                    !phoneValue ? styles.phoneValueBadgeTextEmpty : null,
                  ]}
                >
                  {phoneValue || TEXT.missingValue}
                </Text>
              </View>

              <Pressable
                onPress={onStartEdit}
                style={({ pressed }) => [
                  styles.inlineActionButton,
                  pressed ? styles.pressed : null,
                ]}
              >
                <Ionicons name="add-circle-outline" size={14} color="#2F6BFF" />
                <Text style={styles.inlineActionButtonText}>{TEXT.add}</Text>
              </Pressable>
            </View>
          )}
        </View>

        <Text style={styles.detailLabel}>{TEXT.phone}</Text>
      </View>

      {isEditing ? (
        <View style={styles.phoneActionsRow}>
          <Pressable
            onPress={onCancelEdit}
            disabled={isSaving}
            style={({ pressed }) => [
              styles.secondaryActionButton,
              pressed ? styles.pressed : null,
              isSaving ? styles.disabled : null,
            ]}
          >
            <Text style={styles.secondaryActionButtonText}>{TEXT.cancel}</Text>
          </Pressable>

          <Pressable
            onPress={onSave}
            disabled={isSaveDisabled}
            style={({ pressed }) => [
              styles.primaryActionButton,
              isSaveDisabled ? styles.primaryActionButtonDisabled : null,
              pressed ? styles.pressed : null,
            ]}
          >
            {isSaving ? (
              <ActivityIndicator color="#FFFFFF" size="small" />
            ) : (
              <Text style={styles.primaryActionButtonText}>{TEXT.save}</Text>
            )}
          </Pressable>
        </View>
      ) : null}
    </View>
  );
}

export default function CustomerAccountDetailsScreen() {
  const insets = useSafeAreaInsets();
  const tabBarHeight = useBottomTabBarHeight();
  const sessionContext = useSessionContext();
  const setMyPhone = useMutation(api.users.setMyPhone);

  const user = sessionContext?.user;
  const businesses = sessionContext?.businesses ?? [];
  const savedPhone = user?.phone?.trim() ?? '';

  const [phoneValue, setPhoneValue] = useState(savedPhone);
  const [phoneInput, setPhoneInput] = useState(savedPhone);
  const [isEditingPhone, setIsEditingPhone] = useState(false);
  const [isSavingPhone, setIsSavingPhone] = useState(false);

  useEffect(() => {
    setPhoneValue(savedPhone);
    if (!isEditingPhone) {
      setPhoneInput(savedPhone);
    }
  }, [isEditingPhone, savedPhone]);

  const fullName =
    user?.fullName?.trim() ||
    [user?.firstName?.trim(), user?.lastName?.trim()]
      .filter(Boolean)
      .join(' ')
      .trim() ||
    TEXT.missingValue;
  const email = user?.email?.trim() || TEXT.missingValue;
  const activeMode =
    sessionContext?.activeMode === 'business'
      ? TEXT.businessMode
      : TEXT.customerMode;
  const subscriptionPlan = resolvePlanLabel(user?.subscriptionPlan);
  const accountStatus = user?.isActive ? TEXT.active : TEXT.inactive;
  const trimmedPhoneInput = phoneInput.trim();

  const handleStartPhoneEdit = () => {
    setPhoneInput(phoneValue);
    setIsEditingPhone(true);
  };

  const handleCancelPhoneEdit = () => {
    if (isSavingPhone) {
      return;
    }
    setPhoneInput(phoneValue);
    setIsEditingPhone(false);
  };

  const handleSavePhone = async () => {
    try {
      setIsSavingPhone(true);
      await setMyPhone({ phone: trimmedPhoneInput });
      setPhoneValue(trimmedPhoneInput);
      setPhoneInput(trimmedPhoneInput);
      setIsEditingPhone(false);
      Alert.alert(TEXT.phoneSaveSuccessTitle, TEXT.phoneSaveSuccessMessage);
    } catch (error) {
      Alert.alert(TEXT.phoneSaveErrorTitle, resolvePhoneErrorMessage(error));
    } finally {
      setIsSavingPhone(false);
    }
  };

  return (
    <SafeAreaView style={styles.safeArea} edges={[]}>
      <ScrollView
        contentContainerStyle={[
          styles.scrollContent,
          {
            paddingTop: (insets.top || 0) + 8,
            paddingBottom: tabBarHeight + 24,
          },
        ]}
        keyboardShouldPersistTaps="handled"
      >
        <View style={styles.headerRow}>
          <Pressable
            onPress={() => router.back()}
            style={({ pressed }) => [
              styles.backButton,
              pressed ? styles.pressed : null,
            ]}
          >
            <Ionicons name="chevron-forward" size={20} color="#111827" />
          </Pressable>

          <View style={styles.headerTextWrap}>
            <Text style={styles.pageTitle}>{TEXT.title}</Text>
          </View>
        </View>

        <View style={styles.section}>
          <Text style={styles.sectionTitle}>{TEXT.sectionReadonly}</Text>

          <View style={styles.card}>
            <DetailRow label={TEXT.fullName} value={fullName} />
            <PhoneDetailRow
              isEditing={isEditingPhone}
              isSaving={isSavingPhone}
              phoneValue={phoneValue}
              phoneInput={phoneInput}
              onChangePhone={setPhoneInput}
              onStartEdit={handleStartPhoneEdit}
              onCancelEdit={handleCancelPhoneEdit}
              onSave={handleSavePhone}
            />
            <DetailRow label={TEXT.email} value={email} />
            <DetailRow label={TEXT.mode} value={activeMode} />
            <DetailRow label={TEXT.plan} value={subscriptionPlan} />
            <DetailRow label={TEXT.status} value={accountStatus} />
            <DetailRow
              label={TEXT.businessCount}
              value={businesses.length}
              isLast={true}
            />
          </View>
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: { flex: 1, backgroundColor: '#F3F3F1' },
  scrollContent: {
    paddingHorizontal: 20,
    gap: 16,
  },
  pressed: { opacity: 0.88 },
  disabled: { opacity: 0.6 },

  headerRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    gap: 14,
  },
  headerTextWrap: {
    flex: 1,
    alignItems: 'flex-end',
  },
  backButton: {
    width: 42,
    height: 42,
    borderRadius: 21,
    backgroundColor: '#FFFFFF',
    borderWidth: 1,
    borderColor: '#E5E7EB',
    alignItems: 'center',
    justifyContent: 'center',
  },
  pageTitle: {
    fontSize: 24,
    lineHeight: 30,
    fontWeight: '900',
    color: '#171717',
    textAlign: 'right',
  },

  section: { gap: 10 },
  sectionTitle: {
    fontSize: 12,
    fontWeight: '700',
    color: '#71717A',
    textAlign: 'right',
  },
  card: {
    borderRadius: 18,
    borderWidth: 1,
    borderColor: '#E5E7EB',
    backgroundColor: '#FFFFFF',
    padding: 14,
    gap: 14,
    shadowColor: '#111827',
    shadowOpacity: 0.04,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 4 },
    elevation: 2,
  },

  detailRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    gap: 12,
    paddingBottom: 12,
    borderBottomWidth: 1,
    borderBottomColor: '#F3F4F6',
  },
  detailRowLast: {
    paddingBottom: 0,
    borderBottomWidth: 0,
  },
  detailRowPlain: {
    paddingBottom: 0,
    borderBottomWidth: 0,
  },
  detailLabel: {
    fontSize: 12,
    fontWeight: '700',
    color: '#6B7280',
    textAlign: 'right',
  },
  detailValue: {
    flex: 1,
    fontSize: 14,
    fontWeight: '700',
    color: '#111827',
    textAlign: 'left',
  },

  phoneRowWrap: {
    paddingBottom: 12,
    borderBottomWidth: 1,
    borderBottomColor: '#F3F4F6',
    gap: 10,
  },
  phoneValueWrap: {
    flex: 1,
    justifyContent: 'center',
  },
  phoneDisplayRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  phoneValueBadge: {
    flex: 1,
    minHeight: 44,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: '#E5E7EB',
    backgroundColor: '#F8FAFC',
    paddingHorizontal: 14,
    alignItems: 'flex-start',
    justifyContent: 'center',
  },
  phoneValueBadgeEmpty: {
    borderStyle: 'dashed',
    borderColor: '#D1D5DB',
    backgroundColor: '#F9FAFB',
  },
  phoneValueBadgeText: {
    fontSize: 14,
    fontWeight: '700',
    color: '#111827',
    textAlign: 'left',
  },
  phoneValueBadgeTextEmpty: {
    color: '#9CA3AF',
  },
  phoneInput: {
    flex: 1,
    minHeight: 42,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#D1D5DB',
    backgroundColor: '#F9FAFB',
    paddingHorizontal: 12,
    fontSize: 14,
    fontWeight: '600',
    color: '#111827',
  },
  inlineActionButton: {
    minHeight: 44,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: '#BFDBFE',
    backgroundColor: '#EFF6FF',
    paddingHorizontal: 14,
    flexDirection: 'row-reverse',
    gap: 6,
    alignItems: 'center',
    justifyContent: 'center',
  },
  inlineActionButtonText: {
    fontSize: 12,
    fontWeight: '800',
    color: '#2F6BFF',
    textAlign: 'center',
  },
  phoneActionsRow: {
    flexDirection: 'row-reverse',
    gap: 10,
  },
  secondaryActionButton: {
    flex: 1,
    minHeight: 42,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#D1D5DB',
    backgroundColor: '#FFFFFF',
    alignItems: 'center',
    justifyContent: 'center',
  },
  secondaryActionButtonText: {
    fontSize: 13,
    fontWeight: '700',
    color: '#4B5563',
    textAlign: 'center',
  },
  primaryActionButton: {
    flex: 1,
    minHeight: 42,
    borderRadius: 12,
    backgroundColor: '#2F6BFF',
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 12,
  },
  primaryActionButtonDisabled: {
    backgroundColor: '#AFC6FF',
  },
  primaryActionButtonText: {
    fontSize: 13,
    fontWeight: '800',
    color: '#FFFFFF',
    textAlign: 'center',
  },
});
