export function referralSettingsDestinations(platform: string) {
  return platform === 'web'
    ? ({
        settings: '/business/settings',
        campaigns: '/business/campaigns',
      } as const)
    : ({
        settings: '/(authenticated)/(business)/settings',
        campaigns: '/(authenticated)/(business)/campaigns',
      } as const);
}

export const NATIVE_REFERRAL_DESTINATIONS =
  referralSettingsDestinations('native');
export const WEB_REFERRAL_DESTINATIONS = referralSettingsDestinations('web');
