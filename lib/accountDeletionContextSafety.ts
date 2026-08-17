export function resolveFreshUserIdAfterDeletedUserSuppression<
  TUserId extends string,
>(
  userResultId: TUserId | null | undefined,
  sessionResultId: TUserId | null | undefined,
  deletedUserId: TUserId | null | undefined
): TUserId | null {
  if (
    deletedUserId == null ||
    userResultId === deletedUserId ||
    sessionResultId === deletedUserId
  ) {
    return null;
  }

  return userResultId ?? sessionResultId ?? null;
}

export function shouldSuppressDeletedUserPresentation<
  TUserId extends string,
>(
  userResultId: TUserId | null | undefined,
  sessionResultId: TUserId | null | undefined,
  deletedUserId: TUserId | null | undefined
) {
  return (
    deletedUserId != null &&
    (userResultId === deletedUserId || sessionResultId === deletedUserId)
  );
}

export function createSerializedAsyncOperationQueue() {
  let tail: Promise<void> = Promise.resolve();

  return {
    enqueue(operation: () => Promise<void>) {
      const task = tail.then(operation, operation);
      tail = task.catch(() => undefined);
      return task;
    },
  };
}

export async function hydrateNotificationPreference(options: {
  generation: number;
  getCurrentGeneration: () => number;
  readCanonicalPreference: () => Promise<string | null>;
  readLegacyPreference: () => Promise<string | null>;
  writeCanonicalPreference: (value: string) => Promise<void>;
  removeLegacyPreference: () => Promise<void>;
  setEnabled: (enabled: boolean) => void;
  finishLoading: () => void;
}) {
  const isCurrentGeneration = () =>
    options.generation === options.getCurrentGeneration();

  try {
    const canonicalPreference = await options.readCanonicalPreference();
    if (!isCurrentGeneration()) {
      return;
    }

    const legacyPreference =
      canonicalPreference === null
        ? await options.readLegacyPreference()
        : null;
    if (!isCurrentGeneration()) {
      return;
    }

    const storedPreference = canonicalPreference ?? legacyPreference;
    if (storedPreference !== null) {
      if (!isCurrentGeneration()) {
        return;
      }
      options.setEnabled(storedPreference === '1');
    }

    if (legacyPreference !== null) {
      if (!isCurrentGeneration()) {
        return;
      }
      await options.writeCanonicalPreference(legacyPreference);
      if (!isCurrentGeneration()) {
        return;
      }
      await options.removeLegacyPreference();
    }
  } finally {
    if (isCurrentGeneration()) {
      options.finishLoading();
    }
  }
}
