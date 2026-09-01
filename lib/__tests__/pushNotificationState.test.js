import { describe, expect, test } from 'bun:test';

import {
  createNotificationOperationCoordinator,
  createNotificationRegistrationResult,
  isNotificationContractEnabled,
  isNotificationStateForSession,
  normalizeNotificationPermission,
  resolveNotificationFailurePresentation,
  resolvePermissionForPushRegistration,
} from '../pushNotificationState';

function deferred() {
  let resolve;
  const promise = new Promise((resolvePromise) => {
    resolve = resolvePromise;
  });
  return { promise, resolve };
}

describe('push notification enabled contract', () => {
  test('undetermined permission without a token is not enabled', () => {
    expect(
      isNotificationContractEnabled({
        preferenceEnabled: true,
        permissionStatus: 'undetermined',
        registered: false,
        token: null,
      })
    ).toBe(false);
  });

  test('denied permission is not enabled', () => {
    expect(
      isNotificationContractEnabled({
        preferenceEnabled: true,
        permissionStatus: 'denied',
        registered: true,
        token: 'ExpoPushToken[registered]',
      })
    ).toBe(false);
  });

  test('granted permission with a registered token is enabled', () => {
    expect(
      isNotificationContractEnabled({
        preferenceEnabled: true,
        permissionStatus: 'granted',
        registered: true,
        token: 'ExpoPushToken[registered]',
      })
    ).toBe(true);
  });

  test('granted permission with registration failure is not enabled', () => {
    const result = createNotificationRegistrationResult({
      permissionStatus: 'granted',
      registered: false,
      token: null,
    });

    expect(result).toEqual({
      permissionStatus: 'granted',
      registered: false,
      token: null,
      failure: 'technical',
    });
    expect(
      isNotificationContractEnabled({
        preferenceEnabled: true,
        ...result,
      })
    ).toBe(false);
  });
});

describe('push notification permission and failure decisions', () => {
  test('technical registration failure is distinct from permission denial', () => {
    const technical = createNotificationRegistrationResult({
      permissionStatus: 'granted',
      registered: false,
      token: null,
    });
    const denied = createNotificationRegistrationResult({
      permissionStatus: 'denied',
      registered: false,
      token: null,
    });

    expect(technical.failure).toBe('technical');
    expect(denied.failure).toBe('permission-denied');
    expect(technical.failure).not.toBe(denied.failure);
  });

  test('one failed registration produces one user-facing failure result', () => {
    const result = createNotificationRegistrationResult({
      permissionStatus: 'blocked',
      registered: false,
      token: null,
    });

    expect(result.failure).toBe('permission-settings-required');
    expect(resolveNotificationFailurePresentation(result.failure)).toBe(
      'permission-settings-required'
    );
  });

  test('denied permission without another prompt maps to Settings', () => {
    expect(
      normalizeNotificationPermission(
        { status: 'denied', canAskAgain: false },
        'android'
      )
    ).toBe('blocked');
    expect(
      createNotificationRegistrationResult({
        permissionStatus: 'blocked',
        registered: false,
        token: null,
      }).failure
    ).toBe('permission-settings-required');
  });
});

describe('push notification platform ordering', () => {
  test('Android channel setup completes before permission request', async () => {
    const calls = [];

    const status = await resolvePermissionForPushRegistration({
      platform: 'android',
      askPermission: true,
      ensureAndroidChannel: async () => {
        calls.push('channel');
      },
      getPermissions: async () => {
        calls.push('get-permission');
        return { status: 'undetermined', canAskAgain: true };
      },
      requestPermissions: async () => {
        calls.push('request-permission');
        return { status: 'granted', canAskAgain: true };
      },
    });

    expect(status).toBe('granted');
    expect(calls).toEqual([
      'channel',
      'get-permission',
      'request-permission',
    ]);
  });

  test('iOS registration never attempts Android channel setup', async () => {
    let androidChannelCalls = 0;

    const status = await resolvePermissionForPushRegistration({
      platform: 'ios',
      askPermission: true,
      ensureAndroidChannel: async () => {
        androidChannelCalls += 1;
      },
      getPermissions: async () => ({
        status: 'granted',
        canAskAgain: true,
        ios: { status: 2 },
      }),
      requestPermissions: async () => {
        throw new Error('permission request should not run');
      },
    });

    expect(status).toBe('granted');
    expect(androidChannelCalls).toBe(0);
  });
});

describe('push notification operation race safety', () => {
  test('refresh registration settles before a later disable wins', async () => {
    const coordinator = createNotificationOperationCoordinator(true);
    const session = coordinator.updateSession('user-a');
    const registrationStarted = deferred();
    const registrationSettles = deferred();
    const calls = [];
    let enabled = false;

    const refreshSnapshot = coordinator.getPreferenceSnapshot();
    const refresh = coordinator.enqueueRefresh(session, async () => {
      calls.push('registration-started');
      registrationStarted.resolve();
      await registrationSettles.promise;
      calls.push('registration-settled');
      if (coordinator.isPreferenceSnapshotCurrent(refreshSnapshot)) {
        enabled = true;
      }
    });

    await registrationStarted.promise;
    const disableSnapshot = coordinator.updatePreference(false);
    enabled = false;
    const disable = coordinator.enqueue(async () => {
      calls.push('backend-disabled');
      if (coordinator.isPreferenceSnapshotCurrent(disableSnapshot)) {
        enabled = false;
      }
    });

    registrationSettles.resolve();
    await Promise.all([refresh, disable]);

    expect(calls).toEqual([
      'registration-started',
      'registration-settled',
      'backend-disabled',
    ]);
    expect(enabled).toBe(false);
  });

  test('enable result cannot overwrite a newer disable', async () => {
    const coordinator = createNotificationOperationCoordinator(false);
    const enableSnapshot = coordinator.updatePreference(true);
    const enableStarted = deferred();
    const enableSettles = deferred();
    let enabled = false;

    const enable = coordinator.enqueue(async () => {
      enableStarted.resolve();
      await enableSettles.promise;
      if (coordinator.isPreferenceSnapshotCurrent(enableSnapshot)) {
        enabled = true;
      }
    });

    await enableStarted.promise;
    const disableSnapshot = coordinator.updatePreference(false);
    enabled = false;
    const disable = coordinator.enqueue(async () => {
      if (coordinator.isPreferenceSnapshotCurrent(disableSnapshot)) {
        enabled = false;
      }
    });

    enableSettles.resolve();
    await Promise.all([enable, disable]);

    expect(enabled).toBe(false);
  });

  test('concurrent refreshes coalesce into one registration operation', async () => {
    const coordinator = createNotificationOperationCoordinator(true);
    const session = coordinator.updateSession('user-a');
    const registrationStarted = deferred();
    const registrationSettles = deferred();
    let registrationCount = 0;

    const firstRefresh = coordinator.enqueueRefresh(session, async () => {
      registrationCount += 1;
      registrationStarted.resolve();
      await registrationSettles.promise;
      return 'registered';
    });

    await registrationStarted.promise;
    const secondRefresh = coordinator.enqueueRefresh(session, async () => {
      registrationCount += 1;
      return 'duplicate';
    });

    expect(secondRefresh).toBe(firstRefresh);
    registrationSettles.resolve();
    await expect(firstRefresh).resolves.toBe('registered');
    await expect(secondRefresh).resolves.toBe('registered');
    expect(registrationCount).toBe(1);
  });

  test('preference generation invalidates older reconciliation results', () => {
    const coordinator = createNotificationOperationCoordinator(true);
    const staleSnapshot = coordinator.getPreferenceSnapshot();

    const currentSnapshot = coordinator.updatePreference(false);

    expect(coordinator.isPreferenceSnapshotCurrent(staleSnapshot)).toBe(false);
    expect(coordinator.isPreferenceSnapshotCurrent(currentSnapshot)).toBe(true);
  });

  test('user B never reuses or applies user A refresh work', async () => {
    const coordinator = createNotificationOperationCoordinator(true);
    const userASession = coordinator.updateSession('user-a');
    const userAStarted = deferred();
    const userASettles = deferred();
    const appliedSessions = [];

    const userARefresh = coordinator.enqueueRefresh(
      userASession,
      async () => {
        userAStarted.resolve();
        await userASettles.promise;
        if (coordinator.isSessionSnapshotCurrent(userASession)) {
          appliedSessions.push('user-a');
        }
        return 'user-a-result';
      }
    );

    await userAStarted.promise;
    const userBSession = coordinator.updateSession('user-b');
    const userBRefresh = coordinator.enqueueRefresh(
      userBSession,
      async () => {
        if (coordinator.isSessionSnapshotCurrent(userBSession)) {
          appliedSessions.push('user-b');
        }
        return 'user-b-result';
      }
    );

    expect(userBRefresh).not.toBe(userARefresh);
    expect(appliedSessions).toEqual([]);
    userASettles.resolve();
    await expect(userARefresh).resolves.toBe('user-a-result');
    await expect(userBRefresh).resolves.toBe('user-b-result');
    expect(appliedSessions).toEqual(['user-b']);
  });

  test('sign-out invalidates pending user refresh state', async () => {
    const coordinator = createNotificationOperationCoordinator(true);
    const userSession = coordinator.updateSession('user-a');
    const refreshStarted = deferred();
    const refreshSettles = deferred();
    let enabled = false;
    let token = null;
    const stateSessionGeneration = userSession.generation;

    const refresh = coordinator.enqueueRefresh(userSession, async () => {
      refreshStarted.resolve();
      await refreshSettles.promise;
      if (coordinator.isSessionSnapshotCurrent(userSession)) {
        enabled = true;
        token = 'ExpoPushToken[user-a]';
      }
    });

    await refreshStarted.promise;
    const signedOutSession = coordinator.updateSession(null);
    enabled = false;
    token = null;
    refreshSettles.resolve();
    await refresh;

    expect(coordinator.isSessionSnapshotCurrent(userSession)).toBe(false);
    expect(coordinator.isSessionSnapshotCurrent(signedOutSession)).toBe(true);
    expect(
      isNotificationStateForSession(
        stateSessionGeneration,
        signedOutSession
      )
    ).toBe(false);
    expect(enabled).toBe(false);
    expect(token).toBeNull();
  });

  test('identity transition advances session operation validity', () => {
    const coordinator = createNotificationOperationCoordinator(true);
    const userASession = coordinator.updateSession('user-a');
    const sameUserSession = coordinator.updateSession('user-a');
    const userBSession = coordinator.updateSession('user-b');

    expect(sameUserSession.generation).toBe(userASession.generation);
    expect(userBSession.generation).toBeGreaterThan(userASession.generation);
    expect(coordinator.isSessionSnapshotCurrent(userASession)).toBe(false);
    expect(coordinator.isSessionSnapshotCurrent(userBSession)).toBe(true);
  });

  test('stale same-session rejection is silent after newer preference action', async () => {
    const coordinator = createNotificationOperationCoordinator(false);
    coordinator.updateSession('user-a');
    const actionAStarted = deferred();
    const actionASettles = deferred();
    const actionASnapshot = coordinator.updatePreference(true);
    let currentEnabledState = false;

    const actionA = coordinator.enqueue(async () => {
      actionAStarted.resolve();
      await actionASettles.promise;
      throw new Error('obsolete technical failure');
    });

    await actionAStarted.promise;
    const actionBSnapshot = coordinator.updatePreference(false);
    currentEnabledState = false;
    actionASettles.resolve();

    const staleResult = await actionA.catch((error) => {
      if (!coordinator.isPreferenceSnapshotCurrent(actionASnapshot)) {
        return {
          enabled: false,
          registered: false,
          failure: null,
        };
      }
      throw error;
    });

    expect(staleResult.failure).toBeNull();
    expect(
      coordinator.isPreferenceSnapshotCurrent(actionASnapshot)
    ).toBe(false);
    expect(coordinator.isPreferenceSnapshotCurrent(actionBSnapshot)).toBe(true);
    expect(currentEnabledState).toBe(false);
  });

  test('rejected session refresh does not poison later work', async () => {
    const coordinator = createNotificationOperationCoordinator(true);
    const session = coordinator.updateSession('user-a');
    const failedRefresh = coordinator.enqueueRefresh(session, async () => {
      throw new Error('registration failed');
    });

    await expect(failedRefresh).rejects.toThrow('registration failed');
    const nextRefresh = coordinator.enqueueRefresh(session, async () => {
      return 'recovered';
    });

    expect(nextRefresh).not.toBe(failedRefresh);
    await expect(nextRefresh).resolves.toBe('recovered');
  });
});
