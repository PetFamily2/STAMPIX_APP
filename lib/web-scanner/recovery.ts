export type RecoveryIdentity = {
  runtimeId: string;
  deviceId: string;
  uncertain: boolean;
};
/** Recovery metadata is not a write intent: no operation, QR, resource ID or arguments. */
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
    };
  } else identity = { runtimeId: uuid(), deviceId: uuid(), uncertain: false };
  const write = () => storage.setItem(key, JSON.stringify(identity));
  write(); // If durable uncertainty cannot be marked, this lab must not submit.
  return {
    identity,
    checkpoint: (uncertain: boolean) => {
      identity.uncertain = uncertain;
      write();
    },
    rotate: () => {
      if (identity.uncertain) throw new Error('UNKNOWN_OUTCOME');
      identity.runtimeId = uuid();
      write();
    },
  };
}
