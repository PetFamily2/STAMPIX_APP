import type { WebAuthProviderAvailability } from '../../convex/lib/webAuthConfiguration';

export type WebAuthMethod = keyof WebAuthProviderAvailability;

export async function readWebAuthWithDeadline(
  read: () => Promise<WebAuthProviderAvailability>,
  timeoutMs = 8000
): Promise<WebAuthProviderAvailability> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    return await Promise.race([
      read(),
      new Promise<never>((_resolve, reject) => {
        timer = setTimeout(
          () => reject(new Error('WEB_AUTH_CONFIGURATION_UNAVAILABLE')),
          timeoutMs
        );
      }),
    ]);
  } finally {
    clearTimeout(timer);
  }
}

export async function requireWebAuthProvider(
  provider: WebAuthMethod,
  read: () => Promise<WebAuthProviderAvailability>
): Promise<void> {
  let availability: WebAuthProviderAvailability;
  try {
    availability = await readWebAuthWithDeadline(read);
  } catch {
    throw new Error('WEB_AUTH_CONFIGURATION_UNAVAILABLE');
  }
  if (availability?.[provider] !== true) {
    throw new Error('WEB_AUTH_PROVIDER_NOT_CONFIGURED');
  }
}
