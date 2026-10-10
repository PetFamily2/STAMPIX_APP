import { useQuery } from 'convex/react';
import { makeFunctionReference } from 'convex/server';
import { Platform } from 'react-native';
import type { Id } from '@/convex/_generated/dataModel';
import { type ManualQaRole, manualQaClientEnabled } from './manualQaPolicy';

export type ManualQaAccess = {
  backendUrl: string;
  password: string;
  accounts: Array<{ role: ManualQaRole; email: string; userId: Id<'users'> }>;
};
export const manualQaAccessReference = makeFunctionReference<
  'query',
  Record<string, never>,
  ManualQaAccess | null
>('manualQa:getAccess');

export function isManualQaClientEnabled(): boolean {
  return manualQaClientEnabled({
    platform: Platform.OS,
    environment: process.env.EXPO_PUBLIC_APP_ENV,
    flag: process.env.EXPO_PUBLIC_MANUAL_QA_ENABLED,
    url: process.env.EXPO_PUBLIC_CONVEX_URL,
    previewUrl: process.env.EXPO_PUBLIC_MANUAL_QA_PREVIEW_URL,
    backend: process.env.EXPO_PUBLIC_WEB_SCANNER_BACKEND,
  });
}

export function useManualQaAccess() {
  const enabled = isManualQaClientEnabled();
  const access = useQuery(manualQaAccessReference, enabled ? {} : 'skip');
  return { enabled, access };
}
