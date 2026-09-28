export type AuthPreviewParams = {
  preview?: string;
  map?: string;
};

export type SignedInScreenRedirect =
  | {
      pathname: '/(auth)/sign-up';
      params: AuthPreviewParams;
    }
  | {
      pathname: '/(auth)/sign-up-email';
      params: AuthPreviewParams & { entry: 'sign-in' };
    };

export function resolveBusinessSignedOutHref(
  platform: string
): '/(auth)/sign-up' | '/(auth)/sign-in' {
  return platform === 'web' ? '/(auth)/sign-up' : '/(auth)/sign-in';
}

export function resolveSignedInScreenRedirect(
  platform: string,
  params: AuthPreviewParams = {}
): SignedInScreenRedirect {
  const preserved = {
    ...(params.preview ? { preview: params.preview } : {}),
    ...(params.map ? { map: params.map } : {}),
  };

  if (platform === 'web') {
    return {
      pathname: '/(auth)/sign-up',
      params: preserved,
    };
  }

  return {
    pathname: '/(auth)/sign-up-email',
    params: {
      ...preserved,
      entry: 'sign-in',
    },
  };
}

export function showsGoogleOAuthOnSignUp(platform: string): boolean {
  return platform === 'web' || platform === 'ios' || platform === 'android';
}

export function showsAppleOAuthOnSignUp(platform: string): boolean {
  return platform !== 'web';
}
