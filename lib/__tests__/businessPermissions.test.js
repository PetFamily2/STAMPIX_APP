import { describe, expect, test } from 'bun:test';

import {
  getRoleCapabilities,
  resolveBusinessCapabilities,
} from '../domain/businessPermissions';

describe('business capability resolution', () => {
  test('business invitations are available to owners and managers, not staff', () => {
    expect(getRoleCapabilities('owner').invite_businesses).toBe(true);
    expect(getRoleCapabilities('manager').invite_businesses).toBe(true);
    expect(getRoleCapabilities('staff').invite_businesses).toBe(false);
  });

  test('manager invitation access does not grant billing or purchase controls', () => {
    const manager = resolveBusinessCapabilities(null, 'manager');

    expect(manager.invite_businesses).toBe(true);
    expect(manager.view_billing_state).toBe(false);
    expect(manager.manage_subscription).toBe(false);

    const staff = resolveBusinessCapabilities(null, 'staff');
    expect(staff.manage_subscription).toBe(false);
    expect(staff.view_billing_state).toBe(false);
    expect(staff.invite_businesses).toBe(false);
  });

  test('older capability payloads inherit the dedicated role default', () => {
    expect(
      resolveBusinessCapabilities({ view_billing_state: false }, 'manager')
        .invite_businesses
    ).toBe(true);
    expect(
      resolveBusinessCapabilities({ view_billing_state: true }, 'staff')
        .invite_businesses
    ).toBe(false);
  });
});
