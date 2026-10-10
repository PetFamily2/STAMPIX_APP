/** The existing database used by StampAix's installed development/Preview app. */
export const SHARED_BACKEND_URL = 'https://utmost-fennec-280.convex.cloud';

export function sharedBackendEnabled(input: {
  environment?: string;
  flag?: string;
  url?: string;
}) {
  return (
    ['preview', 'development'].includes(input.environment ?? '') &&
    input.flag === 'true' &&
    input.url === SHARED_BACKEND_URL
  );
}
