export const PRODUCT_PREVIEW_NAME = 'stampaix-product-preview';
export function requireProductPreviewTarget(value) {
  if (
    value?.deploymentType !== 'preview' ||
    value.reference !== `preview/${PRODUCT_PREVIEW_NAME}` ||
    !/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(value.deploymentName ?? '') ||
    ['utmost-fennec-280', 'aware-llama-850', 'dazzling-hound-780'].includes(
      value.deploymentName
    ) ||
    value.url !== `https://${value.deploymentName}.convex.cloud` ||
    typeof value.adminKey !== 'string' ||
    value.adminKey.length < 16 ||
    /\s/.test(value.adminKey)
  )
    throw new Error('PRODUCT_PREVIEW_TARGET_NOT_PROVEN');
  return { name: value.deploymentName, url: value.url, key: value.adminKey };
}
export function productPreviewPublicEnvironment(target) {
  return {
    EXPO_PUBLIC_APP_ENV: 'preview',
    EXPO_PUBLIC_CONVEX_URL: target.url,
    EXPO_PUBLIC_CONVEX_URL_DEV: target.url,
    EXPO_PUBLIC_PWA_ENABLED: 'true',
    EXPO_PUBLIC_WEB_ROLE_ROUTING: 'true',
    EXPO_PUBLIC_MANUAL_QA_ENABLED: 'false',
    EXPO_PUBLIC_WEB_QR_LAB: 'false',
    EXPO_PUBLIC_SCANNER_RECEIPTS: 'true',
    EXPO_PUBLIC_WEB_SCANNER_COMMANDS: 'true',
    EXPO_PUBLIC_WEB_SCANNER_PRODUCT_PREVIEW: 'true',
    EXPO_PUBLIC_WEB_SCANNER_BACKEND: 'verified-preview',
    EXPO_PUBLIC_WEB_SCANNER_PREVIEW_URL: target.url,
    EXPO_PUBLIC_PAYMENT_SYSTEM_ENABLED: 'false',
    EXPO_PUBLIC_MOCK_PAYMENTS: 'false',
  };
}

// A specific operator binding is required before copying any provider credentials
// from EAS Preview. No inherited DEV/Production credential is assumed to be safe.
export function approvedProductProviderEnvironment(source, target) {
  const result = {};
  for (const [binding, names] of [
    [
      'PRODUCT_PREVIEW_AUTH_APPROVED_URL',
      [
        'RESEND_API_KEY',
        'RESEND_FROM_EMAIL',
        'AUTH_GOOGLE_ID',
        'AUTH_GOOGLE_SECRET',
        'AUTH_APPLE_ID',
        'AUTH_APPLE_SECRET',
      ],
    ],
    ['PRODUCT_PREVIEW_PLACES_APPROVED_URL', ['GOOGLE_PLACES_API_KEY']],
    [
      'PRODUCT_PREVIEW_SUMIT_APPROVED_URL',
      ['SUMIT_ENV', 'SUMIT_COMPANY_ID', 'SUMIT_API_KEY', 'SUMIT_PRODUCTS_JSON'],
    ],
  ]) {
    if (!source[binding]) continue;
    if (source[binding] !== target.url)
      throw new Error('PRODUCT_PROVIDER_BINDING_MISMATCH');
    if (binding.includes('SUMIT') && source.SUMIT_ENV !== 'test')
      throw new Error('PRODUCT_SUMIT_TEST_REQUIRED');
    for (const name of names) if (source[name]) result[name] = source[name];
  }
  return result;
}
