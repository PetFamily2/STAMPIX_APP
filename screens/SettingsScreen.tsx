import { useAuthActions } from '@convex-dev/auth/react';
import { Ionicons } from '@expo/vector-icons';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useBottomTabBarHeight } from '@react-navigation/bottom-tabs';
import { useMutation } from 'convex/react';
import { router, useLocalSearchParams, useSegments } from 'expo-router';
import * as SecureStore from 'expo-secure-store';
import { useEffect, useRef, useState } from 'react';
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
import { useOnboarding } from '@/contexts/OnboardingContext';
import { usePushNotifications } from '@/contexts/PushNotificationsContext';
import { useSessionContext, useUser } from '@/contexts/UserContext';
import { api } from '@/convex/_generated/api';
import type { Id } from '@/convex/_generated/dataModel';
import { useActiveBusiness } from '@/hooks/useActiveBusiness';
import {
  type AccountDeletionFlowResult,
  runAccountDeletionWithCleanup,
} from '@/lib/accountDeletionReset';
import { getConvexAuthSecureStoreKeysForCleanup } from '@/lib/auth/storageKeys';
import { clearPendingJoin } from '@/lib/deeplink/pendingJoin';
import { safePush } from '@/lib/navigation';
import {
  alignItems,
  flexDirection,
  justifyContent,
  rtlBaseView,
  selfEnd,
  selfStart,
} from '@/lib/rtl';

const REMEMBERED_EMAIL_STORAGE_KEY = 'remembered_email';
const SCANNER_LAST_PROGRAM_STORAGE_PREFIX = 'scanner:lastProgram:';

type IconName = keyof typeof Ionicons.glyphMap;
type LegalDocumentKey = 'privacy' | 'terms' | 'deletion';

const TEXT = {
  quickWalletTitle: 'הארנק',
  quickWalletSubtitle: 'כרטיסיות ונקודות',
  quickRewardsTitle: 'הטבות',
  quickRewardsSubtitle: 'קופונים ומימושים',
  quickNew: 'חדש',
  sectionPreferences: 'העדפות',
  accountSettingsTitle: 'פרטי חשבון',
  accountSettingsSubtitle: 'שם, אימייל ואבטחה',
  notificationsToggleTitle: 'התראות',
  notificationsToggleSubtitle: 'קבלת עדכונים והטבות',
  marketingToggleTitle: 'דיוור שיווקי',
  marketingToggleSubtitle: 'הסכמה לקבלת מבצעים והטבות',
  sectionSupport: 'תמיכה ומסמכים',
  helpTitle: 'עזרה ותמיכה',
  helpSubtitle: 'שאלות נפוצות ויצירת קשר',
  termsTitle: 'תנאי שימוש',
  termsSubtitle: 'המסמך המשפטי של StampAix',
  privacyTitle: 'מדיניות פרטיות',
  privacySubtitle: 'איך אנחנו שומרים על המידע שלכם',
  accountDeletionPolicyTitle: 'מדיניות מחיקת חשבון',
  accountDeletionPolicySubtitle: 'מה נמחק, מה נשמר ומגבלת בעלים יחיד',
  sectionAccount: 'ניהול חשבון',
  logoutTitle: 'יציאה מהחשבון',
  logoutSubtitle: 'התנתקות מהמכשיר הנוכחי',
  logoutConfirmTitle: 'אישור יציאה',
  logoutConfirmMessage: 'האם אתם בטוחים שברצונכם להתנתק מהחשבון?',
  logoutConfirmAction: 'יציאה מהחשבון',
  deleteTitle: 'מחיקת חשבון',
  deleteSubtitle: 'מחיקה מלאה של החשבון והנתונים',
  footerNote: 'StampAix - נאמנות דיגיטלית פשוטה לעסקים וללקוחות',
  helpCenterText: 'צריכים עזרה? פנו אלינו דרך מרכז התמיכה באפליקציה',
  notificationsSaveFailed: 'לא הצלחנו לשמור את העדפת ההתראות נסו שוב',
  marketingSaveFailed: 'לא הצלחנו לשמור את העדפת הדיוור נסו שוב',
  notificationsPermissionTitle: 'הרשאת התראות נדרשת',
  notificationsPermissionMessage:
    'כדי לקבל התראות, אשרו התראות בהגדרות המכשיר.',
  switchModeFailed: 'לא הצלחנו לעדכן מצב משתמש נסו שוב',
  staffBusinessTitlePrefix: 'מעבר ל',
  staffScannerAction: 'לחץ למעבר',
  staffBusinessesTitle: 'העסקים שבהם אני עובד',
  logoutFailed: 'לא הצלחנו לבצע יציאה נסו שוב',
  deleteModalTitle: 'מחיקת חשבון',
  deleteModalWarning: 'הפעולה תמחק לצמיתות את החשבון ואת כל הנתונים',
  deleteModalConfirmHint: 'להמשך, הקלידו DELETE',
  deleteModalBusy: 'מוחקים נתונים',
  cancel: 'ביטול',
  confirmDelete: 'להמשך',
  deletePermanent: 'מחיקה לצמיתות',
  deleteAlertTitle: 'אישור מחיקה',
  deleteAlertMessage: 'יש להקליד DELETE כדי לאשר מחיקה',
  deleteFailedTitle: 'מחיקת חשבון',
  deleteUnknownError: 'מחיקת החשבון נכשלה נסו שוב',
  soleOwnerDeleteBlockedTitle: 'לא ניתן למחוק את החשבון',
  soleOwnerDeleteBlockedMessage:
    'לא ניתן למחוק את החשבון כל עוד בבעלותך עסק פעיל או סגור. יש לנהל את העסקים שבבעלותך לפני שממשיכים במחיקת החשבון האישי.',
  manageBusinesses: 'ניהול עסקים',
  deleteSuccessTitle: 'המחיקה הושלמה',
  deleteSuccessPrefix: 'המחיקה הסתיימה סיכום טבלאות:',
  ok: 'אישור',
  errorTitle: 'שגיאה',
};

function toErrorMessage(error: unknown, fallback: string) {
  if (error instanceof Error && error.message.trim().length > 0) {
    return fallback;
  }
  if (typeof error === 'string' && error.trim().length > 0) {
    return fallback;
  }
  return fallback;
}

function formatWipeSummary(counts: Record<string, number>) {
  return Object.entries(counts)
    .map(([tableName, count]) => `${tableName}: ${count}`)
    .join('\n');
}

function getScannerRouteForStaffRole(staffRole: 'owner' | 'manager' | 'staff') {
  return staffRole === 'staff'
    ? '/(authenticated)/(staff)/scanner'
    : '/(authenticated)/(business)/scanner';
}

async function clearBusinessSelectionStorage(
  businessIds: readonly Id<'businesses'>[]
) {
  const cleanupResults = await Promise.allSettled(
    businessIds.map((businessId) =>
      AsyncStorage.removeItem(
        `${SCANNER_LAST_PROGRAM_STORAGE_PREFIX}${String(businessId)}`
      )
    )
  );
  if (cleanupResults.some((result) => result.status === 'rejected')) {
    throw new Error('BUSINESS_SELECTION_CLEANUP_FAILED');
  }
}

async function clearConvexAuthSecureStore() {
  const cleanupResults = await Promise.allSettled(
    getConvexAuthSecureStoreKeysForCleanup().map((key) =>
      SecureStore.deleteItemAsync(key)
    )
  );
  if (cleanupResults.some((result) => result.status === 'rejected')) {
    throw new Error('AUTH_STORAGE_CLEANUP_FAILED');
  }
}

function reportPostDeletionCleanupWarning(failedStepNames: readonly string[]) {
  console.warn('[account-deletion] Local cleanup completed with warnings.', {
    failedStepNames,
  });
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
                ? styles.notificationSwitchThumbLeft
                : styles.notificationSwitchThumbRight,
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
  const { resumeAccountDeletion } = useLocalSearchParams<{
    resumeAccountDeletion?: string | string[];
  }>();
  const tabBarHeight = useBottomTabBarHeight();
  const sessionContext = useSessionContext();
  const { resetSessionState } = useUser();
  const user = sessionContext?.user;
  const deleteMyAccountHard = useMutation(api.users.deleteMyAccountHard);
  const setActiveMode = useMutation(api.users.setActiveMode);
  const setMyMarketingProfile = useMutation(api.users.setMyMarketingProfile);
  const { resetAppMode, setAppMode } = useAppMode();
  const { reset: resetOnboarding } = useOnboarding();
  const {
    isSwitchingBusiness,
    resetActiveBusinessState,
    setActiveBusinessId,
  } = useActiveBusiness();
  const {
    clearDeletedAccountNotificationStorage,
    isEnabled: notificationsEnabled,
    isLoading: notificationsLoading,
    isSyncing: notificationsSyncing,
    resetNotificationState,
    setNotificationsEnabled,
  } = usePushNotifications();
  const { signOut } = useAuthActions();

  const [deleteModalVisible, setDeleteModalVisible] = useState(false);
  const [deleteStep, setDeleteStep] = useState<1 | 2>(1);
  const [deleteConfirmationText, setDeleteConfirmationText] = useState('');
  const [deleteBusy, setDeleteBusy] = useState(false);
  const [marketingEnabled, setMarketingEnabled] = useState(
    user?.marketingOptIn === true
  );
  const [marketingBusy, setMarketingBusy] = useState(false);
  const [staffBusinessBusyId, setStaffBusinessBusyId] = useState<string | null>(
    null
  );
  const resumeAccountDeletionHandledRef = useRef(false);

  const isActionBusy = deleteBusy;
  const notificationBusy = notificationsLoading || notificationsSyncing;
  const isDeleteConfirmationValid =
    deleteConfirmationText.trim().toUpperCase() === 'DELETE';
  const isDeleteFinalDisabled = deleteBusy || !isDeleteConfirmationValid;

  const isBusinessSettingsScreen = (
    Array.isArray(segments) ? (segments as string[]) : []
  ).includes('(business)');
  const staffBusinessesRaw =
    sessionContext?.businesses.filter(
      (business) =>
        business.staffRole === 'staff' || business.staffRole === 'manager'
    ) ?? [];
  const activeBusinessId = sessionContext?.activeBusinessId
    ? String(sessionContext.activeBusinessId)
    : null;
  const staffBusinesses = [...staffBusinessesRaw].sort((a, b) => {
    const aIsActive =
      activeBusinessId != null && String(a.id) === activeBusinessId;
    const bIsActive =
      activeBusinessId != null && String(b.id) === activeBusinessId;
    if (aIsActive === bIsActive) {
      return 0;
    }
    return aIsActive ? -1 : 1;
  });
  const singleStaffBusiness =
    staffBusinesses.length === 1 ? staffBusinesses[0] : null;

  useEffect(() => {
    setMarketingEnabled(user?.marketingOptIn === true);
  }, [user?.marketingOptIn]);

  const openHelpCenter = () => {
    router.push('/(authenticated)/(customer)/help-support');
  };

  const openAccountDetails = () => {
    router.push('/(authenticated)/(customer)/account-details');
  };

  const openLegalDocument = (document: LegalDocumentKey) => {
    safePush(`/(authenticated)/settings-legal?document=${document}`);
  };

  const openTermsOfService = () => {
    openLegalDocument('terms');
  };

  const openPrivacyPolicy = () => {
    openLegalDocument('privacy');
  };

  const openAccountDeletionPolicy = () => {
    openLegalDocument('deletion');
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

  useEffect(() => {
    const shouldResume = Array.isArray(resumeAccountDeletion)
      ? resumeAccountDeletion[0] === 'true'
      : resumeAccountDeletion === 'true';
    if (!shouldResume || resumeAccountDeletionHandledRef.current) {
      return;
    }
    resumeAccountDeletionHandledRef.current = true;
    setDeleteStep(1);
    setDeleteConfirmationText('');
    setDeleteModalVisible(true);
  }, [resumeAccountDeletion]);

  const openBusinessDeletionResolution = () => {
    resumeAccountDeletionHandledRef.current = false;
    setDeleteModalVisible(false);
    setDeleteStep(1);
    setDeleteConfirmationText('');
    router.push({
      pathname: '/(authenticated)/business-permanent-deletion',
      params: { returnTo: 'account-deletion' },
    });
  };

  const handleDeleteAccount = async () => {
    if (deleteBusy) {
      return;
    }
    if (!isDeleteConfirmationValid) {
      Alert.alert(TEXT.deleteAlertTitle, TEXT.deleteAlertMessage);
      return;
    }

    setDeleteBusy(true);

    let deletionFlow: AccountDeletionFlowResult<
      Awaited<ReturnType<typeof deleteMyAccountHard>>
    >;
    try {
      deletionFlow = await runAccountDeletionWithCleanup({
        deleteAccount: () => deleteMyAccountHard({}),
        cleanupSteps: [
          {
            name: 'active-business-state',
            run: resetActiveBusinessState,
          },
          {
            name: 'onboarding-state',
            run: resetOnboarding,
          },
          {
            name: 'notification-state',
            run: resetNotificationState,
          },
          {
            name: 'app-mode',
            run: resetAppMode,
          },
          {
            name: 'session-state',
            run: resetSessionState,
          },
          {
            name: 'remembered-email',
            run: () => AsyncStorage.removeItem(REMEMBERED_EMAIL_STORAGE_KEY),
          },
          {
            name: 'business-selections',
            run: () =>
              clearBusinessSelectionStorage(
                sessionContext?.businesses.map((business) => business.id) ?? []
              ),
          },
          {
            name: 'notification-preferences',
            run: clearDeletedAccountNotificationStorage,
          },
          {
            name: 'pending-join',
            run: clearPendingJoin,
          },
          {
            name: 'sign-out',
            run: signOut,
          },
          {
            name: 'auth-storage',
            run: clearConvexAuthSecureStore,
          },
          {
            name: 'welcome-navigation',
            run: () => router.replace('/(auth)/welcome'),
          },
        ],
        onCleanupWarning: reportPostDeletionCleanupWarning,
      });
    } catch {
      setDeleteBusy(false);
      Alert.alert(TEXT.deleteFailedTitle, TEXT.deleteUnknownError);
      return;
    }

    if (deletionFlow.status === 'server_rejected') {
      setDeleteBusy(false);
      if (
        'errorCode' in deletionFlow.result &&
        deletionFlow.result.errorCode === 'SOLE_OWNER_BUSINESS_BLOCKED'
      ) {
        Alert.alert(
          TEXT.soleOwnerDeleteBlockedTitle,
          TEXT.soleOwnerDeleteBlockedMessage,
          [
            { text: TEXT.cancel, style: 'cancel' },
            {
              text: TEXT.manageBusinesses,
              onPress: openBusinessDeletionResolution,
            },
          ]
        );
        return;
      }
      Alert.alert(TEXT.deleteFailedTitle, TEXT.deleteUnknownError);
      return;
    }

    const deletionResult = deletionFlow.result;
    if (!deletionResult.success) {
      return;
    }

    setDeleteBusy(false);
    setDeleteModalVisible(false);
    setDeleteStep(1);
    setDeleteConfirmationText('');
    Alert.alert(
      TEXT.deleteSuccessTitle,
      `${TEXT.deleteSuccessPrefix}\n${formatWipeSummary(
        deletionResult.deleted
      )}`,
      [{ text: TEXT.ok }],
      { cancelable: false }
    );
  };

  const toggleNotifications = async () => {
    if (notificationBusy) {
      return;
    }

    const nextValue = !notificationsEnabled;

    try {
      const result = await setNotificationsEnabled(nextValue);
      if (nextValue && !result.registered) {
        Alert.alert(
          TEXT.notificationsPermissionTitle,
          TEXT.notificationsPermissionMessage
        );
      }
    } catch (error) {
      Alert.alert(
        TEXT.errorTitle,
        toErrorMessage(error, TEXT.notificationsSaveFailed)
      );
    }
  };

  const toggleMarketing = async () => {
    if (marketingBusy || !user) {
      return;
    }

    const nextValue = !marketingEnabled;
    setMarketingEnabled(nextValue);
    setMarketingBusy(true);

    try {
      await setMyMarketingProfile({
        marketingOptIn: nextValue,
        birthdayMonth: user.birthdayMonth,
        birthdayDay: user.birthdayDay,
        anniversaryMonth: user.anniversaryMonth,
        anniversaryDay: user.anniversaryDay,
      });
    } catch (error) {
      setMarketingEnabled(user.marketingOptIn === true);
      Alert.alert(
        TEXT.errorTitle,
        toErrorMessage(error, TEXT.marketingSaveFailed)
      );
    } finally {
      setMarketingBusy(false);
    }
  };

  const openStaffBusinessScanner = async (business: {
    id: Id<'businesses'>;
    staffRole: 'owner' | 'manager' | 'staff';
  }) => {
    if (staffBusinessBusyId || isSwitchingBusiness) {
      return;
    }

    try {
      setStaffBusinessBusyId(String(business.id));
      await setActiveBusinessId(business.id);
      await setActiveMode({ mode: 'business' });
      await setAppMode('business');
      router.navigate(getScannerRouteForStaffRole(business.staffRole));
    } catch (error) {
      Alert.alert(
        TEXT.errorTitle,
        toErrorMessage(error, TEXT.switchModeFailed)
      );
    } finally {
      setStaffBusinessBusyId(null);
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
            title={'הגדרות'}
            subtitle={
              isBusinessSettingsScreen
                ? 'ניהול החשבון, התמיכה והעדפות העסק'
                : 'ניהול החשבון, התמיכה והעדפות הלקוח'
            }
            showAvatar={!isBusinessSettingsScreen}
            avatarUrl={user?.avatarUrl}
            avatarFullName={user?.fullName}
          />
        </View>
        <BusinessModeCtaCard
          disabled={deleteBusy}
          forcePromotionalBanner={true}
        />
        {singleStaffBusiness ? (
          <Pressable
            onPress={() => {
              void openStaffBusinessScanner(singleStaffBusiness);
            }}
            disabled={
              deleteBusy || Boolean(staffBusinessBusyId) || isSwitchingBusiness
            }
            style={({ pressed }) => [
              styles.staffBusinessButton,
              pressed ? styles.pressed : null,
              deleteBusy || staffBusinessBusyId || isSwitchingBusiness
                ? styles.disabled
                : null,
            ]}
          >
            <View style={styles.staffBusinessButtonInner}>
              <View style={styles.staffBusinessIconShell}>
                <Ionicons name="qr-code-outline" size={22} color="#1D4ED8" />
              </View>
              <View style={styles.staffBusinessTextWrap}>
                <Text style={styles.staffBusinessTitle}>
                  {TEXT.staffBusinessTitlePrefix} {singleStaffBusiness.name}
                </Text>
              </View>
              {staffBusinessBusyId === String(singleStaffBusiness.id) ? (
                <ActivityIndicator color="#1D4ED8" />
              ) : (
                <View style={styles.staffBusinessAction}>
                  <Text style={styles.staffBusinessActionText}>
                    {TEXT.staffScannerAction}
                  </Text>
                  <Ionicons name="chevron-back" size={14} color="#1D4ED8" />
                </View>
              )}
            </View>
          </Pressable>
        ) : null}
        {staffBusinesses.length > 1 ? (
          <View style={styles.staffBusinessesCard}>
            <Text style={styles.staffBusinessesTitle}>
              {TEXT.staffBusinessesTitle}
            </Text>
            <View style={styles.staffBusinessesList}>
              {staffBusinesses.map((business) => (
                <Pressable
                  key={String(business.id)}
                  onPress={() => {
                    void openStaffBusinessScanner(business);
                  }}
                  disabled={
                    deleteBusy ||
                    Boolean(staffBusinessBusyId) ||
                    isSwitchingBusiness
                  }
                  style={({ pressed }) => [
                    styles.staffBusinessRow,
                    pressed ? styles.pressed : null,
                    deleteBusy || staffBusinessBusyId || isSwitchingBusiness
                      ? styles.disabled
                      : null,
                  ]}
                >
                  <View style={styles.staffBusinessRowInner}>
                    <View style={styles.staffBusinessRowTextWrap}>
                      <Text style={styles.staffBusinessRowTitle}>
                        {TEXT.staffBusinessTitlePrefix} {business.name}
                      </Text>
                    </View>
                    {staffBusinessBusyId === String(business.id) ? (
                      <ActivityIndicator color="#1D4ED8" />
                    ) : (
                      <View style={styles.staffBusinessAction}>
                        <Text style={styles.staffBusinessActionText}>
                          {TEXT.staffScannerAction}
                        </Text>
                        <Ionicons
                          name="chevron-back"
                          size={14}
                          color="#1D4ED8"
                        />
                      </View>
                    )}
                  </View>
                </Pressable>
              ))}
            </View>
          </View>
        ) : null}
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
          <NotificationToggleRow
            title={TEXT.marketingToggleTitle}
            subtitle={TEXT.marketingToggleSubtitle}
            enabled={marketingEnabled}
            disabled={marketingBusy}
            onPress={toggleMarketing}
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
            onPress={openTermsOfService}
          />
          <MenuRow
            title={TEXT.privacyTitle}
            subtitle={TEXT.privacySubtitle}
            icon="shield-checkmark-outline"
            onPress={openPrivacyPolicy}
          />
          <MenuRow
            title={TEXT.accountDeletionPolicyTitle}
            subtitle={TEXT.accountDeletionPolicySubtitle}
            icon="information-circle-outline"
            onPress={openAccountDeletionPolicy}
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
    width: '100%',
    maxWidth: 720,
    alignSelf: 'center',
  },
  scrollArea: { flex: 1 },
  scrollContent: {
    paddingHorizontal: 20,
    gap: 10,
    width: '100%',
    maxWidth: 720,
    alignSelf: 'center',
  },
  pressed: { opacity: 0.88 },
  disabled: { opacity: 0.6 },

  headerRow: {
    alignItems: 'stretch',
    marginBottom: 4,
  },
  staffBusinessButton: {
    borderRadius: 18,
    borderWidth: 1,
    borderColor: '#BFDBFE',
    backgroundColor: '#FFFFFF',
    paddingHorizontal: 14,
    paddingVertical: 12,
    shadowColor: '#1D4ED8',
    shadowOpacity: 0.05,
    shadowRadius: 10,
    shadowOffset: { width: 0, height: 6 },
    elevation: 2,
  },
  staffBusinessButtonInner: {
    flexDirection: flexDirection.row,
    alignItems: 'center',
    gap: 12,
    ...rtlBaseView,
  },
  staffBusinessIconShell: {
    width: 42,
    height: 42,
    borderRadius: 14,
    backgroundColor: '#EFF6FF',
    alignItems: 'center',
    justifyContent: 'center',
  },
  staffBusinessTextWrap: {
    flex: 1,
    alignItems: alignItems.start,
  },
  staffBusinessTitle: {
    fontSize: 15,
    fontWeight: '800',
    color: '#1E3A8A',
    textAlign: 'right',
  },
  staffBusinessAction: {
    flexDirection: flexDirection.row,
    alignItems: 'center',
    gap: 4,
    ...rtlBaseView,
  },
  staffBusinessActionText: {
    fontSize: 12,
    fontWeight: '800',
    color: '#1D4ED8',
    textAlign: 'right',
    writingDirection: 'rtl',
  },
  staffBusinessesCard: {
    borderRadius: 18,
    borderWidth: 1,
    borderColor: '#DCE6FF',
    backgroundColor: '#FFFFFF',
    paddingHorizontal: 12,
    paddingVertical: 12,
    gap: 8,
  },
  staffBusinessesTitle: {
    fontSize: 12,
    fontWeight: '700',
    color: '#64748B',
    textAlign: 'right',
  },
  staffBusinessesList: {
    gap: 8,
  },
  staffBusinessRow: {
    borderRadius: 14,
    borderWidth: 1,
    borderColor: '#D6E3FF',
    backgroundColor: '#F8FAFF',
    paddingHorizontal: 12,
    paddingVertical: 10,
  },
  staffBusinessRowInner: {
    flexDirection: flexDirection.row,
    alignItems: 'center',
    gap: 10,
    ...rtlBaseView,
  },
  staffBusinessRowTextWrap: {
    flex: 1,
    alignItems: alignItems.start,
  },
  staffBusinessRowTitle: {
    fontSize: 14,
    fontWeight: '800',
    color: '#1E3A8A',
    textAlign: 'right',
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
    borderBottomWidth: 1,
    borderBottomColor: '#D9E2F2',
    paddingVertical: 12,
    paddingHorizontal: 2,
  },
  menuRowDanger: {
    borderBottomColor: '#FECACA',
  },
  menuRowInner: {
    flexDirection: flexDirection.row,
    alignItems: 'center',
    gap: 11,
    ...rtlBaseView,
  },
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
  menuTextWrap: { flex: 1, alignItems: alignItems.start },
  menuTitle: {
    fontSize: 15,
    fontWeight: '800',
    color: '#18181B',
    textAlign: 'right',
    writingDirection: 'rtl',
  },
  menuTitleDanger: { color: '#B42318' },
  menuSubtitle: {
    marginTop: 2,
    fontSize: 12,
    fontWeight: '500',
    color: '#6B7280',
    textAlign: 'right',
    writingDirection: 'rtl',
  },
  notificationToggleRow: {
    borderBottomWidth: 1,
    borderBottomColor: '#D9E2F2',
    paddingHorizontal: 2,
    paddingVertical: 12,
    alignItems: 'stretch',
  },
  notificationToggleInner: {
    flexDirection: flexDirection.row,
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
    alignItems: alignItems.start,
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
    alignSelf: selfStart,
  },
  notificationSwitchThumbLeft: {
    alignSelf: selfEnd,
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
    textAlign: 'right',
    writingDirection: 'rtl',
    color: '#111827',
    fontSize: 14,
    fontWeight: '700',
  },
  modalBusyRow: {
    // Preserve text-then-spinner source order while anchoring at Hebrew start.
    flexDirection: flexDirection.rowReverse,
    justifyContent: justifyContent.start,
    alignItems: 'center',
    gap: 8,
  },
  modalBusyText: { color: '#52525B', fontWeight: '600' },
  modalActions: {
    flexDirection: flexDirection.row,
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
