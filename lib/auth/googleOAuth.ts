import type { ConvexAuthActionsContext } from '@convex-dev/auth/react';
import * as WebBrowser from 'expo-web-browser';

import { getConvexUrl } from '@/utils/convexConfig';

const SAFE_AUTH_REDIRECT_PATH = '/';

type OAuthProvider = 'google' | 'apple';

WebBrowser.maybeCompleteAuthSession();

function extractCodeFromCallbackUrl(callbackUrl: string): string | null {
  const parsed = new URL(callbackUrl);
  const code = parsed.searchParams.get('code');
  return code && code.length > 0 ? code : null;
}

function getSafeRedirectUrl() {
  return new URL(SAFE_AUTH_REDIRECT_PATH, getConvexUrl()).toString();
}

export type OAuthSignInResult = 'success' | 'cancelled';

async function signInWithOAuthProvider(
  signIn: ConvexAuthActionsContext['signIn'],
  provider: OAuthProvider
): Promise<OAuthSignInResult> {
  const started = await signIn(provider, {
    redirectTo: SAFE_AUTH_REDIRECT_PATH,
  });
  if (!started.redirect) {
    if (started.signingIn) {
      return 'success';
    }
    throw new Error(`${provider.toUpperCase()}_REDIRECT_MISSING`);
  }

  const callbackUrl = getSafeRedirectUrl();
  const session = await WebBrowser.openAuthSessionAsync(
    started.redirect.toString(),
    callbackUrl
  );

  if (session.type !== 'success') {
    return 'cancelled';
  }

  const code = extractCodeFromCallbackUrl(session.url);
  if (!code) {
    throw new Error(`${provider.toUpperCase()}_CODE_MISSING`);
  }

  const finished = await signIn(provider, { code });
  if (!finished.signingIn) {
    throw new Error(`${provider.toUpperCase()}_SIGN_IN_FAILED`);
  }

  return 'success';
}

export function signInWithGoogle(
  signIn: ConvexAuthActionsContext['signIn']
): Promise<OAuthSignInResult> {
  return signInWithOAuthProvider(signIn, 'google');
}

export function signInWithApple(
  signIn: ConvexAuthActionsContext['signIn']
): Promise<OAuthSignInResult> {
  return signInWithOAuthProvider(signIn, 'apple');
}
