import AsyncStorage from '@react-native-async-storage/async-storage';
import { useMutation } from 'convex/react';
import Constants from 'expo-constants';
import * as Notifications from 'expo-notifications';
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

export const NOTIFICATIONS_ENABLED_STORAGE_KEY =
  'stampaix.customerNotificationsEnabled';
export const LEGACY_NOTIFICATIONS_ENABLED_STORAGE_KEY =
  'stamprix.customerNotificationsEnabled';

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

function normalizePermissionStatus(
  status: Notifications.PermissionStatus
): NotificationPermissionStatus {
  if (status === Notifications.PermissionStatus.GRANTED) {
    return 'granted';
  }
  if (status === Notifications.PermissionStatus.DENIED) {
    return 'denied';
  }
  if (status === Notifications.PermissionStatus.UNDETERMINED) {
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

  const registeredTokenRef = useRef<string | null>(null);

  const persistEnabledFlag = useCallback(async (enabled: boolean) => {
    await AsyncStorage.setItem(
      NOTIFICATIONS_ENABLED_STORAGE_KEY,
      enabled ? '1' : '0'
    );
    await AsyncStorage.removeItem(LEGACY_NOTIFICATIONS_ENABLED_STORAGE_KEY);
  }, []);

  const disableRegisteredToken = useCallback(async () => {
    const tokenToDisable = registeredTokenRef.current ?? expoPushToken;
    if (tokenToDisable) {
      try {
        await disablePushToken({ token: tokenToDisable });
      } catch {
        // Fall back to disabling all active tokens.
      }
    }
    await disableAllMyPushTokens({});
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
      const pushPlatform = resolvePushPlatform();
      if (!pushPlatform) {
        return {
          permissionStatus: 'unavailable',
          registered: false,
          token: null,
        };
      }

      try {
        const existingPermissions = await Notifications.getPermissionsAsync();
        let permissionStatus = normalizePermissionStatus(
          existingPermissions.status
        );

        if (permissionStatus !== 'granted' && askPermission) {
          const requested = await Notifications.requestPermissionsAsync();
          permissionStatus = normalizePermissionStatus(requested.status);
        }

        if (permissionStatus !== 'granted') {
          return {
            permissionStatus,
            registered: false,
            token: null,
          };
        }

        if (pushPlatform === 'android') {
          await Notifications.setNotificationChannelAsync('default', {
            name: 'default',
            importance: Notifications.AndroidImportance.DEFAULT,
          });
        }

        const projectId = resolveExpoProjectId();
        const tokenResponse = projectId
          ? await Notifications.getExpoPushTokenAsync({ projectId })
          : await Notifications.getExpoPushTokenAsync();
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

        if (
          registeredTokenRef.current &&
          registeredTokenRef.current !== nextToken
        ) {
          try {
            await disablePushToken({ token: registeredTokenRef.current });
          } catch {
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

  const refreshRegistration =
    useCallback(async (): Promise<NotificationToggleResult> => {
      if (!user) {
        return {
          enabled: isEnabled,
          permissionStatus: 'unavailable',
          registered: false,
        };
      }

      setIsSyncing(true);
      try {
        if (!isEnabled) {
          await disableRegisteredToken();
          return {
            enabled: false,
            permissionStatus: 'unavailable',
            registered: false,
          };
        }

        const registration = await registerCurrentDevice(false);
        return {
          enabled: isEnabled,
          permissionStatus: registration.permissionStatus,
          registered: registration.registered,
        };
      } finally {
        setIsSyncing(false);
      }
    }, [disableRegisteredToken, isEnabled, registerCurrentDevice, user]);

  const setNotificationsEnabled = useCallback(
    async (enabled: boolean): Promise<NotificationToggleResult> => {
      await persistEnabledFlag(enabled);
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
          return {
            enabled: false,
            permissionStatus: 'unavailable',
            registered: false,
          };
        }

        const registration = await registerCurrentDevice(true);
        if (!registration.registered) {
          await persistEnabledFlag(false);
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
        setIsSyncing(false);
      }
    },
    [disableRegisteredToken, persistEnabledFlag, registerCurrentDevice, user]
  );

  useEffect(() => {
    let isMounted = true;

    void (async () => {
      try {
        const primary = await AsyncStorage.getItem(
          NOTIFICATIONS_ENABLED_STORAGE_KEY
        );
        const legacy =
          primary === null
            ? await AsyncStorage.getItem(
                LEGACY_NOTIFICATIONS_ENABLED_STORAGE_KEY
              )
            : null;
        const storedValue = primary ?? legacy;

        if (!isMounted) {
          return;
        }

        if (storedValue !== null) {
          setIsEnabled(storedValue === '1');
        }

        if (legacy !== null) {
          await AsyncStorage.setItem(NOTIFICATIONS_ENABLED_STORAGE_KEY, legacy);
          await AsyncStorage.removeItem(
            LEGACY_NOTIFICATIONS_ENABLED_STORAGE_KEY
          );
        }
      } finally {
        if (isMounted) {
          setIsLoading(false);
        }
      }
    })();

    return () => {
      isMounted = false;
    };
  }, []);

  useEffect(() => {
    if (isLoading || !user) {
      return;
    }

    void refreshRegistration();
  }, [isLoading, refreshRegistration, user]);

  const value = useMemo(
    () => ({
      isEnabled,
      isLoading,
      isSyncing,
      expoPushToken,
      setNotificationsEnabled,
      refreshRegistration,
    }),
    [
      expoPushToken,
      isEnabled,
      isLoading,
      isSyncing,
      refreshRegistration,
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
