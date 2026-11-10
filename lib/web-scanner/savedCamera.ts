const SAVED_CAMERA_KEY = 'stampaix:web-scanner-camera';

export function readSavedScannerCamera(
  storage: Pick<Storage, 'getItem'> | null
) {
  try {
    return storage?.getItem(SAVED_CAMERA_KEY) ?? '';
  } catch {
    return '';
  }
}

export function saveScannerCamera(
  deviceId: string,
  storage: Pick<Storage, 'setItem'> | null
) {
  if (!deviceId) return;
  try {
    storage?.setItem(SAVED_CAMERA_KEY, deviceId);
  } catch {
    // The choice still applies for this visit if storage is blocked.
  }
}
