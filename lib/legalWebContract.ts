/** Web launch contract. Keep the immutable legacy Native contract unchanged. */
export const WEB_LEGAL_VERSION = '2026.10.28-web' as const;
export const WEB_LEGAL_UPDATED_AT = '28.10.2026' as const;

export function webLegalAcceptanceArgs(platform: string): {
  webLegalVersion?: typeof WEB_LEGAL_VERSION;
} {
  return platform === 'web' ? { webLegalVersion: WEB_LEGAL_VERSION } : {};
}
