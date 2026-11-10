import {
  NotSent,
  type Operation,
  type Receipt,
  type Scope,
  ServerRejected,
} from '../web-scanner/command';
export type OperationIdentity = Scope & {
  operation: Operation;
  operationId: string;
};
export type SafetyPhase =
  | 'IDLE'
  | 'COMMITTING'
  | 'UNKNOWN_OUTCOME'
  | 'RECONCILING'
  | 'ERROR'
  | 'SUCCESS'
  | 'OFFLINE';
export type ReceiptTransport = {
  probe(scope: Scope): Promise<void>;
  send(
    identity: OperationIdentity,
    args: Record<string, unknown>
  ): Promise<Receipt>;
  read(
    identity: OperationIdentity
  ): Promise<{ status: string; receipt: Receipt | null }>;
};
/** No reconnect writer. Only non-executable receipt identity is durable. */
export class ReceiptCommands {
  phase: SafetyPhase = 'IDLE';
  private pending: {
    identity: OperationIdentity;
    args: Record<string, unknown> | null;
    uncertain?: boolean;
    resolve?: (r: Receipt) => void;
    reject?: (e: Error) => void;
  } | null = null;
  private busy = false;
  private disposed = false;
  constructor(
    private readonly deps: {
      transport: ReceiptTransport;
      valid: () => boolean;
      uuid: () => string;
      save: (identity: OperationIdentity | null) => Promise<void>;
      state: (phase: SafetyPhase, receipt?: Receipt) => void;
    }
  ) {}
  private emit(phase: SafetyPhase, receipt?: Receipt) {
    if (phase === 'UNKNOWN_OUTCOME' && this.pending)
      this.pending.uncertain = true;
    this.phase = phase;
    if (!this.disposed) this.deps.state(phase, receipt);
  }
  restore(identity: OperationIdentity) {
    this.pending = { identity, args: null };
    this.emit('UNKNOWN_OUTCOME');
  }
  run(
    operation: Operation,
    args: Record<string, unknown>,
    scope: Scope
  ): Promise<Receipt> {
    if (this.pending || this.busy || this.disposed || !this.deps.valid())
      return Promise.reject(new NotSent('OFFLINE_OR_PENDING'));
    this.busy = true;
    const identity = { ...scope, operation, operationId: this.deps.uuid() };
    return new Promise((resolve, reject) => {
      this.pending = { identity, args: { ...args }, resolve, reject };
      void this.submit(true);
    });
  }
  private async submit(initial: boolean) {
    const pending = this.pending;
    if (!pending || !pending.args) {
      this.busy = false;
      return;
    }
    let invoked = false;
    let responseReceived = false;
    try {
      await this.deps.transport.probe(pending.identity);
      if (!this.deps.valid() || this.disposed)
        throw new NotSent('STALE_OR_OFFLINE');
      // Failure to durably mark uncertainty prevents transmission.
      await this.deps.save(pending.identity);
      if (!this.deps.valid() || this.disposed)
        throw new NotSent('STALE_OR_OFFLINE');
      this.emit('COMMITTING');
      invoked = true;
      await this.deps.transport.send(pending.identity, pending.args);
      responseReceived = true;
      if (!this.disposed) await this.confirm(pending);
    } catch (error) {
      if (
        initial &&
        (!invoked ||
          (!responseReceived &&
            (error instanceof NotSent || error instanceof ServerRejected)))
      ) {
        await this.deps.save(null).catch(() => {});
        this.pending = null;
        pending.reject?.(
          error instanceof Error ? error : new Error('NOT_SENT')
        );
        this.emit('OFFLINE');
      } else this.emit('UNKNOWN_OUTCOME');
    } finally {
      if (pending.identity.operation === 'resolve' && pending.args) {
        delete pending.args.qrData;
        pending.args = null;
      }
      this.busy = false;
    }
  }
  private async confirm(pending: NonNullable<ReceiptCommands['pending']>) {
    this.emit('RECONCILING');
    const outcome = await this.deps.transport.read(pending.identity);
    if (this.disposed || !this.deps.valid()) return;
    if (outcome.status !== 'CONFIRMED' || !outcome.receipt) {
      this.emit('UNKNOWN_OUTCOME');
      return;
    }
    await this.deps.save(null);
    if (this.disposed || !this.deps.valid()) return;
    this.pending = null;
    const receipt = pending.uncertain
      ? { ...outcome.receipt, reconciledAfterUnknown: true }
      : outcome.receipt;
    if (typeof receipt.commandFailureCode === 'string') {
      this.emit('ERROR', receipt);
      pending.reject?.(new ServerRejected(receipt.commandFailureCode));
      return;
    }
    this.emit('SUCCESS', receipt);
    pending.resolve?.(receipt);
  }
  async reconcile() {
    if (!this.pending || this.busy || !this.deps.valid() || this.disposed)
      return;
    this.busy = true;
    try {
      await this.confirm(this.pending);
    } catch {
      this.emit('UNKNOWN_OUTCOME');
    } finally {
      this.busy = false;
    }
  }
  async retrySameOperation() {
    await this.reconcile();
    if (!this.pending?.args || this.busy || !this.deps.valid() || this.disposed)
      return;
    this.busy = true;
    await this.submit(false);
  }
  networkChanged(connected?: boolean) {
    if (this.pending && (connected === false || !this.deps.valid()))
      this.emit('UNKNOWN_OUTCOME');
    else if (this.deps.valid()) void this.reconcile();
  }
  invalidate() {
    this.disposed = true;
    this.pending?.reject?.(new NotSent('SCOPE_CHANGED'));
    if (this.pending?.args) delete this.pending.args.qrData;
    if (this.pending) {
      this.pending.args = null;
      this.pending.resolve = undefined;
      this.pending.reject = undefined;
    }
  }
  get canRetry() {
    return (
      !!this.pending?.args && this.phase === 'UNKNOWN_OUTCOME' && !this.busy
    );
  }
  get locked() {
    return !!this.pending || this.busy;
  }
}
