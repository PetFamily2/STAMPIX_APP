import { describe, expect, test } from 'bun:test';
import { CANONICAL_LEGAL_VERSION } from '../legalContract';
import { WEB_LEGAL_VERSION, webLegalAcceptanceArgs } from '../legalWebContract';
import { WEB_LEGAL_DOCUMENTS } from '../legalWebDocuments';

describe('Web launch legal contract', () => {
  test('records the new contract only for Web while preserving the legacy contract', () => {
    expect(CANONICAL_LEGAL_VERSION).toBe('2026.10.03');
    expect(webLegalAcceptanceArgs('web')).toEqual({
      webLegalVersion: WEB_LEGAL_VERSION,
    });
    expect(webLegalAcceptanceArgs('android')).toEqual({});
    expect(webLegalAcceptanceArgs('ios')).toEqual({});
  });
  test('public terms contain the approved operator, final prices and provider-confirmed cancellation', () => {
    const text = JSON.stringify(WEB_LEGAL_DOCUMENTS.terms);
    for (const value of [
      'פרץ אלגרה',
      'עוסק פטור',
      '149 / 299 / 499',
      '1,490 / 2,990 / 4,990',
      'אישור מהשרת ומהספק',
      'חבילות אספנות',
    ]) {
      expect(text).toContain(value);
    }
  });
  test('privacy distinguishes location, browser notifications, marketing and payment processing', () => {
    const text = JSON.stringify(WEB_LEGAL_DOCUMENTS.privacy);
    for (const value of [
      'מיקום מעוגל רק לאחר לחיצה',
      'אינו נשמר בפרופיל',
      'נפרד מהסכמה לדיוור',
      'SUMIT',
      'Resend',
      'Convex',
      'https://policies.google.com/privacy',
    ]) {
      expect(text).toContain(value);
    }
  });
});
