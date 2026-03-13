import { useAuthActions } from '@convex-dev/auth/react';
import { Ionicons } from '@expo/vector-icons';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useBottomTabBarHeight } from '@react-navigation/bottom-tabs';
import { useMutation } from 'convex/react';
import { router, useSegments } from 'expo-router';
import * as SecureStore from 'expo-secure-store';
import { useEffect, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Modal,
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

import BusinessScreenHeader from '@/components/BusinessScreenHeader';
import BusinessModeCtaCard from '@/components/customer/BusinessModeCtaCard';
import { useAppMode } from '@/contexts/AppModeContext';
import { api } from '@/convex/_generated/api';
import { getConvexAuthSecureStoreKeysForCleanup } from '@/lib/auth/storageKeys';
import { clearPendingJoin } from '@/lib/deeplink/pendingJoin';

const APP_MODE_STORAGE_KEY = 'stampaix.appMode';
// Legacy typo key kept for migration only.
const LEGACY_APP_MODE_STORAGE_KEY = 'stamprix.appMode';
const REMEMBERED_EMAIL_STORAGE_KEY = 'remembered_email';
const NOTIFICATIONS_ENABLED_STORAGE_KEY =
  'stampaix.customerNotificationsEnabled';
// Legacy typo key kept for migration only.
const LEGACY_NOTIFICATIONS_ENABLED_STORAGE_KEY =
  'stamprix.customerNotificationsEnabled';

type IconName = keyof typeof Ionicons.glyphMap;

const TEXT = {
  quickWalletTitle: '\u05d4\u05d0\u05e8\u05e0\u05e7',
  quickWalletSubtitle:
    '\u05db\u05e8\u05d8\u05d9\u05e1\u05d9\u05d5\u05ea \u05d5\u05e0\u05e7\u05d5\u05d3\u05d5\u05ea',
  quickRewardsTitle: '\u05d4\u05d8\u05d1\u05d5\u05ea',
  quickRewardsSubtitle:
    '\u05e7\u05d5\u05e4\u05d5\u05e0\u05d9\u05dd \u05d5\u05de\u05d9\u05de\u05d5\u05e9\u05d9\u05dd',
  quickNew: '\u05d7\u05d3\u05e9',
  sectionPreferences: '\u05d4\u05e2\u05d3\u05e4\u05d5\u05ea',
  accountSettingsTitle:
    '\u05e4\u05e8\u05d8\u05d9 \u05d7\u05e9\u05d1\u05d5\u05df',
  accountSettingsSubtitle:
    '\u05e9\u05dd, \u05d0\u05d9\u05de\u05d9\u05d9\u05dc \u05d5\u05d0\u05d1\u05d8\u05d7\u05d4',
  notificationsToggleTitle: '\u05d4\u05ea\u05e8\u05d0\u05d5\u05ea',
  notificationsToggleSubtitle:
    '\u05e7\u05d1\u05dc\u05ea \u05e2\u05d3\u05db\u05d5\u05e0\u05d9\u05dd \u05d5\u05d4\u05d8\u05d1\u05d5\u05ea',
  sectionSupport:
    '\u05ea\u05de\u05d9\u05db\u05d4 \u05d5\u05de\u05e1\u05de\u05db\u05d9\u05dd',
  helpTitle: '\u05e2\u05d6\u05e8\u05d4 \u05d5\u05ea\u05de\u05d9\u05db\u05d4',
  helpSubtitle:
    '\u05e9\u05d0\u05dc\u05d5\u05ea \u05e0\u05e4\u05d5\u05e6\u05d5\u05ea \u05d5\u05d9\u05e6\u05d9\u05e8\u05ea \u05e7\u05e9\u05e8',
  termsTitle: '\u05ea\u05e0\u05d0\u05d9 \u05e9\u05d9\u05de\u05d5\u05e9',
  termsSubtitle:
    '\u05d4\u05de\u05e1\u05de\u05da \u05d4\u05de\u05e9\u05e4\u05d8\u05d9 \u05e9\u05dc STAMPAIX',
  privacyTitle:
    '\u05de\u05d3\u05d9\u05e0\u05d9\u05d5\u05ea \u05e4\u05e8\u05d8\u05d9\u05d5\u05ea',
  privacySubtitle:
    '\u05d0\u05d9\u05da \u05d0\u05e0\u05d7\u05e0\u05d5 \u05e9\u05d5\u05de\u05e8\u05d9\u05dd \u05e2\u05dc \u05d4\u05de\u05d9\u05d3\u05e2 \u05e9\u05dc\u05db\u05dd',
  sectionAccount:
    '\u05e0\u05d9\u05d4\u05d5\u05dc \u05d7\u05e9\u05d1\u05d5\u05df',
  logoutTitle:
    '\u05d9\u05e6\u05d9\u05d0\u05d4 \u05de\u05d4\u05d7\u05e9\u05d1\u05d5\u05df',
  logoutSubtitle:
    '\u05d4\u05ea\u05e0\u05ea\u05e7\u05d5\u05ea \u05de\u05d4\u05de\u05db\u05e9\u05d9\u05e8 \u05d4\u05e0\u05d5\u05db\u05d7\u05d9',
  logoutConfirmTitle:
    '\u05d0\u05d9\u05e9\u05d5\u05e8 \u05d9\u05e6\u05d9\u05d0\u05d4',
  logoutConfirmMessage:
    '\u05d4\u05d0\u05dd \u05d0\u05ea\u05dd \u05d1\u05d8\u05d5\u05d7\u05d9\u05dd \u05e9\u05d1\u05e8\u05e6\u05d5\u05e0\u05db\u05dd \u05dc\u05d4\u05ea\u05e0\u05ea\u05e7 \u05de\u05d4\u05d7\u05e9\u05d1\u05d5\u05df?',
  logoutConfirmAction:
    '\u05d9\u05e6\u05d9\u05d0\u05d4 \u05de\u05d4\u05d7\u05e9\u05d1\u05d5\u05df',
  deleteTitle: '\u05de\u05d7\u05d9\u05e7\u05ea \u05d7\u05e9\u05d1\u05d5\u05df',
  deleteSubtitle:
    '\u05de\u05d7\u05d9\u05e7\u05d4 \u05de\u05dc\u05d0\u05d4 \u05e9\u05dc \u05d4\u05d7\u05e9\u05d1\u05d5\u05df \u05d5\u05d4\u05e0\u05ea\u05d5\u05e0\u05d9\u05dd',
  footerNote:
    'STAMPAIX - \u05e0\u05d0\u05de\u05e0\u05d5\u05ea \u05d3\u05d9\u05d2\u05d9\u05d8\u05dc\u05d9\u05ea \u05e4\u05e9\u05d5\u05d8\u05d4 \u05dc\u05e2\u05e1\u05e7\u05d9\u05dd \u05d5\u05dc\u05dc\u05e7\u05d5\u05d7\u05d5\u05ea',
  helpCenterText:
    '\u05e6\u05e8\u05d9\u05db\u05d9\u05dd \u05e2\u05d6\u05e8\u05d4? \u05e4\u05e0\u05d5 \u05d0\u05dc\u05d9\u05e0\u05d5 \u05d3\u05e8\u05da \u05de\u05e8\u05db\u05d6 \u05d4\u05ea\u05de\u05d9\u05db\u05d4 \u05d1\u05d0\u05e4\u05dc\u05d9\u05e7\u05e6\u05d9\u05d4',
  notificationsSaveFailed:
    '\u05dc\u05d0 \u05d4\u05e6\u05dc\u05d7\u05e0\u05d5 \u05dc\u05e9\u05de\u05d5\u05e8 \u05d0\u05ea \u05d4\u05e2\u05d3\u05e4\u05ea \u05d4\u05d4\u05ea\u05e8\u05d0\u05d5\u05ea \u05e0\u05e1\u05d5 \u05e9\u05d5\u05d1',
  switchModeFailed:
    '\u05dc\u05d0 \u05d4\u05e6\u05dc\u05d7\u05e0\u05d5 \u05dc\u05e2\u05d3\u05db\u05df \u05de\u05e6\u05d1 \u05de\u05e9\u05ea\u05de\u05e9 \u05e0\u05e1\u05d5 \u05e9\u05d5\u05d1',
  logoutFailed:
    '\u05dc\u05d0 \u05d4\u05e6\u05dc\u05d7\u05e0\u05d5 \u05dc\u05d1\u05e6\u05e2 \u05d9\u05e6\u05d9\u05d0\u05d4 \u05e0\u05e1\u05d5 \u05e9\u05d5\u05d1',
  deleteModalTitle:
    '\u05de\u05d7\u05d9\u05e7\u05ea \u05d7\u05e9\u05d1\u05d5\u05df',
  deleteModalWarning:
    '\u05d4\u05e4\u05e2\u05d5\u05dc\u05d4 \u05ea\u05de\u05d7\u05e7 \u05dc\u05e6\u05de\u05d9\u05ea\u05d5\u05ea \u05d0\u05ea \u05d4\u05d7\u05e9\u05d1\u05d5\u05df \u05d5\u05d0\u05ea \u05db\u05dc \u05d4\u05e0\u05ea\u05d5\u05e0\u05d9\u05dd',
  deleteModalConfirmHint:
    '\u05dc\u05d4\u05de\u05e9\u05da, \u05d4\u05e7\u05dc\u05d9\u05d3\u05d5 DELETE',
  deleteModalBusy:
    '\u05de\u05d5\u05d7\u05e7\u05d9\u05dd \u05e0\u05ea\u05d5\u05e0\u05d9\u05dd',
  cancel: '\u05d1\u05d9\u05d8\u05d5\u05dc',
  confirmDelete: '\u05dc\u05d4\u05de\u05e9\u05da',
  deletePermanent:
    '\u05de\u05d7\u05d9\u05e7\u05d4 \u05dc\u05e6\u05de\u05d9\u05ea\u05d5\u05ea',
  deleteAlertTitle:
    '\u05d0\u05d9\u05e9\u05d5\u05e8 \u05de\u05d7\u05d9\u05e7\u05d4',
  deleteAlertMessage:
    '\u05d9\u05e9 \u05dc\u05d4\u05e7\u05dc\u05d9\u05d3 DELETE \u05db\u05d3\u05d9 \u05dc\u05d0\u05e9\u05e8 \u05de\u05d7\u05d9\u05e7\u05d4',
  deleteFailedTitle:
    '\u05de\u05d7\u05d9\u05e7\u05ea \u05d7\u05e9\u05d1\u05d5\u05df',
  deleteUnknownError:
    '\u05de\u05d7\u05d9\u05e7\u05ea \u05d4\u05d7\u05e9\u05d1\u05d5\u05df \u05e0\u05db\u05e9\u05dc\u05d4 \u05e0\u05e1\u05d5 \u05e9\u05d5\u05d1',
  deleteSuccessTitle:
    '\u05d4\u05de\u05d7\u05d9\u05e7\u05d4 \u05d4\u05d5\u05e9\u05dc\u05de\u05d4',
  deleteSuccessPrefix:
    '\u05d4\u05de\u05d7\u05d9\u05e7\u05d4 \u05d4\u05e1\u05ea\u05d9\u05d9\u05de\u05d4 \u05e1\u05d9\u05db\u05d5\u05dd \u05d8\u05d1\u05dc\u05d0\u05d5\u05ea:',
  ok: '\u05d0\u05d9\u05e9\u05d5\u05e8',
  errorTitle: '\u05e9\u05d2\u05d9\u05d0\u05d4',
};

function toErrorMessage(error: unknown, fallback: string) {
  if (error instanceof Error && error.message.trim().length > 0) {
    return error.message;
  }
  if (typeof error === 'string' && error.trim().length > 0) {
    return error;
  }
  return fallback;
}

function formatWipeSummary(counts: Record<string, number>) {
  return Object.entries(counts)
    .map(([tableName, count]) => `${tableName}: ${count}`)
    .join('\n');
}

function MenuRow({
  title,
  subtitle,
  icon,
  onPress,
  danger,
  disabled,
  showDot,
}: {
  title: string;
  subtitle?: string;
  icon: IconName;
  onPress?: () => void;
  danger?: boolean;
  disabled?: boolean;
  showDot?: boolean;
}) {
  return (
    <Pressable
      onPress={onPress}
      disabled={disabled}
      style={({ pressed }) => [
        styles.menuRow,
        danger ? styles.menuRowDanger : null,
        pressed ? styles.pressed : null,
        disabled ? styles.disabled : null,
      ]}
    >
      <View style={styles.menuRowInner}>
        <View style={styles.menuIconShell}>
          <Ionicons
            name={icon}
            size={20}
            color={danger ? '#B42318' : '#111827'}
          />
          {showDot ? <View style={styles.menuDot} /> : null}
        </View>

        <View style={styles.menuTextWrap}>
          <Text
            style={[styles.menuTitle, danger ? styles.menuTitleDanger : null]}
          >
            {title}
          </Text>
          {subtitle ? (
            <Text style={styles.menuSubtitle}>{subtitle}</Text>
          ) : null}
        </View>

        <Ionicons name="chevron-back" size={18} color="#A1A1AA" />
      </View>
    </Pressable>
  );
}

function NotificationToggleRow({
  title,
  subtitle,
  enabled,
  disabled,
  onPress,
}: {
  title: string;
  subtitle: string;
  enabled: boolean;
  disabled?: boolean;
  onPress: () => void;
}) {
  return (
    <Pressable
      onPress={onPress}
      disabled={disabled}
      style={({ pressed }) => [
        styles.notificationToggleRow,
        pressed ? styles.pressed : null,
        disabled ? styles.disabled : null,
      ]}
    >
      <View style={styles.notificationToggleInner}>
        <View style={styles.notificationToggleIconShell}>
          <Ionicons name="notifications-outline" size={20} color="#111827" />
        </View>

        <View style={styles.notificationToggleTextWrap}>
          <Text style={styles.notificationToggleTitle}>{title}</Text>
          <Text style={styles.notificationToggleSubtitle}>{subtitle}</Text>
        </View>

        <View
          style={[
            styles.notificationSwitchTrack,
            enabled
              ? styles.notificationSwitchTrackEnabled
              : styles.notificationSwitchTrackDisabled,
          ]}
        >
          <View
            style={[
              styles.notificationSwitchThumb,
              enabled
                ? styles.notificationSwitchThumbEnabled
                : styles.notificationSwitchThumbDisabled,
              enabled
                ? styles.notificationSwitchThumbRight
                : styles.notificationSwitchThumbLeft,
            ]}
          />
        </View>
      </View>
    </Pressable>
  );
}

export default function SettingsScreen() {
  const insets = useSafeAreaInsets();
  const segments = useSegments();
  const tabBarHeight = useBottomTabBarHeight();
  const wipeAllDataHard = useMutation(api.users.wipeAllDataHard);
  const { setAppMode } = useAppMode();
  const { signOut } = useAuthActions();

  const [deleteModalVisible, setDeleteModalVisible] = useState(false);
  const [deleteStep, setDeleteStep] = useState<1 | 2>(1);
  const [deleteConfirmationText, setDeleteConfirmationText] = useState('');
  const [deleteBusy, setDeleteBusy] = useState(false);
  const [notificationsEnabled, setNotificationsEnabled] = useState(true);
  const [notificationBusy, setNotificationBusy] = useState(false);

  const isActionBusy = deleteBusy;
  const isDeleteConfirmationValid =
    deleteConfirmationText.trim().toUpperCase() === 'DELETE';
  const isDeleteFinalDisabled = deleteBusy || !isDeleteConfirmationValid;

  const isBusinessSettingsScreen = (
    Array.isArray(segments) ? (segments as string[]) : []
  ).includes('(business)');

  const openHelpCenter = () => {
    router.push('/(authenticated)/(customer)/help-support');
  };

  const openAccountDetails = () => {
    router.push('/(authenticated)/(customer)/account-details');
  };

  const openLegalScreen = () => {
    router.push('/(auth)/legal');
  };

  const handleLogout = async () => {
    if (isActionBusy) {
      return;
    }

    try {
      await signOut();
      router.replace('/(auth)/sign-in');
    } catch (error) {
      Alert.alert(TEXT.errorTitle, toErrorMessage(error, TEXT.logoutFailed));
    }
  };

  const confirmLogout = () => {
    if (isActionBusy) {
      return;
    }

    Alert.alert(TEXT.logoutConfirmTitle, TEXT.logoutConfirmMessage, [
      { text: TEXT.cancel, style: 'cancel' },
      {
        text: TEXT.logoutConfirmAction,
        style: 'destructive',
        onPress: () => {
          void handleLogout();
        },
      },
    ]);
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

  const clearLocalSessionState = async () => {
    const convexAuthKeys = getConvexAuthSecureStoreKeysForCleanup();
    const cleanupResults = await Promise.allSettled([
      clearPendingJoin(),
      AsyncStorage.removeItem(REMEMBERED_EMAIL_STORAGE_KEY),
      AsyncStorage.removeItem(NOTIFICATIONS_ENABLED_STORAGE_KEY),
      AsyncStorage.removeItem(LEGACY_NOTIFICATIONS_ENABLED_STORAGE_KEY),
      ...convexAuthKeys.map((key) => SecureStore.deleteItemAsync(key)),
      SecureStore.deleteItemAsync(APP_MODE_STORAGE_KEY),
      SecureStore.deleteItemAsync(LEGACY_APP_MODE_STORAGE_KEY),
    ]);

    const failed = cleanupResults.filter(
      (result): result is PromiseRejectedResult => result.status === 'rejected'
    );
    if (failed.length > 0) {
      throw new Error(
        toErrorMessage(failed[0].reason, 'LOCAL_SESSION_CLEANUP_FAILED')
      );
    }

    await setAppMode('customer');
    await SecureStore.deleteItemAsync(APP_MODE_STORAGE_KEY);
    await SecureStore.deleteItemAsync(LEGACY_APP_MODE_STORAGE_KEY);
  };

  const cleanupSignedInSession = async () => {
    try {
      await signOut();
    } catch {
      // Continue with local cleanup even when remote sign-out fails.
    }

    await clearLocalSessionState();
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
      const result = await wipeAllDataHard({});
      await cleanupSignedInSession();

      setDeleteModalVisible(false);
      setDeleteStep(1);
      setDeleteConfirmationText('');
      Alert.alert(
        TEXT.deleteSuccessTitle,
        `${TEXT.deleteSuccessPrefix}\n${formatWipeSummary(result.counts)}`,
        [
          {
            text: TEXT.ok,
            onPress: () => router.replace('/(auth)/welcome'),
          },
        ],
        { cancelable: false }
      );
    } catch (error) {
      Alert.alert(
        TEXT.deleteFailedTitle,
        toErrorMessage(error, TEXT.deleteUnknownError)
      );
    } finally {
      setDeleteBusy(false);
    }
  };

  useEffect(() => {
    let isMounted = true;

    void (async () => {
      try {
        const storedPrimary = await AsyncStorage.getItem(
          NOTIFICATIONS_ENABLED_STORAGE_KEY
        );
        const storedLegacy = storedPrimary
          ? null
          : await AsyncStorage.getItem(
              LEGACY_NOTIFICATIONS_ENABLED_STORAGE_KEY
            );
        const storedValue = storedPrimary ?? storedLegacy;

        if (!isMounted || storedValue == null) {
          return;
        }

        setNotificationsEnabled(storedValue === '1');
        if (storedLegacy !== null) {
          await AsyncStorage.setItem(
            NOTIFICATIONS_ENABLED_STORAGE_KEY,
            storedLegacy
          );
          await AsyncStorage.removeItem(
            LEGACY_NOTIFICATIONS_ENABLED_STORAGE_KEY
          );
        }
      } catch {
        if (isMounted) {
          setNotificationsEnabled(true);
        }
      }
    })();

    return () => {
      isMounted = false;
    };
  }, []);

  const toggleNotifications = async () => {
    if (notificationBusy) {
      return;
    }

    const nextValue = !notificationsEnabled;
    setNotificationsEnabled(nextValue);
    setNotificationBusy(true);

    try {
      await AsyncStorage.setItem(
        NOTIFICATIONS_ENABLED_STORAGE_KEY,
        nextValue ? '1' : '0'
      );
      await AsyncStorage.removeItem(LEGACY_NOTIFICATIONS_ENABLED_STORAGE_KEY);
    } catch (error) {
      setNotificationsEnabled(!nextValue);
      Alert.alert(
        TEXT.errorTitle,
        toErrorMessage(error, TEXT.notificationsSaveFailed)
      );
    } finally {
      setNotificationBusy(false);
    }
  };

  return (
    <SafeAreaView style={styles.safeArea} edges={[]}>
      <View
        style={[
          styles.fixedTopSection,
          {
            paddingTop: (insets.top || 0) + 12,
          },
        ]}
      >
        <View style={styles.headerRow}>
          <BusinessScreenHeader
            title={'\u05d4\u05d2\u05d3\u05e8\u05d5\u05ea'}
            subtitle={
              isBusinessSettingsScreen
                ? '\u05e0\u05d9\u05d4\u05d5\u05dc \u05d4\u05d7\u05e9\u05d1\u05d5\u05df, \u05d4\u05ea\u05de\u05d9\u05db\u05d4 \u05d5\u05d4\u05e2\u05d3\u05e4\u05d5\u05ea \u05d4\u05e2\u05e1\u05e7'
                : '\u05e0\u05d9\u05d4\u05d5\u05dc \u05d4\u05d7\u05e9\u05d1\u05d5\u05df, \u05d4\u05ea\u05de\u05d9\u05db\u05d4 \u05d5\u05d4\u05e2\u05d3\u05e4\u05d5\u05ea \u05d4\u05dc\u05e7\u05d5\u05d7'
            }
          />
        </View>
        <BusinessModeCtaCard disabled={deleteBusy} />
      </View>

      <ScrollView
        style={styles.scrollArea}
        contentContainerStyle={[
          styles.scrollContent,
          {
            paddingBottom: tabBarHeight + 24,
          },
        ]}
      >
        <View style={styles.menuSection}>
          <Text style={styles.sectionTitle}>{TEXT.sectionPreferences}</Text>
          <MenuRow
            title={TEXT.accountSettingsTitle}
            subtitle={TEXT.accountSettingsSubtitle}
            icon="settings-outline"
            showDot={true}
            onPress={openAccountDetails}
          />
          <NotificationToggleRow
            title={TEXT.notificationsToggleTitle}
            subtitle={TEXT.notificationsToggleSubtitle}
            enabled={notificationsEnabled}
            disabled={notificationBusy}
            onPress={toggleNotifications}
          />
        </View>

        <View style={styles.divider} />

        <View style={styles.menuSection}>
          <Text style={styles.sectionTitle}>{TEXT.sectionSupport}</Text>
          <MenuRow
            title={TEXT.helpTitle}
            subtitle={TEXT.helpSubtitle}
            icon="help-circle-outline"
            onPress={openHelpCenter}
          />
          <MenuRow
            title={TEXT.termsTitle}
            subtitle={TEXT.termsSubtitle}
            icon="document-text-outline"
            onPress={openLegalScreen}
          />
          <MenuRow
            title={TEXT.privacyTitle}
            subtitle={TEXT.privacySubtitle}
            icon="shield-checkmark-outline"
            onPress={openLegalScreen}
          />
        </View>

        <View style={styles.divider} />

        <View style={styles.menuSection}>
          <Text style={styles.sectionTitle}>{TEXT.sectionAccount}</Text>
          <MenuRow
            title={TEXT.logoutTitle}
            subtitle={TEXT.logoutSubtitle}
            icon="log-out-outline"
            danger={true}
            disabled={isActionBusy}
            onPress={confirmLogout}
          />
          <MenuRow
            title={TEXT.deleteTitle}
            subtitle={TEXT.deleteSubtitle}
            icon="trash-outline"
            danger={true}
            disabled={isActionBusy}
            onPress={openDeleteModal}
          />
        </View>

        <Text style={styles.footerNote}>{TEXT.footerNote}</Text>
      </ScrollView>

      <Modal
        transparent={true}
        visible={deleteModalVisible}
        animationType="fade"
        onRequestClose={closeDeleteModal}
      >
        <View style={styles.modalBackdrop}>
          <View style={styles.modalCard}>
            <Text style={styles.modalTitle}>{TEXT.deleteModalTitle}</Text>

            {deleteStep === 1 ? (
              <Text style={styles.modalText}>{TEXT.deleteModalWarning}</Text>
            ) : (
              <View style={styles.modalInputBlock}>
                <Text style={styles.modalText}>
                  {TEXT.deleteModalConfirmHint}
                </Text>
                <TextInput
                  value={deleteConfirmationText}
                  onChangeText={setDeleteConfirmationText}
                  editable={!deleteBusy}
                  autoCapitalize="characters"
                  autoCorrect={false}
                  placeholder="DELETE"
                  placeholderTextColor="#9CA3AF"
                  style={styles.modalInput}
                />
              </View>
            )}

            {deleteBusy ? (
              <View style={styles.modalBusyRow}>
                <Text style={styles.modalBusyText}>{TEXT.deleteModalBusy}</Text>
                <ActivityIndicator color="#D92D20" />
              </View>
            ) : null}

            <View style={styles.modalActions}>
              <Pressable
                disabled={deleteBusy}
                onPress={closeDeleteModal}
                style={({ pressed }) => [
                  styles.modalSecondaryButton,
                  pressed ? styles.pressed : null,
                  deleteBusy ? styles.disabled : null,
                ]}
              >
                <Text style={styles.modalSecondaryButtonText}>
                  {TEXT.cancel}
                </Text>
              </Pressable>

              {deleteStep === 1 ? (
                <Pressable
                  disabled={deleteBusy}
                  onPress={() => setDeleteStep(2)}
                  style={({ pressed }) => [
                    styles.modalWarningButton,
                    pressed ? styles.pressed : null,
                    deleteBusy ? styles.disabled : null,
                  ]}
                >
                  <Text style={styles.modalWarningButtonText}>
                    {TEXT.confirmDelete}
                  </Text>
                </Pressable>
              ) : (
                <Pressable
                  disabled={isDeleteFinalDisabled}
                  onPress={handleDeleteAccount}
                  style={({ pressed }) => [
                    styles.modalDangerButton,
                    isDeleteFinalDisabled
                      ? styles.modalDangerButtonDisabled
                      : null,
                    pressed ? styles.pressed : null,
                  ]}
                >
                  <Text
                    style={[
                      styles.modalDangerButtonText,
                      isDeleteFinalDisabled
                        ? styles.modalDangerButtonTextDisabled
                        : null,
                    ]}
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

const styles = StyleSheet.create({
  safeArea: { flex: 1, backgroundColor: '#E9F0FF' },
  fixedTopSection: {
    paddingHorizontal: 20,
    paddingBottom: 10,
    gap: 10,
  },
  scrollArea: { flex: 1 },
  scrollContent: { paddingHorizontal: 20, gap: 10 },
  pressed: { opacity: 0.88 },
  disabled: { opacity: 0.6 },

  headerRow: {
    alignItems: 'stretch',
    marginBottom: 4,
  },
  pageTitle: {
    textAlign: 'right',
    fontSize: 24,
    lineHeight: 29,
    fontWeight: '900',
    color: '#171717',
  },

  menuSection: { gap: 10 },
  sectionTitle: {
    fontSize: 12,
    fontWeight: '700',
    color: '#71717A',
    textAlign: 'right',
  },
  divider: { height: 1, backgroundColor: '#DEDEDE' },
  menuRow: {
    borderRadius: 18,
    borderWidth: 1,
    borderColor: '#E8E8E8',
    backgroundColor: '#FFFFFF',
    paddingVertical: 12,
    paddingHorizontal: 13,
  },
  menuRowDanger: {
    borderColor: '#FECACA',
    backgroundColor: '#FFF7F7',
  },
  menuRowInner: { flexDirection: 'row-reverse', alignItems: 'center', gap: 11 },
  menuIconShell: {
    width: 40,
    height: 40,
    borderRadius: 14,
    backgroundColor: '#F4F4F5',
    alignItems: 'center',
    justifyContent: 'center',
    position: 'relative',
  },
  menuDot: {
    position: 'absolute',
    top: 4,
    left: 4,
    width: 7,
    height: 7,
    borderRadius: 3.5,
    backgroundColor: '#E61E5A',
  },
  menuTextWrap: { flex: 1, alignItems: 'flex-end' },
  menuTitle: {
    fontSize: 15,
    fontWeight: '800',
    color: '#18181B',
    textAlign: 'right',
  },
  menuTitleDanger: { color: '#B42318' },
  menuSubtitle: {
    marginTop: 2,
    fontSize: 12,
    fontWeight: '500',
    color: '#6B7280',
    textAlign: 'right',
  },
  notificationToggleRow: {
    borderRadius: 18,
    borderWidth: 1,
    borderColor: '#E5E7EB',
    backgroundColor: '#FFFFFF',
    paddingHorizontal: 14,
    paddingVertical: 12,
    alignItems: 'stretch',
  },
  notificationToggleInner: {
    flexDirection: 'row-reverse',
    alignItems: 'flex-start',
    gap: 12,
  },
  notificationToggleIconShell: {
    width: 40,
    height: 40,
    borderRadius: 14,
    backgroundColor: '#F4F4F5',
    alignItems: 'center',
    justifyContent: 'center',
  },
  notificationToggleTextWrap: {
    flex: 1,
    alignItems: 'flex-end',
  },
  notificationToggleTitle: {
    fontSize: 15,
    fontWeight: '800',
    color: '#18181B',
    textAlign: 'right',
  },
  notificationToggleSubtitle: {
    marginTop: 3,
    fontSize: 12,
    lineHeight: 17,
    fontWeight: '500',
    color: '#6B7280',
    textAlign: 'right',
  },
  notificationSwitchTrack: {
    width: 46,
    height: 27,
    borderRadius: 999,
    borderWidth: 1,
    paddingHorizontal: 3,
    justifyContent: 'center',
    marginTop: 1,
  },
  notificationSwitchTrackEnabled: {
    backgroundColor: '#EEF3FF',
    borderColor: '#9DB6FF',
  },
  notificationSwitchTrackDisabled: {
    borderColor: '#D4D4D8',
    backgroundColor: '#D4D4D8',
  },
  notificationSwitchThumb: {
    width: 21,
    height: 21,
    borderRadius: 10.5,
  },
  notificationSwitchThumbEnabled: {
    backgroundColor: '#2F6BFF',
  },
  notificationSwitchThumbDisabled: {
    backgroundColor: '#A1A1AA',
  },
  notificationSwitchThumbRight: {
    alignSelf: 'flex-end',
  },
  notificationSwitchThumbLeft: {
    alignSelf: 'flex-start',
  },

  footerNote: {
    marginTop: 2,
    fontSize: 12,
    color: '#71717A',
    textAlign: 'right',
    lineHeight: 18,
  },

  modalBackdrop: {
    flex: 1,
    backgroundColor: 'rgba(15, 23, 42, 0.45)',
    alignItems: 'center',
    justifyContent: 'center',
    padding: 20,
  },
  modalCard: {
    width: '100%',
    maxWidth: 420,
    borderRadius: 22,
    borderWidth: 1,
    borderColor: '#F5D0D0',
    backgroundColor: '#FFFFFF',
    padding: 16,
    gap: 12,
  },
  modalTitle: {
    textAlign: 'right',
    fontSize: 20,
    fontWeight: '900',
    color: '#B42318',
  },
  modalText: {
    textAlign: 'right',
    fontSize: 14,
    color: '#3F3F46',
    lineHeight: 21,
  },
  modalInputBlock: { gap: 10 },
  modalInput: {
    borderWidth: 1,
    borderColor: '#E4E4E7',
    borderRadius: 14,
    paddingHorizontal: 12,
    paddingVertical: 10,
    textAlign: 'left',
    color: '#111827',
    fontSize: 14,
    fontWeight: '700',
  },
  modalBusyRow: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    alignItems: 'center',
    gap: 8,
  },
  modalBusyText: { color: '#52525B', fontWeight: '600' },
  modalActions: {
    flexDirection: 'row-reverse',
    alignItems: 'center',
    gap: 10,
  },
  modalSecondaryButton: {
    flex: 1,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: '#D4D4D8',
    paddingVertical: 12,
    alignItems: 'center',
    justifyContent: 'center',
  },
  modalSecondaryButtonText: { fontWeight: '800', color: '#3F3F46' },
  modalWarningButton: {
    flex: 1,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: '#B42318',
    backgroundColor: '#FEE4E2',
    paddingVertical: 12,
    alignItems: 'center',
    justifyContent: 'center',
  },
  modalWarningButtonText: { fontWeight: '900', color: '#B42318' },
  modalDangerButton: {
    flex: 1,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: '#B42318',
    backgroundColor: '#D92D20',
    paddingVertical: 12,
    alignItems: 'center',
    justifyContent: 'center',
  },
  modalDangerButtonDisabled: { backgroundColor: '#FEE4E2' },
  modalDangerButtonText: { fontWeight: '900', color: '#FFFFFF' },
  modalDangerButtonTextDisabled: { color: '#B42318' },
});
