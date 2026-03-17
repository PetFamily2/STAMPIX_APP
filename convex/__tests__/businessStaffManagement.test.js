import { describe, expect, test } from 'bun:test';

import {
  buildReinviteAfterRemovalPatch,
  calculateTeamSeatsUsed,
} from '../business';
import { enforceTeamAccessForPlanState } from '../entitlements';
import {
  requireActorCanInviteRole,
  requireActorCanManageTargetStaff,
} from '../guards';

function createDbState({
  businessStaff = [],
  staffInvites = [],
  staffEvents = [],
} = {}) {
  return {
    businessStaff: businessStaff.map((row) => ({ ...row })),
    staffInvites: staffInvites.map((row) => ({ ...row })),
    staffEvents: staffEvents.map((row) => ({ ...row })),
  };
}

function createMockCtx(state) {
  return {
    db: {
      query: (tableName) => ({
        withIndex: (_indexName, buildIndex) => {
          const filters = [];
          const q = {
            eq(field, value) {
              filters.push([field, value]);
              return q;
            },
          };
          buildIndex(q);
          const tableRows = state[tableName] ?? [];
          const filteredRows = tableRows.filter((row) =>
            filters.every(([field, value]) => row[field] === value)
          );

          return {
            collect: async () => filteredRows.map((row) => ({ ...row })),
            first: async () =>
              filteredRows[0] ? { ...filteredRows[0] } : null,
          };
        },
      }),
      patch: async (id, patch) => {
        for (const tableName of Object.keys(state)) {
          const index = state[tableName].findIndex((row) => row._id === id);
          if (index >= 0) {
            state[tableName][index] = {
              ...state[tableName][index],
              ...patch,
            };
            return;
          }
        }
        throw new Error(`UNKNOWN_PATCH_TARGET:${id}`);
      },
      insert: async (tableName, value) => {
        const nextId = `${tableName}_${state[tableName].length + 1}`;
        state[tableName].push({ _id: nextId, ...value });
        return nextId;
      },
    },
  };
}

describe('strict v1 staff management rules', () => {
  test('manager capability restrictions are enforced', () => {
    expect(() => requireActorCanInviteRole('manager', 'manager')).toThrow(
      'NOT_AUTHORIZED'
    );
    expect(() => requireActorCanInviteRole('manager', 'staff')).not.toThrow();

    expect(() =>
      requireActorCanManageTargetStaff({
        actorUserId: 'u_manager',
        actorRole: 'manager',
        targetUserId: 'u_owner',
        targetRole: 'owner',
      })
    ).toThrow('NOT_AUTHORIZED');

    expect(() =>
      requireActorCanManageTargetStaff({
        actorUserId: 'u_manager',
        actorRole: 'manager',
        targetUserId: 'u_manager_2',
        targetRole: 'manager',
      })
    ).toThrow('NOT_AUTHORIZED');

    expect(() =>
      requireActorCanManageTargetStaff({
        actorUserId: 'u_manager',
        actorRole: 'manager',
        targetUserId: 'u_staff',
        targetRole: 'staff',
      })
    ).not.toThrow();

    expect(() =>
      requireActorCanManageTargetStaff({
        actorUserId: 'u_manager',
        actorRole: 'manager',
        targetUserId: 'u_manager',
        targetRole: 'staff',
      })
    ).toThrow('CANNOT_MANAGE_SELF');
  });

  test('staff cannot perform team management actions', () => {
    expect(() => requireActorCanInviteRole('staff', 'staff')).toThrow(
      'NOT_AUTHORIZED'
    );

    expect(() =>
      requireActorCanManageTargetStaff({
        actorUserId: 'u_staff_actor',
        actorRole: 'staff',
        targetUserId: 'u_staff_target',
        targetRole: 'staff',
      })
    ).toThrow('NOT_AUTHORIZED');
  });

  test('seat counting excludes expired/cancelled and counts active non-owner', () => {
    const used = calculateTeamSeatsUsed({
      staffRows: [
        { staffRole: 'owner', status: 'active' },
        { staffRole: 'manager', status: 'active' },
        { staffRole: 'staff', status: 'active' },
        { staffRole: 'staff', status: 'suspended' },
        { staffRole: 'staff', status: 'removed' },
      ],
      invites: [
        { status: 'pending', expiresAt: 2_000 },
        { status: 'pending', expiresAt: 500 },
        { status: 'cancelled', expiresAt: 5_000 },
      ],
      now: 1_000,
    });

    expect(used).toBe(3);
  });

  test('downgrade/inactive enforcement suspends manager+staff and cancels pending invites', async () => {
    const state = createDbState({
      businessStaff: [
        {
          _id: 'bs_owner',
          businessId: 'b_1',
          userId: 'u_owner',
          staffRole: 'owner',
          status: 'active',
          isActive: true,
        },
        {
          _id: 'bs_manager',
          businessId: 'b_1',
          userId: 'u_manager',
          staffRole: 'manager',
          status: 'active',
          isActive: true,
        },
        {
          _id: 'bs_staff',
          businessId: 'b_1',
          userId: 'u_staff',
          staffRole: 'staff',
          status: 'active',
          isActive: true,
        },
      ],
      staffInvites: [
        {
          _id: 'invite_pending',
          businessId: 'b_1',
          status: 'pending',
          targetRole: 'manager',
          expiresAt: 99_999,
        },
        {
          _id: 'invite_pending_2',
          businessId: 'b_1',
          status: 'pending',
          targetRole: 'staff',
          expiresAt: 99_999,
        },
      ],
    });
    const ctx = createMockCtx(state);

    await enforceTeamAccessForPlanState(ctx, {
      businessId: 'b_1',
      plan: 'starter',
      status: 'active',
      now: 10_000,
    });

    const manager = state.businessStaff.find((row) => row._id === 'bs_manager');
    const staff = state.businessStaff.find((row) => row._id === 'bs_staff');
    const owner = state.businessStaff.find((row) => row._id === 'bs_owner');

    expect(manager?.status).toBe('suspended');
    expect(manager?.isActive).toBe(false);
    expect(staff?.status).toBe('suspended');
    expect(staff?.isActive).toBe(false);
    expect(owner?.status).toBe('active');
    expect(owner?.isActive).toBe(true);

    expect(
      state.staffInvites.every((invite) => invite.status === 'cancelled')
    ).toBe(true);

    const eventTypes = state.staffEvents.map((event) => event.eventType);
    expect(eventTypes).toContain('auto_disabled_by_plan');
    expect(eventTypes).toContain('auto_invites_cancelled_by_plan');
  });

  test('reinvite-after-removed patch resets status and joinedAt and clears removed fields', () => {
    const patch = buildReinviteAfterRemovalPatch({
      existingRole: 'staff',
      acceptedRole: 'manager',
      actorUserId: 'u_target',
      now: 20_000,
    });

    expect(patch.status).toBe('active');
    expect(patch.isActive).toBe(true);
    expect(patch.joinedAt).toBe(20_000);
    expect(patch.removedAt).toBeUndefined();
    expect(patch.removedByUserId).toBeUndefined();
    expect(patch.staffRole).toBe('manager');
    expect(patch.roleChangedAt).toBe(20_000);
    expect(patch.roleChangedByUserId).toBe('u_target');
  });
});
