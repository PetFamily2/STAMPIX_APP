import { describe, expect, test } from 'bun:test';
import { readFileSync } from 'node:fs';

import { getConvexAuthProviderStorageProps } from '../auth/authStorage.web';
import { signInWithApple, signInWithGoogle } from '../auth/googleOAuth.web';
import {
  POST_AUTH_ROUTES,
  resolvePlatformPostAuthHref,
  resolvePostAuthRoute,
  WEB_BUSINESS_PROOF_HREF,
} from '../auth/postAuthRouting';
import {
  resolveBusinessSignedOutHref,
  resolveSignedInScreenRedirect,
  showsProviderOAuthOnSignUp,
} from '../auth/webAuthEntry';
import { isPushRuntimeUnsupported } from '../pushNotificationState';
import { canUseRevenueCatPurchasesOnPlatform } from '../subscription/billingGuards';

const onboardedCustomer = resolvePostAuthRoute({
  isAuthLoading: false,
  isAuthenticated: true,
  user: { customerOnboardedAt: 1, businessOnboardedAt: 1 },
  sessionContext: {
    activeMode: 'customer',
    activeBusinessId: null,
    businesses: [],
  },
});

describe('business web proof platform split', () => {
  test('web auth storage omits the Convex storage prop', () => {
    const webSource = readFileSync('lib/auth/authStorage.web.ts', 'utf8');
    expect(webSource).not.toContain('expo-secure-store');
    expect(getConvexAuthProviderStorageProps()).toEqual({
      storageNamespace: 'stampaix_auth',
    });
  });

  test('native auth storage keeps SecureStore and the root layout does not import it', () => {
    const nativeSource = readFileSync('lib/auth/authStorage.ts', 'utf8');
    const rootLayout = readFileSync('app/_layout.tsx', 'utf8');

    expect(nativeSource).toContain("from 'expo-secure-store'");
    expect(nativeSource).toContain('SecureStore.getItemAsync');
    expect(nativeSource).toContain('SecureStore.setItemAsync');
    expect(nativeSource).toContain('SecureStore.deleteItemAsync');
    expect(nativeSource).toContain(
      'storageNamespace: CONVEX_AUTH_STORAGE_NAMESPACE'
    );
    expect(rootLayout).not.toContain('expo-secure-store');
    expect(rootLayout).toContain("from '@/lib/auth/authStorage'");
  });

  test('web app mode and feedback stubs do not import native secure or audio modules', () => {
    const appModeWeb = readFileSync('contexts/AppModeContext.web.tsx', 'utf8');
    const appModeNative = readFileSync('contexts/AppModeContext.tsx', 'utf8');
    const feedbackWeb = readFileSync('lib/feedback.web.ts', 'utf8');
    const feedbackNative = readFileSync('lib/feedback.ts', 'utf8');

    expect(appModeWeb).not.toContain('expo-secure-store');
    expect(appModeWeb).toContain('sessionContext?.activeMode');
    expect(appModeWeb).toContain('export function useAppMode');
    expect(appModeNative).toContain("from 'expo-secure-store'");
    expect(feedbackWeb).not.toContain('expo-audio');
    expect(feedbackWeb).toContain(
      'export function disposeFeedbackAudioPlayers'
    );
    expect(feedbackNative).toContain("from 'expo-audio'");
  });

  test('web is an unsupported push runtime and native runtimes stay available', () => {
    expect(
      isPushRuntimeUnsupported({ platformOs: 'web', appOwnership: null })
    ).toBe(true);
    expect(
      isPushRuntimeUnsupported({
        platformOs: 'ios',
        appOwnership: 'standalone',
      })
    ).toBe(false);
    expect(
      isPushRuntimeUnsupported({
        platformOs: 'android',
        appOwnership: null,
      })
    ).toBe(false);
    expect(
      isPushRuntimeUnsupported({ platformOs: 'ios', appOwnership: 'expo' })
    ).toBe(true);
  });

  test('RevenueCat purchases stay limited to ios and android', () => {
    expect(canUseRevenueCatPurchasesOnPlatform('web')).toBe(false);
    expect(canUseRevenueCatPurchasesOnPlatform('ios')).toBe(true);
    expect(canUseRevenueCatPurchasesOnPlatform('android')).toBe(true);

    const providerSource = readFileSync(
      'contexts/RevenueCatContext.tsx',
      'utf8'
    );
    const initializeStart = providerSource.indexOf(
      'async function initialize()'
    );
    const initializeGuard = providerSource.indexOf(
      'if (!canUseRevenueCatPurchasesOnPlatform(Platform.OS))',
      initializeStart
    );
    const purchasesImport = providerSource.indexOf(
      "import('react-native-purchases')",
      initializeStart
    );
    expect(initializeGuard).toBeGreaterThan(initializeStart);
    expect(purchasesImport).toBeGreaterThan(initializeGuard);
  });

  test('web post-auth destination is /business and native destinations stay unchanged', () => {
    expect(onboardedCustomer).toEqual({
      status: 'route',
      href: POST_AUTH_ROUTES.customerWallet,
    });
    expect(resolvePlatformPostAuthHref('ios', onboardedCustomer)).toEqual(
      onboardedCustomer
    );
    expect(resolvePlatformPostAuthHref('android', onboardedCustomer)).toEqual(
      onboardedCustomer
    );
    expect(resolvePlatformPostAuthHref('web', onboardedCustomer)).toEqual({
      status: 'route',
      href: WEB_BUSINESS_PROOF_HREF,
    });
    expect(resolvePlatformPostAuthHref('web', { status: 'loading' })).toEqual({
      status: 'loading',
    });
    expect(
      resolvePlatformPostAuthHref('web', { status: 'unauthenticated' })
    ).toEqual({ status: 'unauthenticated' });
  });

  test('business proof route is /business and signs out through Convex Auth', () => {
    const layout = readFileSync(
      'app/(web-business)/business/_layout.tsx',
      'utf8'
    );
    const screen = readFileSync(
      'app/(web-business)/business/index.tsx',
      'utf8'
    );
    const appJson = JSON.parse(readFileSync('app.json', 'utf8'));

    expect(layout).toContain("Platform.OS !== 'web'");
    expect(layout).toContain('resolvePostAuthRoute');
    expect(layout).toContain("resolveBusinessSignedOutHref('web')");
    expect(layout).toContain('resolveBusinessSignedOutHref(Platform.OS)');
    expect(layout).not.toContain('(authenticated)/_layout');
    expect(screen).toContain('StampAix Business');
    expect(screen).toContain('Technical proof · userId');
    expect(screen).toContain('useActiveBusiness');
    expect(screen).toContain('signOut');
    expect(screen).not.toContain('expo-camera');
    expect(screen).not.toContain('react-native-purchases');
    expect(appJson.expo.web.output).toBe('single');
  });

  test('web email entry shows the legal sign-up screen and still records terms', () => {
    expect(resolveBusinessSignedOutHref('web')).toBe('/(auth)/sign-up');
    expect(resolveBusinessSignedOutHref('ios')).toBe('/(auth)/sign-in');
    expect(resolveBusinessSignedOutHref('android')).toBe('/(auth)/sign-in');

    expect(
      resolveSignedInScreenRedirect('web', { preview: '1', map: 'nearby' })
    ).toEqual({
      pathname: '/(auth)/sign-up',
      params: { preview: '1', map: 'nearby' },
    });
    expect(resolveSignedInScreenRedirect('ios', { preview: '1' })).toEqual({
      pathname: '/(auth)/sign-up-email',
      params: { preview: '1', entry: 'sign-in' },
    });
    expect(resolveSignedInScreenRedirect('android')).toEqual({
      pathname: '/(auth)/sign-up-email',
      params: { entry: 'sign-in' },
    });

    const signInScreen = readFileSync('app/(auth)/sign-in.tsx', 'utf8');
    const signUpScreen = readFileSync('app/(auth)/sign-up.tsx', 'utf8');
    const otpScreen = readFileSync(
      'app/(auth)/onboarding-client-otp.tsx',
      'utf8'
    );

    expect(signInScreen).toContain('resolveSignedInScreenRedirect(Platform.OS');
    expect(signUpScreen).toContain("router.push('/(auth)/sign-up-email')");
    expect(signUpScreen).not.toContain("entry: 'sign-in'");
    expect(otpScreen).toContain(
      "shouldRecordTermsAcceptance = entryValue !== 'sign-in'"
    );
    expect(otpScreen).toContain(
      "acceptCurrentTerms({ source: 'signup_email' })"
    );
  });

  test('web sign-up hides provider OAuth and the web helper cannot open a browser session', async () => {
    expect(showsProviderOAuthOnSignUp('web')).toBe(false);
    expect(showsProviderOAuthOnSignUp('ios')).toBe(true);
    expect(showsProviderOAuthOnSignUp('android')).toBe(true);

    const signUpScreen = readFileSync('app/(auth)/sign-up.tsx', 'utf8');
    const webOAuth = readFileSync('lib/auth/googleOAuth.web.ts', 'utf8');
    const nativeOAuth = readFileSync('lib/auth/googleOAuth.ts', 'utf8');

    expect(signUpScreen).toContain('showsProviderOAuthOnSignUp(Platform.OS)');
    expect(signUpScreen).toContain('accessibilityLabel={TEXT.email}');
    expect(signUpScreen).toContain('{TEXT.legalLink}');
    expect(webOAuth).not.toContain('expo-web-browser');
    expect(webOAuth).not.toContain('expo-linking');
    expect(webOAuth).not.toContain('openAuthSessionAsync');
    expect(nativeOAuth).toContain('openAuthSessionAsync');

    await expect(signInWithGoogle(async () => ({}))).rejects.toThrow(
      'WEB_OAUTH_NOT_IMPLEMENTED'
    );
    await expect(signInWithApple(async () => ({}))).rejects.toThrow(
      'WEB_OAUTH_NOT_IMPLEMENTED'
    );
  });
});
