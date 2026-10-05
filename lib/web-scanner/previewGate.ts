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
