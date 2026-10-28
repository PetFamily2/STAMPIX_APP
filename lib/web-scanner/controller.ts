import type { Decoder, QrFrame } from './decoder';
import {
  cameraConstraints,
  cameraErrorStatus,
  decodeDelay,
  initialScannerState,
  type ScannerEvent,
  type ScannerState,
  scannerReducer,
} from './state';

type ScannerDependencies = {
  video: HTMLVideoElement;
  media?: Pick<MediaDevices, 'getUserMedia' | 'enumerateDevices'>;
  secure: boolean;
  isVisible: () => boolean;
  capture: () => QrFrame | null;
  createDecoder: () => Decoder;
  onState: (state: ScannerState) => void;
  now?: () => number;
  schedule?: (
    callback: () => void,
    delay: number
  ) => ReturnType<typeof setTimeout>;
  cancel?: (timer: ReturnType<typeof setTimeout> | undefined) => void;
};

/** Camera + decode only. Never imports auth, business API, analytics or storage. */
export class WebQrController {
  state = initialScannerState;
  private generation = 0;
  private disposed = false;
  private wanted = false;
  private granted = false;
  private locked = false;
  private pendingRequest = false;
  private resumePending = false;
  private stream?: MediaStream;
  private decoder?: Decoder;
  private timer?: ReturnType<typeof setTimeout>;
  private watchdog?: ReturnType<typeof setTimeout>;
  private cleanupTrack?: () => void;
  private cancelPlayback?: () => void;
  private lastFrameTime = -1;
  private lastProgress = 0;
  private sessionStarted = 0;
  private readonly now: () => number;
  private readonly setTimer: NonNullable<ScannerDependencies['schedule']>;
  private readonly clearTimer: NonNullable<ScannerDependencies['cancel']>;

  constructor(private readonly deps: ScannerDependencies) {
    this.now = deps.now ?? (() => performance.now());
    this.setTimer =
      deps.schedule ?? ((callback, delay) => setTimeout(callback, delay));
    this.clearTimer = deps.cancel ?? ((timer) => clearTimeout(timer));
  }

  private emit(event: ScannerEvent) {
    if (!this.disposed) {
      this.state = scannerReducer(this.state, event);
      this.deps.onState(this.state);
    }
  }

  private release() {
    ++this.generation;
    this.cancelPlayback?.();
    this.cancelPlayback = undefined;
    this.clearTimer(this.timer);
    this.clearTimer(this.watchdog);
    this.cleanupTrack?.();
    this.cleanupTrack = undefined;
    this.decoder?.destroy();
    this.decoder = undefined;
    for (const track of this.stream?.getTracks() ?? []) {
      track.stop();
    }
    this.stream = undefined;
    this.deps.video.pause();
    this.deps.video.srcObject = null;
  }

  async start(deviceId = this.state.selectedCamera): Promise<void> {
    if (this.disposed || this.locked) {
      return;
    }
    this.wanted = true;
    if (!this.deps.secure) {
      this.emit({ type: 'status', status: 'insecure' });
      return;
    }
    if (!this.deps.media) {
      this.emit({ type: 'status', status: 'unsupported' });
      return;
    }
    if (!this.deps.isVisible()) {
      this.emit({ type: 'status', status: 'paused' });
      return;
    }
    if (this.pendingRequest) {
      this.resumePending = this.state.status === 'paused';
      return;
    }
    this.release();
    const generation = this.generation;
    this.pendingRequest = true;
    this.resumePending = false;
    this.emit({ type: 'status', status: 'requesting' });
    this.watchdog = this.setTimer(() => {
      if (generation === this.generation) {
        this.wanted = false;
        this.release();
        this.emit({ type: 'status', status: 'error' });
      }
    }, 20000);
    try {
      let stream: MediaStream;
      try {
        stream = await this.deps.media.getUserMedia(
          cameraConstraints(deviceId)
        );
      } catch (error) {
        if (
          generation !== this.generation ||
          cameraErrorStatus(error) !== 'error' ||
          !(error instanceof DOMException) ||
          error.name !== 'OverconstrainedError'
        ) {
          throw error;
        }
        // A removed camera ID or unsupported constraints: one default fallback.
        stream = await this.deps.media.getUserMedia({
          audio: false,
          video: true,
        });
      }
      if (generation !== this.generation || this.disposed || !this.wanted) {
        for (const track of stream.getTracks()) {
          track.stop();
        }
        return;
      }
      this.stream = stream;
      this.granted = true;
      const video = this.deps.video;
      video.muted = true;
      video.playsInline = true;
      video.srcObject = stream;
      const track = stream.getVideoTracks()[0];
      if (!track) {
        throw new DOMException('No camera', 'NotFoundError');
      }
      const interrupted = () => {
        if (generation === this.generation) {
          this.suspend();
        }
      };
      track.addEventListener('ended', interrupted);
      track.addEventListener('mute', interrupted);
      this.cleanupTrack = () => {
        track.removeEventListener('ended', interrupted);
        track.removeEventListener('mute', interrupted);
      };
      // Focus capability is optional; browsers/lenses may ignore or reject it.
      const capabilities = track.getCapabilities?.() as
        | (MediaTrackCapabilities & { focusMode?: string[] })
        | undefined;
      if (capabilities?.focusMode?.includes('continuous')) {
        void track
          .applyConstraints({
            advanced: [{ focusMode: 'continuous' } as MediaTrackConstraintSet],
          })
          .catch(() => undefined);
      }
      // A suspended Safari stream may leave play() pending indefinitely.
      const cancelled = new Promise<void>((resolve) => {
        this.cancelPlayback = resolve;
      });
      await Promise.race([video.play(), cancelled]);
      if (generation !== this.generation) {
        return;
      }
      this.cancelPlayback = undefined;
      this.clearTimer(this.watchdog);
      this.decoder = this.deps.createDecoder();
      this.lastFrameTime = -1;
      this.lastProgress = this.now();
      this.sessionStarted = this.now();
      this.emit({ type: 'status', status: 'scanning' });
      void this.listCameras(generation, track.getSettings().deviceId ?? '');
      this.schedule(generation, 250);
    } catch (error) {
      if (generation === this.generation) {
        this.wanted = false;
        this.release();
        this.emit({ type: 'status', status: cameraErrorStatus(error) });
      }
    } finally {
      this.pendingRequest = false;
      if (this.resumePending && this.wanted && this.deps.isVisible()) {
        this.resumePending = false;
        void this.start();
      }
    }
  }

  private async listCameras(generation: number, selectedCamera: string) {
    try {
      const devices = await this.deps.media?.enumerateDevices();
      if (generation === this.generation) {
        this.emit({
          type: 'cameras',
          selectedCamera,
          cameras: (devices ?? [])
            .filter((device) => device.kind === 'videoinput' && device.deviceId)
            .map((device, index) => ({
              id: device.deviceId,
              label: device.label || `מצלמה ${index + 1}`,
            })),
        });
      }
    } catch {
      // Safari may withhold device labels; the default stream remains usable.
    }
  }

  private schedule(generation: number, delay: number) {
    this.timer = this.setTimer(() => void this.scan(generation), delay);
  }

  private async scan(generation: number) {
    if (generation !== this.generation || this.locked || this.disposed) {
      return;
    }
    if (!this.deps.isVisible() || this.now() - this.sessionStarted > 120000) {
      this.suspend();
      return;
    }
    const started = this.now();
    try {
      const video = this.deps.video;
      if (video.readyState >= 2 && video.currentTime !== this.lastFrameTime) {
        this.lastFrameTime = video.currentTime;
        this.lastProgress = this.now();
        const frame = this.deps.capture();
        if (frame && this.decoder) {
          const result = await this.decoder.decode(frame);
          if (generation !== this.generation || this.locked || this.disposed) {
            return;
          }
          if (result) {
            this.locked = true;
            this.wanted = false;
            this.emit({ type: 'decoded', length: result.length });
            this.release();
            return;
          }
        }
      }
      if (this.now() - this.lastProgress > 8000) {
        this.wanted = false;
        this.release();
        this.emit({ type: 'status', status: 'error' });
        return;
      }
      this.schedule(generation, decodeDelay(this.now() - started));
    } catch {
      if (generation === this.generation) {
        this.wanted = false;
        this.release();
        this.emit({ type: 'status', status: 'error' });
      }
    }
  }

  suspend() {
    this.release();
    if (!this.locked) {
      this.emit({ type: 'status', status: 'paused' });
    }
  }

  resume() {
    if (this.wanted && this.granted && !this.locked && this.deps.isVisible()) {
      void this.start();
    }
  }

  stop() {
    this.wanted = false;
    this.resumePending = false;
    this.release();
    if (!this.locked) {
      this.emit({ type: 'status', status: 'idle' });
    }
  }

  reset() {
    this.stop();
    this.locked = false;
    this.emit({ type: 'reset' });
  }

  destroy() {
    this.stop();
    this.disposed = true;
  }
}

export function attachCameraLifecycle(
  controller: WebQrController,
  documentTarget: Document,
  windowTarget: Window
) {
  const visibility = () => {
    if (documentTarget.visibilityState === 'hidden') {
      controller.suspend();
    } else {
      controller.resume();
    }
  };
  const hide = () => controller.suspend();
  const show = () => controller.resume();
  documentTarget.addEventListener('visibilitychange', visibility);
  windowTarget.addEventListener('pagehide', hide);
  windowTarget.addEventListener('pageshow', show);
  return () => {
    documentTarget.removeEventListener('visibilitychange', visibility);
    windowTarget.removeEventListener('pagehide', hide);
    windowTarget.removeEventListener('pageshow', show);
    controller.destroy();
  };
}
