export const BUSINESS_ROUTES = {
  team: '/(authenticated)/(business)/team',
  teamAdd: '/(authenticated)/(business)/team/add',
  settings: '/(authenticated)/(business)/settings',
  profile: '/(authenticated)/(business)/settings-business-profile',
  profileComplete:
    '/(authenticated)/(business)/settings-business-profile-complete',
  address: '/(authenticated)/(business)/settings-business-address',
  account: '/(authenticated)/(business)/settings-business-account',
  accountData: '/(authenticated)/(business)/settings-business-account-data',
  subscription: '/(authenticated)/(business)/settings-business-subscription',
  inviteBusinesses:
    '/(authenticated)/(business)/settings-business-invite-businesses',
} as const;
