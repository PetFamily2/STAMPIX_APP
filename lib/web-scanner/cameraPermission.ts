/** Read browser permission, never treat local storage as a camera grant. */
export async function startPreviouslyGrantedCamera(input: {
  permissions?: Pick<Permissions, 'query'>;
  allowed: () => boolean;
  start: () => Promise<void>;
}): Promise<boolean> {
  try {
    const permission = await input.permissions?.query({
      name: 'camera' as PermissionName,
    });
    if (permission?.state !== 'granted' || !input.allowed()) {
      return false;
    }
    await input.start();
    return true;
  } catch {
    // Unsupported Permissions API, revoked access or playback policy: keep manual start.
    return false;
  }
}
