export type ScannerStatus =
  | 'idle'
  | 'requesting'
  | 'scanning'
  | 'locked'
  | 'paused'
  | 'denied'
  | 'no-camera'
  | 'insecure'
  | 'unsupported'
  | 'error';

export type ScanMetadata = { format: 'QR'; length: number };
export type ScannerState = {
  status: ScannerStatus;
  result?: ScanMetadata;
  cameras: { id: string; label: string }[];
  selectedCamera: string;
};
export const initialScannerState: ScannerState = {
  status: 'idle',
  cameras: [],
  selectedCamera: '',
};
export type ScannerEvent =
  | { type: 'status'; status: ScannerStatus }
  | { type: 'decoded'; length: number }
  | {
      type: 'cameras';
      cameras: ScannerState['cameras'];
      selectedCamera: string;
    }
  | { type: 'reset' };

export function scannerReducer(
  state: ScannerState,
  event: ScannerEvent
): ScannerState {
  switch (event.type) {
    case 'status':
      return { ...state, status: event.status };
    case 'reset':
      return { ...state, status: 'idle', result: undefined };
    case 'decoded':
      if (state.status !== 'scanning' || state.result) {
        return state;
      }
      return {
        ...state,
        status: 'locked',
        result: { format: 'QR', length: event.length },
      };
    case 'cameras':
      return {
        ...state,
        cameras: event.cameras,
        selectedCamera: event.selectedCamera,
      };
  }
}

export function cameraErrorStatus(error: unknown): ScannerStatus {
  const name =
    typeof error === 'object' && error !== null && 'name' in error
      ? String(error.name)
      : '';
  if (name === 'NotAllowedError' || name === 'SecurityError') {
    return 'denied';
  }
  if (name === 'NotFoundError' || name === 'DevicesNotFoundError') {
    return 'no-camera';
  }
  return 'error';
}

export function cameraConstraints(deviceId = ''): MediaStreamConstraints {
  return {
    audio: false,
    video: {
      ...(deviceId
        ? { deviceId: { exact: deviceId } }
        : { facingMode: { ideal: 'environment' } }),
      width: { ideal: 1280 },
      height: { ideal: 720 },
      frameRate: { ideal: 15, max: 24 },
    },
  };
}

export function decodeDelay(durationMs: number): number {
  return Math.min(1000, Math.max(250, durationMs * 3));
}

export function isScannerLabEnabled(
  environment: string | undefined,
  flag: string | undefined
): boolean {
  return environment === 'preview' && flag === 'true';
}
