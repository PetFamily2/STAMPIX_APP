import { describe, expect, test } from 'bun:test';
import {
  canRoleAccessCapability,
  getRoleCapabilities,
  listAllowedCapabilities,
} from '../lib/staffPermissions';

describe('staff permissions matrix', () => {
  test('manager has granular capabilities aligned with product rules', () => {
    const manager = getRoleCapabilities('manager');

    expect(manager.access_dashboard).toBe(true);
    expect(manager.access_customers).toBe(true);
    expect(manager.access_campaigns).toBe(true);
    expect(manager.create_campaigns).toBe(true);
    expect(manager.edit_campaigns).toBe(true);
    expect(manager.activate_send_campaigns).toBe(true);
    expect(manager.delete_campaigns).toBe(false);
    expect(manager.edit_loyalty_cards).toBe(true);
    expect(manager.view_usage_quota).toBe(true);
    expect(manager.view_billing_state).toBe(false);
    expect(manager.manage_team).toBe(true);
    expect(manager.export_reports).toBe(true);
  });

  test('staff is restricted from management actions but keeps operational access', () => {
    const staff = getRoleCapabilities('staff');

    expect(staff.access_dashboard).toBe(false);
    expect(staff.access_customers).toBe(true);
    expect(staff.access_campaigns).toBe(true);
    expect(staff.create_campaigns).toBe(false);
    expect(staff.edit_campaigns).toBe(false);
    expect(staff.activate_send_campaigns).toBe(false);
    expect(staff.edit_loyalty_cards).toBe(false);
    expect(staff.manage_team).toBe(false);
    expect(staff.view_settings).toBe(true);
    expect(staff.scanner_access).toBe(true);
    expect(staff.view_customer_state_tier).toBe(true);
  });

  test('helper functions reflect role matrix consistently', () => {
    expect(canRoleAccessCapability('manager', 'delete_campaigns')).toBe(false);
    expect(canRoleAccessCapability('manager', 'edit_loyalty_cards')).toBe(true);
    expect(canRoleAccessCapability('staff', 'create_campaigns')).toBe(false);

    const ownerCapabilities = listAllowedCapabilities('owner');
    expect(ownerCapabilities.length).toBeGreaterThan(10);
    expect(ownerCapabilities.includes('manage_subscription')).toBe(true);
  });
});
