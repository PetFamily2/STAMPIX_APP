import { ConvexHttpClient } from 'convex/browser';
import { makeFunctionReference } from 'convex/server';
import {
  isManualQaClientEnabled,
  manualQaAccessReference,
} from './useManualQaAccess';

/** Uses a separate real Customer session; never impersonates the scanner actor. */
export async function createManualQaCustomerQr(url: string): Promise<string> {
  if (
    !isManualQaClientEnabled() ||
    url !== process.env.EXPO_PUBLIC_MANUAL_QA_PREVIEW_URL
  )
    throw new Error('MANUAL_QA_DISABLED');
  const client = new ConvexHttpClient(url, { logger: false });
  const access = await client.query(manualQaAccessReference, {});
  const customer = access?.accounts.find(
    (account) => account.role === 'customer'
  );
  if (!access || !customer || access.backendUrl !== url)
    throw new Error('MANUAL_QA_DISABLED');
  const login = (await client.action(
    makeFunctionReference<'action'>('auth:signIn'),
    {
      provider: 'password',
      params: {
        flow: 'signIn',
        email: customer.email,
        password: access.password,
      },
    }
  )) as { tokens?: { token: string } };
  if (!login.tokens?.token) throw new Error('MANUAL_QA_LOGIN_FAILED');
  client.setAuth(login.tokens.token);
  try {
    const result = (await client.mutation(
      makeFunctionReference<'mutation'>('scanner:createCustomerScanToken'),
      {},
      { skipQueue: true }
    )) as { scanToken?: string };
    if (typeof result.scanToken !== 'string')
      throw new Error('MANUAL_QA_QR_UNAVAILABLE');
    return result.scanToken;
  } finally {
    await client
      .action(makeFunctionReference<'action'>('auth:signOut'), {})
      .catch(() => {});
    client.clearAuth();
  }
}
