import { useAuthToken } from '@convex-dev/auth/react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useConvexConnectionState } from 'convex/react';
import { useCallback, useEffect, useRef, useState } from 'react';
import { AppState } from 'react-native';
import {
  type OperationIdentity,
  ReceiptCommands,
  type SafetyPhase,
} from '@/lib/scanner/receiptCommands';
import { createReceiptTransport } from '@/lib/scanner/receiptTransport';
import { NotSent, type Operation, type Scope } from '@/lib/web-scanner/command';
import { createHttpTransport } from '@/lib/web-scanner/httpTransport';
import { getConvexUrl } from '@/utils/convexConfig';

/** Native camera/UI remains in the existing route. Only command ownership changes. */
export function useScannerCommandSafety(scope: Scope | null) {
  const token = useAuthToken();
  const connection = useConvexConnectionState();
  const current = useRef({
    scope,
    token,
    connected: connection.isWebSocketConnected,
    foreground: AppState.currentState === 'active',
  });
  current.current = {
    ...current.current,
    scope,
    token,
    connected: connection.isWebSocketConnected,
  };
  const owner = useRef<ReceiptCommands | null>(null);
  const ready = useRef(false);
  const sessionId = useRef<string | null>(null);
  const [phase, setPhase] = useState<SafetyPhase>('UNKNOWN_OUTCOME');
  const [hydrated, setHydrated] = useState(false);
  const [recovered, setRecovered] = useState<{
    operation: Operation;
    receipt: Record<string, any>;
  } | null>(null);
  const actorId = scope?.actorId,
    businessId = scope?.businessId,
    programId = scope?.programId;
  useEffect(() => {
    setHydrated(false);
    setRecovered(null);
    ready.current = false;
    sessionId.current = null;
    if (!actorId || !businessId || !programId) {
      owner.current = null;
      return;
    }
    let disposed = false;
    const prefix = `scanner:receipt:${actorId}:${businessId}:`;
    let key = `${prefix}${programId}`;
    const valid = () =>
      !disposed &&
      current.current.scope?.actorId === actorId &&
      current.current.scope?.businessId === businessId &&
      current.current.scope?.programId === programId &&
      !!current.current.token &&
      current.current.connected &&
      current.current.foreground;
    const options = {
      url: getConvexUrl(),
      token: () => current.current.token,
      valid,
      online: valid,
    };
    const durable = process.env.EXPO_PUBLIC_SCANNER_RECEIPTS === 'true';
    const legacy = createHttpTransport(options);
    const results = new Map<string, Record<string, any>>();
    const transport = durable
      ? createReceiptTransport(options)
      : {
          // Older backend deployments remain supported without a reconnect write queue.
          probe: async (identity: OperationIdentity) => {
            const programs = await legacy.request(
              identity,
              'query',
              'loyaltyPrograms:listScannerPrograms',
              { businessId: identity.businessId }
            );
            if (
              !valid() ||
              !Array.isArray(programs) ||
              !programs.some(
                (program) => program.loyaltyProgramId === identity.programId
              )
            )
              throw new NotSent('OFFLINE_OR_STALE');
          },
          send: async (
            identity: OperationIdentity,
            args: Record<string, any>
          ) => {
            const result = await legacy.send(
              identity.operation,
              args,
              identity
            );
            results.set(identity.operationId, result);
            return result;
          },
          read: async (identity: OperationIdentity) => {
            const receipt = results.get(identity.operationId);
            if (receipt) return { status: 'CONFIRMED', receipt };
            // Without the additive API an unknown legacy result stays blocked.
            return { status: 'UNKNOWN', receipt: null };
          },
        };
    let restoredOperation: Operation | null = null;
    const commands = new ReceiptCommands({
      transport,
      valid,
      uuid: () =>
        `op_${Date.now()}_${Math.random().toString(36).slice(2)}_${Math.random().toString(36).slice(2)}`,
      save: (identity) => {
        if (identity) {
          key = `${prefix}${identity.programId}`;
          return AsyncStorage.setItem(key, JSON.stringify(identity));
        }
        return AsyncStorage.removeItem(key);
      },
      state: (next, receipt) => {
        if (!disposed) {
          setPhase(next);
          if (
            (next === 'SUCCESS' || next === 'ERROR') &&
            receipt &&
            restoredOperation
          ) {
            setRecovered({ operation: restoredOperation, receipt });
            restoredOperation = null;
          }
        }
      },
    });
    owner.current = commands;
    void AsyncStorage.getAllKeys()
      .then((keys) => {
        const pendingKeys = keys.filter((value) => value.startsWith(prefix));
        if (pendingKeys.length > 1)
          throw new Error('MULTIPLE_UNCERTAIN_OPERATIONS');
        key = pendingKeys[0] ?? key;
        return AsyncStorage.getItem(key);
      })
      .then((value) => {
        if (disposed) return;
        if (value) {
          const identity = JSON.parse(value) as OperationIdentity;
          if (
            identity.actorId !== actorId ||
            identity.businessId !== businessId ||
            typeof identity.programId !== 'string' ||
            key !== `${prefix}${identity.programId}` ||
            ![
              'resolve',
              'stamp',
              'redeem',
              'continuation',
              'undo',
              'referral',
            ].includes(identity.operation) ||
            ![
              identity.runtimeId,
              identity.deviceId,
              identity.operationId,
            ].every(
              (s) => typeof s === 'string' && s.length > 0 && s.length <= 160
            )
          )
            throw new Error('INVALID_RECEIPT_IDENTITY');
          restoredOperation = identity.operation;
          commands.restore({
            actorId: identity.actorId,
            businessId: identity.businessId,
            programId: identity.programId,
            runtimeId: identity.runtimeId,
            deviceId: identity.deviceId,
            operation: identity.operation,
            operationId: identity.operationId,
          });
          void commands.reconcile();
        } else setPhase('IDLE');
        ready.current = true;
        setHydrated(true);
      })
      .catch(() => {
        if (!disposed) {
          setPhase('UNKNOWN_OUTCOME');
          setHydrated(false);
        }
      });
    return () => {
      disposed = true;
      commands.invalidate();
      results.clear();
      if (owner.current === commands) owner.current = null;
    };
  }, [actorId, businessId, programId]);
  useEffect(() => {
    owner.current?.networkChanged(connection.isWebSocketConnected);
  }, [connection.isWebSocketConnected]);
  useEffect(
    () =>
      AppState.addEventListener('change', (state) => {
        current.current.foreground = state === 'active';
        owner.current?.networkChanged();
      }).remove,
    []
  );
  const run = useCallback(
    async (operation: Operation, args: Record<string, any>) => {
      const s = current.current.scope;
      if (!s || !owner.current || !ready.current)
        throw new NotSent('SCANNER_NOT_READY');
      const input = { ...args };
      if (
        operation !== 'resolve' &&
        !input.scanSessionId &&
        sessionId.current &&
        process.env.EXPO_PUBLIC_SCANNER_RECEIPTS === 'true'
      )
        input.scanSessionId = sessionId.current;
      const result = await owner.current.run(operation, input, s);
      if (operation === 'resolve') sessionId.current = result.scanSessionId;
      return result;
    },
    []
  );
  const isLocked = useCallback(
    () => !ready.current || !owner.current || owner.current.locked,
    []
  );
  return {
    phase,
    hydrated,
    recovered,
    canRetry: owner.current?.canRetry ?? false,
    run,
    isLocked,
    reconcile: () => owner.current?.reconcile(),
    retry: () => owner.current?.retrySameOperation(),
  };
}
