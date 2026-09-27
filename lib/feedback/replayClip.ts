export const PUNCH_FEEDBACK_VOLUME = 0.8;
export const REDEMPTION_FEEDBACK_VOLUME = 0.46;
export const PUNCH_FEEDBACK_MIN_INTERVAL_MS = 250;
export const PUNCH_FEEDBACK_KEY_LIMIT = 100;
export const FEEDBACK_PLAYER_READY_TIMEOUT_MS = 750;

export type FeedbackPlaybackStatus = {
  isLoaded?: boolean;
  didJustFinish?: boolean;
  playbackState?: string;
};

export type FeedbackClipPlayer = {
  isLoaded?: boolean;
  currentStatus?: FeedbackPlaybackStatus;
  play: () => void;
  seekTo: (seconds: number) => Promise<void>;
  addListener?: (
    eventName: 'playbackStatusUpdate',
    listener: (status: FeedbackPlaybackStatus) => void
  ) => { remove: () => void };
};

export type PunchFeedbackGate = {
  seen: Set<string>;
  lastAt: number;
};

const READY_PLAYBACK_STATES = new Set(['ready', 'ended']);

export function resolveUiInterruptionMode(
  platform: string
): 'duckOthers' | 'mixWithOthers' {
  return platform === 'android' ? 'duckOthers' : 'mixWithOthers';
}

export function isFeedbackPlayerReady(player: FeedbackClipPlayer): boolean {
  if (player.isLoaded === true) {
    return true;
  }
  const status = player.currentStatus;
  if (!status) {
    return false;
  }
  if (status.isLoaded === true || status.didJustFinish === true) {
    return true;
  }
  return (
    typeof status.playbackState === 'string' &&
    READY_PLAYBACK_STATES.has(status.playbackState)
  );
}

function statusIsReady(status: FeedbackPlaybackStatus): boolean {
  if (status.isLoaded === true || status.didJustFinish === true) {
    return true;
  }
  return (
    typeof status.playbackState === 'string' &&
    READY_PLAYBACK_STATES.has(status.playbackState)
  );
}

export function waitForFeedbackPlayerReady(
  player: FeedbackClipPlayer,
  timeoutMs = FEEDBACK_PLAYER_READY_TIMEOUT_MS
): Promise<void> {
  const addListener = player.addListener;
  if (isFeedbackPlayerReady(player) || typeof addListener !== 'function') {
    return Promise.resolve();
  }

  return new Promise((resolve) => {
    let settled = false;
    let subscription: { remove: () => void } | undefined;
    const finish = () => {
      if (settled) {
        return;
      }
      settled = true;
      clearTimeout(timer);
      try {
        subscription?.remove();
      } catch {
        // Listener cleanup must not block playback.
      }
      resolve();
    };
    const timer = setTimeout(finish, timeoutMs);
    try {
      subscription = addListener('playbackStatusUpdate', (status) => {
        if (statusIsReady(status)) {
          finish();
        }
      });
    } catch {
      finish();
      return;
    }
    if (isFeedbackPlayerReady(player)) {
      finish();
    }
  });
}

export async function replayFeedbackClip(
  player: FeedbackClipPlayer,
  options?: {
    readyTimeoutMs?: number;
    onFailure?: (stage: 'seek' | 'play') => void;
  }
): Promise<void> {
  try {
    await waitForFeedbackPlayerReady(player, options?.readyTimeoutMs);
  } catch {
    // A readiness failure still falls through to a best-effort play.
  }

  try {
    await player.seekTo(0);
  } catch {
    options?.onFailure?.('seek');
  }

  try {
    player.play();
  } catch {
    options?.onFailure?.('play');
  }
}

export function consumePunchFeedback(
  gate: PunchFeedbackGate,
  successKey: string | undefined,
  now: number,
  options?: { minIntervalMs?: number; maxKeys?: number }
): boolean {
  const minIntervalMs =
    options?.minIntervalMs ?? PUNCH_FEEDBACK_MIN_INTERVAL_MS;
  const maxKeys = options?.maxKeys ?? PUNCH_FEEDBACK_KEY_LIMIT;
  if (successKey && gate.seen.has(successKey)) {
    return false;
  }
  if (now - gate.lastAt < minIntervalMs) {
    return false;
  }
  gate.lastAt = now;
  if (successKey) {
    gate.seen.add(successKey);
    if (gate.seen.size > maxKeys) {
      const oldest = gate.seen.values().next().value;
      if (oldest) {
        gate.seen.delete(oldest);
      }
    }
  }
  return true;
}
