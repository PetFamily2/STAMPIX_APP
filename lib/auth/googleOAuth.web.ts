import type { ConvexAuthActionsContext } from '@convex-dev/auth/react';

export type OAuthPreferredRole = 'business' | 'customer';
export type OAuthSignInResult = 'success' | 'cancelled';

function readWebRedirectTo(provider: 'google' | 'apple'): string {
  const origin = globalThis.window?.location?.origin;
  if (typeof origin !== 'string' || origin.length === 0) {
    throw new Error('WEB_OAUTH_BROWSER_UNAVAILABLE');
  }

  return `${origin}/oauth-callback?legalSource=signup_${provider}`;
}

export async function signInWithGoogle(
  signIn: ConvexAuthActionsContext['signIn'],
  _role?: OAuthPreferredRole | null
): Promise<OAuthSignInResult> {
  const redirectTo = readWebRedirectTo('google');
  const started = await signIn('google', { redirectTo });
  if (!(started.redirect instanceof URL)) {
    throw new Error('WEB_GOOGLE_REDIRECT_MISSING');
  }

  return 'success';
}

export async function signInWithApple(
  signIn: ConvexAuthActionsContext['signIn'],
  _role?: OAuthPreferredRole | null
): Promise<OAuthSignInResult> {
  const started = await signIn('apple', {
    redirectTo: readWebRedirectTo('apple'),
  });
  if (!(started.redirect instanceof URL))
    throw new Error('WEB_APPLE_REDIRECT_MISSING');
  return 'success';
}
