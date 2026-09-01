export type PushPlatform = 'ios' | 'android';

export type NotificationPermissionStatus =
  | 'granted'
  | 'denied'
  | 'blocked'
  | 'undetermined'
  | 'unavailable';

export type NotificationRegistrationFailure =
  | 'permission-denied'
  | 'permission-settings-required'
  | 'permission-undetermined'
  | 'technical';

export type NotificationFailurePresentation =
  | 'permission-denied'
  | 'permission-settings-required'
  | 'technical';

export type NativeNotificationPermissions = {
  status?: string;
  canAskAgain?: boolean;
  ios?: {
    status?: number | null;
  } | null;
};

type PermissionRegistrationOptions = {
  platform: PushPlatform;
  askPermission: boolean;
  ensureAndroidChannel: () => Promise<void>;
  getPermissions: () => Promise<NativeNotificationPermissions>;
  requestPermissions: () => Promise<NativeNotificationPermissions>;
};

export type NotificationPreferenceSnapshot = {
  enabled: boolean;
  generation: number;
};

export type NotificationSessionSnapshot = {
  sessionKey: string | null;
  generation: number;
};

export type NotificationRegistrationResult = {
  permissionStatus: NotificationPermissionStatus;
  registered: boolean;
  token: string | null;
  failure: NotificationRegistrationFailure | null;
};

export type NotificationToggleResult = Omit<
  NotificationRegistrationResult,
  'token'
> & {
  enabled: boolean;
};

export function isNotificationStateForSession(
  stateSessionGeneration: number | null,
  activeSession: NotificationSessionSnapshot
) {
  return (
    activeSession.sessionKey !== null &&
    stateSessionGeneration === activeSession.generation
  );
}

export function createNotificationOperationCoordinator(
  initialPreferenceEnabled: boolean
) {
  let preferenceEnabled = initialPreferenceEnabled;
  let preferenceGeneration = 0;
  let activeSessionKey: string | null = null;
  let sessionGeneration = 0;
  let operationTail: Promise<void> = Promise.resolve();
  const activeRefreshes = new Map<
    number,
    { sessionKey: string | null; promise: Promise<unknown> }
  >();

  const enqueue = <T>(operation: () => Promise<T>): Promise<T> => {
    const task = operationTail.then(operation, operation);
    operationTail = task.then(
      () => undefined,
      () => undefined
    );
    return task;
  };

  return {
    getPreferenceSnapshot(): NotificationPreferenceSnapshot {
      return {
        enabled: preferenceEnabled,
        generation: preferenceGeneration,
      };
    },
    updatePreference(enabled: boolean): NotificationPreferenceSnapshot {
      preferenceEnabled = enabled;
      preferenceGeneration += 1;
      return {
        enabled: preferenceEnabled,
        generation: preferenceGeneration,
      };
    },
    isPreferenceSnapshotCurrent(snapshot: NotificationPreferenceSnapshot) {
      return (
        snapshot.enabled === preferenceEnabled &&
        snapshot.generation === preferenceGeneration
      );
    },
    updateSession(sessionKey: string | null): NotificationSessionSnapshot {
      if (sessionKey !== activeSessionKey) {
        activeSessionKey = sessionKey;
        sessionGeneration += 1;
      }
      return {
        sessionKey: activeSessionKey,
        generation: sessionGeneration,
      };
    },
    isSessionSnapshotCurrent(snapshot: NotificationSessionSnapshot) {
      return (
        snapshot.sessionKey === activeSessionKey &&
        snapshot.generation === sessionGeneration
      );
    },
    enqueue,
    enqueueRefresh<T>(
      session: NotificationSessionSnapshot,
      operation: () => Promise<T>
    ): Promise<T> {
      const activeRefresh = activeRefreshes.get(session.generation);
      if (activeRefresh?.sessionKey === session.sessionKey) {
        return activeRefresh.promise as Promise<T>;
      }

      const task = enqueue(operation);
      const activeEntry = {
        sessionKey: session.sessionKey,
        promise: task,
      };
      activeRefreshes.set(session.generation, activeEntry);
      void task.then(
        () => {
          if (activeRefreshes.get(session.generation) === activeEntry) {
            activeRefreshes.delete(session.generation);
          }
        },
        () => {
          if (activeRefreshes.get(session.generation) === activeEntry) {
            activeRefreshes.delete(session.generation);
          }
        }
      );
      return task;
    },
  };
}

function normalizeIosAuthorizationStatus(
  status: number | null | undefined,
  canAskAgain: boolean | undefined
): NotificationPermissionStatus | null {
  if (status === 0) {
    return 'undetermined';
  }
  if (status === 1) {
    return canAskAgain === false ? 'blocked' : 'denied';
  }
  if (status === 2 || status === 3 || status === 4) {
    return 'granted';
  }
  return null;
}

export function normalizeNotificationPermission(
  permissions: NativeNotificationPermissions,
  platform: PushPlatform
): NotificationPermissionStatus {
  if (platform === 'ios') {
    const iosStatus = normalizeIosAuthorizationStatus(
      permissions.ios?.status,
      permissions.canAskAgain
    );
    if (iosStatus) {
      return iosStatus;
    }
  }

  if (permissions.status === 'granted') {
    return 'granted';
  }
  if (permissions.status === 'denied') {
    return permissions.canAskAgain === false ? 'blocked' : 'denied';
  }
  if (permissions.status === 'undetermined') {
    return 'undetermined';
  }
  return 'unavailable';
}

export function isValidRegisteredPushToken(token: string | null | undefined) {
  return typeof token === 'string' && token.trim().length > 0;
}

export function isNotificationContractEnabled(options: {
  preferenceEnabled: boolean;
  permissionStatus: NotificationPermissionStatus;
  registered: boolean;
  token: string | null | undefined;
}) {
  return (
    options.preferenceEnabled &&
    options.permissionStatus === 'granted' &&
    options.registered &&
    isValidRegisteredPushToken(options.token)
  );
}

export function classifyNotificationRegistrationFailure(
  permissionStatus: NotificationPermissionStatus
): NotificationRegistrationFailure {
  if (permissionStatus === 'denied') {
    return 'permission-denied';
  }
  if (permissionStatus === 'blocked') {
    return 'permission-settings-required';
  }
  if (permissionStatus === 'undetermined') {
    return 'permission-undetermined';
  }
  return 'technical';
}

export function resolveNotificationFailurePresentation(
  failure: NotificationRegistrationFailure | null
): NotificationFailurePresentation | null {
  if (!failure) {
    return null;
  }
  if (failure === 'permission-settings-required') {
    return 'permission-settings-required';
  }
  if (
    failure === 'permission-denied' ||
    failure === 'permission-undetermined'
  ) {
    return 'permission-denied';
  }
  return 'technical';
}

export function createNotificationRegistrationResult(options: {
  permissionStatus: NotificationPermissionStatus;
  registered: boolean;
  token: string | null;
}): NotificationRegistrationResult {
  const registered =
    options.registered &&
    options.permissionStatus === 'granted' &&
    isValidRegisteredPushToken(options.token);

  return {
    permissionStatus: options.permissionStatus,
    registered,
    token: registered ? options.token : null,
    failure: registered
      ? null
      : classifyNotificationRegistrationFailure(options.permissionStatus),
  };
}

export async function resolvePermissionForPushRegistration({
  platform,
  askPermission,
  ensureAndroidChannel,
  getPermissions,
  requestPermissions,
}: PermissionRegistrationOptions): Promise<NotificationPermissionStatus> {
  if (platform === 'android') {
    await ensureAndroidChannel();
  }

  let permissions = await getPermissions();
  let permissionStatus = normalizeNotificationPermission(
    permissions,
    platform
  );
  const canRequest =
    permissionStatus === 'undetermined' ||
    (permissionStatus === 'denied' && permissions.canAskAgain !== false);

  if (askPermission && canRequest) {
    permissions = await requestPermissions();
    permissionStatus = normalizeNotificationPermission(permissions, platform);
  }

  return permissionStatus;
}
