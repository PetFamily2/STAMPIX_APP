import { useAuthActions } from '@convex-dev/auth/react';
import { Ionicons } from '@expo/vector-icons';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useMutation, useQuery } from 'convex/react';
import { router } from 'expo-router';
import * as SecureStore from 'expo-secure-store';
import { useMemo, useState } from 'react';
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

import { IS_DEV_MODE } from '@/config/appConfig';
import { useAppMode } from '@/contexts/AppModeContext';
import { useSessionContext } from '@/contexts/UserContext';
import { api } from '@/convex/_generated/api';
import { getConvexAuthSecureStoreKeysForHardReset } from '@/lib/auth/storageKeys';
import { clearPendingJoin } from '@/lib/deeplink/pendingJoin';
import { BUSINESS_ONBOARDING_ROUTES } from '@/lib/onboarding/businessOnboardingFlow';

const APP_MODE_STORAGE_KEY = 'stamprix.appMode';
const REMEMBERED_EMAIL_STORAGE_KEY = 'remembered_email';

type IconName = keyof typeof Ionicons.glyphMap;

const TEXT = {
  title: '\u05d4\u05e4\u05e8\u05d5\u05e4\u05d9\u05dc \u05e9\u05dc\u05d9',
  profileFallbackName: '\u05d7\u05d1\u05e8 STAMPIX',
  profileFallbackSubtitle:
    '\u05d7\u05e9\u05d1\u05d5\u05df \u05dc\u05e7\u05d5\u05d7',
  statCards:
    '\u05db\u05e8\u05d8\u05d9\u05e1\u05d9\u05dd \u05e4\u05e2\u05d9\u05dc\u05d9\u05dd',
  statBusinesses:
    '\u05e2\u05e1\u05e7\u05d9\u05dd \u05e9\u05de\u05d5\u05e8\u05d9\u05dd',
  statInvites:
    '\u05d4\u05d6\u05de\u05e0\u05d5\u05ea \u05e4\u05ea\u05d5\u05d7\u05d5\u05ea',
  quickWalletTitle: '\u05d4\u05d0\u05e8\u05e0\u05e7',
  quickWalletSubtitle:
    '\u05db\u05e8\u05d8\u05d9\u05e1\u05d9\u05d5\u05ea \u05d5\u05e0\u05e7\u05d5\u05d3\u05d5\u05ea',
  quickRewardsTitle: '\u05d4\u05d8\u05d1\u05d5\u05ea',
  quickRewardsSubtitle:
    '\u05e7\u05d5\u05e4\u05d5\u05e0\u05d9\u05dd \u05d5\u05de\u05d9\u05de\u05d5\u05e9\u05d9\u05dd',
  quickNew: '\u05d7\u05d3\u05e9',
  hostTitle:
    '\u05e8\u05d5\u05e6\u05d9\u05dd \u05dc\u05e6\u05e8\u05e3 \u05d0\u05ea \u05d4\u05e2\u05e1\u05e7 \u05e9\u05dc\u05db\u05dd?',
  hostSubtitle:
    '\u05d4\u05e4\u05e2\u05d9\u05dc\u05d5 \u05db\u05e8\u05d8\u05d9\u05e1 \u05e0\u05d0\u05de\u05e0\u05d5\u05ea \u05d3\u05d9\u05d2\u05d9\u05d8\u05dc\u05d9 \u05d5\u05d4\u05ea\u05d7\u05d9\u05dc\u05d5 \u05dc\u05e6\u05d1\u05d5\u05e8 \u05dc\u05e7\u05d5\u05d7\u05d5\u05ea \u05d7\u05d5\u05d6\u05e8\u05d9\u05dd.',
  hostButton:
    '\u05e6\u05d5\u05e8 \u05e4\u05e8\u05d5\u05e4\u05d9\u05dc \u05dc\u05e2\u05e1\u05e7 \u05e9\u05dc\u05da',
  switchToCustomerTitle:
    '\u05d7\u05d6\u05e8\u05d4 \u05dc\u05de\u05e6\u05d1 \u05dc\u05e7\u05d5\u05d7',
  switchToCustomerSubtitle:
    '\u05de\u05e2\u05d1\u05e8 \u05de\u05d4\u05d9\u05e8 \u05dc\u05d0\u05e8\u05e0\u05e7 \u05d5\u05dc\u05d4\u05d8\u05d1\u05d5\u05ea \u05d4\u05d0\u05d9\u05e9\u05d9\u05d5\u05ea \u05e9\u05dc\u05db\u05dd.',
  switchToCustomerButton:
    '\u05de\u05e2\u05d1\u05e8 \u05dc\u05dc\u05e7\u05d5\u05d7',
  sectionPreferences: '\u05d4\u05e2\u05d3\u05e4\u05d5\u05ea',
  accountSettingsTitle:
    '\u05e4\u05e8\u05d8\u05d9 \u05d7\u05e9\u05d1\u05d5\u05df',
  accountSettingsSubtitle:
    '\u05e9\u05dd, \u05d0\u05d9\u05de\u05d9\u05d9\u05dc \u05d5\u05d0\u05d1\u05d8\u05d7\u05d4',
  notificationsTitle: '\u05d4\u05ea\u05e8\u05d0\u05d5\u05ea',
  notificationsSubtitle:
    '\u05e2\u05d3\u05db\u05d5\u05e0\u05d9\u05dd \u05de\u05d4\u05d0\u05e4\u05dc\u05d9\u05e7\u05e6\u05d9\u05d4 \u05d5\u05de\u05d4\u05e2\u05e1\u05e7\u05d9\u05dd',
  sectionSupport:
    '\u05ea\u05de\u05d9\u05db\u05d4 \u05d5\u05de\u05e1\u05de\u05db\u05d9\u05dd',
  helpTitle: '\u05e2\u05d6\u05e8\u05d4 \u05d5\u05ea\u05de\u05d9\u05db\u05d4',
  helpSubtitle:
    '\u05e9\u05d0\u05dc\u05d5\u05ea \u05e0\u05e4\u05d5\u05e6\u05d5\u05ea \u05d5\u05d9\u05e6\u05d9\u05e8\u05ea \u05e7\u05e9\u05e8',
  termsTitle: '\u05ea\u05e0\u05d0\u05d9 \u05e9\u05d9\u05de\u05d5\u05e9',
  termsSubtitle:
    '\u05d4\u05de\u05e1\u05de\u05da \u05d4\u05de\u05e9\u05e4\u05d8\u05d9 \u05e9\u05dc STAMPIX',
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
  deleteTitle: '\u05de\u05d7\u05d9\u05e7\u05ea \u05d7\u05e9\u05d1\u05d5\u05df',
  deleteSubtitle:
    '\u05de\u05d7\u05d9\u05e7\u05d4 \u05de\u05dc\u05d0\u05d4 \u05e9\u05dc \u05d4\u05d7\u05e9\u05d1\u05d5\u05df \u05d5\u05d4\u05e0\u05ea\u05d5\u05e0\u05d9\u05dd',
  devResetTitle: 'Reset Local (DEV)',
  devResetSubtitle: 'Clear local auth/cache for new-user simulation',
  footerNote:
    'STAMPIX - \u05e0\u05d0\u05de\u05e0\u05d5\u05ea \u05d3\u05d9\u05d2\u05d9\u05d8\u05dc\u05d9\u05ea \u05e4\u05e9\u05d5\u05d8\u05d4 \u05dc\u05e2\u05e1\u05e7\u05d9\u05dd \u05d5\u05dc\u05dc\u05e7\u05d5\u05d7\u05d5\u05ea.',
  comingSoon:
    '\u05d4\u05de\u05e1\u05da \u05d9\u05d4\u05d9\u05d4 \u05d6\u05de\u05d9\u05df \u05d1\u05e7\u05e8\u05d5\u05d1.',
  notificationsCenter: '\u05d4\u05ea\u05e8\u05d0\u05d5\u05ea',
  notificationsCenterText:
    '\u05d0\u05d9\u05df \u05d4\u05ea\u05e8\u05d0\u05d5\u05ea \u05d7\u05d3\u05e9\u05d5\u05ea \u05db\u05e8\u05d2\u05e2.',
  helpCenterText:
    '\u05e6\u05e8\u05d9\u05db\u05d9\u05dd \u05e2\u05d6\u05e8\u05d4? \u05e4\u05e0\u05d5 \u05d0\u05dc\u05d9\u05e0\u05d5 \u05d3\u05e8\u05da \u05de\u05e8\u05db\u05d6 \u05d4\u05ea\u05de\u05d9\u05db\u05d4 \u05d1\u05d0\u05e4\u05dc\u05d9\u05e7\u05e6\u05d9\u05d4.',
  switchModeFailed:
    '\u05dc\u05d0 \u05d4\u05e6\u05dc\u05d7\u05e0\u05d5 \u05dc\u05e2\u05d3\u05db\u05df \u05de\u05e6\u05d1 \u05de\u05e9\u05ea\u05de\u05e9. \u05e0\u05e1\u05d5 \u05e9\u05d5\u05d1.',
  logoutFailed:
    '\u05dc\u05d0 \u05d4\u05e6\u05dc\u05d7\u05e0\u05d5 \u05dc\u05d1\u05e6\u05e2 \u05d9\u05e6\u05d9\u05d0\u05d4. \u05e0\u05e1\u05d5 \u05e9\u05d5\u05d1.',
  deleteModalTitle:
    '\u05de\u05d7\u05d9\u05e7\u05ea \u05d7\u05e9\u05d1\u05d5\u05df',
  deleteModalWarning:
    '\u05d4\u05e4\u05e2\u05d5\u05dc\u05d4 \u05ea\u05de\u05d7\u05e7 \u05dc\u05e6\u05de\u05d9\u05ea\u05d5\u05ea \u05d0\u05ea \u05d4\u05d7\u05e9\u05d1\u05d5\u05df \u05d5\u05d0\u05ea \u05db\u05dc \u05d4\u05e0\u05ea\u05d5\u05e0\u05d9\u05dd.',
  deleteModalConfirmHint:
    '\u05dc\u05d4\u05de\u05e9\u05da, \u05d4\u05e7\u05dc\u05d9\u05d3\u05d5 DELETE.',
  deleteModalBusy:
    '\u05de\u05d5\u05d7\u05e7\u05d9\u05dd \u05e0\u05ea\u05d5\u05e0\u05d9\u05dd...',
  cancel: '\u05d1\u05d9\u05d8\u05d5\u05dc',
  confirmDelete: '\u05dc\u05d4\u05de\u05e9\u05da',
  deletePermanent:
    '\u05de\u05d7\u05d9\u05e7\u05d4 \u05dc\u05e6\u05de\u05d9\u05ea\u05d5\u05ea',
  deleteAlertTitle:
    '\u05d0\u05d9\u05e9\u05d5\u05e8 \u05de\u05d7\u05d9\u05e7\u05d4',
  deleteAlertMessage:
    '\u05d9\u05e9 \u05dc\u05d4\u05e7\u05dc\u05d9\u05d3 DELETE \u05db\u05d3\u05d9 \u05dc\u05d0\u05e9\u05e8 \u05de\u05d7\u05d9\u05e7\u05d4.',
  deleteFailedTitle:
    '\u05de\u05d7\u05d9\u05e7\u05ea \u05d7\u05e9\u05d1\u05d5\u05df',
  deleteUnknownError:
    '\u05de\u05d7\u05d9\u05e7\u05ea \u05d4\u05d7\u05e9\u05d1\u05d5\u05df \u05e0\u05db\u05e9\u05dc\u05d4. \u05e0\u05e1\u05d5 \u05e9\u05d5\u05d1.',
  deleteSuccessTitle:
    '\u05d4\u05de\u05d7\u05d9\u05e7\u05d4 \u05d4\u05d5\u05e9\u05dc\u05de\u05d4',
  deleteSuccessPrefix:
    '\u05d4\u05de\u05d7\u05d9\u05e7\u05d4 \u05d4\u05e1\u05ea\u05d9\u05d9\u05de\u05d4. \u05e1\u05d9\u05db\u05d5\u05dd \u05d8\u05d1\u05dc\u05d0\u05d5\u05ea:',
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

function resolveName(sessionContext: ReturnType<typeof useSessionContext>) {
  const user = sessionContext?.user;
  const fullName = user?.fullName?.trim();
  if (fullName) {
    return fullName;
  }

  const first = user?.firstName?.trim() ?? '';
  const last = user?.lastName?.trim() ?? '';
  const composed = `${first} ${last}`.trim();
  if (composed) {
    return composed;
  }

  const emailPrefix = user?.email?.split('@')[0]?.trim();
  if (emailPrefix) {
    return emailPrefix;
  }

  return TEXT.profileFallbackName;
}

function resolveInitial(name: string) {
  const firstChar = name.trim().charAt(0);
  return firstChar ? firstChar.toUpperCase() : 'S';
}

function Metric({
  value,
  label,
  withDivider,
}: {
  value: number;
  label: string;
  withDivider?: boolean;
}) {
  return (
    <View
      style={[styles.metricBlock, withDivider ? styles.metricDivider : null]}
    >
      <Text style={styles.metricValue}>{value}</Text>
      <Text style={styles.metricLabel}>{label}</Text>
    </View>
  );
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

export default function SettingsScreen() {
  const insets = useSafeAreaInsets();
  const wipeAllDataHard = useMutation(api.users.wipeAllDataHard);
  const setActiveMode = useMutation(api.users.setActiveMode);
  const memberships = useQuery(api.memberships.byCustomer, {}) ?? [];
  const { appMode, setAppMode, isLoading: isAppModeLoading } = useAppMode();
  const sessionContext = useSessionContext();
  const { signOut } = useAuthActions();

  const [modeSwitchBusy, setModeSwitchBusy] = useState(false);
  const [deleteModalVisible, setDeleteModalVisible] = useState(false);
  const [deleteStep, setDeleteStep] = useState<1 | 2>(1);
  const [deleteConfirmationText, setDeleteConfirmationText] = useState('');
  const [deleteBusy, setDeleteBusy] = useState(false);
  const [localResetBusy, setLocalResetBusy] = useState(false);

  const isActionBusy = modeSwitchBusy || deleteBusy || localResetBusy;
  const isDeleteConfirmationValid =
    deleteConfirmationText.trim().toUpperCase() === 'DELETE';
  const isDeleteFinalDisabled = deleteBusy || !isDeleteConfirmationValid;

  const bizList = sessionContext?.businesses ?? [];
  const pendingInvites = sessionContext?.pendingInvites ?? [];
  const hasOwnerOrManager = bizList.some(
    (business) =>
      business.staffRole === 'owner' || business.staffRole === 'manager'
  );
  const businessOnboarded =
    (sessionContext?.user?.businessOnboardedAt ?? null) != null;
  const shouldStartBusinessOnboarding =
    !businessOnboarded || !hasOwnerOrManager;

  const displayName = useMemo(
    () => resolveName(sessionContext),
    [sessionContext]
  );
  const displayInitial = useMemo(
    () => resolveInitial(displayName),
    [displayName]
  );
  const displaySubtitle = useMemo(() => {
    const primaryBusinessName = bizList[0]?.name;
    if (primaryBusinessName) {
      return `${primaryBusinessName} - STAMPIX`;
    }
    if (sessionContext?.user?.email?.trim()) {
      return sessionContext.user.email.trim();
    }
    return TEXT.profileFallbackSubtitle;
  }, [bizList, sessionContext]);

  const openComingSoon = (title: string) => {
    Alert.alert(title, TEXT.comingSoon);
  };

  const openNotificationsCenter = () => {
    Alert.alert(TEXT.notificationsCenter, TEXT.notificationsCenterText);
  };

  const openHelpCenter = () => {
    Alert.alert(TEXT.helpTitle, TEXT.helpCenterText);
  };

  const openLegalScreen = () => {
    router.push('/(auth)/legal');
  };

  const handleSwitchToBusiness = async () => {
    if (isAppModeLoading || modeSwitchBusy || isActionBusy) {
      return;
    }

    try {
      setModeSwitchBusy(true);

      if (shouldStartBusinessOnboarding) {
        await setAppMode('business');
        if (hasOwnerOrManager) {
          await setActiveMode({ mode: 'business' });
        }
        router.replace(BUSINESS_ONBOARDING_ROUTES.role);
        return;
      }

      await setActiveMode({ mode: 'business' });
      await setAppMode('business');
      router.replace('/(authenticated)/(business)/dashboard');
    } catch (error) {
      Alert.alert(
        TEXT.errorTitle,
        toErrorMessage(error, TEXT.switchModeFailed)
      );
    } finally {
      setModeSwitchBusy(false);
    }
  };

  const handleSwitchToCustomer = async () => {
    if (isAppModeLoading || modeSwitchBusy || isActionBusy) {
      return;
    }

    try {
      setModeSwitchBusy(true);
      await setActiveMode({ mode: 'customer' });
      await setAppMode('customer');
      router.replace('/(authenticated)/(customer)/wallet');
    } catch (error) {
      Alert.alert(
        TEXT.errorTitle,
        toErrorMessage(error, TEXT.switchModeFailed)
      );
    } finally {
      setModeSwitchBusy(false);
    }
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

  const hardResetLocalState = async () => {
    const convexAuthKeys = getConvexAuthSecureStoreKeysForHardReset();
    const cleanupResults = await Promise.allSettled([
      clearPendingJoin(),
      AsyncStorage.removeItem(REMEMBERED_EMAIL_STORAGE_KEY),
      ...convexAuthKeys.map((key) => SecureStore.deleteItemAsync(key)),
      SecureStore.deleteItemAsync(APP_MODE_STORAGE_KEY),
    ]);

    const failed = cleanupResults.filter(
      (result): result is PromiseRejectedResult => result.status === 'rejected'
    );
    if (failed.length > 0) {
      throw new Error(
        toErrorMessage(failed[0].reason, 'LOCAL_HARD_RESET_FAILED')
      );
    }

    await setAppMode('customer');
    await SecureStore.deleteItemAsync(APP_MODE_STORAGE_KEY);
  };

  const runLocalHardReset = async () => {
    try {
      await signOut();
    } catch {
      // Continue with local cleanup even when remote sign-out fails.
    }

    await hardResetLocalState();
  };

  const handleDevLocalReset = async () => {
    if (!IS_DEV_MODE || isActionBusy) {
      return;
    }

    setLocalResetBusy(true);
    try {
      await runLocalHardReset();
      router.replace('/(auth)/welcome');
    } catch (error) {
      Alert.alert(
        TEXT.errorTitle,
        toErrorMessage(error, TEXT.deleteUnknownError)
      );
    } finally {
      setLocalResetBusy(false);
    }
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
      await runLocalHardReset();

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

  const isBusinessMode = appMode === 'business';
  const hostActionDisabled = isAppModeLoading || modeSwitchBusy || isActionBusy;

  return (
    <SafeAreaView style={styles.safeArea} edges={[]}>
      <ScrollView
        contentContainerStyle={[
          styles.scrollContent,
          { paddingTop: (insets.top || 0) + 8 },
        ]}
      >
        <View style={styles.headerRow}>
          <Pressable
            onPress={openNotificationsCenter}
            style={({ pressed }) => [
              styles.notificationButton,
              pressed ? styles.pressed : null,
            ]}
          >
            <Ionicons name="notifications-outline" size={20} color="#1F2937" />
            <View style={styles.notificationDot} />
          </Pressable>

          <Text style={styles.pageTitle}>{TEXT.title}</Text>
        </View>

        <View style={styles.profileCard}>
          <View style={styles.profileCardInner}>
            <View style={styles.metricsColumn}>
              <Metric
                value={memberships.length}
                label={TEXT.statCards}
                withDivider={true}
              />
              <Metric
                value={bizList.length}
                label={TEXT.statBusinesses}
                withDivider={true}
              />
              <Metric value={pendingInvites.length} label={TEXT.statInvites} />
            </View>

            <View style={styles.identityColumn}>
              <View style={styles.avatarWrap}>
                <View style={styles.avatarCircle}>
                  <Text style={styles.avatarInitial}>{displayInitial}</Text>
                </View>
                <View style={styles.avatarBadge}>
                  <Ionicons name="shield-checkmark" size={13} color="#FFFFFF" />
                </View>
              </View>

              <Text style={styles.profileName} numberOfLines={1}>
                {displayName}
              </Text>
              <Text style={styles.profileSubtitle} numberOfLines={1}>
                {displaySubtitle}
              </Text>
            </View>
          </View>
        </View>

        <View style={styles.hostFrame}>
          <Pressable
            onPress={
              isBusinessMode ? handleSwitchToCustomer : handleSwitchToBusiness
            }
            disabled={hostActionDisabled}
            style={({ pressed }) => [
              styles.hostCard,
              pressed ? styles.pressed : null,
              hostActionDisabled ? styles.disabled : null,
            ]}
          >
            <View style={styles.hostCardInner}>
              <View style={styles.hostIconShell}>
                <Ionicons
                  name={
                    isBusinessMode ? 'person-outline' : 'storefront-outline'
                  }
                  size={22}
                  color="#111827"
                />
              </View>

              <View style={styles.hostTextWrap}>
                <Text style={styles.hostTitle} numberOfLines={2}>
                  {isBusinessMode ? TEXT.switchToCustomerTitle : TEXT.hostTitle}
                </Text>
                <Text style={styles.hostSubtitle} numberOfLines={3}>
                  {isBusinessMode
                    ? TEXT.switchToCustomerSubtitle
                    : TEXT.hostSubtitle}
                </Text>

                <View style={styles.hostButton}>
                  {modeSwitchBusy ? (
                    <ActivityIndicator color="#FFFFFF" />
                  ) : (
                    <>
                      <Text style={styles.hostButtonText}>
                        {isBusinessMode
                          ? TEXT.switchToCustomerButton
                          : TEXT.hostButton}
                      </Text>
                      <Ionicons name="chevron-back" size={14} color="#FFFFFF" />
                    </>
                  )}
                </View>
              </View>
            </View>
          </Pressable>
        </View>

        <View style={styles.menuSection}>
          <Text style={styles.sectionTitle}>{TEXT.sectionPreferences}</Text>
          <MenuRow
            title={TEXT.accountSettingsTitle}
            subtitle={TEXT.accountSettingsSubtitle}
            icon="settings-outline"
            showDot={true}
            onPress={() => openComingSoon(TEXT.accountSettingsTitle)}
          />
          <MenuRow
            title={TEXT.notificationsTitle}
            subtitle={TEXT.notificationsSubtitle}
            icon="notifications-outline"
            onPress={() => openComingSoon(TEXT.notificationsTitle)}
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
            onPress={handleLogout}
          />
          <MenuRow
            title={TEXT.deleteTitle}
            subtitle={TEXT.deleteSubtitle}
            icon="trash-outline"
            danger={true}
            disabled={isActionBusy}
            onPress={openDeleteModal}
          />
          {IS_DEV_MODE ? (
            <MenuRow
              title={TEXT.devResetTitle}
              subtitle={TEXT.devResetSubtitle}
              icon="refresh-outline"
              disabled={isActionBusy}
              onPress={handleDevLocalReset}
            />
          ) : null}
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
  safeArea: { flex: 1, backgroundColor: '#F3F3F1' },
  scrollContent: { paddingHorizontal: 20, paddingBottom: 100, gap: 10 },
  pressed: { opacity: 0.88 },
  disabled: { opacity: 0.6 },

  headerRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 4,
  },
  notificationButton: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: '#EAEAEA',
    alignItems: 'center',
    justifyContent: 'center',
  },
  notificationDot: {
    position: 'absolute',
    top: 14,
    right: 14,
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: '#E61E5A',
  },
  pageTitle: {
    textAlign: 'right',
    fontSize: 22,
    lineHeight: 27,
    fontWeight: '900',
    color: '#171717',
  },

  profileCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: 16,
    borderWidth: 1,
    borderColor: '#E8E8E8',
    padding: 12,
    shadowColor: '#111827',
    shadowOpacity: 0.05,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 7 },
    elevation: 2,
  },
  profileCardInner: {
    flexDirection: 'row-reverse',
    alignItems: 'center',
    gap: 12,
  },
  metricsColumn: { width: 82 },
  metricBlock: { paddingVertical: 7, alignItems: 'flex-end' },
  metricDivider: { borderBottomWidth: 1, borderBottomColor: '#ECECEC' },
  metricValue: {
    fontSize: 20,
    lineHeight: 24,
    fontWeight: '800',
    color: '#171717',
    textAlign: 'right',
  },
  metricLabel: {
    marginTop: 2,
    fontSize: 11,
    fontWeight: '500',
    color: '#4B5563',
    textAlign: 'right',
  },

  identityColumn: { flex: 1, alignItems: 'flex-end' },
  avatarWrap: { position: 'relative' },
  avatarCircle: {
    width: 68,
    height: 68,
    borderRadius: 34,
    backgroundColor: '#E6ECF8',
    borderWidth: 1,
    borderColor: '#D5DDED',
    alignItems: 'center',
    justifyContent: 'center',
  },
  avatarInitial: {
    fontSize: 24,
    fontWeight: '900',
    color: '#111827',
    textAlign: 'center',
  },
  avatarBadge: {
    position: 'absolute',
    left: -4,
    bottom: 4,
    width: 24,
    height: 24,
    borderRadius: 12,
    borderWidth: 2,
    borderColor: '#FFFFFF',
    backgroundColor: '#E61E5A',
    alignItems: 'center',
    justifyContent: 'center',
  },
  profileName: {
    marginTop: 8,
    fontSize: 20,
    lineHeight: 24,
    fontWeight: '900',
    color: '#171717',
    textAlign: 'right',
  },
  profileSubtitle: {
    marginTop: 2,
    fontSize: 12,
    fontWeight: '500',
    color: '#6B7280',
    textAlign: 'right',
  },

  hostFrame: {
    borderWidth: 2,
    borderColor: '#9DB6FF',
    borderRadius: 18,
    backgroundColor: '#EEF3FF',
    padding: 6,
  },

  hostCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: 16,
    borderWidth: 1,
    borderColor: '#E8E8E8',
    padding: 12,
    shadowColor: '#111827',
    shadowOpacity: 0.04,
    shadowRadius: 10,
    shadowOffset: { width: 0, height: 6 },
    elevation: 2,
  },
  hostCardInner: {
    flexDirection: 'row-reverse',
    alignItems: 'center',
    gap: 12,
  },
  hostIconShell: {
    width: 42,
    height: 42,
    borderRadius: 12,
    backgroundColor: '#F3F4F6',
    alignItems: 'center',
    justifyContent: 'center',
  },
  hostTextWrap: { flex: 1, alignItems: 'flex-end', gap: 7 },
  hostTitle: {
    fontSize: 18,
    lineHeight: 22,
    fontWeight: '900',
    color: '#171717',
    textAlign: 'right',
  },
  hostSubtitle: {
    fontSize: 12,
    lineHeight: 17,
    fontWeight: '500',
    color: '#52525B',
    textAlign: 'right',
  },
  hostButton: {
    marginTop: 2,
    backgroundColor: '#111827',
    borderRadius: 999,
    paddingHorizontal: 12,
    paddingVertical: 7,
    flexDirection: 'row-reverse',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 5,
    minWidth: 118,
  },
  hostButtonText: {
    fontSize: 12,
    fontWeight: '800',
    color: '#FFFFFF',
    textAlign: 'right',
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
