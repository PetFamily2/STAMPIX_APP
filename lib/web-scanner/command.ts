export type Operation =
  | 'resolve'
  | 'stamp'
  | 'redeem'
  | 'continuation'
  | 'undo'
  | 'referral';
export type Phase =
  | 'IDLE'
  | 'CAMERA_READY'
  | 'QR_LOCKED'
  | 'RESOLVING'
  | 'READY_FOR_ACTION'
  | 'COMMITTING'
  | 'UNKNOWN_OUTCOME'
  | 'RECONCILING'
  | 'SUCCESS'
  | 'ERROR'
  | 'OFFLINE';
export type Scope = {
  actorId: string;
  businessId: string;
  programId: string;
  runtimeId: string;
  deviceId: string;
};
export type Receipt = Record<string, any>;
export type Outcome = {
  status: string;
  actorId: string;
  businessId: string;
  programId: string;
  serverNow: number;
  sessionId: string | null;
  expiresAt: number | null;
  receipt: Receipt | null;
};
export type CommandState = {
  phase: Phase;
  code: string | null;
  session: Receipt | null;
  receipt: Receipt | null;
  operation: Operation | null;
};
export const initialCommand: CommandState = {
  phase: 'IDLE',
  code: null,
  session: null,
  receipt: null,
  operation: null,
};
export class NotSent extends Error {
  constructor(readonly code: string) {
    super(code);
  }
}
export class ServerRejected extends Error {
  constructor(readonly code: string) {
    super(code);
  }
}
export type Transport = {
  probe(scope: Scope): Promise<Outcome>;
  send(
    operation: Operation,
    args: Record<string, any>,
    scope: Scope
  ): Promise<Receipt>;
  outcome(
    operation: Operation | 'recovery',
    args: Record<string, any>,
    scope: Scope
  ): Promise<Outcome>;
};

/** Single command owner; no raw QR, promises, error payloads or intents in state/storage. */
export class WebScannerCommands {
  state: CommandState = initialCommand;
  private busy = false;
  private blocked = false;
  private generation = 0;
  private pending: { operation: Operation; args: Record<string, any> } | null =
    null;
  constructor(
    private readonly deps: {
      scope: Scope;
      transport: Transport;
      online: () => boolean;
      current: () => boolean;
      checkpoint: (uncertain: boolean) => void;
      onState: (state: CommandState) => void;
      now?: () => number;
      recovery?: boolean;
    }
  ) {
    if (deps.recovery) {
      this.blocked = true;
      this.state = {
        ...initialCommand,
        phase: 'UNKNOWN_OUTCOME',
        code: 'RELOAD_REQUIRES_REVIEW',
      };
    }
  }
  private emit(phase: Phase, extra: Partial<CommandState> = {}) {
    this.state = { ...this.state, phase, ...extra };
    this.deps.onState(this.state);
  }
  private valid() {
    return this.deps.current() && this.deps.online();
  }
  private matches(o: Outcome) {
    const s = this.deps.scope;
    return (
      o.actorId === s.actorId &&
      o.businessId === s.businessId &&
      o.programId === s.programId
    );
  }
  cameraReady() {
    if (!this.busy && !this.blocked && this.state.phase === 'IDLE')
      this.emit('CAMERA_READY');
  }
  async decode(qrData: string) {
    if (
      this.busy ||
      this.blocked ||
      !['IDLE', 'CAMERA_READY'].includes(this.state.phase)
    )
      return;
    if (!this.valid()) {
      this.emit('OFFLINE', { code: 'OFFLINE_OR_STALE' });
      return;
    }
    this.emit('QR_LOCKED');
    const args = {
      qrData,
      businessId: this.deps.scope.businessId,
      programId: this.deps.scope.programId,
      scannerRuntimeSessionId: this.deps.scope.runtimeId,
      deviceId: this.deps.scope.deviceId,
    };
    qrData = '';
    await this.execute('resolve', args);
  }
  async action(operation: Exclude<Operation, 'resolve'>, id?: string) {
    if (this.busy || this.blocked || !this.state.session) return;
    const session = this.state.session;
    if (operation === 'stamp' || operation === 'redeem') {
      if (
        this.state.phase !== 'READY_FOR_ACTION' ||
        (operation === 'redeem') !== (session.resolution === 'REDEEM_AVAILABLE')
      )
        return;
    } else if (this.state.phase !== 'SUCCESS') return;
    if (['stamp', 'redeem', 'continuation'].includes(operation)) {
      const expires =
        operation === 'continuation'
          ? this.state.receipt?.redemptionContinuationAvailableUntil
          : session.sessionExpiresAt;
      if (
        typeof expires !== 'number' ||
        (this.deps.now?.() ?? Date.now()) >= expires
      ) {
        this.emit('ERROR', { code: 'SCAN_SESSION_EXPIRED' });
        return;
      }
    }
    if (
      operation === 'undo' &&
      (!this.state.receipt?.eventId ||
        this.state.receipt.undoBlockedReason ||
        (this.deps.now?.() ?? Date.now()) >=
          Number(this.state.receipt.undoAvailableUntil ?? 0))
    ) {
      this.emit('ERROR', { code: 'UNDO_NOT_AVAILABLE' });
      return;
    }
    const args =
      operation === 'undo'
        ? {
            eventId: this.state.receipt?.eventId,
            scannerRuntimeSessionId: this.deps.scope.runtimeId,
            deviceId: this.deps.scope.deviceId,
          }
        : operation === 'referral'
          ? {
              rewardId: id,
              businessId: this.deps.scope.businessId,
              scannerRuntimeSessionId: this.deps.scope.runtimeId,
              deviceId: this.deps.scope.deviceId,
            }
          : { scanSessionId: session.scanSessionId };
    if (operation === 'referral' && !id) return;
    await this.execute(operation, args);
  }
  private async execute(operation: Operation, args: Record<string, any>) {
    if (!this.valid()) {
      if ('qrData' in args) args.qrData = '';
      this.emit('OFFLINE', { code: 'OFFLINE_OR_STALE' });
      return;
    }
    this.busy = true;
    const generation = this.generation;
    this.emit(operation === 'resolve' ? 'RESOLVING' : 'COMMITTING', {
      operation,
      code: null,
    });
    let sent = false;
    let responseReceived = false;
    try {
      const probe = await this.deps.transport.probe(this.deps.scope);
      if (generation !== this.generation || !this.valid())
        throw new NotSent('STALE_OR_OFFLINE');
      if (!this.matches(probe) || probe.status !== 'AUTHORIZED')
        throw new NotSent('PROGRAM_OR_ACTOR_UNAVAILABLE');
      this.deps.checkpoint(true); // only an uncertainty bit + runtime identity; never arguments.
      this.blocked = true;
      this.pending = {
        operation,
        args: operation === 'resolve' ? {} : { ...args },
      };
      sent = true;
      const result = await this.deps.transport.send(
        operation,
        args,
        this.deps.scope
      );
      responseReceived = true;
      if (generation !== this.generation || !this.deps.current()) return;
      if (operation === 'resolve') {
        if (
          !result.scanSessionId ||
          typeof result.sessionExpiresAt !== 'number'
        )
          throw new Error('INVALID_RECEIPT');
        this.clearUncertainty();
        this.emit('READY_FOR_ACTION', { session: result });
      } else {
        // Even an HTTP success is reconciled to an action-specific canonical receipt.
        this.emit('RECONCILING');
        const outcome = await this.deps.transport.outcome(
          operation,
          args,
          this.deps.scope
        );
        if (generation !== this.generation || !this.deps.current()) return;
        this.accept(outcome, operation);
      }
    } catch (error) {
      if (generation !== this.generation || !this.deps.current()) return;
      if (
        !sent ||
        (!responseReceived &&
          (error instanceof NotSent || error instanceof ServerRejected))
      ) {
        this.clearUncertainty();
        this.emit(this.deps.online() ? 'ERROR' : 'OFFLINE', {
          code:
            error instanceof NotSent || error instanceof ServerRejected
              ? error.code
              : 'PREFLIGHT_FAILED',
        });
      } else this.emit('UNKNOWN_OUTCOME', { code: 'OUTCOME_NOT_CONFIRMED' });
    } finally {
      if ('qrData' in args) args.qrData = '';
      this.busy = false;
    }
  }
  private clearUncertainty() {
    this.deps.checkpoint(false);
    this.blocked = false;
    this.pending = null;
  }
  private accept(outcome: Outcome, operation: Operation) {
    if (
      !this.matches(outcome) ||
      !outcome.receipt ||
      (operation === 'resolve'
        ? outcome.status !== 'RESOLVED'
        : outcome.status !== 'CONFIRMED')
    ) {
      this.emit('UNKNOWN_OUTCOME', { code: 'OUTCOME_NOT_CONFIRMED' });
      return;
    }
    this.clearUncertainty();
    if (operation === 'resolve')
      this.emit('READY_FOR_ACTION', { session: outcome.receipt });
    else this.emit('SUCCESS', { receipt: outcome.receipt, code: null });
  }
  async reconcile() {
    if (this.busy || !this.blocked || !this.valid()) return;
    this.busy = true;
    const generation = this.generation;
    const pending = this.pending;
    this.emit('RECONCILING');
    try {
      const outcome = await this.deps.transport.outcome(
        pending?.operation ?? 'recovery',
        {
          ...pending?.args,
          scanSessionId: this.state.session?.scanSessionId,
        },
        this.deps.scope
      );
      if (generation !== this.generation || !this.deps.current()) return;
      if (pending) this.accept(outcome, pending.operation);
      else this.emit('UNKNOWN_OUTCOME', { code: 'RELOAD_REQUIRES_REVIEW' });
    } catch {
      if (generation === this.generation)
        this.emit('UNKNOWN_OUTCOME', { code: 'RECONCILIATION_UNAVAILABLE' });
    } finally {
      this.busy = false;
    }
  }
  async retrySameSession() {
    const pending = this.pending;
    if (
      this.busy ||
      !this.blocked ||
      !pending ||
      !this.valid() ||
      pending.operation === 'resolve' ||
      pending.operation === 'referral' ||
      this.state.phase !== 'UNKNOWN_OUTCOME'
    )
      return;
    // Explicit user request only. Existing contracts bind these operations to a fixed ID.
    // Rejection of a retry cannot prove that the original uncertain request failed.
    this.busy = true;
    const generation = this.generation;
    this.emit('RECONCILING');
    try {
      const probe = await this.deps.transport.probe(this.deps.scope);
      if (
        generation !== this.generation ||
        !this.valid() ||
        !this.matches(probe) ||
        probe.status !== 'AUTHORIZED'
      )
        return;
      const prior = await this.deps.transport.outcome(
        pending.operation,
        pending.args,
        this.deps.scope
      );
      if (generation !== this.generation || !this.valid()) return;
      if (
        this.matches(prior) &&
        prior.status === 'CONFIRMED' &&
        prior.receipt
      ) {
        this.accept(prior, pending.operation);
        return;
      }
      try {
        await this.deps.transport.send(
          pending.operation,
          { ...pending.args },
          this.deps.scope
        );
      } catch {
        /* Only reconciliation can end existing uncertainty. */
      }
      if (generation !== this.generation || !this.valid()) return;
      const after = await this.deps.transport.outcome(
        pending.operation,
        pending.args,
        this.deps.scope
      );
      if (generation !== this.generation || !this.valid()) return;
      this.accept(after, pending.operation);
    } catch {
      if (generation === this.generation)
        this.emit('UNKNOWN_OUTCOME', { code: 'RECONCILIATION_UNAVAILABLE' });
    } finally {
      if (generation === this.generation && this.blocked)
        this.emit('UNKNOWN_OUTCOME', { code: 'OUTCOME_NOT_CONFIRMED' });
      this.busy = false;
    }
  }
  networkChanged() {
    // Reconnect can read only. It never calls send or creates a new resolve/session.
    if (this.deps.online() && this.blocked) void this.reconcile();
    else if (!this.deps.online() && this.blocked)
      this.emit('UNKNOWN_OUTCOME', { code: 'CONNECTION_LOST_AFTER_SEND' });
    else if (!this.deps.online() && !this.busy)
      this.emit('OFFLINE', { code: 'OFFLINE' });
  }
  invalidate() {
    ++this.generation;
    if (this.blocked) this.emit('UNKNOWN_OUTCOME', { code: 'SCOPE_CHANGED' });
    else this.emit('ERROR', { code: 'SCOPE_CHANGED' });
  }
  reset() {
    if (this.busy || this.blocked) return false;
    this.state = initialCommand;
    this.deps.onState(this.state);
    return true;
  }
}
