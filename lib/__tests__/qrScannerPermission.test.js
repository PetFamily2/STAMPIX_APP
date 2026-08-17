import { describe, expect, test } from 'bun:test';
import { readFileSync } from 'node:fs';
import {
  resolveCameraPermissionAction,
  shouldRefreshCameraPermission,
} from '../scanner/posFlow';

const QR_SCANNER_SOURCE = 'components/QrScanner.tsx';

describe('shared QR scanner camera permission recovery', () => {
  test('requestable and permanent denials choose different recovery actions', () => {
    expect(
      resolveCameraPermissionAction({ granted: false, canAskAgain: true })
    ).toBe('request');
    expect(
      resolveCameraPermissionAction({ granted: false, canAskAgain: false })
    ).toBe('settings');
    expect(
      resolveCameraPermissionAction({ granted: true, canAskAgain: true })
    ).toBe('camera');
  });

  test('camera permission refresh is limited to app-active transitions', () => {
    expect(shouldRefreshCameraPermission('active')).toBe(true);
    expect(shouldRefreshCameraPermission('background')).toBe(false);
    expect(shouldRefreshCameraPermission('inactive')).toBe(false);
  });

  test('shared implementation preserves settings, app refresh and scan lock contracts', () => {
    const source = readFileSync(QR_SCANNER_SOURCE, 'utf8');
    expect(source).toContain('Linking.openSettings()');
    expect(source).toContain("AppState.addEventListener('change'");
    expect(source).toContain("barcodeTypes: ['qr']");
    expect(source).toContain('scanLockRef.current = true');
    expect(source).toContain('scanLockRef.current = false');
    expect(source).toContain('}, [resetKey]);');
  });
});
