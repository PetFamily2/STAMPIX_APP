import type { Operation } from './command';
export type RecoveryIdentity = {
  runtimeId: string;
  deviceId: string;
  uncertain: boolean;
  operation?: Operation;
  operationId?: string;
};
/** Recovery metadata is not a write intent: only a receipt identity, no QR, resource ID or executable arguments. */
export function recoveryIdentity(
  storage: Pick<Storage, 'getItem' | 'setItem'>,
  key: string,
  uuid: () => string = () => crypto.randomUUID()
) {
  const stored = storage.getItem(key);
  let identity: RecoveryIdentity;
  if (stored) {
    const value = JSON.parse(stored);
    if (
      typeof value.runtimeId !== 'string' ||
      typeof value.deviceId !== 'string' ||
      typeof value.uncertain !== 'boolean' ||
      value.runtimeId.length > 160 ||
      value.deviceId.length > 160
    ) {
      throw new Error('RECOVERY_METADATA_UNAVAILABLE');
    }
    identity = {
      runtimeId: value.runtimeId,
      deviceId: value.deviceId,
      uncertain: value.uncertain,
      ...(value.operationId &&
      [
        'resolve',
        'stamp',
        'redeem',
        'continuation',
        'undo',
        'referral',
      ].includes(value.operation) &&
      typeof value.operationId === 'string' &&
      value.operationId.length <= 160
        ? { operation: value.operation, operationId: value.operationId }
        : {}),
    };
  } else identity = { runtimeId: uuid(), deviceId: uuid(), uncertain: false };
  const write = () => storage.setItem(key, JSON.stringify(identity));
  write(); // If durable uncertainty cannot be marked, this lab must not submit.
  return {
    identity,
    checkpoint: (
      uncertain: boolean,
      receipt?: { operation: Operation; operationId: string }
    ) => {
      identity.uncertain = uncertain;
      if (uncertain && receipt) {
        identity.operation = receipt.operation;
        identity.operationId = receipt.operationId;
      } else if (!uncertain) {
        delete identity.operation;
        delete identity.operationId;
      }
      write();
    },
    rotate: () => {
      if (identity.uncertain) throw new Error('UNKNOWN_OUTCOME');
      identity.runtimeId = uuid();
      write();
    },
  };
}

/** An unresolved operation fences all programs for the same actor/business after reload. */
export function pendingProgram(
  storage: Pick<Storage, 'length' | 'key' | 'getItem'>,
  actorId: string,
  businessId: string
) {
  const prefix = `stampaix:web-scanner-recovery:${actorId}:${businessId}:`;
  let program: string | null = null;
  for (let i = 0; i < storage.length; i++) {
    const key = storage.key(i);
    if (!key?.startsWith(prefix)) continue;
    const value = JSON.parse(storage.getItem(key) ?? '{}');
    if (value.uncertain !== true) continue;
    const candidate = key.slice(prefix.length);
    if (!candidate || candidate.length > 160 || program)
      throw new Error('RECOVERY_SCOPE_REQUIRES_REVIEW');
    program = candidate;
  }
  return program;
}
