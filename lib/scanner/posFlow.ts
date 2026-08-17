export type PosPhase =
  | 'setup'
  | 'needs_program'
  | 'ready'
  | 'resolving'
  | 'redeem_confirmation'
  | 'technical_retry'
  | 'terminal_error'
  | 'success'
  | 'reversed';

export type CameraPermissionAction =
  | 'loading'
  | 'camera'
  | 'request'
  | 'settings';

export function resolveCameraPermissionAction(
  permission: { granted: boolean; canAskAgain: boolean } | null | undefined
): CameraPermissionAction {
  if (!permission) {
    return 'loading';
  }
  if (permission.granted) {
    return 'camera';
  }
  return permission.canAskAgain ? 'request' : 'settings';
}

export function shouldRefreshCameraPermission(appState: string) {
  return appState === 'active';
}

export type PosActionMode = 'stamp' | 'redeem';

export type PosProgramSnapshot = {
  programId: string;
  title: string;
  rewardName: string;
  maxStamps: number;
  allowPosEnroll: boolean;
};

export type PosMembershipSnapshot = {
  membershipId: string;
  currentStamps: number;
  maxStamps: number;
  canRedeemNow: boolean;
} | null;

export type PosResolvedSession = {
  scanSessionId: string;
  sessionExpiresAt: number;
  customerUserId: string;
  customerDisplayName: string;
  membership: PosMembershipSnapshot;
  program: PosProgramSnapshot;
  actionMode: PosActionMode;
  joinedCustomer: boolean;
};

export type PosUndoState = {
  eventId: string;
  availableUntil: number;
  actionMode: PosActionMode;
};

export type PosTransactionResult = {
  customerUserId: string;
  customerDisplayName: string;
  program: PosProgramSnapshot;
  actionMode: PosActionMode;
  joinedCustomer: boolean;
  currentStamps: number;
  maxStamps: number;
  canRedeemNow: boolean;
  undo: PosUndoState | null;
  undoBlockedReason: 'REFERRAL_REWARD_TRIGGERED' | null;
};

export type PosErrorKind =
  | 'business_closed'
  | 'stale_program'
  | 'qr_invalid'
  | 'qr_expired'
  | 'qr_used'
  | 'pos_enroll_disabled'
  | 'authorization'
  | 'entitlement'
  | 'rate_limit'
  | 'session'
  | 'business_rule'
  | 'technical';

export type PosErrorPresentation = {
  code: string;
  kind: PosErrorKind;
  message: string;
  retrySameSession: boolean;
  canChangeProgram: boolean;
};

export type PosFlowState = {
  phase: PosPhase;
  selectedProgramId: string | null;
  scannerResetKey: number;
  notice: string | null;
  session: PosResolvedSession | null;
  result: PosTransactionResult | null;
  error: PosErrorPresentation | null;
  referralExpanded: boolean;
};

export type PosFlowEvent =
  | {
      type: 'PROGRAMS_READY';
      programIds: string[];
      savedProgramId: string | null;
    }
  | { type: 'SELECT_PROGRAM'; programId: string }
  | { type: 'CHANGE_PROGRAM' }
  | { type: 'BEGIN_RESOLVE' }
  | { type: 'SHOW_REDEEM_CONFIRMATION'; session: PosResolvedSession }
  | {
      type: 'SHOW_TECHNICAL_RETRY';
      session: PosResolvedSession;
      error: PosErrorPresentation;
    }
  | { type: 'SHOW_TERMINAL_ERROR'; error: PosErrorPresentation }
  | { type: 'SHOW_SUCCESS'; result: PosTransactionResult }
  | { type: 'SHOW_REVERSED'; result: PosTransactionResult }
  | { type: 'EXPIRE_UNDO' }
  | { type: 'TOGGLE_REFERRALS' }
  | { type: 'NEXT_CUSTOMER' }
  | { type: 'BUSINESS_CHANGED' }
  | { type: 'CLEAR_STALE_PROGRAM'; notice: string };

export type TransactionGenerationRef = {
  current: number;
};

export function captureTransactionGeneration(
  generationRef: TransactionGenerationRef
) {
  return generationRef.current;
}

export function invalidateTransactionGeneration(
  generationRef: TransactionGenerationRef
) {
  generationRef.current += 1;
  return generationRef.current;
}

export function isTransactionGenerationCurrent(
  generationRef: TransactionGenerationRef,
  generation: number
) {
  return generationRef.current === generation;
}

export async function awaitCurrentTransaction<T>(
  generationRef: TransactionGenerationRef,
  generation: number,
  operation: () => Promise<T>
): Promise<{ status: 'current'; value: T } | { status: 'stale' }> {
  const value = await operation();
  if (!isTransactionGenerationCurrent(generationRef, generation)) {
    return { status: 'stale' };
  }
  return { status: 'current', value };
}

export function resolveSameBusinessProgramRefresh(
  selectedProgramId: string | null,
  programIds: string[]
) {
  if (!selectedProgramId) {
    return 'hydrate' as const;
  }
  return programIds.includes(selectedProgramId)
    ? ('preserve' as const)
    : ('stale' as const);
}

const KNOWN_ERROR_CODES = [
  'BUSINESS_PERMANENT_DELETION_IN_PROGRESS',
  'PROGRAM_NOT_SCANNER_ELIGIBLE',
  'UNDO_SESSION_CONTINUITY_BROKEN',
  'UNDO_NOT_LAST_MEMBERSHIP_EVENT',
  'UNDO_NOT_LAST_SESSION_EVENT',
  'UNDO_BLOCKED_REFERRAL_REWARD',
  'UNDO_REDEEM_DISABLED',
  'SUBSCRIPTION_INACTIVE',
  'PLAN_LIMIT_REACHED',
  'FEATURE_NOT_AVAILABLE',
  'SCAN_SESSION_EXPIRED',
  'INVALID_SCAN_SESSION',
  'SCAN_SESSION_FAILED',
  'INVALID_SCAN_ACTION',
  'TOKEN_ALREADY_USED',
  'POS_ENROLL_DISABLED',
  'PROGRAM_NOT_FOUND',
  'MEMBERSHIP_NOT_FOUND',
  'NOT_ENOUGH_STAMPS',
  'CUSTOMER_NOT_FOUND',
  'BUSINESS_NOT_FOUND',
  'BUSINESS_CLOSED',
  'NOT_AUTHENTICATED',
  'NOT_AUTHORIZED',
  'UNDO_PERMISSION_DENIED',
  'UNDO_SESSION_MISMATCH',
  'UNDO_EXPIRED',
  'EVENT_NOT_FOUND',
  'EVENT_NOT_REVERSIBLE',
  'UNDO_NOT_ALLOWED',
  'INVALID_QR',
  'EXPIRED_TOKEN',
  'SELF_STAMP',
  'RATE_LIMITED',
] as const;

function cleanTransactionState(
  state: PosFlowState,
  phase: 'ready' | 'needs_program'
): PosFlowState {
  return {
    phase,
    selectedProgramId: state.selectedProgramId,
    scannerResetKey: state.scannerResetKey + 1,
    notice: null,
    session: null,
    result: null,
    error: null,
    referralExpanded: false,
  };
}

export function createInitialPosFlowState(): PosFlowState {
  return {
    phase: 'setup',
    selectedProgramId: null,
    scannerResetKey: 0,
    notice: null,
    session: null,
    result: null,
    error: null,
    referralExpanded: false,
  };
}

export function resolveProgramPreset(
  programIds: string[],
  savedProgramId: string | null
) {
  if (programIds.length === 0) {
    return { phase: 'needs_program' as const, selectedProgramId: null };
  }
  if (programIds.length === 1) {
    return {
      phase: 'ready' as const,
      selectedProgramId: programIds[0] ?? null,
    };
  }
  if (savedProgramId && programIds.includes(savedProgramId)) {
    return {
      phase: 'ready' as const,
      selectedProgramId: savedProgramId,
    };
  }
  return { phase: 'needs_program' as const, selectedProgramId: null };
}

export function posFlowReducer(
  state: PosFlowState,
  event: PosFlowEvent
): PosFlowState {
  switch (event.type) {
    case 'PROGRAMS_READY': {
      const preset = resolveProgramPreset(
        event.programIds,
        event.savedProgramId
      );
      return {
        ...createInitialPosFlowState(),
        phase: preset.phase,
        selectedProgramId: preset.selectedProgramId,
        scannerResetKey: state.scannerResetKey + 1,
      };
    }
    case 'SELECT_PROGRAM':
      return {
        ...cleanTransactionState(state, 'ready'),
        selectedProgramId: event.programId,
      };
    case 'CHANGE_PROGRAM':
      return {
        ...cleanTransactionState(state, 'needs_program'),
        selectedProgramId: null,
      };
    case 'BEGIN_RESOLVE':
      return {
        ...state,
        phase: 'resolving',
        notice: null,
        session: null,
        result: null,
        error: null,
        referralExpanded: false,
      };
    case 'SHOW_REDEEM_CONFIRMATION':
      return {
        ...state,
        phase: 'redeem_confirmation',
        session: event.session,
        result: null,
        error: null,
        referralExpanded: false,
      };
    case 'SHOW_TECHNICAL_RETRY':
      return {
        ...state,
        phase: 'technical_retry',
        session: event.session,
        result: null,
        error: event.error,
        referralExpanded: false,
      };
    case 'SHOW_TERMINAL_ERROR':
      return {
        ...state,
        phase: 'terminal_error',
        session: null,
        result: null,
        error: event.error,
        referralExpanded: false,
      };
    case 'SHOW_SUCCESS':
      return {
        ...state,
        phase: 'success',
        session: null,
        result: event.result,
        error: null,
        referralExpanded: false,
      };
    case 'SHOW_REVERSED':
      return {
        ...state,
        phase: 'reversed',
        session: null,
        result: event.result,
        error: null,
        referralExpanded: false,
      };
    case 'EXPIRE_UNDO':
      return state.result
        ? { ...state, result: { ...state.result, undo: null } }
        : state;
    case 'TOGGLE_REFERRALS':
      return { ...state, referralExpanded: !state.referralExpanded };
    case 'NEXT_CUSTOMER':
      return cleanTransactionState(
        state,
        state.selectedProgramId ? 'ready' : 'needs_program'
      );
    case 'BUSINESS_CHANGED':
      return {
        ...createInitialPosFlowState(),
        scannerResetKey: state.scannerResetKey + 1,
      };
    case 'CLEAR_STALE_PROGRAM':
      return {
        phase: 'needs_program',
        selectedProgramId: null,
        scannerResetKey: state.scannerResetKey + 1,
        notice: event.notice,
        session: null,
        result: null,
        error: null,
        referralExpanded: false,
      };
  }
}

function errorMessage(error: unknown): string {
  if (error instanceof Error) {
    return error.message;
  }
  if (typeof error === 'string') {
    return error;
  }
  return '';
}

function knownStructuredErrorCode(error: unknown): string | null {
  if (typeof error !== 'object' || error === null) {
    return null;
  }

  const record = error as Record<string, unknown>;
  const candidates = [record.code, record.data, record.cause];
  for (const candidate of candidates) {
    if (typeof candidate === 'string') {
      const knownCode = KNOWN_ERROR_CODES.find((code) => code === candidate);
      if (knownCode) {
        return knownCode;
      }
      continue;
    }
    if (typeof candidate === 'object' && candidate !== null) {
      const nested = candidate as Record<string, unknown>;
      if (typeof nested.code === 'string') {
        const knownCode = KNOWN_ERROR_CODES.find(
          (code) => code === nested.code
        );
        if (knownCode) {
          return knownCode;
        }
      }
    }
  }

  return null;
}

export function extractPosErrorCode(error: unknown): string {
  const structuredCode = knownStructuredErrorCode(error);
  if (structuredCode) {
    return structuredCode;
  }
  const message = errorMessage(error);
  const code = KNOWN_ERROR_CODES.find((candidate) =>
    message.includes(candidate)
  );
  return code ?? 'UNKNOWN';
}

export function classifyPosError(
  error: unknown,
  context: 'resolve' | 'commit' | 'undo'
): PosErrorPresentation {
  const code = extractPosErrorCode(error);

  if (
    code === 'PROGRAM_NOT_FOUND' ||
    code === 'PROGRAM_NOT_SCANNER_ELIGIBLE'
  ) {
    return {
      code,
      kind: 'stale_program',
      message: 'התוכנית שנבחרה כבר אינה זמינה. יש לבחור תוכנית אחרת.',
      retrySameSession: false,
      canChangeProgram: true,
    };
  }
  if (
    code === 'BUSINESS_CLOSED' ||
    code === 'BUSINESS_NOT_FOUND' ||
    code === 'BUSINESS_PERMANENT_DELETION_IN_PROGRESS'
  ) {
    return {
      code,
      kind: 'business_closed',
      message: 'העסק אינו פעיל כרגע ולא ניתן לבצע סריקות.',
      retrySameSession: false,
      canChangeProgram: false,
    };
  }
  if (code === 'INVALID_QR') {
    return {
      code,
      kind: 'qr_invalid',
      message: 'זה אינו קוד QR תקין של לקוח.',
      retrySameSession: false,
      canChangeProgram: false,
    };
  }
  if (code === 'EXPIRED_TOKEN') {
    return {
      code,
      kind: 'qr_expired',
      message: 'תוקף ה-QR פג. בקשו מהלקוח לרענן את הקוד.',
      retrySameSession: false,
      canChangeProgram: false,
    };
  }
  if (code === 'TOKEN_ALREADY_USED') {
    return {
      code,
      kind: 'qr_used',
      message: 'ה-QR כבר שימש לפעולה. בקשו מהלקוח לרענן את הקוד.',
      retrySameSession: false,
      canChangeProgram: false,
    };
  }
  if (code === 'POS_ENROLL_DISABLED') {
    return {
      code,
      kind: 'pos_enroll_disabled',
      message: 'התוכנית הזו מיועדת ללקוחות קיימים בלבד.',
      retrySameSession: false,
      canChangeProgram: true,
    };
  }
  if (code === 'NOT_AUTHORIZED' || code === 'NOT_AUTHENTICATED') {
    return {
      code,
      kind: 'authorization',
      message: 'אין הרשאה לבצע פעולת סריקה בעסק הזה.',
      retrySameSession: false,
      canChangeProgram: false,
    };
  }
  if (
    code === 'FEATURE_NOT_AVAILABLE' ||
    code === 'PLAN_LIMIT_REACHED' ||
    code === 'SUBSCRIPTION_INACTIVE'
  ) {
    return {
      code,
      kind: 'entitlement',
      message: 'מגבלת המסלול אינה מאפשרת להשלים את הפעולה כרגע.',
      retrySameSession: false,
      canChangeProgram: false,
    };
  }
  if (code === 'RATE_LIMITED') {
    return {
      code,
      kind: 'rate_limit',
      message: 'אפשר לנקב שוב לאותו לקוח לאחר 30 שניות.',
      retrySameSession: false,
      canChangeProgram: false,
    };
  }
  if (
    code === 'INVALID_SCAN_SESSION' ||
    code === 'SCAN_SESSION_EXPIRED' ||
    code === 'SCAN_SESSION_FAILED' ||
    code === 'INVALID_SCAN_ACTION'
  ) {
    return {
      code,
      kind: 'session',
      message: 'הסריקה אינה פעילה יותר. יש לסרוק את הלקוח מחדש.',
      retrySameSession: false,
      canChangeProgram: false,
    };
  }
  if (context === 'undo') {
    return {
      code,
      kind: 'business_rule',
      message: 'לא ניתן לבטל את הפעולה האחרונה.',
      retrySameSession: false,
      canChangeProgram: false,
    };
  }
  if (
    code === 'SELF_STAMP' ||
    code === 'CUSTOMER_NOT_FOUND' ||
    code === 'MEMBERSHIP_NOT_FOUND' ||
    code === 'NOT_ENOUGH_STAMPS'
  ) {
    const messages: Record<string, string> = {
      SELF_STAMP: 'לא ניתן לנקב לעצמכם.',
      CUSTOMER_NOT_FOUND: 'הלקוח לא נמצא.',
      MEMBERSHIP_NOT_FOUND: 'ללקוח אין כרטיס פעיל בתוכנית שנבחרה.',
      NOT_ENOUGH_STAMPS: 'אין מספיק ניקובים למימוש ההטבה.',
    };
    return {
      code,
      kind: 'business_rule',
      message: messages[code] ?? 'לא ניתן להשלים את הפעולה.',
      retrySameSession: false,
      canChangeProgram: false,
    };
  }

  return {
    code,
    kind: 'technical',
    message:
      context === 'commit'
        ? 'אירעה תקלה טכנית. אפשר לנסות שוב בלי לסרוק מחדש.'
        : 'אירעה תקלה טכנית. יש לנסות לסרוק שוב.',
    retrySameSession: context === 'commit',
    canChangeProgram: false,
  };
}

export function resolveSubscriptionRecovery(canManageSubscription: boolean) {
  return canManageSubscription
    ? ('manage_subscription' as const)
    : ('contact_owner' as const);
}

export function resolveNoProgramsRecovery(canManagePrograms: boolean) {
  return canManagePrograms
    ? ('manage_programs' as const)
    : ('contact_manager' as const);
}
