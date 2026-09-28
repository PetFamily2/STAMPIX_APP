import type { ConvexAuthActionsContext } from '@convex-dev/auth/react';

export type OAuthPreferredRole = 'business' | 'customer';
export type OAuthSignInResult = 'success' | 'cancelled';

function readWebGoogleRedirectTo(): string {
  const origin = globalThis.window?.location?.origin;
  if (typeof origin !== 'string' || origin.length === 0) {
    throw new Error('WEB_OAUTH_BROWSER_UNAVAILABLE');
  }

  return `${origin}/oauth-callback?legalSource=signup_google`;
}

export async function signInWithGoogle(
  signIn: ConvexAuthActionsContext['signIn'],
  _role?: OAuthPreferredRole | null
): Promise<OAuthSignInResult> {
  const redirectTo = readWebGoogleRedirectTo();
  const started = await signIn('google', { redirectTo });
  if (!(started.redirect instanceof URL)) {
    throw new Error('WEB_GOOGLE_REDIRECT_MISSING');
  }

  return 'success';
}

export function signInWithApple(
  _signIn: ConvexAuthActionsContext['signIn'],
  _role?: OAuthPreferredRole | null
): Promise<OAuthSignInResult> {
  return Promise.reject(new Error('WEB_OAUTH_NOT_IMPLEMENTED'));
}
