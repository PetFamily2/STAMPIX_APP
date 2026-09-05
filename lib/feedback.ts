import {
  createAudioPlayer,
  setAudioModeAsync,
  type AudioPlayer,
} from 'expo-audio';
import * as Haptics from 'expo-haptics';
import { Platform } from 'react-native';

const STAMP_CLICK = require('../assets/audio/stamp-click.wav');
const REDEMPTION_SUCCESS = require('../assets/audio/redemption-success.wav');
const RECENT_CELEBRATION_SESSION_LIMIT = 50;
const RECENT_PUNCH_SUCCESS_LIMIT = 100;

let audioModePromise: Promise<void> | null = null;
let punchPlayer: AudioPlayer | null = null;
let celebrationPlayer: AudioPlayer | null = null;
let lastPunchFeedbackAt = 0;
let lastCelebrationFeedbackAt = 0;
const celebratedSessionKeys = new Set<string>();
const punchedSuccessKeys = new Set<string>();

function ensureUiAudioMode() {
  audioModePromise ??= setAudioModeAsync({
    playsInSilentMode: false,
    interruptionMode: 'mixWithOthers',
    allowsRecording: false,
    shouldPlayInBackground: false,
    shouldRouteThroughEarpiece: false,
    allowsBackgroundRecording: false,
  }).catch(() => {});
  return audioModePromise;
}

function getPunchPlayer() {
  punchPlayer ??= createAudioPlayer(STAMP_CLICK, {
    keepAudioSessionActive: false,
  });
  punchPlayer.volume = 0.34;
  return punchPlayer;
}

function getCelebrationPlayer() {
  celebrationPlayer ??= createAudioPlayer(REDEMPTION_SUCCESS, {
    keepAudioSessionActive: false,
  });
  celebrationPlayer.volume = 0.46;
  return celebrationPlayer;
}

async function replay(playerFactory: () => AudioPlayer) {
  try {
    await ensureUiAudioMode();
    const player = playerFactory();
    await player.seekTo(0);
    player.play();
  } catch {
    // Sound effects are progressive enhancement and never block the UI flow.
  }
}

async function playPunchHaptic() {
  try {
    if (Platform.OS === 'android') {
      await Haptics.performAndroidHapticsAsync(
        Haptics.AndroidHaptics.Virtual_Key
      );
      return;
    }
    await Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
  } catch {
    // Haptics are progressive enhancement.
  }
}

async function playCelebrationHaptic() {
  try {
    if (Platform.OS === 'android') {
      await Haptics.performAndroidHapticsAsync(
        Haptics.AndroidHaptics.Confirm
      );
      return;
    }
    await Haptics.notificationAsync(
      Haptics.NotificationFeedbackType.Success
    );
  } catch {
    // Haptics are progressive enhancement.
  }
}

export function playPunchSuccessFeedback(successKey?: string) {
  if (successKey && punchedSuccessKeys.has(successKey)) {
    return;
  }
  const now = Date.now();
  if (now - lastPunchFeedbackAt < 250) {
    return;
  }
  lastPunchFeedbackAt = now;
  if (successKey) {
    punchedSuccessKeys.add(successKey);
    if (punchedSuccessKeys.size > RECENT_PUNCH_SUCCESS_LIMIT) {
      const oldest = punchedSuccessKeys.values().next().value;
      if (oldest) {
        punchedSuccessKeys.delete(oldest);
      }
    }
  }
  void Promise.allSettled([replay(getPunchPlayer), playPunchHaptic()]);
}

export function playRedemptionCelebrationFeedback(sessionKey: string) {
  if (!sessionKey || celebratedSessionKeys.has(sessionKey)) {
    return;
  }
  const now = Date.now();
  if (now - lastCelebrationFeedbackAt < 1_500) {
    return;
  }
  lastCelebrationFeedbackAt = now;
  celebratedSessionKeys.add(sessionKey);
  if (celebratedSessionKeys.size > RECENT_CELEBRATION_SESSION_LIMIT) {
    const oldest = celebratedSessionKeys.values().next().value;
    if (oldest) {
      celebratedSessionKeys.delete(oldest);
    }
  }
  void Promise.allSettled([
    replay(getCelebrationPlayer),
    playCelebrationHaptic(),
  ]);
}

export function playSubtleConfirmationHaptic() {
  void (async () => {
    try {
      if (Platform.OS === 'android') {
        await Haptics.performAndroidHapticsAsync(
          Haptics.AndroidHaptics.Confirm
        );
        return;
      }
      await Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    } catch {
      // Haptics are progressive enhancement.
    }
  })();
}

export function disposeFeedbackAudioPlayers() {
  try {
    punchPlayer?.remove();
  } catch {
    // Already released or unavailable.
  }
  try {
    celebrationPlayer?.remove();
  } catch {
    // Already released or unavailable.
  }
  punchPlayer = null;
  celebrationPlayer = null;
  audioModePromise = null;
}
