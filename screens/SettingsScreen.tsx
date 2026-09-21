import { useAuthActions } from '@convex-dev/auth/react';
import { Ionicons } from '@expo/vector-icons';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useBottomTabBarHeight } from '@react-navigation/bottom-tabs';
import { useMutation } from 'convex/react';
import {
  router,
  useFocusEffect,
  useLocalSearchParams,
  useSegments,
} from 'expo-router';
import * as SecureStore from 'expo-secure-store';
import { useCallback, useEffect, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  AppState,
  Linking,
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
import {
  SETTINGS_TOKENS,
  SettingsDangerSection,
  SettingsGroup,
  SettingsNavRow,
  SettingsSection,
} from '@/components/business-settings';
import BusinessModeCtaCard from '@/components/customer/BusinessModeCtaCard';
import StickyScrollHeader from '@/components/StickyScrollHeader';
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
  type NotificationRegistrationFailure,
  resolveNotificationFailurePresentation,
} from '@/lib/pushNotificationState';
import {
  flexDirection,
  justifyContent,
  rtlBaseView,
  selfEnd,
  selfStart,
} from '@/lib/rtl';

const REMEMBERED_EMAIL_STORAGE_KEY = 'remembered_email';
const SCANNER_LAST_PROGRAM_STORAGE_PREFIX = 'scanner:lastProgram:';

type LegalDocumentKey = 'privacy' | 'terms' | 'deletion';

const TEXT = {
  quickWalletTitle: 'הארנק',
  quickWalletSubtitle: 'כרטיסיות ונקודות',
  quickRewardsTitle: 'הטבות',
  quickRewardsSubtitle: 'קופונים ומימושים',
  quickNew: 'חדש',
  sectionPreferences: 'העדפות',
  accountSettingsTitle: 'פרטי חשבון',
  accountSettingsSubtitle: 'שם ואימייל',
  notificationsToggleTitle: 'התראות',
  notificationsToggleSubtitle: 'עדכונים והטבות',
  marketingToggleTitle: 'דיוור שיווקי',
  marketingToggleSubtitle:
    'קמפיינים בתוך האפליקציה ובהתראות מכל עסק שהצטרפת אליו',
  sectionSupport: 'תמיכה ומסמכים',
  helpTitle: 'עזרה ותמיכה',
  helpSubtitle: 'שאלות ופנייה',
  termsTitle: 'תנאי שימוש',
  privacyTitle: 'מדיניות פרטיות',
  accountDeletionPolicyTitle: 'מדיניות מחיקת חשבון',
  sectionAccount: 'חשבון',
  logoutTitle: 'יציאה מהחשבון',
  logoutConfirmTitle: 'אישור יציאה',
  logoutConfirmMessage: 'האם אתם בטוחים שברצונכם להתנתק מהחשבון?',
  logoutConfirmAction: 'יציאה מהחשבון',
  deleteTitle: 'מחיקת חשבון',
  deleteSubtitle: 'פעולה בלתי הפיכה',
  footerNote: 'StampAix',
  helpCenterText: 'צריכים עזרה? פנו אלינו דרך מרכז התמיכה באפליקציה',
  notificationsSaveFailed: 'לא הצלחנו לשמור את העדפת ההתראות נסו שוב',
  marketingSaveFailed: 'לא הצלחנו לשמור את העדפת הדיוור נסו שוב',
  notificationsPermissionTitle: 'הרשאת התראות נדרשת',
  notificationsPermissionMessage:
    'כדי לקבל התראות, אשרו התראות בהגדרות המכשיר.',
  notificationsPermissionDeniedMessage:
    'הרשאת ההתראות לא אושרה. אפשר לנסות שוב כשתרצו.',
  notificationsTechnicalFailure:
    'לא הצלחנו להפעיל את ההתראות כרגע. נסו שוב מאוחר יותר.',
  openSettings: 'פתח הגדרות',
  switchModeFailed: 'לא הצלחנו לעדכן מצב משתמש נסו שוב',
  staffScannerAction: 'סריקה',
  staffBusinessesTitle: 'העסקים שלי',
  logoutFailed: 'לא הצלחנו לבצע יציאה נסו שוב',
  deleteModalTitle: 'מחיקת חשבון',
  deleteModalWarning:
    'הפעולה תמחק לצמיתות את החשבון האישי, הכרטיסיות, ההעדפות והמידע המשויך אליו. מידע שחובה לשמור לפי דין, לצורכי חיוב, אבטחה או מניעת הונאה עשוי להישמר באופן מצומצם. אם החשבון הוא הבעלים היחיד של עסק פעיל או סגור, יהיה צורך להסדיר תחילה את הבעלות. אי אפשר לבטל את המחיקה לאחר השלמתה.',
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
  deleteSuccessMessage:
    'החשבון והנתונים שניתן למחוק הוסרו. מידע שחובה לשמור לפי דין עשוי להישמר בהתאם למדיניות הפרטיות.',
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

function formatStaffBusinessTitle(businessName: string) {
  const name = businessName.trim();
  return name.length > 0 ? `מעבר ל${name}` : 'מעבר לעסק';
}

function showNotificationEnableFailure(
  failure: NotificationRegistrationFailure | null
) {
  const presentation = resolveNotificationFailurePresentation(failure);
  if (!presentation) {
    return;
  }

  if (presentation === 'permission-settings-required') {
    Alert.alert(
      TEXT.notificationsPermissionTitle,
      TEXT.notificationsPermissionMessage,
      [
        { text: TEXT.cancel, style: 'cancel' },
        {
          text: TEXT.openSettings,
          onPress: () => {
            void Linking.openSettings();
          },
        },
      ]
    );
    return;
  }

  if (presentation === 'permission-denied') {
    Alert.alert(
      TEXT.notificationsPermissionTitle,
      TEXT.notificationsPermissionDeniedMessage
    );
    return;
  }

  Alert.alert(TEXT.errorTitle, TEXT.notificationsTechnicalFailure);
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
  void failedStepNames;
}

function NotificationToggleRow({
  title,
  subtitle,
  enabled,
  disabled,
  onPress,
  isLast = false,
}: {
  title: string;
  subtitle: string;
  enabled: boolean;
  disabled?: boolean;
  onPress: () => void;
  isLast?: boolean;
}) {
  return (
    <Pressable
      onPress={onPress}
      disabled={disabled}
      accessibilityRole="switch"
      accessibilityLabel={title}
      accessibilityHint={subtitle}
      accessibilityState={{ checked: enabled, disabled }}
      style={({ pressed }) => [
        styles.notificationToggleRow,
        isLast ? styles.rowLast : null,
        pressed ? styles.pressed : null,
        disabled ? styles.disabled : null,
      ]}
    >
      <View style={styles.notificationToggleInner}>
        <View style={styles.notificationToggleIconShell}>
          <Ionicons
            name="notifications-outline"
            size={18}
            color={SETTINGS_TOKENS.accentText}
          />
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
  const { isSwitchingBusiness, resetActiveBusinessState, setActiveBusinessId } =
    useActiveBusiness();
  const {
    clearDeletedAccountNotificationStorage,
    isEnabled: notificationsEnabled,
    isLoading: notificationsLoading,
    isSyncing: notificationsSyncing,
    refreshRegistration,
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
  const refreshNotificationRegistrationRef = useRef(refreshRegistration);

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
    refreshNotificationRegistrationRef.current = refreshRegistration;
  }, [refreshRegistration]);

  useFocusEffect(
    useCallback(() => {
      if (notificationsLoading) {
        return;
      }
      const refresh = () => {
        void refreshNotificationRegistrationRef
          .current()
          .catch(() => undefined);
      };
      refresh();

      const appStateSubscription = AppState.addEventListener(
        'change',
        (nextState) => {
          if (nextState === 'active') {
            refresh();
          }
        }
      );
      return () => {
        appStateSubscription.remove();
      };
    }, [notificationsLoading])
  );

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
      TEXT.deleteSuccessMessage,
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
        showNotificationEnableFailure(result.failure);
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
        source: 'settings',
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
      <ScrollView
        style={styles.scrollArea}
        stickyHeaderIndices={[0]}
        contentContainerStyle={[
          styles.scrollContent,
          {
            paddingBottom: tabBarHeight + 24,
          },
        ]}
      >
        <StickyScrollHeader
          topPadding={(insets.top || 0) + 12}
          backgroundColor="#E9F0FF"
          style={styles.headerRow}
        >
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
        </StickyScrollHeader>
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
            accessibilityRole="button"
            accessibilityLabel={formatStaffBusinessTitle(
              singleStaffBusiness.name
            )}
            style={({ pressed }) => [
              styles.staffPrimaryButton,
              pressed ? styles.pressed : null,
              deleteBusy || staffBusinessBusyId || isSwitchingBusiness
                ? styles.disabled
                : null,
            ]}
          >
            {staffBusinessBusyId === String(singleStaffBusiness.id) ? (
              <ActivityIndicator color="#FFFFFF" />
            ) : (
              <Text style={styles.staffPrimaryButtonText}>
                {formatStaffBusinessTitle(singleStaffBusiness.name)}
              </Text>
            )}
          </Pressable>
        ) : null}
        {staffBusinesses.length > 1 ? (
          <SettingsSection title={TEXT.staffBusinessesTitle}>
            <SettingsGroup>
              {staffBusinesses.map((business, index) => (
                <SettingsNavRow
                  key={String(business.id)}
                  title={formatStaffBusinessTitle(business.name)}
                  icon="qr-code-outline"
                  disabled={
                    deleteBusy ||
                    Boolean(staffBusinessBusyId) ||
                    isSwitchingBusiness
                  }
                  isLast={index === staffBusinesses.length - 1}
                  onPress={() => {
                    void openStaffBusinessScanner(business);
                  }}
                  trailing={
                    staffBusinessBusyId === String(business.id) ? (
                      <ActivityIndicator color="#2F6BFF" />
                    ) : (
                      <View style={styles.staffRowActionPill}>
                        <Text style={styles.staffRowActionPillText}>
                          {TEXT.staffScannerAction}
                        </Text>
                      </View>
                    )
                  }
                  showChevron={false}
                />
              ))}
            </SettingsGroup>
          </SettingsSection>
        ) : null}
        <SettingsSection title={TEXT.sectionPreferences}>
          <SettingsGroup>
            <SettingsNavRow
              title={TEXT.accountSettingsTitle}
              subtitle={TEXT.accountSettingsSubtitle}
              icon="settings-outline"
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
              isLast={true}
            />
          </SettingsGroup>
        </SettingsSection>

        <SettingsSection title={TEXT.sectionSupport}>
          <SettingsGroup>
            <SettingsNavRow
              title={TEXT.helpTitle}
              subtitle={TEXT.helpSubtitle}
              icon="help-circle-outline"
              onPress={openHelpCenter}
            />
            <SettingsNavRow
              title={TEXT.termsTitle}
              icon="document-text-outline"
              onPress={openTermsOfService}
            />
            <SettingsNavRow
              title={TEXT.privacyTitle}
              icon="shield-checkmark-outline"
              onPress={openPrivacyPolicy}
            />
            <SettingsNavRow
              title={TEXT.accountDeletionPolicyTitle}
              icon="information-circle-outline"
              onPress={openAccountDeletionPolicy}
              isLast={true}
            />
          </SettingsGroup>
        </SettingsSection>

        <SettingsSection title={TEXT.sectionAccount}>
          <SettingsGroup>
            <SettingsNavRow
              title={TEXT.logoutTitle}
              icon="log-out-outline"
              disabled={isActionBusy}
              onPress={confirmLogout}
              isLast={true}
            />
          </SettingsGroup>
        </SettingsSection>

        <SettingsDangerSection
          title={TEXT.deleteTitle}
          description={TEXT.deleteSubtitle}
        >
          <SettingsNavRow
            title={TEXT.deletePermanent}
            icon="trash-outline"
            destructive={true}
            disabled={isActionBusy}
            onPress={openDeleteModal}
            isLast={true}
          />
        </SettingsDangerSection>

        <Text style={styles.footerNote}>{TEXT.footerNote}</Text>
      </ScrollView>

      <Modal
        transparent={true}
        visible={deleteModalVisible}
        animationType="fade"
        onRequestClose={closeDeleteModal}
      >
        <View style={styles.modalBackdrop}>
          <View accessibilityViewIsModal={true} style={styles.modalCard}>
            <Text style={styles.modalTitle}>{TEXT.deleteModalTitle}</Text>

            {deleteStep === 1 ? (
              <Text style={styles.modalText}>{TEXT.deleteModalWarning}</Text>
            ) : (
              <View style={styles.modalInputBlock}>
                <Text style={styles.modalText}>
                  {TEXT.deleteModalConfirmHint}
                </Text>
                <TextInput
                  accessibilityLabel={TEXT.deleteModalConfirmHint}
                  accessibilityHint="יש להקליד DELETE באותיות באנגלית"
                  autoFocus={true}
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
                accessibilityRole="button"
                accessibilityLabel={TEXT.cancel}
                accessibilityState={{ disabled: deleteBusy }}
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
                  accessibilityRole="button"
                  accessibilityLabel={TEXT.confirmDelete}
                  accessibilityState={{ disabled: deleteBusy }}
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
                  accessibilityRole="button"
                  accessibilityLabel={TEXT.deletePermanent}
                  accessibilityState={{ disabled: isDeleteFinalDisabled }}
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
  scrollArea: { flex: 1 },
  scrollContent: {
    paddingHorizontal: 20,
    gap: SETTINGS_TOKENS.sectionGap,
    width: '100%',
    maxWidth: 720,
    alignSelf: 'center',
  },
  pressed: { opacity: 0.88 },
  disabled: { opacity: 0.6 },

  headerRow: {
    alignItems: 'stretch',
    paddingBottom: 10,
  },
  staffPrimaryButton: {
    alignSelf: 'stretch',
    minHeight: 52,
    borderRadius: 999,
    backgroundColor: '#2F6BFF',
    paddingHorizontal: 20,
    alignItems: 'center',
    justifyContent: 'center',
  },
  staffPrimaryButtonText: {
    fontSize: 16,
    lineHeight: 22,
    fontWeight: '700',
    color: '#FFFFFF',
    textAlign: 'center',
    writingDirection: 'rtl',
  },
  staffRowActionPill: {
    minHeight: 32,
    borderRadius: 999,
    backgroundColor: '#2F6BFF',
    paddingHorizontal: 12,
    alignItems: 'center',
    justifyContent: 'center',
  },
  staffRowActionPillText: {
    fontSize: 12,
    fontWeight: '700',
    color: '#FFFFFF',
    textAlign: 'center',
    writingDirection: 'rtl',
  },
  pageTitle: {
    textAlign: 'right',
    fontSize: 24,
    lineHeight: 29,
    fontWeight: '900',
    color: '#171717',
  },

  notificationToggleRow: {
    minHeight: SETTINGS_TOKENS.rowMinHeight,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: SETTINGS_TOKENS.border,
    paddingHorizontal: 16,
    paddingVertical: 12,
    alignItems: 'stretch',
  },
  notificationToggleInner: {
    flexDirection: flexDirection.row,
    alignItems: 'center',
    gap: 12,
    ...rtlBaseView,
  },
  notificationToggleIconShell: {
    width: 36,
    height: 36,
    borderRadius: 12,
    backgroundColor: SETTINGS_TOKENS.accentSoft,
    alignItems: 'center',
    justifyContent: 'center',
  },
  notificationToggleTextWrap: {
    flex: 1,
    minWidth: 0,
    alignItems: 'stretch',
  },
  notificationToggleTitle: {
    fontSize: 16,
    lineHeight: 22,
    fontWeight: '600',
    color: SETTINGS_TOKENS.textPrimary,
    textAlign: 'right',
    writingDirection: 'rtl',
  },
  notificationToggleSubtitle: {
    marginTop: 3,
    fontSize: 12,
    lineHeight: 17,
    fontWeight: '400',
    color: SETTINGS_TOKENS.textSecondary,
    textAlign: 'right',
    writingDirection: 'rtl',
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
  rowLast: {
    borderBottomWidth: 0,
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
    borderRadius: 999,
    borderWidth: 1,
    borderColor: '#D4D4D8',
    paddingVertical: 12,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#FFFFFF',
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
