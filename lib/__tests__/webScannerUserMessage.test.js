import { describe, expect, test } from 'bun:test';
import {
  cameraStatusLabel,
  scannerErrorLabel,
  scannerNeedsSubscription,
  scannerPhaseLabel,
  scannerSuccessLabel,
} from '../web-scanner/userMessage';

describe('web scanner user copy', () => {
  test('subscription failure is a short Hebrew status, never the code', () => {
    expect(scannerErrorLabel('SUBSCRIPTION_INACTIVE')).toBe(
      'המנוי לא פעיל. רכישת טסט לא עובדת.'
    );
    expect(scannerNeedsSubscription('SUBSCRIPTION_INACTIVE')).toBe(true);
    expect(scannerErrorLabel('SUBSCRIPTION_INACTIVE')).not.toContain(
      'SUBSCRIPTION'
    );
  });

  test('unknown and technical codes stay generic', () => {
    expect(scannerErrorLabel('SCANNER_COMMAND_FAILED')).toBe('נסו שוב');
    expect(scannerErrorLabel('ConvexError')).toBe('נסו שוב');
    expect(scannerErrorLabel(null)).toBe('נסו שוב');
  });

  test('duplicate stamp, reward and network stay short', () => {
    expect(scannerErrorLabel('RATE_LIMITED')).toBe('כבר נוספה חותמת');
    expect(scannerSuccessLabel({ eventType: 'REWARD_REDEEMED' })).toBe(
      'הפרס מומש'
    );
    expect(scannerPhaseLabel('OFFLINE', null)).toBe('אין רשת');
    expect(scannerPhaseLabel('QR_LOCKED', null)).toBe('הקוד נקרא');
    expect(scannerPhaseLabel('SUCCESS', { eventType: 'STAMP_ADDED' })).toBe(
      'חותמת נוספה'
    );
  });

  test('camera guidance appears only for a blocked camera', () => {
    expect(cameraStatusLabel('scanning')).toBeNull();
    expect(cameraStatusLabel('requesting')).toBeNull();
    expect(cameraStatusLabel('denied')).toBe('אשרו מצלמה');
    expect(cameraStatusLabel('denied')).not.toContain('HTTPS');
  });
});
