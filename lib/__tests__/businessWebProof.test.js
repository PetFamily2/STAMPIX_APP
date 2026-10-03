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
  showsAppleOAuthOnSignUp,
  showsGoogleOAuthOnSignUp,
} from '../auth/webAuthEntry';
import {
  getBusinessWebResponsiveLayout,
  getNextBusinessWebShellOverlay,
} from '../design/businessWebResponsive';
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

  test('business dashboard route is /business and signs out through Convex Auth', () => {
    const layout = readFileSync(
      'app/(web-business)/business/_layout.tsx',
      'utf8'
    );
    const screen = readFileSync(
      'app/(web-business)/business/index.tsx',
      'utf8'
    );
    const shell = readFileSync(
      'components/business-web/BusinessWebShell.tsx',
      'utf8'
    );
    const shellRoute = readFileSync(
      'components/business-web/BusinessWebShellRoute.tsx',
      'utf8'
    );
    const dashboard = readFileSync(
      'components/business-web/BusinessWebDashboard.tsx',
      'utf8'
    );
    const appJson = JSON.parse(readFileSync('app.json', 'utf8'));

    const nativeRedirect = readFileSync(
      'components/navigation/NativeCompanionRedirect.tsx',
      'utf8'
    );
    expect(layout).toContain("Platform.OS !== 'web'");
    expect(layout).toContain('NativeCompanionRedirect');
    expect(layout).toContain("resolveBusinessSignedOutHref('web')");
    expect(nativeRedirect).toContain('resolvePostAuthRoute');
    expect(nativeRedirect).toContain(
      'resolveBusinessSignedOutHref(Platform.OS)'
    );
    expect(layout).not.toContain('(authenticated)/_layout');
    expect(layout).toContain('BusinessWebShellRoute');
    expect(shellRoute).toContain('BusinessWebShell');
    expect(screen).toContain('BusinessWebDashboard');
    expect(screen).not.toContain('Technical proof');
    expect(screen).not.toContain('userIdLabel');
    expect(screen).not.toContain('selectable={true}');
    expect(screen).toContain('useActiveBusiness');
    expect(shellRoute).toContain('setActiveBusinessId(businessId)');
    expect(screen).toContain('key={String(activeBusinessId)}');
    expect(screen).toContain('activeBusinessId={activeBusinessId}');
    expect(shellRoute).toContain('onSelectBusiness={handleSelect}');
    expect(shellRoute).toContain('signOut');
    expect(shell).toContain('StampAix');
    expect(shell).toContain('accessibilityLabel="התנתקות"');
    expect(shell).toContain("label: 'דף הבית'");
    expect(shell).toContain("label: 'לקוחות'");
    expect(shell).toContain("label: 'מועדון והטבות'");
    expect(shell).toContain("label: 'צוות'");
    expect(shell).toContain("label: 'ניתוחים'");
    expect(shell).toContain("label: 'חיוב וחשבוניות'");
    expect(shell).toContain("label: 'הגדרות העסק'");
    expect(shell.match(/דף הבית/g)).toHaveLength(1);
    expect(dashboard.match(/דף הבית/g)).toHaveLength(1);
    expect(shell).not.toContain('<Text style={styles.topbarTitle}>');
    expect(shell).toContain('getBusinessWebResponsiveLayout(width)');
    expect(shell).toContain('popoverWidth');
    expect(shell).toContain('styles.switcherMenuCompact');
    expect(shell).toContain('styles.mobileMenuOverlay');
    expect(shell).toContain('styles.mobileMenuBackdrop');
    expect(shell).toContain('styles.mobileMenuDrawer');
    expect(shell).toContain('styles.popoverBackdrop');
    expect(shell).toContain("position: 'absolute'");
    expect(shell).toContain('accessibilityViewIsModal={true}');
    expect(shell).toContain('accessibilityRole="menu"');
    expect(shell).toContain("event.key === 'Escape'");
    expect(shell).toContain('getNextBusinessWebShellOverlay');
    expect(shell).toContain("activeOverlay === 'navigation'");
    expect(shell).toContain("activeOverlay === 'account'");
    expect(shell).toContain("activeOverlay === 'business'");
    expect(shell).not.toContain('<View style={styles.mobileMenu}>');
    expect(dashboard).toContain('getBusinessWebResponsiveLayout(width)');
    expect(dashboard).toContain('cardSingleColumn');
    expect(dashboard).toContain('cardMobile');
    expect(dashboard).toContain('kpiHeadingMobile');
    expect(dashboard).toContain('activityRowMobile');
    expect(dashboard).toContain("activityPresentation === 'feed'");
    expect(dashboard).toContain("width: '100%'");
    expect(dashboard).toContain("flexBasis: 'auto'");
    expect(shell).toContain("from '@/lib/rtl'");
    expect(shell).not.toContain('I18nManager');
    expect(dashboard).toContain('api.dashboard.getBusinessDashboardSummary');
    expect(dashboard).toContain('api.dashboard.getBusinessDashboardDay');
    expect(dashboard).toContain('api.events.getRecentActivity');
    expect(dashboard).not.toContain('revenue');
    expect(dashboard).not.toContain('sales');
    expect(screen).not.toContain('expo-camera');
    expect(screen).not.toContain('react-native-purchases');
    expect(appJson.expo.web.output).toBe('single');
  });

  test('business web responsive contract covers the approved QA widths', () => {
    expect(getBusinessWebResponsiveLayout(1440)).toEqual({
      composition: 'desktop',
      navigation: 'sidebar',
      kpiColumns: 4,
      detailColumns: 2,
      activityPresentation: 'table',
      pagePadding: 24,
      pageTopPadding: 24,
      popoverWidth: 280,
    });
    expect(getBusinessWebResponsiveLayout(1100)).toEqual({
      composition: 'desktop',
      navigation: 'sidebar',
      kpiColumns: 2,
      detailColumns: 1,
      activityPresentation: 'table',
      pagePadding: 32,
      pageTopPadding: 32,
      popoverWidth: 280,
    });
    expect(getBusinessWebResponsiveLayout(900)).toEqual({
      composition: 'tablet',
      navigation: 'compact',
      kpiColumns: 2,
      detailColumns: 1,
      activityPresentation: 'table',
      pagePadding: 16,
      pageTopPadding: 24,
      popoverWidth: 280,
    });
    expect(getBusinessWebResponsiveLayout(720)).toEqual({
      composition: 'tablet',
      navigation: 'compact',
      kpiColumns: 2,
      detailColumns: 1,
      activityPresentation: 'table',
      pagePadding: 16,
      pageTopPadding: 24,
      popoverWidth: 280,
    });
    expect(getBusinessWebResponsiveLayout(390)).toEqual({
      composition: 'mobile',
      navigation: 'compact',
      kpiColumns: 2,
      detailColumns: 1,
      activityPresentation: 'feed',
      pagePadding: 16,
      pageTopPadding: 16,
      popoverWidth: 280,
    });
    expect(getBusinessWebResponsiveLayout(360)).toEqual({
      composition: 'mobile',
      navigation: 'compact',
      kpiColumns: 2,
      detailColumns: 1,
      activityPresentation: 'feed',
      pagePadding: 16,
      pageTopPadding: 16,
      popoverWidth: 280,
    });
    expect(getBusinessWebResponsiveLayout(320)).toEqual({
      composition: 'narrow-mobile',
      navigation: 'compact',
      kpiColumns: 1,
      detailColumns: 1,
      activityPresentation: 'feed',
      pagePadding: 16,
      pageTopPadding: 16,
      popoverWidth: 280,
    });
  });

  test('business shell overlays are mutually exclusive and toggle cleanly', () => {
    expect(getNextBusinessWebShellOverlay(null, 'navigation')).toBe(
      'navigation'
    );
    expect(getNextBusinessWebShellOverlay('navigation', 'account')).toBe(
      'account'
    );
    expect(getNextBusinessWebShellOverlay('account', 'business')).toBe(
      'business'
    );
    expect(getNextBusinessWebShellOverlay('business', 'business')).toBeNull();
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

  test('web sign-up shows Google only and starts the browser OAuth redirect', async () => {
    expect(showsGoogleOAuthOnSignUp('web')).toBe(true);
    expect(showsAppleOAuthOnSignUp('web')).toBe(false);
    expect(showsGoogleOAuthOnSignUp('ios')).toBe(true);
    expect(showsAppleOAuthOnSignUp('ios')).toBe(true);
    expect(showsGoogleOAuthOnSignUp('android')).toBe(true);
    expect(showsAppleOAuthOnSignUp('android')).toBe(true);

    const signUpScreen = readFileSync('app/(auth)/sign-up.tsx', 'utf8');
    const webOAuth = readFileSync('lib/auth/googleOAuth.web.ts', 'utf8');
    const nativeOAuth = readFileSync('lib/auth/googleOAuth.ts', 'utf8');
    const successBranch = signUpScreen.slice(
      signUpScreen.indexOf("if (result !== 'success')")
    );
    const webGuard = successBranch.indexOf("Platform.OS === 'web'");
    const nativeCallbackReplace = successBranch.indexOf(
      "pathname: '/(auth)/oauth-callback'"
    );

    expect(signUpScreen).toContain('showsGoogleOAuthOnSignUp(Platform.OS)');
    expect(signUpScreen).toContain('showsAppleOAuthOnSignUp(Platform.OS)');
    expect(signUpScreen).not.toContain('showsProviderOAuthOnSignUp');
    expect(signUpScreen).toContain('accessibilityLabel={TEXT.google}');
    expect(signUpScreen).toContain('accessibilityLabel={TEXT.apple}');
    expect(signUpScreen).toContain('accessibilityLabel={TEXT.email}');
    expect(signUpScreen).toContain('{TEXT.legalLink}');
    expect(webGuard).toBeGreaterThan(-1);
    expect(nativeCallbackReplace).toBeGreaterThan(webGuard);
    expect(webOAuth).toContain("signIn('google', { redirectTo })");
    expect(webOAuth).toContain('/oauth-callback');
    expect(webOAuth).toContain('legalSource=signup_google');
    expect(webOAuth).not.toContain('expo-web-browser');
    expect(webOAuth).not.toContain('expo-linking');
    expect(webOAuth).not.toContain('window.location.href');
    expect(webOAuth).not.toContain('openAuthSessionAsync');
    expect(webOAuth).not.toContain('{ code }');
    expect(nativeOAuth).toContain('openAuthSessionAsync');
    expect(nativeOAuth).toContain('signIn(provider, { code })');

    const previousWindow = globalThis.window;
    globalThis.window = {
      location: { origin: 'http://localhost:8081' },
    };
    try {
      const calls = [];
      const result = await signInWithGoogle(async (provider, params) => {
        calls.push({ provider, params });
        return {
          signingIn: false,
          redirect: new URL(
            'https://example.convex.site/api/auth/signin/google'
          ),
        };
      });

      expect(result).toBe('success');
      expect(calls).toEqual([
        {
          provider: 'google',
          params: {
            redirectTo:
              'http://localhost:8081/oauth-callback?legalSource=signup_google',
          },
        },
      ]);

      await expect(
        signInWithGoogle(async () => ({ signingIn: false }))
      ).rejects.toThrow('WEB_GOOGLE_REDIRECT_MISSING');
    } finally {
      globalThis.window = previousWindow;
    }

    await expect(signInWithGoogle(async () => ({}))).rejects.toThrow(
      'WEB_OAUTH_BROWSER_UNAVAILABLE'
    );
    await expect(signInWithApple(async () => ({}))).rejects.toThrow(
      'WEB_OAUTH_NOT_IMPLEMENTED'
    );
  });
});
