import { productionPilotEnabled } from '@/lib/pwa/releaseGate';

type WebRoleRoutingFlagInput = {
  platform: string;
  appEnvironment?: string;
  flag?: string;
  releaseGate?: string;
};

/** Rollout control only. Convex remains the authority for identity and roles. */
export function resolveWebRoleRoutingFlag({
  platform,
  appEnvironment,
  flag,
  releaseGate,
}: WebRoleRoutingFlagInput): boolean {
  return (
    platform === 'web' &&
    flag === 'true' &&
    (appEnvironment === 'preview' ||
      productionPilotEnabled(appEnvironment, releaseGate))
  );
}

export function isWebRoleRoutingEnabled(platform: string): boolean {
  return resolveWebRoleRoutingFlag({
    platform,
    appEnvironment: process.env.EXPO_PUBLIC_APP_ENV,
    flag: process.env.EXPO_PUBLIC_WEB_ROLE_ROUTING,
    releaseGate: process.env.EXPO_PUBLIC_PWA_RELEASE_GATE,
  });
}
