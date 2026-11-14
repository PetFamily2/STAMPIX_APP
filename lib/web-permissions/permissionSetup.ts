export type SetupRole = 'customer' | 'business';
export type SetupPermission = 'notifications' | 'camera' | 'location';
export type SetupResult = 'ready' | 'incomplete';

export function permissionPlan(role: SetupRole): SetupPermission[] {
  return role === 'business'
    ? ['notifications', 'camera', 'location']
    : ['notifications', 'location'];
}

/** Called from a click. Start notifications before any await to preserve browser activation. */
export async function runPermissionSetup(
  selected: SetupPermission[],
  actions: {
    valid: () => boolean;
    notifications: () => Promise<boolean | undefined>;
    camera: () => Promise<void>;
    location: () => Promise<void>;
    result: (kind: SetupPermission, result: SetupResult) => void;
  }
) {
  for (const kind of ['notifications', 'camera', 'location'] as const) {
    if (!actions.valid()) return;
    if (!selected.includes(kind)) continue;
    let result: SetupResult = 'incomplete';
    try {
      const value = await actions[kind]();
      result =
        kind === 'notifications' && value !== true ? 'incomplete' : 'ready';
    } catch {
      // One denial must not prevent the other selected capabilities being offered.
    }
    if (!actions.valid()) return;
    actions.result(kind, result);
  }
}
