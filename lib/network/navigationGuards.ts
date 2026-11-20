export type NavigationGuard = { isDirty: boolean; onDiscard?: () => void };

/** One clean or unmounting form must never clear a different dirty form. */
export function createNavigationGuardRegistry(
  onChange: (guard: NavigationGuard | null) => void
) {
  const guards = new Map<symbol, NavigationGuard>();
  return (key: symbol, guard: NavigationGuard | null) => {
    if (guard?.isDirty) guards.set(key, guard);
    else guards.delete(key);
    const active = [...guards.values()];
    onChange(
      active.length
        ? {
            isDirty: true,
            onDiscard: () => {
              for (const item of active) item.onDiscard?.();
            },
          }
        : null
    );
  };
}
