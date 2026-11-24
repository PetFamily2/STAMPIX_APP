const SAVED_CAMERA_KEY = 'stampaix:web-scanner-camera';

function cameraStorage() {
  try {
    return typeof localStorage === 'undefined' ? null : localStorage;
  } catch {
    return null;
  }
}

export function readSavedScannerCamera(
  storage: Pick<Storage, 'getItem'> | null = cameraStorage()
) {
  try {
    return storage?.getItem(SAVED_CAMERA_KEY) ?? '';
  } catch {
    return '';
  }
}

export function saveScannerCamera(
  deviceId: string,
  storage: Pick<Storage, 'setItem'> | null = cameraStorage()
) {
  if (!deviceId) return;
  try {
    storage?.setItem(SAVED_CAMERA_KEY, deviceId);
  } catch {
    // The choice still applies for this visit if storage is blocked.
  }
}
