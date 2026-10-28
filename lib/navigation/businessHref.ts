import type { Href } from 'expo-router';
/** Keeps existing Native destinations; only explicit Web management adapters are mapped. */
export function businessHref(platform: string, path: string): Href & string {
  if (platform !== 'web') return path as Href & string;
  const mappings: Record<string, string> = {
    '/(authenticated)/(business)/cards': '/business/loyalty',
    '/(authenticated)/(business)/programs': '/business/loyalty',
    '/(authenticated)/(business)/campaigns': '/business/campaigns',
    '/(authenticated)/(business)/cards/new': '/business/cards/new',
    '/(authenticated)/(business)/cards/[programId]':
      '/business/cards/[programId]',
    '/(authenticated)/(business)/cards/campaign/[campaignId]':
      '/business/campaign/[campaignId]',
    '/(authenticated)/(business)/cards/campaigns': '/business/campaigns',
    '/(authenticated)/(business)/settings-business-referrals':
      '/business/referrals',
  };
  return (mappings[path] ?? path) as Href & string;
}
