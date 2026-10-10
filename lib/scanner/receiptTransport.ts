import { NotSent, type Scope } from '../web-scanner/command';
import { createHttpTransport } from '../web-scanner/httpTransport';
import type { ReceiptTransport } from './receiptCommands';

export function createReceiptTransport(
  deps: Parameters<typeof createHttpTransport>[0]
): ReceiptTransport {
  const http = createHttpTransport(deps);
  const args = (
    identity: Scope & { operationId: string; operation: string }
  ) => ({
    operationId: identity.operationId,
    operation: identity.operation,
    businessId: identity.businessId,
    programId: identity.programId,
    runtimeId: identity.runtimeId,
    deviceId: identity.deviceId,
  });
  return {
    probe: async (scope) => {
      const result = await http.probe(scope);
      if (
        result.status !== 'AUTHORIZED' ||
        result.actorId !== scope.actorId ||
        result.businessId !== scope.businessId ||
        result.programId !== scope.programId
      )
        throw new NotSent('NOT_AUTHORIZED');
    },
    send: (identity, input) =>
      http.request(identity, 'mutation', 'scannerCommands:execute', {
        ...args(identity),
        ...(typeof input.qrData === 'string' ? { qrData: input.qrData } : {}),
        ...(input.scanSessionId ? { sessionId: input.scanSessionId } : {}),
        ...(input.eventId ? { eventId: input.eventId } : {}),
        ...(input.rewardId ? { rewardId: input.rewardId } : {}),
      }),
    read: (identity) =>
      http.request(
        identity,
        'query',
        'scannerCommands:getReceipt',
        args(identity)
      ),
  };
}
