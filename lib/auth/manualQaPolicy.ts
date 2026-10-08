export const MANUAL_QA_BRANCH = 'pwa/phase-3-scanner-commands-20261005';
export const MANUAL_QA_PREVIEW_NAME = 'stampaix-pwa-phase3-e2e';
export const MANUAL_QA_ROLES = [
  'customer',
  'owner',
  'manager',
  'staff',
] as const;
export type ManualQaRole = (typeof MANUAL_QA_ROLES)[number];
export const MANUAL_QA_PASSWORD = 'StampAix-Synthetic-Preview-QA-2026!';

export function manualQaEmail(role: ManualQaRole): string {
  return `phase3-${role}@example.invalid`;
}

function safePreviewUrl(url: string | undefined): boolean {
  return (
    !!url &&
    /^https:\/\/[a-z0-9]+(?:-[a-z0-9]+)*\.convex\.cloud$/.test(url) &&
    !/^https:\/\/(utmost-fennec-280|aware-llama-850)\.convex\.cloud$/.test(url)
  );
}

export function manualQaClientEnabled(input: {
  platform: string;
  environment?: string;
  flag?: string;
  url?: string;
  previewUrl?: string;
  backend?: string;
}): boolean {
  return (
    input.platform === 'web' &&
    input.environment === 'preview' &&
    input.flag === 'true' &&
    input.backend === 'verified-preview' &&
    safePreviewUrl(input.url) &&
    input.url === input.previewUrl
  );
}

type Environment = Partial<Record<string, string | undefined>>;
export function manualQaBackendEnabled(
  env: Environment = process.env
): boolean {
  return (
    env.STAMPAIX_ENV === 'preview' &&
    env.MANUAL_QA_ENABLED === 'true' &&
    env.MANUAL_QA_DEPLOYMENT_TYPE === 'preview' &&
    env.MANUAL_QA_SOURCE_BRANCH === MANUAL_QA_BRANCH &&
    env.PHASE3_PREVIEW_NAME === MANUAL_QA_PREVIEW_NAME &&
    safePreviewUrl(env.CONVEX_CLOUD_URL) &&
    env.CONVEX_CLOUD_URL === env.PHASE3_PREVIEW_URL &&
    env.CONVEX_SITE_URL === env.CONVEX_CLOUD_URL?.replace('.cloud', '.site') &&
    (env.PHASE3_FIXTURE_SECRET?.length ?? 0) >= 32 &&
    env.MANUAL_QA_PASSWORD === MANUAL_QA_PASSWORD
  );
}

/** Runs before the existing Password provider verifies credentials, for every flow. */
export function manualQaPasswordProfile(
  params: Record<string, unknown>,
  env: Environment = process.env
): { email: string } {
  const email = typeof params.email === 'string' ? params.email : '';
  const synthetic =
    /^phase3-(customer|owner|manager|staff|deletion)@example\.invalid$/.test(
      email
    );
  if (synthetic || env.MANUAL_QA_ENABLED === 'true') {
    if (!synthetic || !manualQaBackendEnabled(env))
      throw new Error('MANUAL_QA_DISABLED');
    if (params.flow !== 'signIn' && params.flow !== 'signUp')
      throw new Error('MANUAL_QA_FLOW_DENIED');
    if (
      params.flow === 'signUp' &&
      params.qaProvisioningSecret !== env.PHASE3_FIXTURE_SECRET
    )
      throw new Error('MANUAL_QA_PROVISIONING_DENIED');
  }
  return { email };
}
