import { describe, expect, test } from 'bun:test';
import { readFileSync } from 'node:fs';

import {
  buildRedemptionPresentation,
  REDEMPTION_PRESENTATION_INPUT_KEYS,
} from '../redemptionPresentation';
import {
  getRedemptionCaptureDimensions,
  REDEMPTION_SHARE_HEIGHT,
  REDEMPTION_SHARE_WIDTH,
  runRedemptionShare,
} from '../redemptionShare';

function source(overrides = {}) {
  return {
    variant: 'standard',
    state: 'normal',
    businessName: 'קפה שכונתי',
    businessLogoUrl: 'https://images.example.com/business.png',
    programDisplayName: 'מועדון הבוקר',
    rewardDisplayName: 'קפה ומאפה במתנה',
    cardThemeId: 'midnight-luxe',
    ...overrides,
  };
}

describe('redemption presentation privacy allowlist', () => {
  test('projects only public business and benefit fields', () => {
    expect(REDEMPTION_PRESENTATION_INPUT_KEYS).toEqual([
      'variant',
      'state',
      'businessName',
      'businessLogoUrl',
      'programDisplayName',
      'rewardDisplayName',
      'cardThemeId',
    ]);

    const presentation = buildRedemptionPresentation({
      ...source(),
      customerName: 'PRIVATE_CUSTOMER',
      customerContact: 'PRIVATE_CONTACT',
      qr: 'PRIVATE_QR',
      memberId: 'PRIVATE_MEMBER_ID',
      databaseId: 'PRIVATE_DATABASE_ID',
      staffIdentity: 'PRIVATE_STAFF',
      referralCode: 'PRIVATE_REFERRAL_CODE',
      transactionMetadata: 'PRIVATE_TRANSACTION',
    });
    const serialized = JSON.stringify(presentation);

    for (const privateValue of [
      'PRIVATE_CUSTOMER',
      'PRIVATE_CONTACT',
      'PRIVATE_QR',
      'PRIVATE_MEMBER_ID',
      'PRIVATE_DATABASE_ID',
      'PRIVATE_STAFF',
      'PRIVATE_REFERRAL_CODE',
      'PRIVATE_TRANSACTION',
    ]) {
      expect(serialized).not.toContain(privateValue);
    }
  });

  test('keeps standard and referral celebration variants distinct', () => {
    const standard = buildRedemptionPresentation(source());
    const referral = buildRedemptionPresentation(
      source({ variant: 'referral' })
    );

    expect(standard.variant).toBe('standard');
    expect(standard.copy.eyebrow).toBe('רגע של פינוק');
    expect(referral.variant).toBe('referral');
    expect(referral.copy.eyebrow).toBe('הטבת חברים');
    expect(referral.copy.title).not.toBe(standard.copy.title);
  });

  test('uses a monogram fallback for missing or unsafe logo URLs', () => {
    const missingLogo = buildRedemptionPresentation(
      source({ businessName: 'מאפיית השחר', businessLogoUrl: null })
    );
    const unsafeLogo = buildRedemptionPresentation(
      source({ businessLogoUrl: 'file:///private/customer.png' })
    );

    expect(missingLogo.businessLogoUrl).toBeNull();
    expect(missingLogo.businessMonogram).toBe('מה');
    expect(unsafeLogo.businessLogoUrl).toBeNull();
  });

  test('disables sharing and supplies explicit expired and revoked states', () => {
    const normal = buildRedemptionPresentation(source());
    const loading = buildRedemptionPresentation(source({ state: 'loading' }));
    const expired = buildRedemptionPresentation(source({ state: 'expired' }));
    const revoked = buildRedemptionPresentation(
      source({ state: 'revoked', variant: 'referral' })
    );
    const unavailable = buildRedemptionPresentation(
      source({ state: 'unavailable' })
    );

    expect(normal.canShare).toBe(true);
    expect(loading.canShare).toBe(false);
    expect(loading.copy.title).toContain('מכינים');
    expect(expired.canShare).toBe(false);
    expect(expired.copy.title).toContain('תוקף');
    expect(revoked.canShare).toBe(false);
    expect(revoked.copy.title).toContain('בוטלה');
    expect(unavailable.canShare).toBe(false);
    expect(unavailable.copy.title).toContain('אינה זמינה');
  });
});

function createShareHarness({
  isEnabled = () => true,
  available = () => Promise.resolve(true),
  capture = () => Promise.resolve('/tmp/redemption-share.png'),
  openNativeShare = () => Promise.resolve(),
  releaseCapture = () => undefined,
  platform = 'android',
  pixelRatio = 3,
} = {}) {
  const calls = [];
  const inFlight = { current: false };
  const captureTarget = { current: {} };

  return {
    calls,
    inFlight,
    execute: () =>
      runRedemptionShare({
        isEnabled,
        captureTarget,
        platform,
        pixelRatio,
        inFlight,
        isSharingAvailable: () => {
          calls.push({ type: 'availability' });
          return available();
        },
        capture: (target, options) => {
          calls.push({ type: 'capture', target, options });
          return capture(target, options);
        },
        openNativeShare: (uri, options) => {
          calls.push({ type: 'share', uri, options });
          return openNativeShare(uri, options);
        },
        releaseCapture: (uri) => {
          calls.push({ type: 'release', uri });
          releaseCapture(uri);
        },
      }),
  };
}

describe('redemption sharing behavior', () => {
  test('does nothing until share is explicitly invoked', async () => {
    const harness = createShareHarness();

    expect(harness.calls).toEqual([]);

    const result = await harness.execute();

    expect(result).toEqual({ status: 'shared' });
    expect(harness.calls.map(({ type }) => type)).toEqual([
      'availability',
      'capture',
      'share',
      'release',
    ]);
    expect(harness.calls[2].uri).toBe('file:///tmp/redemption-share.png');
    expect(harness.inFlight.current).toBe(false);
  });

  test('does not share disabled, expired, or revoked presentations', async () => {
    for (const state of ['loading', 'expired', 'revoked']) {
      const presentation = buildRedemptionPresentation(source({ state }));
      const harness = createShareHarness({
        isEnabled: () => presentation.canShare,
      });

      expect(await harness.execute()).toEqual({ status: 'ignored' });
      expect(harness.calls).toEqual([]);
      expect(harness.inFlight.current).toBe(false);
    }
  });

  test('deduplicates concurrent calls and permits a later completed flow', async () => {
    let resolveCapture;
    const capturePending = new Promise((resolve) => {
      resolveCapture = resolve;
    });
    let captureCount = 0;
    const harness = createShareHarness({
      capture: () => {
        captureCount += 1;
        if (captureCount === 1) {
          return capturePending;
        }
        return Promise.resolve('/tmp/redemption-share-again.png');
      },
    });

    const first = harness.execute();
    await Promise.resolve();
    const concurrent = await harness.execute();

    expect(concurrent).toEqual({ status: 'ignored' });
    expect(harness.inFlight.current).toBe(true);

    resolveCapture('/tmp/redemption-share.png');
    expect(await first).toEqual({ status: 'shared' });
    expect(harness.inFlight.current).toBe(false);

    expect(await harness.execute()).toEqual({ status: 'shared' });
    expect(captureCount).toBe(2);
  });

  test('does not capture when native sharing is unavailable', async () => {
    const harness = createShareHarness({
      available: () => Promise.resolve(false),
    });

    expect(await harness.execute()).toEqual({
      status: 'error',
      error: 'sharing-unavailable',
    });
    expect(harness.calls.map(({ type }) => type)).toEqual(['availability']);
    expect(harness.inFlight.current).toBe(false);
  });

  test('does not open native sharing after capture failure', async () => {
    const harness = createShareHarness({
      capture: () => Promise.reject(new Error('capture failed')),
    });

    expect(await harness.execute()).toEqual({
      status: 'error',
      error: 'capture-failed',
    });
    expect(harness.calls.map(({ type }) => type)).toEqual([
      'availability',
      'capture',
    ]);
    expect(harness.inFlight.current).toBe(false);
  });

  test('reports native share failures distinctly and cleans the temp file', async () => {
    const harness = createShareHarness({
      openNativeShare: () => Promise.reject(new Error('native share failed')),
    });

    expect(await harness.execute()).toEqual({
      status: 'error',
      error: 'native-share-failed',
    });
    expect(harness.calls.map(({ type }) => type)).toEqual([
      'availability',
      'capture',
      'share',
      'release',
    ]);
    expect(harness.calls[3].uri).toBe('/tmp/redemption-share.png');
    expect(harness.inFlight.current).toBe(false);
  });

  test('treats a resolved native dismissal as non-error and finalizes safely', async () => {
    let resolveNativeFlow;
    const nativeFlowPending = new Promise((resolve) => {
      resolveNativeFlow = resolve;
    });
    const harness = createShareHarness({
      openNativeShare: () => nativeFlowPending,
    });

    const sharing = harness.execute();
    await Promise.resolve();
    await Promise.resolve();

    expect(harness.calls.map(({ type }) => type)).toEqual([
      'availability',
      'capture',
      'share',
    ]);
    expect(harness.inFlight.current).toBe(true);

    resolveNativeFlow();
    expect(await sharing).toEqual({ status: 'shared' });
    expect(harness.calls.at(-1)).toEqual({
      type: 'release',
      uri: '/tmp/redemption-share.png',
    });
    expect(harness.inFlight.current).toBe(false);
  });

  test('preserves 1080x1920 output sizing on iOS and Android', async () => {
    const iosDimensions = getRedemptionCaptureDimensions('ios', 3);
    const androidDimensions = getRedemptionCaptureDimensions('android', 3);

    expect(iosDimensions.width * 3).toBe(REDEMPTION_SHARE_WIDTH);
    expect(iosDimensions.height * 3).toBe(REDEMPTION_SHARE_HEIGHT);
    expect(androidDimensions).toEqual({
      width: REDEMPTION_SHARE_WIDTH,
      height: REDEMPTION_SHARE_HEIGHT,
    });

    const iosHarness = createShareHarness({
      platform: 'ios',
      pixelRatio: 3,
    });
    const androidHarness = createShareHarness({
      platform: 'android',
      pixelRatio: 3,
    });

    await iosHarness.execute();
    await androidHarness.execute();

    expect(iosHarness.calls[1].options).toMatchObject(iosDimensions);
    expect(androidHarness.calls[1].options).toMatchObject(androidDimensions);
  });
});

describe('redemption celebration source contracts', () => {
  test('keeps manual RTL helpers and a rendered logo-error fallback', () => {
    const celebrationSource = readFileSync(
      'components/customer/RedemptionCelebration.tsx',
      'utf8'
    );
    const shareCardSource = readFileSync(
      'components/customer/RedemptionShareCard.tsx',
      'utf8'
    );
    const businessMarkSource = readFileSync(
      'components/customer/RedemptionBusinessMark.tsx',
      'utf8'
    );

    for (const componentSource of [celebrationSource, shareCardSource]) {
      expect(componentSource).toContain('flexDirection.row');
      expect(componentSource).toContain('rtlBaseText');
      expect(componentSource).not.toContain('I18nManager');
      expect(componentSource).not.toContain("direction: 'rtl'");
    }
    expect(businessMarkSource).toContain('onError={() =>');
    expect(businessMarkSource).toContain('{businessMonogram}');
  });
});
