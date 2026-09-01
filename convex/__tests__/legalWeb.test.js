import { describe, expect, test } from 'bun:test';
import { readFileSync } from 'node:fs';

import {
  handlePublicLegalDocumentRequest,
  renderPublicLegalDocument,
} from '../http';

const LEGAL_CASES = [
  {
    key: 'privacy',
    path: '/legal/privacy',
    title: 'מדיניות פרטיות',
    representativeContent:
      'פרטי חשבון וזיהוי: שם, אימייל או טלפון, מזהי משתמש פנימיים ופרטי אימות הנדרשים להתחברות.',
  },
  {
    key: 'terms',
    path: '/legal/terms',
    title: 'תנאי שימוש',
    representativeContent:
      'StampAix מספקת פלטפורמה דיגיטלית לנאמנות לקוחות, כרטיסיות, ניקובים, מבצעים, סריקות QR וניהול צוותים.',
  },
];

describe('public legal pages', () => {
  for (const legalCase of LEGAL_CASES) {
    test(`${legalCase.path} is public production-safe Hebrew HTML`, async () => {
      const response = handlePublicLegalDocumentRequest(legalCase.key);
      const html = await response.text();

      expect(response.status).toBe(200);
      expect(response.headers.get('content-type')).toBe(
        'text/html; charset=utf-8'
      );
      expect(response.headers.get('content-language')).toBe('he');
      expect(response.headers.get('x-content-type-options')).toBe('nosniff');
      expect(response.headers.get('referrer-policy')).toBe('no-referrer');
      expect(response.headers.get('x-frame-options')).toBe('DENY');
      expect(response.headers.get('content-security-policy')).toContain(
        "frame-ancestors 'none'"
      );
      expect(html).toContain('<html lang="he" dir="rtl">');
      expect(html).toContain('<meta charset="utf-8"');
      expect(html).toContain(legalCase.title);
      expect(html).toContain(legalCase.representativeContent);
      expect(html).toContain('StampAix');
      expect(html).not.toContain('<script');
      expect(html).not.toMatch(
        /APPLE_TEAM_ID|sha256_cert_fingerprints|assetlinks|apple-app-site-association/i
      );
    });
  }

  test('rendering requires no authentication context or user data', () => {
    expect(() => renderPublicLegalDocument('privacy')).not.toThrow();
    expect(() => renderPublicLegalDocument('terms')).not.toThrow();
  });

  test('privacy, terms, and existing account deletion routes stay registered', () => {
    const httpSource = readFileSync('convex/http.ts', 'utf8');

    for (const legalCase of LEGAL_CASES) {
      expect(httpSource).toContain(`path: '${legalCase.path}'`);
    }
    expect(httpSource).toContain("path: '/account-deletion'");
    expect(httpSource).toContain("path: '/account-deletion/request'");
  });
});
