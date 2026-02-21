import type { ConvexAuthActionsContext } from '@convex-dev/auth/react';
import * as Linking from 'expo-linking';
import * as WebBrowser from 'expo-web-browser';

const SAFE_AUTH_REDIRECT_PATH = '/oauth-callback';

type OAuthProvider = 'google' | 'apple';
export type OAuthPreferredRole = 'business' | 'customer';

WebBrowser.maybeCompleteAuthSession();

function extractCodeFromCallbackUrl(callbackUrl: string): string | null {
  const parsed = new URL(callbackUrl);
  const code = parsed.searchParams.get('code');
  return code && code.length > 0 ? code : null;
}

function getSafeRedirectUrl(
  provider: OAuthProvider,
  role?: OAuthPreferredRole | null
) {
  return Linking.createURL(SAFE_AUTH_REDIRECT_PATH, {
    queryParams: {
      provider,
      role: role ?? undefined,
    },
  });
}

export type OAuthSignInResult = 'success' | 'cancelled';

async function signInWithOAuthProvider(
  signIn: ConvexAuthActionsContext['signIn'],
  provider: OAuthProvider,
  role?: OAuthPreferredRole | null
): Promise<OAuthSignInResult> {
  const callbackUrl = getSafeRedirectUrl(provider, role);
  const started = await signIn(provider, {
    redirectTo: callbackUrl,
  });
  if (!started.redirect) {
    if (started.signingIn) {
      return 'success';
    }
    throw new Error(`${provider.toUpperCase()}_REDIRECT_MISSING`);
  }

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
  signIn: ConvexAuthActionsContext['signIn'],
  role?: OAuthPreferredRole | null
): Promise<OAuthSignInResult> {
  return signInWithOAuthProvider(signIn, 'google', role);
}

export function signInWithApple(
  signIn: ConvexAuthActionsContext['signIn'],
  role?: OAuthPreferredRole | null
): Promise<OAuthSignInResult> {
  return signInWithOAuthProvider(signIn, 'apple', role);
}
