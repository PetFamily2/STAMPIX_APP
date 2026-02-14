import type { ConvexAuthActionsContext } from '@convex-dev/auth/react';
import * as Linking from 'expo-linking';
import * as WebBrowser from 'expo-web-browser';

const GOOGLE_PROVIDER_ID = 'google';
const GOOGLE_CALLBACK_PATH = '/sign-in';

WebBrowser.maybeCompleteAuthSession();

function extractCodeFromCallbackUrl(callbackUrl: string): string | null {
  const parsed = Linking.parse(callbackUrl);
  const maybeCode = parsed.queryParams?.code;

  if (typeof maybeCode === 'string' && maybeCode.length > 0) {
    return maybeCode;
  }
  if (Array.isArray(maybeCode) && typeof maybeCode[0] === 'string') {
    return maybeCode[0];
  }

  return null;
}

export type GoogleOAuthSignInResult = 'success' | 'cancelled';

export async function signInWithGoogle(
  signIn: ConvexAuthActionsContext['signIn']
): Promise<GoogleOAuthSignInResult> {
  const redirectTo = Linking.createURL(GOOGLE_CALLBACK_PATH);

  const started = await signIn(GOOGLE_PROVIDER_ID, { redirectTo });
  if (!started.redirect) {
    if (started.signingIn) {
      return 'success';
    }
    throw new Error('GOOGLE_REDIRECT_MISSING');
  }

  const session = await WebBrowser.openAuthSessionAsync(
    started.redirect.toString(),
    redirectTo
  );
  if (session.type !== 'success') {
    return 'cancelled';
  }

  const code = extractCodeFromCallbackUrl(session.url);
  if (!code) {
    throw new Error('GOOGLE_CODE_MISSING');
  }

  const finished = await signIn(GOOGLE_PROVIDER_ID, { code });
  if (!finished.signingIn) {
    throw new Error('GOOGLE_SIGN_IN_FAILED');
  }

  return 'success';
}
