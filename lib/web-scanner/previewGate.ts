import { productionPilotEnabled } from '@/lib/pwa/releaseGate';
export function scannerPreviewEnabled(input: {
  platform: string;
  environment?: string;
  flag?: string;
  actorId?: string;
  businessId?: string;
  actors?: string;
  businesses?: string;
  backend?: string;
  url?: string;
  prodUrl?: string;
  previewUrl?: string;
}) {
  const listed = (list: string | undefined, id: string | undefined) =>
    !!id &&
    (list ?? '')
      .split(',')
      .map((s) => s.trim())
      .filter(Boolean)
      .includes(id);
  return (
    input.platform === 'web' &&
    input.environment === 'preview' &&
    input.flag === 'true' &&
    input.backend === 'verified-preview' &&
    !!input.url &&
    input.url === input.previewUrl &&
    !/^https:\/\/(utmost-fennec-280|aware-llama-850)\.convex\.cloud$/.test(
      input.url
    ) &&
    input.url !== input.prodUrl &&
    /^https:\/\/[a-z0-9-]+\.convex\.cloud$/.test(input.url) &&
    listed(input.actors, input.actorId) &&
    listed(input.businesses, input.businessId)
  );
}

/** Latent Production pilot only. No environment is enabled by adding this policy. */
export function scannerProductionPilotEnabled(input: {
  platform: string;
  environment?: string;
  releaseGate?: string;
  flag?: string;
  actorId?: string;
  businessId?: string;
  actors?: string;
  businesses?: string;
  backend?: string;
  url?: string;
  prodUrl?: string;
  previewUrl?: string;
}) {
  const listed = (list: string | undefined, id: string | undefined) =>
    !!id &&
    (list ?? '')
      .split(',')
      .map((s) => s.trim())
      .filter(Boolean)
      .includes(id);
  return (
    input.platform === 'web' &&
    productionPilotEnabled(input.environment, input.releaseGate) &&
    input.flag === 'true' &&
    input.backend === 'verified-production' &&
    !!input.url &&
    input.url === input.prodUrl &&
    input.url !== input.previewUrl &&
    /^https:\/\/[a-z0-9-]+\.convex\.cloud$/.test(input.url) &&
    input.url !== 'https://utmost-fennec-280.convex.cloud' &&
    listed(input.actors, input.actorId) &&
    listed(input.businesses, input.businessId)
  );
}
export function scannerCommandsEnabled(
  input: Parameters<typeof scannerProductionPilotEnabled>[0]
) {
  return scannerPreviewEnabled(input) || scannerProductionPilotEnabled(input);
}
