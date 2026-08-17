export type AccountDeletionServerResult = {
  success: boolean;
};

export type AccountDeletionCleanupStep = {
  name: string;
  run: () => void | Promise<void>;
};

export type AccountDeletionFlowResult<
  TResult extends AccountDeletionServerResult,
> =
  | {
      status: 'server_rejected';
      result: TResult;
    }
  | {
      status: 'deleted';
      result: TResult;
      failedCleanupSteps: string[];
    };

export async function runAccountDeletionWithCleanup<
  TResult extends AccountDeletionServerResult,
>(options: {
  deleteAccount: () => Promise<TResult>;
  cleanupSteps: readonly AccountDeletionCleanupStep[];
  onCleanupWarning?: (failedStepNames: readonly string[]) => void | Promise<void>;
}): Promise<AccountDeletionFlowResult<TResult>> {
  const result = await options.deleteAccount();
  if (!result.success) {
    return { status: 'server_rejected', result };
  }

  const failedCleanupSteps: string[] = [];
  for (const step of options.cleanupSteps) {
    try {
      await step.run();
    } catch {
      failedCleanupSteps.push(step.name);
    }
  }

  if (failedCleanupSteps.length > 0 && options.onCleanupWarning) {
    try {
      await options.onCleanupWarning(failedCleanupSteps);
    } catch {
      // Warning reporting must not change an already-completed deletion.
    }
  }

  return {
    status: 'deleted',
    result,
    failedCleanupSteps,
  };
}
