export type WebAuthProviderAvailability = {
  google: boolean;
  apple: boolean;
  email: boolean;
};

type Environment = Partial<Record<string, string | undefined>>;

function configured(value: string | undefined): boolean {
  return (
    typeof value === 'string' &&
    value.length > 0 &&
    value === value.trim() &&
    !/^(undefined|null|placeholder)$/i.test(value)
  );
}

function validEncryptionKey(value: string | undefined): boolean {
  if (typeof value !== 'string') return false;
  // Match providerCredentials.importEncryptionKey's existing normalization.
  const encodedKey = value.trim();
  if (!configured(encodedKey)) return false;
  try {
    const base64 = encodedKey.replace(/-/g, '+').replace(/_/g, '/');
    return (
      atob(base64.padEnd(Math.ceil(base64.length / 4) * 4, '=')).length === 32
    );
  } catch {
    return false;
  }
}

// Configuration readiness only. Provider-side validity requires a real OAuth test.
// Public callers receive booleans, never identifiers, secrets, or environment values.
export function readWebAuthProviderAvailability(
  env: Environment = process.env
): WebAuthProviderAvailability {
  const encryptionReady = validEncryptionKey(
    env.AUTH_PROVIDER_TOKEN_ENCRYPTION_KEY
  );
  return {
    google:
      encryptionReady &&
      /^[0-9]+-[A-Za-z0-9_-]+\.apps\.googleusercontent\.com$/.test(
        env.AUTH_GOOGLE_ID ?? ''
      ) &&
      configured(env.AUTH_GOOGLE_SECRET),
    apple:
      encryptionReady &&
      configured(env.AUTH_APPLE_ID) &&
      configured(env.AUTH_APPLE_SECRET),
    email: configured(env.RESEND_API_KEY) && configured(env.RESEND_FROM_EMAIL),
  };
}
