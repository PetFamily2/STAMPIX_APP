export type AppEnv = 'dev' | 'prod';

export type ResolveAppEnvInput = {
  expoPublicAppEnv?: string | null;
  forceProdMode?: boolean;
  isDevRuntime?: boolean;
};

export type ResolveConvexUrlInput = {
  appEnv: AppEnv;
  devUrl?: string | null;
  prodUrl?: string | null;
  legacyUrl?: string | null;
};

export function resolveAppEnv({
  expoPublicAppEnv,
  forceProdMode = false,
  isDevRuntime = false,
}: ResolveAppEnvInput): AppEnv {
  const explicit = expoPublicAppEnv?.trim().toLowerCase();
  const isNonProductionBuild =
    explicit === 'development' || explicit === 'preview';
  const isDevMode = forceProdMode
    ? false
    : isNonProductionBuild || (explicit !== 'production' && isDevRuntime);
  return isDevMode ? 'dev' : 'prod';
}

export function resolveConvexUrl({
  appEnv,
  devUrl,
  prodUrl,
  legacyUrl,
}: ResolveConvexUrlInput): string {
  if (appEnv === 'prod') {
    if (prodUrl?.trim()) {
      return prodUrl;
    }
    throw new Error(
      'Production requires EXPO_PUBLIC_CONVEX_URL_PROD. Legacy and development Convex URLs are not accepted.'
    );
  }

  if (appEnv === 'dev' && devUrl) {
    return devUrl;
  }

  if (legacyUrl) {
    return legacyUrl;
  }

  throw new Error(
    'חסרה כתובת Convex. הגדר EXPO_PUBLIC_CONVEX_URL או כתובות ספציפיות לסביבה ב-.env'
  );
}
