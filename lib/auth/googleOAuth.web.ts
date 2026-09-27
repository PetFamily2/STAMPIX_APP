import type { ConvexAuthActionsContext } from '@convex-dev/auth/react';

export type OAuthPreferredRole = 'business' | 'customer';
export type OAuthSignInResult = 'success' | 'cancelled';

export function signInWithGoogle(
  _signIn: ConvexAuthActionsContext['signIn'],
  _role?: OAuthPreferredRole | null
): Promise<OAuthSignInResult> {
  return Promise.reject(new Error('WEB_OAUTH_NOT_IMPLEMENTED'));
}

export function signInWithApple(
  _signIn: ConvexAuthActionsContext['signIn'],
  _role?: OAuthPreferredRole | null
): Promise<OAuthSignInResult> {
  return Promise.reject(new Error('WEB_OAUTH_NOT_IMPLEMENTED'));
}
