import { describe, expect, test } from 'bun:test';

import {
  getActiveMembershipByBusinessId,
  resolveActiveBusinessShell,
} from '../activeBusinessShell';

describe('active business shell routing', () => {
  const memberships = [
    { id: 'biz_owner', staffRole: 'owner' },
    { id: 'biz_manager', staffRole: 'manager' },
    { id: 'biz_staff', staffRole: 'staff' },
  ];

  test('uses activeBusinessId only and does not fallback to other memberships', () => {
    expect(resolveActiveBusinessShell(memberships, 'biz_owner')).toBe(
      'business'
    );
    expect(resolveActiveBusinessShell(memberships, 'biz_manager')).toBe(
      'business'
    );
    expect(resolveActiveBusinessShell(memberships, 'biz_staff')).toBe('staff');

    expect(resolveActiveBusinessShell(memberships, null)).toBe('none');
    expect(resolveActiveBusinessShell(memberships, 'biz_missing')).toBe('none');
  });

  test('returns active membership strictly by activeBusinessId', () => {
    expect(getActiveMembershipByBusinessId(memberships, 'biz_staff')).toEqual({
      id: 'biz_staff',
      staffRole: 'staff',
    });
    expect(
      getActiveMembershipByBusinessId(memberships, 'biz_missing')
    ).toBeNull();
    expect(getActiveMembershipByBusinessId(memberships, undefined)).toBeNull();
  });
});
