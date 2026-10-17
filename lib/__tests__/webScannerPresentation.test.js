import { describe, expect, test } from 'bun:test';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import BusinessScanner from '../../components/web-scanner/BusinessScanner.web';
import {
  cameraDisplayName,
  cameraStatusMessage,
} from '../web-scanner/presentation';

describe('scanner presentation', () => {
  test('the initial scanner explains how to start without showing a reset action', () => {
    const html = renderToStaticMarkup(
      createElement(BusinessScanner, {
        actorId: 'actor',
        businessId: 'business',
        programId: 'program',
        token: 'not-a-real-token',
        url: 'https://example.invalid',
        enabled: true,
      })
    );
    expect(html).toContain('הפעילו את המצלמה כדי לסרוק קוד של לקוח');
    expect(html).toContain('הפעלת מצלמה');
    expect(html).toContain('data-camera-active="false"');
    expect(html).not.toContain('סריקת לקוח נוסף');
    expect(html).not.toContain('אישור חותמת');
    expect(html).not.toContain('אישור מימוש');
  });

  test('device names remain distinguishable without exposing browser labels', () => {
    expect(cameraDisplayName('camera 2, facing back', 1)).toBe(
      'מצלמה אחורית 2'
    );
    expect(cameraDisplayName('FaceTime front camera', 0)).toBe('מצלמה קדמית 1');
    expect(cameraDisplayName('', 2)).toBe('מצלמה 3');
    expect(cameraDisplayName('USB device serial 12345', 3)).toBe('מצלמה 4');
  });

  test('permission and hardware errors offer different recovery guidance', () => {
    expect(cameraStatusMessage('denied')).toContain('הגדרות האתר');
    expect(cameraStatusMessage('no-camera')).toContain('לא נמצאה מצלמה');
    expect(cameraStatusMessage('unsupported')).toContain('בדפדפן אחר');
    expect(cameraStatusMessage('requesting')).toContain('ממתינים לאישור');
    expect(cameraStatusMessage('scanning')).toContain('בתוך המסגרת');
  });
});
