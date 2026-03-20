export type StaffRole = 'owner' | 'manager' | 'staff';

export type BusinessCapability =
  | 'access_dashboard'
  | 'access_customers'
  | 'access_campaigns'
  | 'create_campaigns'
  | 'edit_campaigns'
  | 'activate_send_campaigns'
  | 'delete_campaigns'
  | 'access_analytics'
  | 'export_reports'
  | 'view_usage_quota'
  | 'view_billing_state'
  | 'manage_subscription'
  | 'manage_team'
  | 'edit_loyalty_cards'
  | 'view_settings'
  | 'edit_business_profile'
  | 'scanner_access'
  | 'view_customer_state_tier';

export type BusinessCapabilityMap = Record<BusinessCapability, boolean>;

const ROLE_CAPABILITIES: Record<StaffRole, BusinessCapabilityMap> = {
  owner: {
    access_dashboard: true,
    access_customers: true,
    access_campaigns: true,
    create_campaigns: true,
    edit_campaigns: true,
    activate_send_campaigns: true,
    delete_campaigns: true,
    access_analytics: true,
    export_reports: true,
    view_usage_quota: true,
    view_billing_state: true,
    manage_subscription: true,
    manage_team: true,
    edit_loyalty_cards: true,
    view_settings: true,
    edit_business_profile: true,
    scanner_access: true,
    view_customer_state_tier: true,
  },
  manager: {
    access_dashboard: true,
    access_customers: true,
    access_campaigns: true,
    create_campaigns: true,
    edit_campaigns: true,
    activate_send_campaigns: true,
    delete_campaigns: false,
    access_analytics: true,
    export_reports: true,
    view_usage_quota: true,
    view_billing_state: false,
    manage_subscription: false,
    manage_team: true,
    edit_loyalty_cards: true,
    view_settings: true,
    edit_business_profile: true,
    scanner_access: true,
    view_customer_state_tier: true,
  },
  staff: {
    access_dashboard: false,
    access_customers: true,
    access_campaigns: true,
    create_campaigns: false,
    edit_campaigns: false,
    activate_send_campaigns: false,
    delete_campaigns: false,
    access_analytics: false,
    export_reports: false,
    view_usage_quota: false,
    view_billing_state: false,
    manage_subscription: false,
    manage_team: false,
    edit_loyalty_cards: false,
    view_settings: true,
    edit_business_profile: false,
    scanner_access: true,
    view_customer_state_tier: true,
  },
};

export function getRoleCapabilities(staffRole: StaffRole): BusinessCapabilityMap {
  return ROLE_CAPABILITIES[staffRole];
}

export function resolveBusinessCapabilities(
  capabilities: Partial<BusinessCapabilityMap> | null | undefined,
  fallbackRole: StaffRole
) {
  const fallback = ROLE_CAPABILITIES[fallbackRole];
  if (!capabilities) {
    return fallback;
  }

  return {
    access_dashboard:
      capabilities.access_dashboard ?? fallback.access_dashboard,
    access_customers:
      capabilities.access_customers ?? fallback.access_customers,
    access_campaigns:
      capabilities.access_campaigns ?? fallback.access_campaigns,
    create_campaigns:
      capabilities.create_campaigns ?? fallback.create_campaigns,
    edit_campaigns: capabilities.edit_campaigns ?? fallback.edit_campaigns,
    activate_send_campaigns:
      capabilities.activate_send_campaigns ??
      fallback.activate_send_campaigns,
    delete_campaigns:
      capabilities.delete_campaigns ?? fallback.delete_campaigns,
    access_analytics:
      capabilities.access_analytics ?? fallback.access_analytics,
    export_reports: capabilities.export_reports ?? fallback.export_reports,
    view_usage_quota:
      capabilities.view_usage_quota ?? fallback.view_usage_quota,
    view_billing_state:
      capabilities.view_billing_state ?? fallback.view_billing_state,
    manage_subscription:
      capabilities.manage_subscription ?? fallback.manage_subscription,
    manage_team: capabilities.manage_team ?? fallback.manage_team,
    edit_loyalty_cards:
      capabilities.edit_loyalty_cards ?? fallback.edit_loyalty_cards,
    view_settings: capabilities.view_settings ?? fallback.view_settings,
    edit_business_profile:
      capabilities.edit_business_profile ?? fallback.edit_business_profile,
    scanner_access: capabilities.scanner_access ?? fallback.scanner_access,
    view_customer_state_tier:
      capabilities.view_customer_state_tier ??
      fallback.view_customer_state_tier,
  };
}
