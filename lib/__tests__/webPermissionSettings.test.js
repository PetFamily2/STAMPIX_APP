import { describe, expect, test } from 'bun:test';
import { readFileSync } from 'node:fs';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { BrowserPermissionsPanel } from '../../components/web-permissions/BrowserPermissionsPanel.web';
import { CANONICAL_PRIVACY_VERSION } from '../legalContract';
import {
  checkCameraAccess,
  checkLocationAccess,
  isAppleMobile,
  pushAvailability,
  pushFailureMessage,
  readBrowserPermission,
} from '../web-permissions/browserPermissions';
import { firstVisitStep } from '../web-permissions/firstVisit';

describe('central Web/PWA permission settings', () => {
  test('queries never prompt and unsupported queries do not pretend to be denials', async () => {
    expect(await readBrowserPermission(undefined, 'camera')).toBe('unknown');
    expect(
      await readBrowserPermission(
        {
          query: async () => {
            throw Error('unsupported');
          },
        },
        'camera'
      )
    ).toBe('unknown');
    for (const state of ['granted', 'denied', 'prompt']) {
      expect(
        await readBrowserPermission(
          {
            query: async ({ name }) => {
              expect(name).toBe('geolocation');
              return { state };
            },
          },
          'geolocation'
        )
      ).toBe(state);
    }
  });
  test('camera permission check closes every track and never requests audio', async () => {
    const stopped = [];
    await checkCameraAccess({
      getUserMedia: async (constraints) => {
        expect(constraints).toEqual({ video: true, audio: false });
        return {
          getTracks: () => [
            { stop: () => stopped.push(1) },
            { stop: () => stopped.push(2) },
          ],
        };
      },
    });
    expect(stopped).toEqual([1, 2]);
  });
  test('camera failures remain failures, not local saved grants', async () => {
    await expect(
      checkCameraAccess({
        getUserMedia: async () => {
          throw new DOMException('blocked', 'NotAllowedError');
        },
      })
    ).rejects.toThrow('blocked');
  });
  test('location check discards coordinates and has a finite timeout', async () => {
    const result = await checkLocationAccess({
      getCurrentPosition: (success, _error, options) => {
        expect(options.timeout).toBe(10000);
        expect(options.enableHighAccuracy).toBe(false);
        success({ coords: { latitude: 1, longitude: 2 } });
      },
    });
    expect(result).toBeUndefined();
    await expect(
      checkLocationAccess({
        getCurrentPosition: (_success, error) => error({ code: 1 }),
      })
    ).rejects.toEqual({ code: 1 });
  });
  test('only Apple mobile outside standalone gets the Home Screen explanation', () => {
    expect(isAppleMobile('Android Chrome', 5)).toBe(false);
    expect(isAppleMobile('iPhone', 5)).toBe(true);
    expect(isAppleMobile('Macintosh', 5)).toBe(true);
    expect(isAppleMobile('Macintosh', 0)).toBe(false);
    const common = {
      secure: true,
      appleMobile: false,
      standalone: false,
      supported: true,
    };
    expect(pushAvailability(common)).toBeNull();
    expect(pushAvailability({ ...common, appleMobile: true })).toBe(
      'HOME_SCREEN_REQUIRED'
    );
    expect(
      pushAvailability({ ...common, appleMobile: true, standalone: true })
    ).toBeNull();
    expect(pushAvailability({ ...common, supported: false })).toBe(
      'UNSUPPORTED'
    );
    expect(pushAvailability({ ...common, secure: false })).toBe('INSECURE');
  });
  test('configuration, blocked permission, network and browser failure have distinct recovery guidance', () => {
    const codes = [
      'NOT_CONFIGURED',
      'DENIED',
      'DISMISSED',
      'UNSUPPORTED',
      'HOME_SCREEN_REQUIRED',
      'INSTALL_REQUIRED',
      'OFFLINE',
      'REGISTRATION_FAILED',
      'STORAGE_UNAVAILABLE',
      'UNKNOWN',
    ];
    expect(new Set(codes.map(pushFailureMessage)).size).toBe(codes.length);
    expect(pushFailureMessage('NOT_CONFIGURED')).toContain(
      'אינה בעיית הרשאה בטלפון'
    );
    expect(pushFailureMessage('DENIED')).toContain('הגדרות האתר');
    expect(pushFailureMessage('OFFLINE')).not.toContain('iPhone');
  });
  test('settings render semantic controls with no permission prompts during rendering', () => {
    const html = renderToStaticMarkup(
      createElement(
        BrowserPermissionsPanel,
        null,
        createElement('p', null, 'התראות')
      )
    );
    for (const text of [
      'הרשאות והתקנה',
      'מצלמה',
      'מיקום',
      'התראות',
      'התקנה למסך הבית',
      'מדיניות הפרטיות',
    ]) {
      expect(html).toContain(text);
    }
    expect(html).toContain('dir="rtl"');
    expect(html).toContain('<button');
    expect(html).toContain('<output');
    expect(html).toContain('דיוור שיווקי');
    expect(html).not.toContain('autoplay');
  });
  test('all existing role settings reuse the web override, native remains inert', () => {
    for (const path of [
      'screens/SettingsScreen.tsx',
      'screens/StaffSettingsScreen.tsx',
      'components/business-web/BusinessWebSettings.tsx',
    ]) {
      expect(readFileSync(path, 'utf8')).toContain('<WebPushSettings />');
    }
    expect(readFileSync('components/WebPushSettings.tsx', 'utf8')).toContain(
      'return null'
    );
    expect(readFileSync('components/PwaRuntime.tsx', 'utf8')).toContain(
      'return null'
    );
    const source = readFileSync('components/WebPushSettings.web.tsx', 'utf8');
    expect(source).toContain('<BrowserPermissionsPanel>');
    const click = source.slice(source.indexOf('const toggle = async'));
    expect(click.indexOf('Notification.requestPermission()')).toBeLessThan(
      click.indexOf('await ')
    );
    const mount = source.slice(0, source.indexOf('const toggle = async'));
    expect(mount).not.toContain('Notification.requestPermission()');
    expect(mount).not.toContain("'mutation'");
    expect(source).not.toContain('לא ניתן להפעיל התראות כרגע. ב-iPhone');
  });
});

describe('first-visit privacy, installation and notification introduction', () => {
  test('privacy notice comes before any optional introduction, even before login', () => {
    expect(
      firstVisitStep({
        privacyVersion: null,
        setupDone: true,
        signedIn: false,
        installed: true,
      })
    ).toBe('privacy');
    expect(
      firstVisitStep({
        privacyVersion: 'old',
        setupDone: true,
        signedIn: true,
        installed: true,
      })
    ).toBe('privacy');
  });
  test('signed-in introduction offers install before notifications; installed PWA skips installation', () => {
    const input = {
      privacyVersion: CANONICAL_PRIVACY_VERSION,
      setupDone: false,
      signedIn: true,
      installed: false,
    };
    expect(firstVisitStep(input)).toBe('install');
    expect(firstVisitStep({ ...input, installed: true })).toBe('notifications');
    expect(firstVisitStep({ ...input, setupDone: true })).toBeNull();
    expect(firstVisitStep({ ...input, signedIn: false })).toBeNull();
  });
  test('local notice acknowledgement never substitutes for account consent or sends campaigns', () => {
    const source = readFileSync(
      'components/web-permissions/WebPermissionOnboarding.web.tsx',
      'utf8'
    );
    expect(source.replace(/\s+/g, ' ')).toContain(
      'אינו מחליף את ההסכמות הנדרשות בהרשמה'
    );
    expect(source).toContain('/legal?document=privacy');
    expect(source).toContain('לא עכשיו');
    expect(source).toContain('localStorage.setItem');
    expect(source).not.toContain('useMutation');
    expect(source).not.toContain('marketingOptIn');
    expect(source).not.toContain('requestPermission(');
  });
});
