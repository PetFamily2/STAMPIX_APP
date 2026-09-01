import AsyncStorage from '@react-native-async-storage/async-storage';
import { useMutation } from 'convex/react';
import Constants from 'expo-constants';
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import { Platform } from 'react-native';
import { useUser } from '@/contexts/UserContext';
import { api } from '@/convex/_generated/api';
import {
  createSerializedAsyncOperationQueue,
  hydrateNotificationPreference,
} from '@/lib/accountDeletionContextSafety';
import {
  createNotificationOperationCoordinator,
  createNotificationRegistrationResult,
  isNotificationContractEnabled,
  isNotificationStateForSession,
  type NotificationPermissionStatus,
  type NotificationRegistrationResult,
  type NotificationSessionSnapshot,
  type NotificationToggleResult,
  type PushPlatform,
  resolvePermissionForPushRegistration,
} from '@/lib/pushNotificationState';

export const NOTIFICATIONS_ENABLED_STORAGE_KEY =
  'stampaix.customerNotificationsEnabled';
const ANDROID_NOTIFICATION_CHANNEL_ID = 'default';
const ANDROID_NOTIFICATION_CHANNEL_NAME = 'StampAix';

type NotificationsApi = typeof import('expo-notifications');

let notificationsModulePromise: Promise<NotificationsApi | null> | null = null;
let notificationHandlerConfigured = false;

type PushNotificationsContextValue = {
  isEnabled: boolean;
  isLoading: boolean;
  isSyncing: boolean;
  expoPushToken: string | null;
  permissionStatus: NotificationPermissionStatus;
  setNotificationsEnabled: (
    enabled: boolean
  ) => Promise<NotificationToggleResult>;
  refreshRegistration: () => Promise<NotificationToggleResult>;
  resetNotificationState: () => void;
  clearDeletedAccountNotificationStorage: () => Promise<void>;
};

const PushNotificationsContext = createContext<
  PushNotificationsContextValue | undefined
>(undefined);

function resolvePushPlatform(): PushPlatform | null {
  if (Platform.OS === 'ios') {
    return 'ios';
  }
  if (Platform.OS === 'android') {
    return 'android';
  }
  return null;
}

function isUnsupportedPushRuntime() {
  return Constants.appOwnership === 'expo';
}

async function loadNotificationsModule() {
  if (isUnsupportedPushRuntime()) {
    return null;
  }

  notificationsModulePromise ??= import('expo-notifications')
    .then((notificationsModule) => {
      if (!notificationHandlerConfigured) {
        notificationsModule.setNotificationHandler({
          handleNotification: async () => ({
            shouldShowBanner: true,
            shouldShowList: true,
            shouldPlaySound: true,
            shouldSetBadge: false,
          }),
        });
        notificationHandlerConfigured = true;
      }

      return notificationsModule;
    })
    .catch(() => null);

  return notificationsModulePromise;
}

async function ensureAndroidNotificationChannel(Notifications: NotificationsApi) {
  if (Platform.OS !== 'android') {
    return;
  }

  await Notifications.setNotificationChannelAsync(
    ANDROID_NOTIFICATION_CHANNEL_ID,
    {
      name: ANDROID_NOTIFICATION_CHANNEL_NAME,
      importance: Notifications.AndroidImportance.DEFAULT,
    }
  );
}

function resolveExpoProjectId() {
  const fromEas = Constants.easConfig?.projectId;
  if (typeof fromEas === 'string' && fromEas.trim().length > 0) {
    return fromEas.trim();
  }

  const fromExpoConfig = (
    Constants.expoConfig?.extra as Record<string, unknown> | null
  )?.eas;
  if (
    fromExpoConfig &&
    typeof fromExpoConfig === 'object' &&
    typeof (fromExpoConfig as { projectId?: unknown }).projectId === 'string'
  ) {
    return ((fromExpoConfig as { projectId: string }).projectId ?? '').trim();
  }

  return undefined;
}

export function PushNotificationsProvider({
  children,
}: {
  children: React.ReactNode;
}) {
  const registerPushToken = useMutation(
    api.pushNotifications.registerPushToken
  );
  const disablePushToken = useMutation(api.pushNotifications.disablePushToken);
  const disableAllMyPushTokens = useMutation(
    api.pushNotifications.disableAllMyPushTokens
  );
  const { user } = useUser();
  const authenticatedUserId = user ? String(user._id) : null;

  const [isEnabled, setIsEnabled] = useState(false);
  const [permissionStatus, setPermissionStatus] =
    useState<NotificationPermissionStatus>('unavailable');
  const [isLoading, setIsLoading] = useState(true);
  const [isSyncing, setIsSyncing] = useState(false);
  const [expoPushToken, setExpoPushToken] = useState<string | null>(null);
  const [
    notificationStateSessionGeneration,
    setNotificationStateSessionGeneration,
  ] = useState<number | null>(null);
  const [isAccountStateReset, setIsAccountStateReset] = useState(false);

  const registeredTokenRef = useRef<string | null>(null);
  const registeredTokenSessionGenerationRef = useRef<number | null>(null);
  const resetForUserIdRef = useRef<string | null>(null);
  const notificationStateGenerationRef = useRef(0);
  const pendingPushOperationCountRef = useRef(0);
  const notificationOperations = useMemo(
    () => createNotificationOperationCoordinator(true),
    []
  );
  const activeSessionSnapshot = useMemo(
    () => notificationOperations.updateSession(authenticatedUserId),
    [authenticatedUserId, notificationOperations]
  );
  const preferenceStorageQueue = useMemo(
    () => createSerializedAsyncOperationQueue(),
    []
  );

  useEffect(() => {
    registeredTokenRef.current = null;
    registeredTokenSessionGenerationRef.current = null;
    setExpoPushToken(null);
    setIsEnabled(false);
    setPermissionStatus('unavailable');
    setIsSyncing(false);
    setNotificationStateSessionGeneration(activeSessionSnapshot.generation);
  }, [activeSessionSnapshot.generation]);

  useEffect(() => {
    void loadNotificationsModule();
  }, []);

  const persistEnabledFlag = useCallback(
    (enabled: boolean, generation: number) =>
      preferenceStorageQueue.enqueue(async () => {
        if (generation !== notificationStateGenerationRef.current) {
          return;
        }
        await AsyncStorage.setItem(
          NOTIFICATIONS_ENABLED_STORAGE_KEY,
          enabled ? '1' : '0'
        );
      }),
    [preferenceStorageQueue]
  );

  const disableRegisteredToken = useCallback(
    async (operationSession: NotificationSessionSnapshot) => {
      const generation = notificationStateGenerationRef.current;
      const isCurrentGeneration = () =>
        generation === notificationStateGenerationRef.current &&
        notificationOperations.isSessionSnapshotCurrent(operationSession);
      const tokenToDisable =
        registeredTokenSessionGenerationRef.current ===
        operationSession.generation
          ? registeredTokenRef.current
          : null;
      if (tokenToDisable) {
        try {
          await disablePushToken({ token: tokenToDisable });
          if (!isCurrentGeneration()) {
            return;
          }
        } catch {
          if (!isCurrentGeneration()) {
            return;
          }
          // Fall back to disabling all active tokens.
        }
      }
      await disableAllMyPushTokens({});
      if (!isCurrentGeneration()) {
        return;
      }
      registeredTokenRef.current = null;
      registeredTokenSessionGenerationRef.current = null;
      setExpoPushToken(null);
    },
    [disableAllMyPushTokens, disablePushToken, notificationOperations]
  );

  const registerCurrentDevice = useCallback(
    async (
      askPermission: boolean,
      operationSession: NotificationSessionSnapshot
    ): Promise<NotificationRegistrationResult> => {
      const stateGeneration = notificationStateGenerationRef.current;
      const isCurrentGeneration = () =>
        stateGeneration === notificationStateGenerationRef.current &&
        notificationOperations.isSessionSnapshotCurrent(operationSession);
      const pushPlatform = resolvePushPlatform();
      const Notifications = await loadNotificationsModule();
      if (!isCurrentGeneration() || !pushPlatform || !Notifications) {
        return createNotificationRegistrationResult({
          permissionStatus: 'unavailable',
          registered: false,
          token: null,
        });
      }

      let currentPermissionStatus: NotificationPermissionStatus = 'unavailable';
      try {
        currentPermissionStatus = await resolvePermissionForPushRegistration({
          platform: pushPlatform,
          askPermission,
          ensureAndroidChannel: () =>
            ensureAndroidNotificationChannel(Notifications),
          getPermissions: () => Notifications.getPermissionsAsync(),
          requestPermissions: () => Notifications.requestPermissionsAsync(),
        });
        if (!isCurrentGeneration()) {
          return createNotificationRegistrationResult({
            permissionStatus: 'unavailable',
            registered: false,
            token: null,
          });
        }

        if (currentPermissionStatus !== 'granted') {
          return createNotificationRegistrationResult({
            permissionStatus: currentPermissionStatus,
            registered: false,
            token: null,
          });
        }

        const projectId = resolveExpoProjectId();
        if (!projectId) {
          return createNotificationRegistrationResult({
            permissionStatus: currentPermissionStatus,
            registered: false,
            token: null,
          });
        }

        const tokenResponse = await Notifications.getExpoPushTokenAsync({
          projectId,
        });
        if (!isCurrentGeneration()) {
          return createNotificationRegistrationResult({
            permissionStatus: 'unavailable',
            registered: false,
            token: null,
          });
        }
        const nextToken = tokenResponse.data?.trim() ?? '';

        if (!nextToken) {
          return createNotificationRegistrationResult({
            permissionStatus: currentPermissionStatus,
            registered: false,
            token: null,
          });
        }

        await registerPushToken({
          token: nextToken,
          platform: pushPlatform,
        });

        if (!isCurrentGeneration()) {
          return createNotificationRegistrationResult({
            permissionStatus: 'granted',
            registered: false,
            token: null,
          });
        }

        const previousRegisteredToken =
          registeredTokenSessionGenerationRef.current ===
          operationSession.generation
            ? registeredTokenRef.current
            : null;
        if (
          previousRegisteredToken &&
          previousRegisteredToken !== nextToken
        ) {
          try {
            await disablePushToken({ token: previousRegisteredToken });
            if (!isCurrentGeneration()) {
              return createNotificationRegistrationResult({
                permissionStatus: 'unavailable',
                registered: false,
                token: null,
              });
            }
          } catch {
            if (!isCurrentGeneration()) {
              return createNotificationRegistrationResult({
                permissionStatus: 'unavailable',
                registered: false,
                token: null,
              });
            }
            // Keep the current token active even if old-token cleanup fails.
          }
        }

        registeredTokenRef.current = nextToken;
        registeredTokenSessionGenerationRef.current =
          operationSession.generation;
        return createNotificationRegistrationResult({
          permissionStatus: currentPermissionStatus,
          registered: true,
          token: nextToken,
        });
      } catch {
        return createNotificationRegistrationResult({
          permissionStatus: currentPermissionStatus,
          registered: false,
          token: null,
        });
      }
    },
    [disablePushToken, notificationOperations, registerPushToken]
  );

  const applyRegistrationResult = useCallback(
    (
      registration: NotificationRegistrationResult,
      nextPreferenceEnabled: boolean,
      operationSession: NotificationSessionSnapshot
    ) => {
      if (!notificationOperations.isSessionSnapshotCurrent(operationSession)) {
        return false;
      }
      setPermissionStatus(registration.permissionStatus);
      setExpoPushToken(registration.token);
      setNotificationStateSessionGeneration(operationSession.generation);
      const nextEnabled = isNotificationContractEnabled({
        preferenceEnabled: nextPreferenceEnabled,
        permissionStatus: registration.permissionStatus,
        registered: registration.registered,
        token: registration.token,
      });
      setIsEnabled(nextEnabled);
      return nextEnabled;
    },
    [notificationOperations]
  );

  const resetNotificationState = useCallback(() => {
    notificationStateGenerationRef.current += 1;
    resetForUserIdRef.current = user ? String(user._id) : null;
    registeredTokenRef.current = null;
    registeredTokenSessionGenerationRef.current = null;
    setExpoPushToken(null);
    setNotificationStateSessionGeneration(null);
    setIsEnabled(false);
    notificationOperations.updatePreference(false);
    setPermissionStatus('unavailable');
    setIsLoading(false);
    setIsSyncing(false);
    setIsAccountStateReset(true);
  }, [notificationOperations, user]);

  const clearDeletedAccountNotificationStorage = useCallback(
    () =>
      preferenceStorageQueue.enqueue(async () => {
        const cleanupResults = await Promise.allSettled([
          AsyncStorage.removeItem(NOTIFICATIONS_ENABLED_STORAGE_KEY),
        ]);
        if (cleanupResults.some((result) => result.status === 'rejected')) {
          throw new Error('NOTIFICATION_PREFERENCE_CLEANUP_FAILED');
        }
      }),
    [preferenceStorageQueue]
  );

  useEffect(() => {
    const currentUserId = user ? String(user._id) : null;
    if (
      !isAccountStateReset ||
      !currentUserId ||
      currentUserId === resetForUserIdRef.current
    ) {
      return;
    }

    resetForUserIdRef.current = null;
    notificationOperations.updatePreference(true);
    setPermissionStatus('unavailable');
    setIsEnabled(false);
    setIsAccountStateReset(false);
  }, [isAccountStateReset, notificationOperations, user]);

  const refreshRegistration =
    useCallback(async (): Promise<NotificationToggleResult> => {
      const generation = notificationStateGenerationRef.current;
      const operationSession = activeSessionSnapshot;
      const isCurrentGeneration = () =>
        generation === notificationStateGenerationRef.current &&
        notificationOperations.isSessionSnapshotCurrent(operationSession);
      if (!user || isAccountStateReset) {
        return {
          enabled: false,
          permissionStatus: 'unavailable',
          registered: false,
          failure: 'technical',
        };
      }

      const preferenceSnapshot =
        notificationOperations.getPreferenceSnapshot();
      pendingPushOperationCountRef.current += 1;
      setIsSyncing(true);
      try {
        return await notificationOperations.enqueueRefresh(
          operationSession,
          async (): Promise<NotificationToggleResult> => {
            if (
              !isCurrentGeneration() ||
              !notificationOperations.isPreferenceSnapshotCurrent(
                preferenceSnapshot
              )
            ) {
              return {
                enabled: false,
                permissionStatus: 'unavailable',
                registered: false,
                failure: null,
              };
            }

            if (!preferenceSnapshot.enabled) {
              await disableRegisteredToken(operationSession);
              if (
                isCurrentGeneration() &&
                notificationOperations.isPreferenceSnapshotCurrent(
                  preferenceSnapshot
                )
              ) {
                setPermissionStatus('unavailable');
                setIsEnabled(false);
              }
              return {
                enabled: false,
                permissionStatus: 'unavailable',
                registered: false,
                failure: null,
              };
            }

            const registration = await registerCurrentDevice(
              false,
              operationSession
            );
            if (
              !isCurrentGeneration() ||
              !notificationOperations.isPreferenceSnapshotCurrent(
                preferenceSnapshot
              )
            ) {
              return {
                enabled: false,
                permissionStatus: registration.permissionStatus,
                registered: false,
                failure: null,
              };
            }
            const enabled = applyRegistrationResult(
              registration,
              preferenceSnapshot.enabled,
              operationSession
            );
            return {
              enabled,
              permissionStatus: registration.permissionStatus,
              registered: registration.registered,
              failure: registration.failure,
            };
          }
        );
      } finally {
        pendingPushOperationCountRef.current = Math.max(
          0,
          pendingPushOperationCountRef.current - 1
        );
        if (pendingPushOperationCountRef.current === 0) {
          if (isCurrentGeneration()) {
            setIsSyncing(false);
          }
        }
      }
    }, [
      activeSessionSnapshot,
      applyRegistrationResult,
      disableRegisteredToken,
      isAccountStateReset,
      notificationOperations,
      registerCurrentDevice,
      user,
    ]);

  const setNotificationsEnabled = useCallback(
    async (enabled: boolean): Promise<NotificationToggleResult> => {
      const generation = notificationStateGenerationRef.current;
      const operationSession = activeSessionSnapshot;
      const isCurrentGeneration = () =>
        generation === notificationStateGenerationRef.current &&
        notificationOperations.isSessionSnapshotCurrent(operationSession);
      const preferenceSnapshot =
        notificationOperations.updatePreference(enabled);
      setIsEnabled(false);
      setNotificationStateSessionGeneration(operationSession.generation);
      pendingPushOperationCountRef.current += 1;
      setIsSyncing(true);
      try {
        return await notificationOperations.enqueue(
          async (): Promise<NotificationToggleResult> => {
            if (!isCurrentGeneration()) {
              return {
                enabled: false,
                permissionStatus: 'unavailable',
                registered: false,
                failure: null,
              };
            }
            await persistEnabledFlag(enabled, generation);
            if (!isCurrentGeneration()) {
              return {
                enabled: false,
                permissionStatus: 'unavailable',
                registered: false,
                failure: null,
              };
            }

            if (!user) {
              return {
                enabled: false,
                permissionStatus: 'unavailable',
                registered: false,
                failure: 'technical',
              };
            }

            if (!enabled) {
              if (!isCurrentGeneration()) {
                return {
                  enabled: false,
                  permissionStatus: 'unavailable',
                  registered: false,
                  failure: null,
                };
              }
              await disableRegisteredToken(operationSession);
              if (
                isCurrentGeneration() &&
                notificationOperations.isPreferenceSnapshotCurrent(
                  preferenceSnapshot
                )
              ) {
                setPermissionStatus('unavailable');
                setExpoPushToken(null);
                setIsEnabled(false);
              }
              return {
                enabled: false,
                permissionStatus: 'unavailable',
                registered: false,
                failure: null,
              };
            }

            if (
              !isCurrentGeneration() ||
              !notificationOperations.isPreferenceSnapshotCurrent(
                preferenceSnapshot
              )
            ) {
              return {
                enabled: false,
                permissionStatus: 'unavailable',
                registered: false,
                failure: null,
              };
            }

            const registration = await registerCurrentDevice(
              true,
              operationSession
            );
            if (
              !isCurrentGeneration() ||
              !notificationOperations.isPreferenceSnapshotCurrent(
                preferenceSnapshot
              )
            ) {
              return {
                enabled: false,
                permissionStatus: registration.permissionStatus,
                registered: false,
                failure: null,
              };
            }
            const nextEnabled = applyRegistrationResult(
              registration,
              enabled,
              operationSession
            );
            return {
              enabled: nextEnabled,
              permissionStatus: registration.permissionStatus,
              registered: registration.registered,
              failure: registration.failure,
            };
          }
        );
      } catch (error) {
        if (
          !isCurrentGeneration() ||
          !notificationOperations.isPreferenceSnapshotCurrent(
            preferenceSnapshot
          )
        ) {
          return {
            enabled: false,
            permissionStatus: 'unavailable',
            registered: false,
            failure: null,
          };
        }
        throw error;
      } finally {
        pendingPushOperationCountRef.current = Math.max(
          0,
          pendingPushOperationCountRef.current - 1
        );
        if (pendingPushOperationCountRef.current === 0) {
          if (isCurrentGeneration()) {
            setIsSyncing(false);
          }
        }
      }
    },
    [
      activeSessionSnapshot,
      applyRegistrationResult,
      disableRegisteredToken,
      notificationOperations,
      persistEnabledFlag,
      registerCurrentDevice,
      user,
    ]
  );

  useEffect(() => {
    const generation = notificationStateGenerationRef.current;
    let isHydrationActive = true;

    const hydrationTask = preferenceStorageQueue.enqueue(() =>
      hydrateNotificationPreference({
        generation,
        getCurrentGeneration: () =>
          isHydrationActive
            ? notificationStateGenerationRef.current
            : Number.NaN,
        readPreference: () =>
          AsyncStorage.getItem(NOTIFICATIONS_ENABLED_STORAGE_KEY),
        setEnabled: (enabled) => {
          notificationOperations.updatePreference(enabled);
          if (!enabled) {
            setIsEnabled(false);
          }
        },
        finishLoading: () => setIsLoading(false),
      })
    );
    void hydrationTask.catch(() => undefined);

    return () => {
      isHydrationActive = false;
    };
  }, [notificationOperations, preferenceStorageQueue]);

  useEffect(() => {
    if (isLoading || !user || isAccountStateReset) {
      return;
    }

    void refreshRegistration().catch(() => undefined);
  }, [isAccountStateReset, isLoading, refreshRegistration, user]);

  const notificationStateIsForActiveSession = isNotificationStateForSession(
    notificationStateSessionGeneration,
    activeSessionSnapshot
  );

  const value = useMemo(
    () => ({
      isEnabled: notificationStateIsForActiveSession ? isEnabled : false,
      isLoading,
      isSyncing,
      expoPushToken: notificationStateIsForActiveSession
        ? expoPushToken
        : null,
      permissionStatus: notificationStateIsForActiveSession
        ? permissionStatus
        : 'unavailable',
      setNotificationsEnabled,
      refreshRegistration,
      resetNotificationState,
      clearDeletedAccountNotificationStorage,
    }),
    [
      expoPushToken,
      clearDeletedAccountNotificationStorage,
      isEnabled,
      isLoading,
      isSyncing,
      notificationStateIsForActiveSession,
      permissionStatus,
      refreshRegistration,
      resetNotificationState,
      setNotificationsEnabled,
    ]
  );

  return (
    <PushNotificationsContext.Provider value={value}>
      {children}
    </PushNotificationsContext.Provider>
  );
}

export function usePushNotifications() {
  const context = useContext(PushNotificationsContext);
  if (!context) {
    throw new Error(
      'usePushNotifications must be used within PushNotificationsProvider'
    );
  }
  return context;
}
