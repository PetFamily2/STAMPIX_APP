import type { Href } from 'expo-router';
import type { RecommendationNavigationTarget } from './navigation';

const WEB_PATHS: Record<string, string> = {
  '/(authenticated)/(business)/settings-business-address': '/business/settings',
  '/(authenticated)/(business)/settings-business-profile': '/business/settings',
  '/(authenticated)/(business)/programs': '/business/loyalty',
  '/(authenticated)/(business)/cards/[programId]':
    '/business/cards/[programId]',
  '/(authenticated)/(business)/campaigns': '/business/campaigns',
  '/(authenticated)/(business)/cards/campaign/[campaignId]':
    '/business/campaign/[campaignId]',
  '/(authenticated)/(business)/customers': '/business/customers',
  '/(authenticated)/(business)/team': '/business/team',
  '/(authenticated)/(business)/settings-business-subscription':
    '/business/billing',
};

export function webHrefFromRecommendationTarget(
  target: RecommendationNavigationTarget
): Href | null {
  const pathname = WEB_PATHS[target.pathname];
  if (!pathname) {
    return null;
  }
  return { pathname, params: target.params } as Href;
}

export function webHrefFromStoredRecommendationResult(result: {
  kind: string;
  campaignId?: string;
  customerFilter?: string | null;
}): Href | null {
  switch (result.kind) {
    case 'open_draft':
      return result.campaignId
        ? ({
            pathname: '/business/campaign/[campaignId]',
            params: { campaignId: result.campaignId },
          } as Href)
        : null;
    case 'view_customers': {
      const filter = result.customerFilter;
      if (
        filter === 'at_risk' ||
        filter === 'near_reward' ||
        filter === 'new_customers'
      ) {
        return {
          pathname: '/business/customers',
          params: { filter },
        } as Href;
      }
      return '/business/customers' as Href;
    }
    case 'view_analytics':
      return '/business/analytics' as Href;
    case 'open_cards':
      return '/business/loyalty' as Href;
    case 'open_profile':
      return '/business/settings' as Href;
    case 'view_subscription':
      return '/business/billing' as Href;
    default:
      return null;
  }
}
