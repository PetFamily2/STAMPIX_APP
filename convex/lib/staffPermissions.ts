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

const ALL_TRUE_CAPABILITIES: BusinessCapabilityMap = {
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
};

const ROLE_CAPABILITIES: Record<StaffRole, BusinessCapabilityMap> = {
  owner: ALL_TRUE_CAPABILITIES,
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

export function getRoleCapabilities(
  staffRole: StaffRole
): BusinessCapabilityMap {
  return ROLE_CAPABILITIES[staffRole];
}

export function listAllowedCapabilities(staffRole: StaffRole) {
  const capabilities = ROLE_CAPABILITIES[staffRole];
  return (Object.keys(capabilities) as BusinessCapability[]).filter(
    (capability) => capabilities[capability]
  );
}

export function canRoleAccessCapability(
  staffRole: StaffRole,
  capability: BusinessCapability
) {
  return ROLE_CAPABILITIES[staffRole][capability] === true;
}
