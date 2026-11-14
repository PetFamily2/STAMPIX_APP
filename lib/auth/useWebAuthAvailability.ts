import { useConvex } from 'convex/react';
import { makeFunctionReference } from 'convex/server';
import { useCallback, useEffect, useState } from 'react';
import { Platform } from 'react-native';
import type { WebAuthProviderAvailability } from '../../convex/lib/webAuthConfiguration';
import {
  readWebAuthWithDeadline,
  requireWebAuthProvider,
  type WebAuthMethod,
} from './webProviderAvailability';

const reference = makeFunctionReference<
  'query',
  Record<string, never>,
  WebAuthProviderAvailability
>('webAuth:getProviderAvailability');
const nativeProviders = { google: true, apple: true, email: true };

export function useWebAuthAvailability() {
  const convex = useConvex();
  const [providers, setProviders] =
    useState<WebAuthProviderAvailability | null>(
      Platform.OS === 'web' ? null : nativeProviders
    );
  const [failed, setFailed] = useState(false);
  const [revision, setRevision] = useState(0);
  const read = useCallback(
    () => readWebAuthWithDeadline(() => convex.query(reference, {})),
    [convex]
  );
  // biome-ignore lint/correctness/useExhaustiveDependencies: revision is the explicit user retry trigger.
  useEffect(() => {
    if (Platform.OS !== 'web') return;
    let active = true;
    setProviders(null);
    setFailed(false);
    void read().then(
      (result) => {
        if (active) setProviders(result);
      },
      () => {
        if (active) setFailed(true);
      }
    );
    return () => {
      active = false;
    };
  }, [read, revision]);
  return {
    providers,
    failed,
    retry: () => setRevision((value) => value + 1),
    requireProvider: (provider: WebAuthMethod) =>
      requireWebAuthProvider(provider, read),
  };
}
