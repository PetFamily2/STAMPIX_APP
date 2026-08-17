import { describe, expect, test } from 'bun:test';
import { readFileSync } from 'node:fs';

import {
  createSerializedAsyncOperationQueue,
  hydrateNotificationPreference,
  resolveFreshUserIdAfterDeletedUserSuppression,
  shouldSuppressDeletedUserPresentation,
} from '../accountDeletionContextSafety';
import { runAccountDeletionWithCleanup } from '../accountDeletionReset';

const SETTINGS_SOURCE = 'screens/SettingsScreen.tsx';
const ACTIVE_BUSINESS_SOURCE = 'contexts/ActiveBusinessContext.tsx';
const APP_MODE_SOURCE = 'contexts/AppModeContext.tsx';
const ONBOARDING_SOURCE = 'contexts/OnboardingContext.tsx';
const NOTIFICATIONS_SOURCE = 'contexts/PushNotificationsContext.tsx';
const USER_SOURCE = 'contexts/UserContext.tsx';

function cleanupStep(name, calls, shouldFail = false) {
  return {
    name,
    run: () => {
      calls.push(name);
      if (shouldFail) {
        throw new Error(`${name}_FAILED`);
      }
    },
  };
}

function deferred() {
  let resolvePromise;
  const promise = new Promise((resolve) => {
    resolvePromise = resolve;
  });
  return {
    promise,
    resolve(value) {
      resolvePromise(value);
    },
  };
}

describe('post-account-deletion reset orchestration', () => {
  test('server success runs every account reset through welcome navigation', async () => {
    const calls = [];
    const stepNames = [
      'active-business-state',
      'onboarding-state',
      'notification-state',
      'app-mode',
      'session-state',
      'remembered-email',
      'business-selections',
      'notification-preferences',
      'pending-join',
      'sign-out',
      'auth-storage',
      'welcome-navigation',
    ];

    const outcome = await runAccountDeletionWithCleanup({
      deleteAccount: async () => ({ success: true, deleted: { users: 1 } }),
      cleanupSteps: stepNames.map((name) => cleanupStep(name, calls)),
    });

    expect(outcome.status).toBe('deleted');
    expect(outcome.failedCleanupSteps).toEqual([]);
    expect(calls).toEqual(stepNames);
  });

  test('one local failure does not stop later cleanup or welcome navigation', async () => {
    const calls = [];
    const warnings = [];

    const outcome = await runAccountDeletionWithCleanup({
      deleteAccount: async () => ({ success: true }),
      cleanupSteps: [
        cleanupStep('active-business-state', calls, true),
        cleanupStep('onboarding-state', calls),
        cleanupStep('sign-out', calls),
        cleanupStep('welcome-navigation', calls),
      ],
      onCleanupWarning: (failedStepNames) => {
        warnings.push([...failedStepNames]);
      },
    });

    expect(outcome).toEqual({
      status: 'deleted',
      result: { success: true },
      failedCleanupSteps: ['active-business-state'],
    });
    expect(calls).toEqual([
      'active-business-state',
      'onboarding-state',
      'sign-out',
      'welcome-navigation',
    ]);
    expect(warnings).toEqual([['active-business-state']]);
  });

  test('multiple local failures remain warnings and best-effort cleanup continues', async () => {
    const calls = [];

    const outcome = await runAccountDeletionWithCleanup({
      deleteAccount: async () => ({ success: true }),
      cleanupSteps: [
        cleanupStep('notification-state', calls, true),
        cleanupStep('app-mode', calls, true),
        cleanupStep('session-state', calls),
        cleanupStep('auth-storage', calls, true),
        cleanupStep('welcome-navigation', calls),
      ],
    });

    expect(outcome.status).toBe('deleted');
    expect(outcome.failedCleanupSteps).toEqual([
      'notification-state',
      'app-mode',
      'auth-storage',
    ]);
    expect(calls).toEqual([
      'notification-state',
      'app-mode',
      'session-state',
      'auth-storage',
      'welcome-navigation',
    ]);
  });

  test('server rejection or exception never starts post-success cleanup', async () => {
    const rejectedCalls = [];
    const rejected = await runAccountDeletionWithCleanup({
      deleteAccount: async () => ({
        success: false,
        errorCode: 'SOLE_OWNER_BUSINESS_BLOCKED',
      }),
      cleanupSteps: [cleanupStep('welcome-navigation', rejectedCalls)],
    });

    expect(rejected.status).toBe('server_rejected');
    expect(rejectedCalls).toEqual([]);

    const thrownCalls = [];
    await expect(
      runAccountDeletionWithCleanup({
        deleteAccount: async () => {
          throw new Error('SERVER_DELETE_FAILED');
        },
        cleanupSteps: [cleanupStep('welcome-navigation', thrownCalls)],
      })
    ).rejects.toThrow('SERVER_DELETE_FAILED');
    expect(thrownCalls).toEqual([]);
  });
});

describe('account-deletion reset integration contracts', () => {
  test('Settings wires every narrow reset and replaces history with welcome', () => {
    const source = readFileSync(SETTINGS_SOURCE, 'utf8');
    const cleanupStart = source.indexOf('runAccountDeletionWithCleanup({');
    const navigationIndex = source.indexOf(
      "router.replace('/(auth)/welcome')",
      cleanupStart
    );

    expect(cleanupStart).toBeGreaterThan(-1);
    expect(source).toContain('run: resetActiveBusinessState');
    expect(source).toContain('run: resetOnboarding');
    expect(source).toContain('run: resetNotificationState');
    expect(source).toContain('run: resetAppMode');
    expect(source).toContain('run: resetSessionState');
    expect(source).toContain(
      'AsyncStorage.removeItem(REMEMBERED_EMAIL_STORAGE_KEY)'
    );
    expect(source).toContain('run: () =>');
    expect(source).toContain('clearBusinessSelectionStorage(');
    expect(source).toContain('SCANNER_LAST_PROGRAM_STORAGE_PREFIX');
    expect(source).toContain('run: clearPendingJoin');
    expect(source).toContain('run: clearDeletedAccountNotificationStorage');
    expect(source).toContain('run: signOut');
    expect(source).toContain('run: clearConvexAuthSecureStore');
    expect(navigationIndex).toBeGreaterThan(cleanupStart);
    expect(source).toContain('onCleanupWarning: reportPostDeletionCleanupWarning');
  });

  test('notification reset clears account state without touching OS permission', () => {
    const source = readFileSync(NOTIFICATIONS_SOURCE, 'utf8');
    const resetStart = source.indexOf('const resetNotificationState');
    const resetEnd = source.indexOf('\n  useEffect(', resetStart);
    const resetBlock = source.slice(resetStart, resetEnd);

    expect(resetStart).toBeGreaterThan(-1);
    expect(resetBlock).toContain('registeredTokenRef.current = null');
    expect(resetBlock).toContain('setExpoPushToken(null)');
    expect(resetBlock).toContain('setIsEnabled(false)');
    expect(resetBlock).toContain('setIsSyncing(false)');
    expect(resetBlock).not.toContain('getPermissionsAsync');
    expect(resetBlock).not.toContain('requestPermissionsAsync');
    expect(resetBlock).not.toContain('disablePushToken');
    expect(resetBlock).not.toContain('disableAllMyPushTokens');
  });

  test('context resets suppress deleted-account values and restore clean defaults', () => {
    const activeBusiness = readFileSync(ACTIVE_BUSINESS_SOURCE, 'utf8');
    const appMode = readFileSync(APP_MODE_SOURCE, 'utf8');
    const onboarding = readFileSync(ONBOARDING_SOURCE, 'utf8');
    const user = readFileSync(USER_SOURCE, 'utf8');

    expect(activeBusiness).toContain('setLocalBusinessIdOverride(null)');
    expect(activeBusiness).toContain('setIsAccountStateReset(true)');
    expect(activeBusiness).toContain(
      'const businesses = isAccountStateReset ? [] : queriedBusinesses'
    );
    expect(appMode).toContain('pendingModeRef.current = null');
    expect(appMode).toContain("setAppModeState('customer')");
    expect(onboarding).toContain('setBusinessDraft({ ...defaultBusinessDraft })');
    expect(onboarding).toContain(
      'setProgramDraft({ ...defaultProgramDraft })'
    );
    expect(onboarding).toContain('setBusinessId(null)');
    expect(onboarding).toContain('setProgramId(null)');
    expect(user).toContain('setIsAccountStateReset(true)');
    expect(user).toContain('lastAuthenticatedUserIdRef.current');
    expect(user).toContain('deletedUserIdRef.current');
    expect(user).toContain(
      'currentUserId ?? lastAuthenticatedUserIdRef.current'
    );
    expect(user).toContain('shouldSuppressAccountPresentation');
    expect(user).not.toContain('deletedUserIdRef.current = null');
  });
});

describe('account context reset race safety', () => {
  test('deleted-user suppression waits for both user queries to leave A', () => {
    const resolveFreshUser = (userResultId, sessionResultId) =>
      resolveFreshUserIdAfterDeletedUserSuppression(
        userResultId,
        sessionResultId,
        'user_A'
      );

    expect(resolveFreshUser('user_B', 'user_A')).toBeNull();
    expect(resolveFreshUser('user_A', 'user_B')).toBeNull();
    expect(resolveFreshUser('user_B', null)).toBe('user_B');
    expect(resolveFreshUser(null, 'user_B')).toBe('user_B');
    expect(resolveFreshUser('user_B', 'user_B')).toBe('user_B');
    expect(resolveFreshUser(null, null)).toBeNull();
    expect(resolveFreshUser(undefined, undefined)).toBeNull();
    expect(resolveFreshUser('user_A', null)).toBeNull();
    expect(resolveFreshUser(null, 'user_A')).toBeNull();
    expect(resolveFreshUser('user_A', 'user_A')).toBeNull();
  });

  test('deleted A remains a presentation guard after B was already visible', () => {
    const deletedUserId = 'user_A';
    const isSuppressed = (userResultId, sessionResultId) =>
      shouldSuppressDeletedUserPresentation(
        userResultId,
        sessionResultId,
        deletedUserId
      );

    expect(isSuppressed('user_B', null)).toBe(false);
    expect(isSuppressed('user_B', 'user_A')).toBe(true);
    expect(isSuppressed('user_B', null)).toBe(false);

    expect(isSuppressed(null, 'user_B')).toBe(false);
    expect(isSuppressed('user_A', 'user_B')).toBe(true);
    expect(isSuppressed(null, 'user_B')).toBe(false);

    expect(deletedUserId).toBe('user_A');
  });

  test('reset invalidates an in-flight notification preference hydration', async () => {
    const canonicalRead = deferred();
    const enabledWrites = [];
    const canonicalWrites = [];
    const legacyRemovals = [];
    const loadingFinishes = [];
    let legacyReads = 0;
    let generation = 0;

    const hydration = hydrateNotificationPreference({
      generation,
      getCurrentGeneration: () => generation,
      readCanonicalPreference: () => canonicalRead.promise,
      readLegacyPreference: async () => {
        legacyReads += 1;
        return '1';
      },
      writeCanonicalPreference: async (value) => {
        canonicalWrites.push(value);
      },
      removeLegacyPreference: async () => {
        legacyRemovals.push(true);
      },
      setEnabled: (enabled) => {
        enabledWrites.push(enabled);
      },
      finishLoading: () => {
        loadingFinishes.push(true);
      },
    });

    generation += 1;
    canonicalRead.resolve(null);
    await hydration;

    expect(enabledWrites).toEqual([]);
    expect(legacyReads).toBe(0);
    expect(canonicalWrites).toEqual([]);
    expect(legacyRemovals).toEqual([]);
    expect(loadingFinishes).toEqual([]);
  });

  test('current notification hydration still applies and migrates preferences', async () => {
    const enabledWrites = [];
    const canonicalWrites = [];
    const legacyRemovals = [];
    let loadingFinishes = 0;
    const generation = 4;

    await hydrateNotificationPreference({
      generation,
      getCurrentGeneration: () => generation,
      readCanonicalPreference: async () => null,
      readLegacyPreference: async () => '0',
      writeCanonicalPreference: async (value) => {
        canonicalWrites.push(value);
      },
      removeLegacyPreference: async () => {
        legacyRemovals.push(true);
      },
      setEnabled: (enabled) => {
        enabledWrites.push(enabled);
      },
      finishLoading: () => {
        loadingFinishes += 1;
      },
    });

    expect(enabledWrites).toEqual([false]);
    expect(canonicalWrites).toEqual(['0']);
    expect(legacyRemovals).toEqual([true]);
    expect(loadingFinishes).toBe(1);
  });

  test('final notification cleanup waits for a stale migration write', async () => {
    const queue = createSerializedAsyncOperationQueue();
    const staleWrite = deferred();
    const writeStarted = deferred();
    const storage = new Map([['legacy', '1']]);
    let generation = 0;
    let enabled = false;

    const hydration = queue.enqueue(() =>
      hydrateNotificationPreference({
        generation,
        getCurrentGeneration: () => generation,
        readCanonicalPreference: async () => storage.get('canonical') ?? null,
        readLegacyPreference: async () => storage.get('legacy') ?? null,
        writeCanonicalPreference: async (value) => {
          writeStarted.resolve();
          await staleWrite.promise;
          storage.set('canonical', value);
        },
        removeLegacyPreference: async () => {
          storage.delete('legacy');
        },
        setEnabled: (nextEnabled) => {
          enabled = nextEnabled;
        },
        finishLoading: () => undefined,
      })
    );

    await writeStarted.promise;
    generation += 1;
    enabled = false;
    const finalCleanup = queue.enqueue(async () => {
      storage.delete('canonical');
      storage.delete('legacy');
    });

    staleWrite.resolve();
    await hydration;
    await finalCleanup;

    expect(enabled).toBe(false);
    expect(storage.has('canonical')).toBe(false);
    expect(storage.has('legacy')).toBe(false);
  });

  test('outer notification operations guard stale results and finally state', () => {
    const source = readFileSync(NOTIFICATIONS_SOURCE, 'utf8');
    const persistenceStart = source.indexOf('const persistEnabledFlag');
    const disableStart = source.indexOf(
      'const disableRegisteredToken',
      persistenceStart
    );
    const registrationStart = source.indexOf(
      'const registerCurrentDevice',
      disableStart
    );
    const resetStart = source.indexOf(
      'const resetNotificationState',
      registrationStart
    );
    const refreshStart = source.indexOf('const refreshRegistration');
    const setEnabledStart = source.indexOf(
      'const setNotificationsEnabled',
      refreshStart
    );
    const hydrationStart = source.indexOf('useEffect(() => {', setEnabledStart);
    const refreshBlock = source.slice(refreshStart, setEnabledStart);
    const setEnabledBlock = source.slice(setEnabledStart, hydrationStart);
    const persistenceBlock = source.slice(persistenceStart, disableStart);
    const disableBlock = source.slice(disableStart, registrationStart);
    const registrationBlock = source.slice(registrationStart, resetStart);

    expect(persistenceBlock).toContain(
      'generation !== notificationStateGenerationRef.current'
    );
    expect(disableBlock).toContain(
      'const generation = notificationStateGenerationRef.current'
    );
    expect(disableBlock).toContain('if (!isCurrentGeneration())');
    expect(registrationBlock).toContain(
      'const stateGeneration = notificationStateGenerationRef.current'
    );
    expect(registrationBlock).toContain('if (!isCurrentGeneration())');
    expect(refreshBlock).toContain(
      'const generation = notificationStateGenerationRef.current'
    );
    expect(refreshBlock).toContain('if (!isCurrentGeneration())');
    expect(refreshBlock).toContain(
      'if (isCurrentGeneration()) {\n          setIsSyncing(false);'
    );
    expect(setEnabledBlock).toContain(
      'const generation = notificationStateGenerationRef.current'
    );
    expect(setEnabledBlock).toContain(
      'await persistEnabledFlag(enabled, generation)'
    );
    expect(setEnabledBlock).toContain('if (!isCurrentGeneration())');
    expect(setEnabledBlock).toContain(
      'if (isCurrentGeneration()) {\n          setIsSyncing(false);'
    );
    expect(source).toContain('preferenceStorageQueue.enqueue');
    expect(source).toContain('clearDeletedAccountNotificationStorage');
  });
});
