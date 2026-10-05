import { ConvexHttpClient } from 'convex/browser';
import { makeFunctionReference } from 'convex/server';
import {
  NotSent,
  type Operation,
  type Outcome,
  type Scope,
  ServerRejected,
  type Transport,
} from './command';

const paths: Record<Operation, string> = {
  resolve: 'scanner:resolveScan',
  stamp: 'scanner:commitStamp',
  redeem: 'scanner:commitRedeem',
  continuation: 'scanner:commitCompletedStampRedeem',
  undo: 'scanner:undoLastScannerAction',
  referral: 'referrals:redeemReferralBenefit',
};
/** No WebSocket, retry, durable arguments, keepalive, service worker or background sync. */
export function createHttpTransport(deps: {
  url: string;
  token: () => string | null;
  valid: () => boolean;
  online: () => boolean;
  fetch?: typeof fetch;
  timeoutMs?: number;
}): Transport {
  const run = async (
    scope: Scope,
    kind: 'query' | 'mutation',
    path: string,
    args: Record<string, any>
  ) => {
    if (!deps.valid() || !deps.online()) throw new NotSent('OFFLINE_OR_STALE');
    const token = deps.token();
    if (!token) throw new NotSent('NOT_AUTHENTICATED');
    const abort = new AbortController();
    const timer = setTimeout(() => abort.abort(), deps.timeoutMs ?? 12000);
    let definitiveCode: string | null = null;
    const client = new ConvexHttpClient(deps.url, {
      logger: false,
      auth: token,
      fetch: async (input, init) => {
        if (!deps.valid() || !deps.online() || deps.token() !== token)
          throw new NotSent('STALE_OR_OFFLINE');
        const response = await (deps.fetch ?? fetch)(input, {
          ...init,
          signal: abort.signal,
          cache: 'no-store',
          credentials: 'omit',
          redirect: 'error',
          keepalive: false,
        });
        // Only a well-formed UDF error response is definitive. Do not retain error messages.
        try {
          if (response.ok || response.status === 560) {
            const envelope = await response.clone().json();
            if (envelope.status === 'error') {
              const match = /\b[A-Z][A-Z_]{3,70}\b/.exec(
                String(envelope.errorMessage ?? '')
              );
              definitiveCode = match?.[0] ?? 'SERVER_REJECTED';
            }
          }
        } catch {
          /* malformed/transport errors remain unknown */
        }
        return response;
      },
    });
    try {
      return kind === 'mutation'
        ? await client.mutation(makeFunctionReference<'mutation'>(path), args, {
            skipQueue: true,
          })
        : await client.query(makeFunctionReference<'query'>(path), args);
    } catch (error) {
      if (definitiveCode) throw new ServerRejected(definitiveCode);
      if (error instanceof NotSent) throw error;
      throw new Error('TRANSPORT_OUTCOME_UNKNOWN');
    } finally {
      clearTimeout(timer);
      client.clearAuth();
    }
  };
  const queryArgs = (
    scope: Scope,
    operation: string,
    args: Record<string, any> = {}
  ) => ({
    businessId: scope.businessId,
    programId: scope.programId,
    runtimeId: scope.runtimeId,
    deviceId: scope.deviceId,
    operation,
    ...(args.scanSessionId ? { sessionId: args.scanSessionId } : {}),
    ...(args.eventId ? { eventId: args.eventId } : {}),
    ...(args.rewardId ? { rewardId: args.rewardId } : {}),
  });
  return {
    probe: (scope) =>
      run(
        scope,
        'query',
        'webScanner:getOutcome',
        queryArgs(scope, 'probe')
      ) as Promise<Outcome>,
    send: (operation, args, scope) =>
      run(scope, 'mutation', paths[operation], args),
    outcome: (operation, args, scope) =>
      run(
        scope,
        'query',
        'webScanner:getOutcome',
        queryArgs(scope, operation, args)
      ) as Promise<Outcome>,
  };
}
