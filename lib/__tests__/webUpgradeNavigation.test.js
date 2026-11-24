import { expect, test } from 'bun:test';
import { buildSubscriptionComparisonHref as nativeHref } from '../subscription/upgradeNavigation';
import {
  buildSubscriptionComparisonHref,
  openSubscriptionComparison,
} from '../subscription/upgradeNavigation.web';

test('Web quota and subscription actions stay inside Web billing', () => {
  const options = {
    featureKey: ' campaigns ',
    requiredPlan: 'premium',
    reason: 'limit_reached',
  };
  const destination = buildSubscriptionComparisonHref(options);
  expect(destination).toEqual({
    pathname: '/business/billing',
    params: {
      focus: 'comparison',
      recommendedPlan: 'premium',
      upgradeReason: 'limit_reached',
      featureKey: 'campaigns',
    },
  });
  const pushes = [];
  openSubscriptionComparison({ push: (href) => pushes.push(href) }, options);
  expect(pushes).toEqual([destination]);
});

test('Native subscription destination is preserved', () => {
  expect(nativeHref()).toEqual({
    pathname: '/(authenticated)/(business)/settings-business-subscription',
    params: { focus: 'comparison', recommendedPlan: 'pro' },
  });
});
