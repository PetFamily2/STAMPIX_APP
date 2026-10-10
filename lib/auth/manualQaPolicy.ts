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

// Synthetic access is permanently retired, including previously valid Preview flags.
export function manualQaClientEnabled(_input: {
  platform: string;
  environment?: string;
  flag?: string;
  url?: string;
  previewUrl?: string;
  backend?: string;
}): boolean {
  return false;
}

type Environment = Partial<Record<string, string | undefined>>;
export function manualQaBackendEnabled(
  _env: Environment = process.env
): boolean {
  return false;
}

/** Runs before the existing Password provider verifies credentials, for every flow. */
export function manualQaPasswordProfile(
  params: Record<string, unknown>,
  _env: Environment = process.env
): { email: string } {
  const email = typeof params.email === 'string' ? params.email : '';
  const synthetic =
    /^phase3-(customer|owner|manager|staff|deletion)@example\.invalid$/.test(
      email
    );
  if (synthetic) throw new Error('MANUAL_QA_DISABLED');
  return { email };
}
