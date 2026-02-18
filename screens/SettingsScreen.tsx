import { useAuthActions } from '@convex-dev/auth/react';
import { Ionicons } from '@expo/vector-icons';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useMutation } from 'convex/react';
import { router } from 'expo-router';
import { useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Modal,
  Pressable,
  ScrollView,
  Text,
  TextInput,
  View,
} from 'react-native';
import {
  SafeAreaView,
  useSafeAreaInsets,
} from 'react-native-safe-area-context';

import { useAppMode } from '@/contexts/AppModeContext';
import { api } from '@/convex/_generated/api';
import { clearPendingJoin } from '@/lib/deeplink/pendingJoin';
import { clearOnboardingSessionId } from '@/lib/onboarding/session';

const TEXT = {
  roleBusiness: 'בעל עסק',
  roleCustomer: 'לקוח',
  roleHint: 'מצב זה משנה את תפריט ההטבות',
  title: 'פרופיל והגדרות',
  subtitle: 'ניהול חשבון, תמיכה ומסמכים',
  dev: 'DEV',
  devBusinessTitle: 'מצב עסק',
  devBusinessSubtitle: 'מעבר למסך סורק עסק',
  devCustomerTitle: 'מצב לקוח',
  devCustomerSubtitle: 'חזרה לפרופיל לקוח',
  sectionGeneral: 'כללי',
  notificationsTitle: 'התראות',
  notificationsSubtitle: 'ניהול הרשאות והתראות מהעסקים',
  languageTitle: 'שפה ותצוגה',
  languageSubtitle: 'עברית, RTL ותצוגה כללית',
  sectionSupport: 'תמיכה ומסמכים',
  supportTitle: 'תמיכה',
  supportSubtitle: 'צרו קשר או דווחו על בעיה',
  termsTitle: 'תנאי שימוש',
  termsSubtitle: 'מסמך חובה לחנויות',
  privacyTitle: 'מדיניות פרטיות',
  privacySubtitle: 'מסמך חובה לחנויות',
  sectionAccount: 'חשבון',
  deleteTitle: 'מחיקת חשבון',
  deleteSubtitle: 'חובה ל-App Store: דרך ברורה למחיקה',
  logoutTitle: 'יציאה מהחשבון',
  logoutSubtitle: 'נתק את המשתמש במכשיר',
  demoNote:
    'דמו זמני: בשלב הבא נחבר פעולות אמיתיות (פתיחת מסמכים, תמיכה, יציאה ומחיקה) ל-Convex.',
  deleteModalTitle: 'מחיקת חשבון',
  deleteModalWarning: 'המחיקה היא לצמיתות. פעולה זו אינה הפיכה.',
  deleteModalConfirmHint: 'כדי לאשר מחיקה לצמיתות, הקלידו DELETE.',
  deleteModalBusy: 'מוחקים חשבון...',
  cancel: 'ביטול',
  confirmDelete: 'אישור מחיקה',
  deletePermanent: 'מחיקה לצמיתות',
  deleteAlertTitle: 'אישור מחיקה',
  deleteAlertMessage: 'יש להקליד DELETE כדי לאשר מחיקה.',
  deleteFailedTitle: 'מחיקת חשבון',
  deleteUnknownError: 'מחיקת החשבון נכשלה. נסו שוב.',
  errorTitle: 'שגיאה',
};

function Row({
  title,
  subtitle,
  icon,
  danger,
  disabled,
  onPress,
}: {
  title: string;
  subtitle?: string;
  icon: keyof typeof Ionicons.glyphMap;
  danger?: boolean;
  disabled?: boolean;
  onPress?: () => void;
}) {
  return (
    <Pressable
      onPress={onPress}
      disabled={disabled}
      style={({ pressed }) => ({
        backgroundColor: '#FFFFFF',
        borderRadius: 18,
        paddingVertical: 14,
        paddingHorizontal: 14,
        borderWidth: 1,
        borderColor: '#E3E9FF',
        opacity: disabled ? 0.55 : pressed ? 0.92 : 1,
      })}
    >
      <View
        style={{ flexDirection: 'row-reverse', alignItems: 'center', gap: 12 }}
      >
        <View
          style={{
            width: 40,
            height: 40,
            borderRadius: 14,
            alignItems: 'center',
            justifyContent: 'center',
            backgroundColor: danger ? '#FFE9E9' : '#F3F6FF',
            borderWidth: 1,
            borderColor: danger ? '#FFD0D0' : '#E3E9FF',
          }}
        >
          <Ionicons
            name={icon}
            size={20}
            color={danger ? '#D92D20' : '#2F6BFF'}
          />
        </View>

        <View style={{ flex: 1 }}>
          <Text
            style={{
              fontSize: 14,
              fontWeight: '800',
              textAlign: 'right',
              color: danger ? '#D92D20' : '#0B1220',
            }}
          >
            {title}
          </Text>
          {subtitle ? (
            <Text
              style={{
                marginTop: 4,
                fontSize: 12,
                textAlign: 'right',
                color: '#5B6475',
              }}
            >
              {subtitle}
            </Text>
          ) : null}
        </View>

        <Ionicons name="chevron-back" size={18} color="#9AA4B8" />
      </View>
    </Pressable>
  );
}

export default function SettingsScreen() {
  const insets = useSafeAreaInsets();
  const setMyRole = useMutation(api.users.setMyRole);
  const deleteMyAccountHard = useMutation(api.users.deleteMyAccountHard);
  const [roleBusy, setRoleBusy] = useState(false);
  const { appMode, setAppMode, isLoading: isAppModeLoading } = useAppMode();
  const [appModeBusy, setAppModeBusy] = useState(false);
  const [deleteModalVisible, setDeleteModalVisible] = useState(false);
  const [deleteStep, setDeleteStep] = useState<1 | 2>(1);
  const [deleteConfirmationText, setDeleteConfirmationText] = useState('');
  const [deleteBusy, setDeleteBusy] = useState(false);
  const { signOut } = useAuthActions();
  const isActionBusy = roleBusy || deleteBusy;
  const isDeleteConfirmationValid =
    deleteConfirmationText.trim().toUpperCase() === 'DELETE';
  const isDeleteFinalDisabled = deleteBusy || !isDeleteConfirmationValid;
  const isDevBuild = process.env.NODE_ENV !== 'production';

  const handleAppModeChange = async (nextMode: 'customer' | 'business') => {
    if (isAppModeLoading || appModeBusy || isActionBusy) {
      return;
    }
    if (nextMode === appMode) {
      return;
    }
    try {
      setAppModeBusy(true);
      await setAppMode(nextMode);
    } finally {
      setAppModeBusy(false);
    }
  };

  const handleSwitchToBusiness = async () => {
    if (isActionBusy) {
      return;
    }
    try {
      setRoleBusy(true);
      await setMyRole({ role: 'merchant' });
      router.push('/(authenticated)/(business)/dashboard');
    } finally {
      setRoleBusy(false);
    }
  };

  const handleSwitchToCustomer = async () => {
    if (isActionBusy) {
      return;
    }
    try {
      setRoleBusy(true);
      await setMyRole({ role: 'customer' });
    } finally {
      setRoleBusy(false);
    }
  };

  const handleLogout = async () => {
    if (isActionBusy) {
      return;
    }
    try {
      setRoleBusy(true);
      await signOut();
      router.replace('/(auth)/sign-in');
    } finally {
      setRoleBusy(false);
    }
  };

  const closeDeleteModal = () => {
    if (deleteBusy) {
      return;
    }
    setDeleteModalVisible(false);
    setDeleteStep(1);
    setDeleteConfirmationText('');
  };

  const openDeleteModal = () => {
    if (isActionBusy) {
      return;
    }
    setDeleteStep(1);
    setDeleteConfirmationText('');
    setDeleteModalVisible(true);
  };

  const clearLocalStateAfterDelete = async () => {
    await Promise.allSettled([
      clearPendingJoin(),
      clearOnboardingSessionId(),
      AsyncStorage.removeItem('remembered_email'),
    ]);

    await setAppMode('customer');
  };

  const handleDeleteAccount = async () => {
    if (deleteBusy) {
      return;
    }
    if (!isDeleteConfirmationValid) {
      Alert.alert(TEXT.deleteAlertTitle, TEXT.deleteAlertMessage);
      return;
    }

    try {
      setDeleteBusy(true);
      const result = await deleteMyAccountHard({});

      if (!result.success) {
        Alert.alert(TEXT.deleteFailedTitle, result.message);
        return;
      }

      await signOut();
      await clearLocalStateAfterDelete();

      setDeleteModalVisible(false);
      setDeleteStep(1);
      setDeleteConfirmationText('');
      router.replace('/(auth)/welcome');
    } catch {
      Alert.alert(TEXT.errorTitle, TEXT.deleteUnknownError);
    } finally {
      setDeleteBusy(false);
    }
  };

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: '#E9F0FF' }} edges={[]}>
      <ScrollView
        contentContainerStyle={{
          paddingHorizontal: 20,
          paddingTop: (insets.top || 0) + 16,
          paddingBottom: 120,
          gap: 12,
        }}
      >
        <View
          style={{
            backgroundColor: '#FFFFFF',
            borderRadius: 20,
            borderWidth: 1,
            borderColor: '#E3E9FF',
            padding: 12,
          }}
        >
          <View
            style={{
              flexDirection: 'row-reverse',
              alignItems: 'center',
              justifyContent: 'space-between',
            }}
          >
            <Pressable
              onPress={() => handleAppModeChange('business')}
              style={({ pressed }) => ({
                paddingHorizontal: 8,
                opacity: pressed || isAppModeLoading || appModeBusy ? 0.7 : 1,
              })}
            >
              <Text style={{ fontWeight: '800', color: '#1A2B4A' }}>
                {TEXT.roleBusiness}
              </Text>
            </Pressable>

            <Pressable
              onPress={() =>
                handleAppModeChange(
                  appMode === 'customer' ? 'business' : 'customer'
                )
              }
              style={({ pressed }) => ({
                width: 56,
                height: 30,
                borderRadius: 999,
                backgroundColor: '#D9DEE7',
                padding: 3,
                justifyContent: 'center',
                opacity: pressed || isAppModeLoading || appModeBusy ? 0.8 : 1,
              })}
            >
              <View
                style={{
                  width: 24,
                  height: 24,
                  borderRadius: 12,
                  backgroundColor: '#FFFFFF',
                  alignSelf: appMode === 'customer' ? 'flex-end' : 'flex-start',
                  shadowColor: '#000',
                  shadowOpacity: 0.08,
                  shadowRadius: 4,
                  elevation: 2,
                }}
              />
            </Pressable>

            <Pressable
              onPress={() => handleAppModeChange('customer')}
              style={({ pressed }) => ({
                paddingHorizontal: 8,
                opacity: pressed || isAppModeLoading || appModeBusy ? 0.7 : 1,
              })}
            >
              <Text style={{ fontWeight: '800', color: '#1A2B4A' }}>
                {TEXT.roleCustomer}
              </Text>
            </Pressable>
          </View>
          <Text
            style={{
              marginTop: 8,
              fontSize: 11,
              color: '#5B6475',
              textAlign: 'right',
            }}
          >
            {TEXT.roleHint}
          </Text>
        </View>

        <View>
          <Text
            style={{
              fontSize: 24,
              fontWeight: '800',
              color: '#1A2B4A',
              textAlign: 'right',
            }}
          >
            {TEXT.title}
          </Text>
          <Text
            style={{
              marginTop: 6,
              fontSize: 13,
              color: '#2F6BFF',
              textAlign: 'right',
              fontWeight: '600',
            }}
          >
            {TEXT.subtitle}
          </Text>
        </View>

        {isDevBuild ? (
          <View style={{ gap: 10 }}>
            <Text
              style={{
                fontSize: 12,
                fontWeight: '800',
                color: '#5B6475',
                textAlign: 'right',
              }}
            >
              {TEXT.dev}
            </Text>
            <Row
              title={TEXT.devBusinessTitle}
              subtitle={TEXT.devBusinessSubtitle}
              icon="briefcase-outline"
              disabled={isActionBusy}
              onPress={handleSwitchToBusiness}
            />
            <Row
              title={TEXT.devCustomerTitle}
              subtitle={TEXT.devCustomerSubtitle}
              icon="person-outline"
              disabled={isActionBusy}
              onPress={handleSwitchToCustomer}
            />
          </View>
        ) : null}

        <View style={{ gap: 10 }}>
          <Text
            style={{
              fontSize: 12,
              fontWeight: '800',
              color: '#5B6475',
              textAlign: 'right',
            }}
          >
            {TEXT.sectionGeneral}
          </Text>
          <Row
            title={TEXT.notificationsTitle}
            subtitle={TEXT.notificationsSubtitle}
            icon="notifications-outline"
            onPress={() => {}}
          />
          <Row
            title={TEXT.languageTitle}
            subtitle={TEXT.languageSubtitle}
            icon="language-outline"
            onPress={() => {}}
          />
        </View>

        <View style={{ gap: 10 }}>
          <Text
            style={{
              fontSize: 12,
              fontWeight: '800',
              color: '#5B6475',
              textAlign: 'right',
            }}
          >
            {TEXT.sectionSupport}
          </Text>
          <Row
            title={TEXT.supportTitle}
            subtitle={TEXT.supportSubtitle}
            icon="help-circle-outline"
            onPress={() => {}}
          />
          <Row
            title={TEXT.termsTitle}
            subtitle={TEXT.termsSubtitle}
            icon="document-text-outline"
            onPress={() => {}}
          />
          <Row
            title={TEXT.privacyTitle}
            subtitle={TEXT.privacySubtitle}
            icon="shield-checkmark-outline"
            onPress={() => {}}
          />
        </View>

        <View style={{ gap: 10 }}>
          <Text
            style={{
              fontSize: 12,
              fontWeight: '800',
              color: '#5B6475',
              textAlign: 'right',
            }}
          >
            {TEXT.sectionAccount}
          </Text>
          <Row
            title={TEXT.deleteTitle}
            subtitle={TEXT.deleteSubtitle}
            icon="trash-outline"
            danger={true}
            disabled={isActionBusy}
            onPress={openDeleteModal}
          />
          <Row
            title={TEXT.logoutTitle}
            subtitle={TEXT.logoutSubtitle}
            icon="log-out-outline"
            danger={true}
            disabled={isActionBusy}
            onPress={handleLogout}
          />
        </View>

        <Text
          style={{
            marginTop: 6,
            textAlign: 'right',
            color: '#8A94A6',
            fontSize: 11,
          }}
        >
          {TEXT.demoNote}
        </Text>
      </ScrollView>

      <Modal
        transparent={true}
        visible={deleteModalVisible}
        animationType="fade"
        onRequestClose={closeDeleteModal}
      >
        <View
          style={{
            flex: 1,
            backgroundColor: 'rgba(11, 18, 32, 0.45)',
            alignItems: 'center',
            justifyContent: 'center',
            padding: 20,
          }}
        >
          <View
            style={{
              width: '100%',
              maxWidth: 420,
              backgroundColor: '#FFFFFF',
              borderRadius: 22,
              borderWidth: 1,
              borderColor: '#E3E9FF',
              padding: 18,
              gap: 12,
            }}
          >
            <Text
              style={{
                textAlign: 'right',
                fontSize: 18,
                fontWeight: '900',
                color: '#D92D20',
              }}
            >
              {TEXT.deleteModalTitle}
            </Text>

            {deleteStep === 1 ? (
              <Text
                style={{
                  textAlign: 'right',
                  color: '#3A4252',
                  lineHeight: 20,
                }}
              >
                {TEXT.deleteModalWarning}
              </Text>
            ) : (
              <View style={{ gap: 10 }}>
                <Text
                  style={{
                    textAlign: 'right',
                    color: '#3A4252',
                    lineHeight: 20,
                  }}
                >
                  {TEXT.deleteModalConfirmHint}
                </Text>
                <TextInput
                  value={deleteConfirmationText}
                  onChangeText={setDeleteConfirmationText}
                  editable={!deleteBusy}
                  autoCapitalize="characters"
                  autoCorrect={false}
                  placeholder="DELETE"
                  placeholderTextColor="#9AA4B8"
                  style={{
                    borderWidth: 1,
                    borderColor: '#E3E9FF',
                    borderRadius: 14,
                    paddingHorizontal: 12,
                    paddingVertical: 10,
                    textAlign: 'left',
                    color: '#0B1220',
                    fontWeight: '700',
                  }}
                />
              </View>
            )}

            {deleteBusy ? (
              <View
                style={{
                  flexDirection: 'row',
                  alignItems: 'center',
                  justifyContent: 'flex-end',
                  gap: 8,
                }}
              >
                <Text style={{ color: '#5B6475', fontWeight: '600' }}>
                  {TEXT.deleteModalBusy}
                </Text>
                <ActivityIndicator color="#D92D20" />
              </View>
            ) : null}

            <View
              style={{
                flexDirection: 'row-reverse',
                alignItems: 'center',
                gap: 10,
              }}
            >
              <Pressable
                disabled={deleteBusy}
                onPress={closeDeleteModal}
                style={({ pressed }) => ({
                  flex: 1,
                  borderRadius: 14,
                  borderWidth: 1,
                  borderColor: '#D0D7E6',
                  paddingVertical: 12,
                  alignItems: 'center',
                  opacity: deleteBusy ? 0.5 : pressed ? 0.85 : 1,
                })}
              >
                <Text style={{ fontWeight: '800', color: '#3A4252' }}>
                  {TEXT.cancel}
                </Text>
              </Pressable>

              {deleteStep === 1 ? (
                <Pressable
                  disabled={deleteBusy}
                  onPress={() => setDeleteStep(2)}
                  style={({ pressed }) => ({
                    flex: 1,
                    borderRadius: 14,
                    minHeight: 48,
                    borderWidth: 1,
                    borderColor: '#B42318',
                    backgroundColor: '#FEE4E2',
                    paddingVertical: 12,
                    paddingHorizontal: 10,
                    alignItems: 'center',
                    justifyContent: 'center',
                    opacity: deleteBusy ? 0.7 : pressed ? 0.9 : 1,
                  })}
                >
                  <Text
                    style={{
                      fontWeight: '900',
                      color: '#B42318',
                    }}
                    numberOfLines={1}
                  >
                    {TEXT.confirmDelete}
                  </Text>
                </Pressable>
              ) : (
                <Pressable
                  disabled={isDeleteFinalDisabled}
                  onPress={handleDeleteAccount}
                  style={({ pressed }) => ({
                    flex: 1,
                    borderRadius: 14,
                    minHeight: 48,
                    borderWidth: 1,
                    borderColor: '#B42318',
                    backgroundColor: isDeleteFinalDisabled
                      ? '#FEE4E2'
                      : '#D92D20',
                    paddingVertical: 12,
                    paddingHorizontal: 10,
                    alignItems: 'center',
                    justifyContent: 'center',
                    opacity: pressed ? 0.92 : 1,
                  })}
                >
                  <Text
                    style={{
                      fontWeight: '900',
                      color: isDeleteFinalDisabled ? '#B42318' : '#FFFFFF',
                    }}
                    numberOfLines={1}
                  >
                    {TEXT.deletePermanent}
                  </Text>
                </Pressable>
              )}
            </View>
          </View>
        </View>
      </Modal>
    </SafeAreaView>
  );
}
