import { describe, expect, test } from 'bun:test';
import { readFileSync } from 'node:fs';
import {
  awaitCurrentTransaction,
  captureTransactionGeneration,
  classifyPosError,
  createInitialPosFlowState,
  invalidateTransactionGeneration,
  posFlowReducer,
  resolveNoProgramsRecovery,
  resolveProgramPreset,
  resolveSameBusinessProgramRefresh,
  resolveSubscriptionRecovery,
} from '../scanner/posFlow';

const SCANNER_SCREEN_SOURCE = 'app/(authenticated)/(business)/scanner.tsx';

function createDeferred() {
  let resolve;
  let reject;
  const promise = new Promise((resolvePromise, rejectPromise) => {
    resolve = resolvePromise;
    reject = rejectPromise;
  });
  return { promise, resolve, reject };
}

const program = {
  programId: 'program_1',
  title: 'קפה קבוע',
  rewardName: 'קפה מתנה',
  maxStamps: 10,
  allowPosEnroll: true,
};

const session = {
  scanSessionId: 'session_1',
  sessionExpiresAt: Date.now() + 30_000,
  customerUserId: 'customer_1',
  customerDisplayName: 'לקוח לדוגמה',
  membership: null,
  program,
  actionMode: 'stamp',
  joinedCustomer: true,
};

const result = {
  customerUserId: 'customer_1',
  customerDisplayName: 'לקוח לדוגמה',
  program,
  actionMode: 'stamp',
  joinedCustomer: true,
  currentStamps: 1,
  maxStamps: 10,
  canRedeemNow: false,
  undo: {
    eventId: 'event_1',
    availableUntil: Date.now() + 30_000,
    actionMode: 'stamp',
  },
  undoBlockedReason: null,
};

describe('scanner POS program preset', () => {
  test('one program auto-selects regardless of saved value', () => {
    expect(resolveProgramPreset(['program_1'], null)).toEqual({
      phase: 'ready',
      selectedProgramId: 'program_1',
    });
  });

  test('valid saved multi-program preset is reused', () => {
    expect(
      resolveProgramPreset(['program_1', 'program_2'], 'program_2')
    ).toEqual({ phase: 'ready', selectedProgramId: 'program_2' });
  });

  test('missing or stale multi-program preset requires selection', () => {
    expect(resolveProgramPreset(['program_1', 'program_2'], null)).toEqual({
      phase: 'needs_program',
      selectedProgramId: null,
    });
    expect(
      resolveProgramPreset(['program_1', 'program_2'], 'archived_program')
    ).toEqual({ phase: 'needs_program', selectedProgramId: null });
  });

  test('program switching is ignored while a transaction is active', () => {
    const activePhases = [
      'resolving',
      'redeem_confirmation',
      'technical_retry',
      'terminal_error',
      'success',
      'reversed',
    ];

    for (const phase of activePhases) {
      const current = {
        ...createInitialPosFlowState(),
        phase,
        selectedProgramId: 'program_1',
        session:
          phase === 'success' || phase === 'reversed' ? null : session,
        result:
          phase === 'success' || phase === 'reversed' ? result : null,
      };
      const next = posFlowReducer(current, {
        type: 'SELECT_PROGRAM',
        programId: 'program_2',
      });

      expect(next).toBe(current);
      expect(next.selectedProgramId).toBe('program_1');
      expect(next.session).toBe(current.session);
      expect(next.result).toBe(current.result);
    }
  });

  test('an empty eligible-program list clears the preset instead of keeping a stale selection', () => {
    expect(resolveProgramPreset([], 'program_1')).toEqual({
      phase: 'needs_program',
      selectedProgramId: null,
    });
    expect(
      resolveSameBusinessProgramRefresh('program_1', [])
    ).toBe('stale');

    const hydrated = posFlowReducer(createInitialPosFlowState(), {
      type: 'PROGRAMS_READY',
      programIds: [],
      savedProgramId: 'program_1',
    });
    expect(hydrated.phase).toBe('needs_program');
    expect(hydrated.selectedProgramId).toBeNull();
    expect(hydrated.session).toBeNull();
    expect(hydrated.result).toBeNull();
  });
});

describe('scanner POS phases and reset', () => {
  test('missing multi-program preset enters needs_program', () => {
    const state = posFlowReducer(createInitialPosFlowState(), {
      type: 'PROGRAMS_READY',
      programIds: ['program_1', 'program_2'],
      savedProgramId: null,
    });

    expect(state.phase).toBe('needs_program');
    expect(state.selectedProgramId).toBeNull();
  });

  test('covers ready, resolving, redemption, success and reversed phases', () => {
    let state = posFlowReducer(createInitialPosFlowState(), {
      type: 'PROGRAMS_READY',
      programIds: ['program_1'],
      savedProgramId: null,
    });
    expect(state.phase).toBe('ready');

    state = posFlowReducer(state, { type: 'BEGIN_RESOLVE' });
    expect(state.phase).toBe('resolving');

    state = posFlowReducer(state, {
      type: 'SHOW_REDEEM_CONFIRMATION',
      session: { ...session, actionMode: 'redeem', joinedCustomer: false },
    });
    expect(state.phase).toBe('redeem_confirmation');

    state = posFlowReducer(state, { type: 'SHOW_SUCCESS', result });
    expect(state.phase).toBe('success');

    state = posFlowReducer(state, { type: 'SHOW_REVERSED', result });
    expect(state.phase).toBe('reversed');
  });

  test('technical retry preserves the exact resolved session', () => {
    const error = classifyPosError(new Error('TRANSIENT_DB_ERROR'), 'commit');
    const state = posFlowReducer(
      {
        ...createInitialPosFlowState(),
        phase: 'resolving',
        selectedProgramId: 'program_1',
      },
      { type: 'SHOW_TECHNICAL_RETRY', session, error }
    );

    expect(state.phase).toBe('technical_retry');
    expect(state.session).toBe(session);
    expect(state.error?.retrySameSession).toBe(true);
  });

  test('join, stamp, and redemption success keep the exact outcome', () => {
    const outcomes = [
      result,
      { ...result, joinedCustomer: false, currentStamps: 4 },
      {
        ...result,
        actionMode: 'redeem',
        joinedCustomer: false,
        currentStamps: 0,
      },
    ];

    for (const outcome of outcomes) {
      const state = posFlowReducer(
        {
          ...createInitialPosFlowState(),
          phase: 'resolving',
          selectedProgramId: 'program_1',
          session,
        },
        { type: 'SHOW_SUCCESS', result: outcome }
      );
      expect(state.phase).toBe('success');
      expect(state.result).toBe(outcome);
      expect(state.session).toBeNull();
    }
  });

  test('terminal error clears the customer session and is not retry state', () => {
    const error = classifyPosError(new Error('INVALID_QR'), 'resolve');
    const state = posFlowReducer(
      {
        ...createInitialPosFlowState(),
        phase: 'resolving',
        selectedProgramId: 'program_1',
        session,
      },
      { type: 'SHOW_TERMINAL_ERROR', error }
    );

    expect(state.phase).toBe('terminal_error');
    expect(state.session).toBeNull();
    expect(state.error).toBe(error);
  });

  test('Next Customer completely clears transaction state but preserves preset', () => {
    const dirtyState = {
      ...createInitialPosFlowState(),
      phase: 'success',
      selectedProgramId: 'program_1',
      session,
      result,
      error: classifyPosError(new Error('INVALID_QR'), 'resolve'),
      referralExpanded: true,
    };

    const reset = posFlowReducer(dirtyState, { type: 'NEXT_CUSTOMER' });
    expect(reset.phase).toBe('ready');
    expect(reset.selectedProgramId).toBe('program_1');
    expect(reset.session).toBeNull();
    expect(reset.result).toBeNull();
    expect(reset.error).toBeNull();
    expect(reset.referralExpanded).toBe(false);
    expect(reset.scannerResetKey).toBe(dirtyState.scannerResetKey + 1);
  });

  test('stale program recovery clears the preset and transaction', () => {
    const state = posFlowReducer(
      {
        ...createInitialPosFlowState(),
        phase: 'technical_retry',
        selectedProgramId: 'program_1',
        session,
      },
      {
        type: 'CLEAR_STALE_PROGRAM',
        notice: 'התוכנית אינה זמינה',
      }
    );

    expect(state.phase).toBe('needs_program');
    expect(state.selectedProgramId).toBeNull();
    expect(state.session).toBeNull();
  });

  test('business change clears the old preset and complete transaction', () => {
    const oldBusinessState = {
      ...createInitialPosFlowState(),
      phase: 'success',
      selectedProgramId: 'program_1',
      scannerResetKey: 5,
      result,
    };

    const nextBusinessState = posFlowReducer(oldBusinessState, {
      type: 'BUSINESS_CHANGED',
    });

    expect(nextBusinessState.phase).toBe('setup');
    expect(nextBusinessState.selectedProgramId).toBeNull();
    expect(nextBusinessState.session).toBeNull();
    expect(nextBusinessState.result).toBeNull();
    expect(nextBusinessState.scannerResetKey).toBe(6);
  });

  test('success automatically uses the same complete reset after 30 seconds', () => {
    const source = readFileSync(SCANNER_SCREEN_SOURCE, 'utf8');
    expect(source).toContain('const COMPLETE_RESET_MS = 30_000;');
    expect(source).toContain('queueCompleteReset(resetAt - Date.now())');
    expect(source).toContain("dispatch({ type: 'NEXT_CUSTOMER' });");
    expect(source).toContain(
      'invalidateTransactionGeneration(transactionGenerationRef);'
    );
    expect(source).toContain('setIsRedeemingBenefitId(null);');
    expect(source).toContain('setBenefitActionMessage(null);');
  });
});

describe('scanner POS transaction generation races', () => {
  test('same-business refresh preserves a resolving transaction and camera key when preset remains valid', () => {
    const resolvingState = {
      ...createInitialPosFlowState(),
      phase: 'resolving',
      selectedProgramId: 'program_1',
      scannerResetKey: 7,
      session,
    };

    const decision = resolveSameBusinessProgramRefresh(
      resolvingState.selectedProgramId,
      ['program_1', 'program_2']
    );
    const stateAfterRefresh =
      decision === 'preserve'
        ? resolvingState
        : posFlowReducer(resolvingState, {
            type: 'PROGRAMS_READY',
            programIds: ['program_1', 'program_2'],
            savedProgramId: 'program_1',
          });

    expect(decision).toBe('preserve');
    expect(stateAfterRefresh).toBe(resolvingState);
    expect(stateAfterRefresh.phase).toBe('resolving');
    expect(stateAfterRefresh.session).toBe(session);
    expect(stateAfterRefresh.scannerResetKey).toBe(7);
  });

  test('reset while resolve is pending prevents customer state, commit, success, and error', async () => {
    const generationRef = { current: 4 };
    const pendingResolve = createDeferred();
    const pendingResolveFailure = createDeferred();
    const uiEvents = [];
    let commitCalls = 0;
    const generation = captureTransactionGeneration(generationRef);

    const runResolve = async (pending) => {
      try {
        const resolved = await awaitCurrentTransaction(
          generationRef,
          generation,
          () => pending.promise
        );
        if (resolved.status === 'stale') {
          return;
        }
        uiEvents.push(`customer:${resolved.value.customerUserId}`);
        commitCalls += 1;
        uiEvents.push('success');
      } catch {
        if (generationRef.current === generation) {
          uiEvents.push('error');
        }
      }
    };
    const tasks = [runResolve(pendingResolve), runResolve(pendingResolveFailure)];

    invalidateTransactionGeneration(generationRef);
    pendingResolve.resolve({ customerUserId: 'customer_a' });
    pendingResolveFailure.reject(new Error('late resolve error'));
    await Promise.all(tasks);

    expect(commitCalls).toBe(0);
    expect(uiEvents).toEqual([]);
  });

  test('reset while commit is pending prevents success, retry, error, and Undo state', async () => {
    const generationRef = { current: 8 };
    const pendingCommit = createDeferred();
    const pendingCommitFailure = createDeferred();
    const uiEvents = [];
    const generation = captureTransactionGeneration(generationRef);

    const runCommit = async (pending) => {
      try {
        const committed = await awaitCurrentTransaction(
          generationRef,
          generation,
          () => pending.promise
        );
        if (committed.status === 'stale') {
          return;
        }
        uiEvents.push('success', 'undo-enabled');
      } catch {
        if (generationRef.current === generation) {
          uiEvents.push('technical-retry', 'error');
        }
      }
    };
    const tasks = [runCommit(pendingCommit), runCommit(pendingCommitFailure)];

    invalidateTransactionGeneration(generationRef);
    pendingCommit.resolve({ eventId: 'event_a' });
    pendingCommitFailure.reject(new Error('late commit error'));
    await Promise.all(tasks);

    expect(uiEvents).toEqual([]);
  });

  test('business switch prevents old-business work from repopulating the scanner', async () => {
    const generationRef = { current: 11 };
    const oldBusinessResolve = createDeferred();
    const visibleCustomers = [];
    const generation = captureTransactionGeneration(generationRef);

    const task = (async () => {
      const resolved = await awaitCurrentTransaction(
        generationRef,
        generation,
        () => oldBusinessResolve.promise
      );
      if (resolved.status === 'current') {
        visibleCustomers.push(resolved.value.customerUserId);
      }
    })();

    invalidateTransactionGeneration(generationRef);
    oldBusinessResolve.resolve({ customerUserId: 'old_business_customer' });
    await task;

    expect(visibleCustomers).toEqual([]);
  });

  test('technical retry commits the exact session without resolve and ignores a stale response', async () => {
    const generationRef = { current: 15 };
    const pendingRetry = createDeferred();
    const committedSessions = [];
    const uiEvents = [];
    let resolveCalls = 0;
    const scannerOperations = {
      resolve: async () => {
        resolveCalls += 1;
        return session;
      },
      commit: async (resolvedSession) => {
        committedSessions.push(resolvedSession);
        return pendingRetry.promise;
      },
    };
    const generation = captureTransactionGeneration(generationRef);

    const task = (async () => {
      const retrySession = session;
      const committed = await awaitCurrentTransaction(
        generationRef,
        generation,
        () => scannerOperations.commit(retrySession)
      );
      if (committed.status === 'current') {
        uiEvents.push('success');
      }
    })();

    invalidateTransactionGeneration(generationRef);
    pendingRetry.resolve({ eventId: 'retry_event' });
    await task;

    expect(committedSessions).toEqual([session]);
    expect(committedSessions[0]).toBe(session);
    expect(resolveCalls).toBe(0);
    expect(uiEvents).toEqual([]);
  });

  test('screen passes the original resolve generation into commit and resets on business change', () => {
    const source = readFileSync(SCANNER_SCREEN_SOURCE, 'utf8');
    expect(source).toContain(
      'async (session: PosResolvedSession, generation: number)'
    );
    expect(source).toContain('await commitFromSession(session, generation);');
    expect(source).toContain(
      "dispatch({ type: 'BUSINESS_CHANGED' });"
    );
    expect(source).toContain("refreshDecision === 'preserve'");
  });
});

describe('scanner POS error and capability policy', () => {
  test('terminal product errors never become technical retries', () => {
    expect(classifyPosError(new Error('BUSINESS_CLOSED'), 'commit').kind).toBe(
      'business_closed'
    );
    expect(classifyPosError(new Error('PROGRAM_NOT_FOUND'), 'commit').kind).toBe(
      'stale_program'
    );
    expect(
      classifyPosError(new Error('POS_ENROLL_DISABLED'), 'resolve').kind
    ).toBe('pos_enroll_disabled');
    expect(classifyPosError(new Error('RATE_LIMITED'), 'commit').kind).toBe(
      'rate_limit'
    );
    expect(
      classifyPosError(new Error('PLAN_LIMIT_REACHED'), 'commit').kind
    ).toBe('entitlement');
  });

  test('structured Convex entitlement payloads are classified by code', () => {
    expect(
      classifyPosError(
        { data: { code: 'PLAN_LIMIT_REACHED' } },
        'commit'
      ).kind
    ).toBe('entitlement');
  });

  test('unknown commit error is retryable but unknown resolve error is not', () => {
    expect(
      classifyPosError(new Error('TRANSIENT_DB_ERROR'), 'commit')
        .retrySameSession
    ).toBe(true);
    expect(
      classifyPosError(new Error('TRANSIENT_DB_ERROR'), 'resolve')
        .retrySameSession
    ).toBe(false);
  });

  test('recovery actions follow real capabilities', () => {
    expect(resolveSubscriptionRecovery(true)).toBe('manage_subscription');
    expect(resolveSubscriptionRecovery(false)).toBe('contact_owner');
    expect(resolveNoProgramsRecovery(true)).toBe('manage_programs');
    expect(resolveNoProgramsRecovery(false)).toBe('contact_manager');
  });
});

describe('scanner POS compact presentation contract', () => {
  test('uses a fixed five-column wrapped grid with no horizontal carousel', () => {
    const source = readFileSync(SCANNER_SCREEN_SOURCE, 'utf8');

    expect(source).toContain('const PROGRAM_GRID_COLUMNS = 5;');
    expect(source).toContain(
      'PROGRAM_GRID_GAP * (PROGRAM_GRID_COLUMNS - 1)'
    );
    expect(source).toContain("flexWrap: 'wrap'");
    expect(source).not.toContain('horizontal={true}');
    expect(source).not.toContain('programOptionsScroll');
    expect(source).toContain('{programs.map((program) => {');
    expect(source).not.toContain('programs.length === 1');
  });

  test('uses canonical themes and the business-selected stamp icon', () => {
    const source = readFileSync(SCANNER_SCREEN_SOURCE, 'utf8');

    expect(source).toContain(
      "import { resolveCardTheme } from '@/constants/cardThemes';"
    );
    expect(source).toContain(
      'resolveCardTheme(program.cardThemeId ?? undefined)'
    );
    expect(source).toContain(
      'resolveProgramIconName(program.stampIcon)'
    );
    expect(source).toContain('{program.stampIcon}');
  });

  test('selection has border, icon ring, check, shadow, and accessibility state', () => {
    const source = readFileSync(SCANNER_SCREEN_SOURCE, 'utf8');

    expect(source).toContain('styles.programTileSelected');
    expect(source).toContain('styles.programIconRingSelected');
    expect(source).toContain('styles.programSelectedCheck');
    expect(source).toContain('accessibilityState={{');
    expect(source).toContain('selected,');
    expect(source).toContain('elevation: 5');
  });

  test('removes the old active-card controls and redundant scanner instructions', () => {
    const source = readFileSync(SCANNER_SCREEN_SOURCE, 'utf8');

    expect(source).toContain('בחרו כרטיסייה לסריקה');
    expect(source).not.toContain('תוכנית פעילה בקופה');
    expect(source).not.toContain('החלפה');
    expect(source).not.toContain('הכרטיסייה המסומנת תשמש לסריקות הבאות');
    expect(source).not.toContain('סרקו את קוד הלקוח');
    expect(source).not.toContain('מקמו את קוד ה-QR');
  });

  test('final stamp and already-full scans converge on one redemption offer', () => {
    const source = readFileSync(SCANNER_SCREEN_SOURCE, 'utf8');
    const finalStampBranch = source.slice(
      source.indexOf("session.actionMode === 'stamp' &&"),
      source.indexOf('dispatch({ type: \'SHOW_SUCCESS\'')
    );
    const resolvedFullBranch = source.slice(
      source.indexOf("resolved.resolution === 'REDEEM_AVAILABLE'"),
      source.indexOf('await commitFromSession(session, generation);')
    );

    expect(finalStampBranch).toContain(
      "commitTarget: 'completed_stamp_redemption'"
    );
    expect(finalStampBranch).toContain(
      "type: 'SHOW_REDEEM_CONFIRMATION'"
    );
    expect(resolvedFullBranch).toContain(
      "type: 'SHOW_REDEEM_CONFIRMATION'"
    );
    expect(source).toContain('commitCompletedStampRedeem');
    expect(source).toContain('מימוש ההטבה');
    expect(source).toContain('לא עכשיו');
  });

  test('not-now performs no redemption and returns to the selected scanner', () => {
    const source = readFileSync(SCANNER_SCREEN_SOURCE, 'utf8');
    const redemptionUi = source.slice(
      source.indexOf("flow.phase === 'redeem_confirmation'"),
      source.indexOf("flow.phase === 'technical_retry'")
    );

    expect(redemptionUi).toContain('onPress={resetForNextCustomer}');
    expect(redemptionUi).toContain('לא עכשיו');

    const state = posFlowReducer(
      {
        ...createInitialPosFlowState(),
        phase: 'redeem_confirmation',
        selectedProgramId: 'program_1',
        session: { ...session, actionMode: 'redeem' },
      },
      { type: 'NEXT_CUSTOMER' }
    );
    expect(state.phase).toBe('ready');
    expect(state.selectedProgramId).toBe('program_1');
    expect(state.session).toBeNull();
  });

  test('keeps compact result, countdown undo, and manual RTL helpers', () => {
    const source = readFileSync(SCANNER_SCREEN_SOURCE, 'utf8');

    expect(source).toContain("'נוסף ניקוב'");
    expect(source).toContain("'ההטבה מומשה'");
    expect(source).toContain('ביטול פעולה ${formatUndoCountdown(');
    expect(source).toContain('flexDirection: flexDirection.row');
    expect(source).not.toContain('I18nManager');
    expect(source).not.toContain('forceRTL');
    expect(source).not.toContain('allowRTL');
  });

  test('blocks program tile switching while a POS transaction is in flight', () => {
    const source = readFileSync(SCANNER_SCREEN_SOURCE, 'utf8');
    const reducerSource = readFileSync('lib/scanner/posFlow.ts', 'utf8');
    const selectProgram = source.slice(
      source.indexOf('const selectProgram = useCallback'),
      source.indexOf('const recoverFromStaleProgram')
    );
    const tilePressable = source.slice(
      source.indexOf('{programs.map((program) => {'),
      source.indexOf('const renderResultDetails')
    );

    expect(selectProgram).toContain(
      "(flow.phase !== 'ready' && flow.phase !== 'needs_program')"
    );
    expect(source).toContain(
      "flow.phase === 'ready' || flow.phase === 'needs_program'"
    );
    expect(tilePressable).toContain('disabled={!selectionEnabled}');
    expect(tilePressable).toContain("busy: flow.phase === 'resolving'");
    expect(reducerSource).toContain(
      "if (state.phase !== 'ready' && state.phase !== 'needs_program')"
    );
  });

  test('hides the camera and shows a compact empty state when no program is eligible', () => {
    const source = readFileSync(SCANNER_SCREEN_SOURCE, 'utf8');
    const emptyProgramsUi = source.slice(
      source.indexOf('if (programs.length === 0) {'),
      source.indexOf('const selectionEnabled')
    );
    const cameraGate = source.slice(
      source.indexOf('const shouldShowCamera'),
      source.indexOf('const shouldShowTransactionArea')
    );
    const transactionGate = source.slice(
      source.indexOf('const shouldShowTransactionArea'),
      source.indexOf('<SafeAreaView style={styles.safeArea}')
    );

    expect(emptyProgramsUi).toContain('אין תוכנית פעילה לסריקה');
    expect(emptyProgramsUi).toContain(
      'resolveNoProgramsRecovery(canManagePrograms)'
    );
    expect(emptyProgramsUi).toContain("'/(authenticated)/(business)/cards'");
    expect(emptyProgramsUi).toContain('ניהול תוכניות');
    expect(emptyProgramsUi).not.toContain('<QrScanner');
    expect(cameraGate).toContain('selectedProgram &&');
    expect(transactionGate).toContain('programs.length > 0 &&');
    expect(transactionGate).toContain('selectedProgram &&');
  });

  test('keeps the compact tile fully pressable with a non-color selected state', () => {
    const source = readFileSync(SCANNER_SCREEN_SOURCE, 'utf8');
    const tilePressable = source.slice(
      source.indexOf('{programs.map((program) => {'),
      source.indexOf('const renderResultDetails')
    );

    expect(tilePressable).toContain('accessibilityRole="button"');
    expect(tilePressable).toMatch(
      /accessibilityLabel=\{`בחירת כרטיסייה \$\{program\.title\}`\}/
    );
    expect(tilePressable).toContain('selected,');
    expect(tilePressable).toContain('disabled: !selectionEnabled');
    expect(tilePressable).toContain('pointerEvents="none"');
    expect(tilePressable).toContain('maxFontSizeMultiplier={1.35}');
    expect(tilePressable).toContain('numberOfLines={1}');
    expect(tilePressable).toContain('ellipsizeMode="tail"');
    expect(tilePressable).not.toContain('hitSlop');
    expect(source).toContain('height: 84');
    expect(source).toContain('styles.programSelectedCheck');
    expect(source).toContain('styles.programIconRingSelected');
  });
});
