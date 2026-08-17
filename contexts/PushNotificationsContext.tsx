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

export const NOTIFICATIONS_ENABLED_STORAGE_KEY =
  'stampaix.customerNotificationsEnabled';
export const LEGACY_NOTIFICATIONS_ENABLED_STORAGE_KEY =
  'stamprix.customerNotificationsEnabled';
const ANDROID_NOTIFICATION_CHANNEL_ID = 'default';
const ANDROID_NOTIFICATION_CHANNEL_NAME = 'STAMPAIX';

type NotificationsApi = typeof import('expo-notifications');

let notificationsModulePromise: Promise<NotificationsApi | null> | null = null;
let notificationHandlerConfigured = false;

type NotificationPermissionStatus =
  | 'granted'
  | 'denied'
  | 'undetermined'
  | 'unavailable';

type NotificationToggleResult = {
  enabled: boolean;
  permissionStatus: NotificationPermissionStatus;
  registered: boolean;
};

type PushNotificationsContextValue = {
  isEnabled: boolean;
  isLoading: boolean;
  isSyncing: boolean;
  expoPushToken: string | null;
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

function resolvePushPlatform(): 'ios' | 'android' | null {
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

function normalizePermissionStatus(
  status: string
): NotificationPermissionStatus {
  if (status === 'granted') {
    return 'granted';
  }
  if (status === 'denied') {
    return 'denied';
  }
  if (status === 'undetermined') {
    return 'undetermined';
  }
  return 'unavailable';
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

  const [isEnabled, setIsEnabled] = useState(true);
  const [isLoading, setIsLoading] = useState(true);
  const [isSyncing, setIsSyncing] = useState(false);
  const [expoPushToken, setExpoPushToken] = useState<string | null>(null);
  const [isAccountStateReset, setIsAccountStateReset] = useState(false);

  const registeredTokenRef = useRef<string | null>(null);
  const resetForUserIdRef = useRef<string | null>(null);
  const notificationStateGenerationRef = useRef(0);
  const preferenceStorageQueue = useMemo(
    () => createSerializedAsyncOperationQueue(),
    []
  );

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
        if (generation !== notificationStateGenerationRef.current) {
          return;
        }
        await AsyncStorage.removeItem(
          LEGACY_NOTIFICATIONS_ENABLED_STORAGE_KEY
        );
      }),
    [preferenceStorageQueue]
  );

  const disableRegisteredToken = useCallback(async () => {
    const generation = notificationStateGenerationRef.current;
    const isCurrentGeneration = () =>
      generation === notificationStateGenerationRef.current;
    const tokenToDisable = registeredTokenRef.current ?? expoPushToken;
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
    setExpoPushToken(null);
  }, [disableAllMyPushTokens, disablePushToken, expoPushToken]);

  const registerCurrentDevice = useCallback(
    async (
      askPermission: boolean
    ): Promise<{
      permissionStatus: NotificationPermissionStatus;
      registered: boolean;
      token: string | null;
    }> => {
      const stateGeneration = notificationStateGenerationRef.current;
      const isCurrentGeneration = () =>
        stateGeneration === notificationStateGenerationRef.current;
      const pushPlatform = resolvePushPlatform();
      const Notifications = await loadNotificationsModule();
      if (!isCurrentGeneration() || !pushPlatform || !Notifications) {
        return {
          permissionStatus: 'unavailable',
          registered: false,
          token: null,
        };
      }

      try {
        const existingPermissions = await Notifications.getPermissionsAsync();
        if (!isCurrentGeneration()) {
          return {
            permissionStatus: 'unavailable',
            registered: false,
            token: null,
          };
        }
        let permissionStatus = normalizePermissionStatus(
          existingPermissions.status
        );

        if (permissionStatus === 'denied') {
          return {
            permissionStatus,
            registered: false,
            token: null,
          };
        }

        if (permissionStatus === 'undetermined' && askPermission) {
          const requested = await Notifications.requestPermissionsAsync();
          if (!isCurrentGeneration()) {
            return {
              permissionStatus: 'unavailable',
              registered: false,
              token: null,
            };
          }
          permissionStatus = normalizePermissionStatus(requested.status);
        }

        if (permissionStatus !== 'granted') {
          return {
            permissionStatus,
            registered: false,
            token: null,
          };
        }

        const projectId = resolveExpoProjectId();
        if (!projectId) {
          return {
            permissionStatus: 'unavailable',
            registered: false,
            token: null,
          };
        }

        await ensureAndroidNotificationChannel(Notifications);
        if (!isCurrentGeneration()) {
          return {
            permissionStatus: 'unavailable',
            registered: false,
            token: null,
          };
        }

        const tokenResponse = await Notifications.getExpoPushTokenAsync({
          projectId,
        });
        if (!isCurrentGeneration()) {
          return {
            permissionStatus: 'unavailable',
            registered: false,
            token: null,
          };
        }
        const nextToken = tokenResponse.data?.trim() ?? '';

        if (!nextToken) {
          return {
            permissionStatus: 'granted',
            registered: false,
            token: null,
          };
        }

        await registerPushToken({
          token: nextToken,
          platform: pushPlatform,
        });

        if (!isCurrentGeneration()) {
          return {
            permissionStatus: 'granted',
            registered: false,
            token: null,
          };
        }

        if (
          registeredTokenRef.current &&
          registeredTokenRef.current !== nextToken
        ) {
          try {
            await disablePushToken({ token: registeredTokenRef.current });
            if (!isCurrentGeneration()) {
              return {
                permissionStatus: 'unavailable',
                registered: false,
                token: null,
              };
            }
          } catch {
            if (!isCurrentGeneration()) {
              return {
                permissionStatus: 'unavailable',
                registered: false,
                token: null,
              };
            }
            // Keep the current token active even if old-token cleanup fails.
          }
        }

        registeredTokenRef.current = nextToken;
        setExpoPushToken(nextToken);

        return {
          permissionStatus: 'granted',
          registered: true,
          token: nextToken,
        };
      } catch {
        return {
          permissionStatus: 'unavailable',
          registered: false,
          token: null,
        };
      }
    },
    [disablePushToken, registerPushToken]
  );

  const resetNotificationState = useCallback(() => {
    notificationStateGenerationRef.current += 1;
    resetForUserIdRef.current = user ? String(user._id) : null;
    registeredTokenRef.current = null;
    setExpoPushToken(null);
    setIsEnabled(false);
    setIsLoading(false);
    setIsSyncing(false);
    setIsAccountStateReset(true);
  }, [user]);

  const clearDeletedAccountNotificationStorage = useCallback(
    () =>
      preferenceStorageQueue.enqueue(async () => {
        const cleanupResults = await Promise.allSettled([
          AsyncStorage.removeItem(NOTIFICATIONS_ENABLED_STORAGE_KEY),
          AsyncStorage.removeItem(LEGACY_NOTIFICATIONS_ENABLED_STORAGE_KEY),
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
    setIsEnabled(true);
    setIsAccountStateReset(false);
  }, [isAccountStateReset, user]);

  const refreshRegistration =
    useCallback(async (): Promise<NotificationToggleResult> => {
      const generation = notificationStateGenerationRef.current;
      const isCurrentGeneration = () =>
        generation === notificationStateGenerationRef.current;
      if (!user || isAccountStateReset) {
        return {
          enabled: isAccountStateReset ? false : isEnabled,
          permissionStatus: 'unavailable',
          registered: false,
        };
      }

      setIsSyncing(true);
      try {
        if (!isEnabled) {
          await disableRegisteredToken();
          if (!isCurrentGeneration()) {
            return {
              enabled: false,
              permissionStatus: 'unavailable',
              registered: false,
            };
          }
          return {
            enabled: false,
            permissionStatus: 'unavailable',
            registered: false,
          };
        }

        const registration = await registerCurrentDevice(false);
        if (!isCurrentGeneration()) {
          return {
            enabled: false,
            permissionStatus: 'unavailable',
            registered: false,
          };
        }
        return {
          enabled: isEnabled,
          permissionStatus: registration.permissionStatus,
          registered: registration.registered,
        };
      } finally {
        if (isCurrentGeneration()) {
          setIsSyncing(false);
        }
      }
    }, [
      disableRegisteredToken,
      isAccountStateReset,
      isEnabled,
      registerCurrentDevice,
      user,
    ]);

  const setNotificationsEnabled = useCallback(
    async (enabled: boolean): Promise<NotificationToggleResult> => {
      const generation = notificationStateGenerationRef.current;
      const isCurrentGeneration = () =>
        generation === notificationStateGenerationRef.current;
      await persistEnabledFlag(enabled, generation);
      if (!isCurrentGeneration()) {
        return {
          enabled: false,
          permissionStatus: 'unavailable',
          registered: false,
        };
      }
      setIsEnabled(enabled);

      if (!user) {
        return {
          enabled,
          permissionStatus: 'unavailable',
          registered: false,
        };
      }

      setIsSyncing(true);
      try {
        if (!enabled) {
          await disableRegisteredToken();
          if (!isCurrentGeneration()) {
            return {
              enabled: false,
              permissionStatus: 'unavailable',
              registered: false,
            };
          }
          return {
            enabled: false,
            permissionStatus: 'unavailable',
            registered: false,
          };
        }

        const registration = await registerCurrentDevice(true);
        if (!isCurrentGeneration()) {
          return {
            enabled: false,
            permissionStatus: 'unavailable',
            registered: false,
          };
        }
        if (!registration.registered) {
          await persistEnabledFlag(false, generation);
          if (!isCurrentGeneration()) {
            return {
              enabled: false,
              permissionStatus: 'unavailable',
              registered: false,
            };
          }
          setIsEnabled(false);
          return {
            enabled: false,
            permissionStatus: registration.permissionStatus,
            registered: false,
          };
        }

        return {
          enabled: true,
          permissionStatus: registration.permissionStatus,
          registered: true,
        };
      } finally {
        if (isCurrentGeneration()) {
          setIsSyncing(false);
        }
      }
    },
    [disableRegisteredToken, persistEnabledFlag, registerCurrentDevice, user]
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
        readCanonicalPreference: () =>
          AsyncStorage.getItem(NOTIFICATIONS_ENABLED_STORAGE_KEY),
        readLegacyPreference: () =>
          AsyncStorage.getItem(LEGACY_NOTIFICATIONS_ENABLED_STORAGE_KEY),
        writeCanonicalPreference: (value) =>
          AsyncStorage.setItem(NOTIFICATIONS_ENABLED_STORAGE_KEY, value),
        removeLegacyPreference: () =>
          AsyncStorage.removeItem(LEGACY_NOTIFICATIONS_ENABLED_STORAGE_KEY),
        setEnabled: setIsEnabled,
        finishLoading: () => setIsLoading(false),
      })
    );
    void hydrationTask.catch(() => undefined);

    return () => {
      isHydrationActive = false;
    };
  }, [preferenceStorageQueue]);

  useEffect(() => {
    if (isLoading || !user || isAccountStateReset) {
      return;
    }

    void refreshRegistration();
  }, [isAccountStateReset, isLoading, refreshRegistration, user]);

  const value = useMemo(
    () => ({
      isEnabled,
      isLoading,
      isSyncing,
      expoPushToken,
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
