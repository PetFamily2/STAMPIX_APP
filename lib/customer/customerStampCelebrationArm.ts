import { useMutation } from 'convex/react';
import { useEffect, useState } from 'react';

import { api } from '@/convex/_generated/api';
import {
  getCustomerStampCelebrationSessionEpoch,
  registerCustomerStampCelebrationArmReset,
  subscribeCustomerStampCelebrationSession,
} from '@/lib/customer/customerStampCelebration';

export type CustomerStampCelebrationArmSnapshot = {
  serverArmedAt: number | null;
  serverArmFailed: boolean;
};

const MAX_ARM_ATTEMPTS = 3;
const ARM_RETRY_DELAY_MS = 400;

let snapshot: CustomerStampCelebrationArmSnapshot = {
  serverArmedAt: null,
  serverArmFailed: false,
};
let request: Promise<void> | null = null;
let armGeneration = 0;
const listeners = new Set<
  (next: CustomerStampCelebrationArmSnapshot) => void
>();

function emit(next: CustomerStampCelebrationArmSnapshot) {
  snapshot = next;
  for (const listener of listeners) {
    listener(snapshot);
  }
}

function sleep(ms: number) {
  return new Promise((resolve) => {
    setTimeout(resolve, ms);
  });
}

async function runArmAttempts(
  generation: number,
  readArmedAt: () => Promise<number | null>
) {
  try {
    for (let attempt = 0; attempt < MAX_ARM_ATTEMPTS; attempt += 1) {
      if (generation !== armGeneration) {
        return;
      }
      try {
        const armedAt = await readArmedAt();
        if (generation !== armGeneration) {
          return;
        }
        if (typeof armedAt === 'number' && Number.isFinite(armedAt)) {
          emit({ serverArmedAt: armedAt, serverArmFailed: false });
          return;
        }
      } catch {
        // Retry while the arm mutation is briefly unavailable.
      }
      if (generation !== armGeneration) {
        return;
      }
      if (attempt < MAX_ARM_ATTEMPTS - 1) {
        await sleep(ARM_RETRY_DELAY_MS);
      }
    }
    if (generation !== armGeneration) {
      return;
    }
    emit({ serverArmedAt: null, serverArmFailed: true });
  } finally {
    if (generation === armGeneration) {
      request = null;
    }
  }
}

export function readCustomerStampCelebrationArmSnapshot(): CustomerStampCelebrationArmSnapshot {
  return snapshot;
}

export function resetCustomerStampCelebrationArm() {
  armGeneration += 1;
  request = null;
  emit({ serverArmedAt: null, serverArmFailed: false });
}

export function requestCustomerStampCelebrationArm(
  readArmedAt: () => Promise<number | null>
): Promise<void> {
  if (snapshot.serverArmedAt !== null || snapshot.serverArmFailed) {
    return Promise.resolve();
  }
  if (request) {
    return request;
  }
  const generation = armGeneration;
  request = runArmAttempts(generation, readArmedAt);
  return request;
}

export function resetCustomerStampCelebrationArmForTests() {
  armGeneration += 1;
  request = null;
  snapshot = { serverArmedAt: null, serverArmFailed: false };
  listeners.clear();
}

registerCustomerStampCelebrationArmReset(resetCustomerStampCelebrationArm);

export function useCustomerStampCelebrationArm(): CustomerStampCelebrationArmSnapshot {
  const armSession = useMutation(
    api.memberships.armCustomerStampCelebrationSession
  );
  const [armSnapshot, setArmSnapshot] = useState(snapshot);
  const [sessionEpoch, setSessionEpoch] = useState(
    getCustomerStampCelebrationSessionEpoch
  );

  useEffect(() => {
    const listener = (next: CustomerStampCelebrationArmSnapshot) => {
      setArmSnapshot(next);
    };
    listeners.add(listener);
    setArmSnapshot(snapshot);
    return () => {
      listeners.delete(listener);
    };
  }, []);

  useEffect(() => {
    return subscribeCustomerStampCelebrationSession(() => {
      setSessionEpoch(getCustomerStampCelebrationSessionEpoch());
    });
  }, []);

  useEffect(() => {
    if (sessionEpoch < 0) {
      return;
    }
    void requestCustomerStampCelebrationArm(async () => {
      const result = await armSession({});
      if (
        !result ||
        typeof result.armedAt !== 'number' ||
        !Number.isFinite(result.armedAt)
      ) {
        return null;
      }
      return result.armedAt;
    });
  }, [armSession, sessionEpoch]);

  return armSnapshot;
}
