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
  readPreference: () => Promise<string | null>;
  setEnabled: (enabled: boolean) => void;
  finishLoading: () => void;
}) {
  const isCurrentGeneration = () =>
    options.generation === options.getCurrentGeneration();

  try {
    const storedPreference = await options.readPreference();
    if (!isCurrentGeneration()) {
      return;
    }

    if (storedPreference !== null) {
      options.setEnabled(storedPreference === '1');
    }
  } finally {
    if (isCurrentGeneration()) {
      options.finishLoading();
    }
  }
}
