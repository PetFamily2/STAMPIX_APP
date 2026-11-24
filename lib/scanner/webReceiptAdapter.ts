import type { Operation, Scope, Transport } from '../web-scanner/command';
import { createHttpTransport } from '../web-scanner/httpTransport';
import { createReceiptTransport } from './receiptTransport';

export function createWebReceiptAdapter(
  deps: Parameters<typeof createHttpTransport>[0]
): Transport {
  const legacy = createHttpTransport(deps);
  const receipts = createReceiptTransport(deps);
  const identity = (
    scope: Scope,
    operation: Operation,
    args: Record<string, any>
  ) => ({ ...scope, operation, operationId: args.clientOperationId });
  return {
    supportsOperationReceipt: true,
    probe: legacy.probe,
    send: (operation, args, scope) =>
      receipts.send(identity(scope, operation, args), args),
    outcome: async (operation, args, scope) => {
      if (operation === 'recovery' || !args.clientOperationId)
        return legacy.outcome(operation, args, scope);
      const result = await receipts.read(identity(scope, operation, args));
      return {
        actorId: scope.actorId,
        businessId: scope.businessId,
        programId: scope.programId,
        serverNow: Date.now(),
        status:
          result.status === 'CONFIRMED' && operation === 'resolve'
            ? 'RESOLVED'
            : result.status,
        sessionId: result.receipt?.scanSessionId ?? args.scanSessionId ?? null,
        expiresAt: result.receipt?.sessionExpiresAt ?? null,
        receipt: result.receipt,
      };
    },
  };
}
