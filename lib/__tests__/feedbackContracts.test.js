import { describe, expect, test } from 'bun:test';
import { existsSync, readFileSync, statSync } from 'node:fs';

import {
  consumePunchFeedback,
  PUNCH_FEEDBACK_VOLUME,
  REDEMPTION_FEEDBACK_VOLUME,
  replayFeedbackClip,
  resolveUiInterruptionMode,
} from '../feedback/replayClip';

const feedbackSource = readFileSync(
  new URL('../feedback.ts', import.meta.url),
  'utf8'
);
const scannerSource = readFileSync(
  new URL('../../app/(authenticated)/(business)/scanner.tsx', import.meta.url),
  'utf8'
);
const hostSource = readFileSync(
  new URL(
    '../../components/customer/RedemptionCelebrationHost.tsx',
    import.meta.url
  ),
  'utf8'
);
const appConfigSource = readFileSync(
  new URL('../../app.config.ts', import.meta.url),
  'utf8'
);

describe('authoritative sound and haptic feedback contracts', () => {
  test('punch feedback is connected after confirmed commit and only for stamp mode', () => {
    const successPath = scannerSource.slice(
      scannerSource.indexOf('const result = guardedResult.value'),
      scannerSource.indexOf('} catch (error)')
    );
    expect(successPath).toContain("session.actionMode === 'stamp'");
    expect(successPath).toContain(
      'playPunchSuccessFeedback(String(result.eventId))'
    );
    expect(
      scannerSource.slice(0, scannerSource.indexOf('commitFromSession'))
    ).not.toContain('playPunchSuccessFeedback(');
  });

  test('failed punch and scanner resolve paths cannot trigger success feedback', () => {
    const failurePath = scannerSource.slice(
      scannerSource.indexOf('} catch (error)')
    );
    expect(
      failurePath.slice(0, failurePath.indexOf('const handleScan'))
    ).not.toContain('playPunchSuccessFeedback(');
    const resolvePath = scannerSource.slice(
      scannerSource.indexOf('const handleScan'),
      scannerSource.indexOf('const handleUndo')
    );
    expect(resolvePath).not.toContain('playPunchSuccessFeedback()');
  });

  test('celebration feedback requires normal authoritative presentation', () => {
    expect(hostSource).toContain("presentation?.state !== 'normal'");
    expect(hostSource).toContain('playRedemptionCelebrationFeedback');
  });

  test('session keys prevent trivial rerender duplication', () => {
    expect(feedbackSource).toContain('celebratedSessionKeys.has(sessionKey)');
    expect(hostSource).toContain('acknowledgedClaimRef.current');
  });

  test('audio assets are local, tiny, and not network URLs', () => {
    const redemption = new URL(
      '../../assets/audio/redemption-success.wav',
      import.meta.url
    );
    const stamp = new URL(
      '../../assets/audio/stamp-click.wav',
      import.meta.url
    );
    expect(existsSync(redemption)).toBe(true);
    expect(existsSync(stamp)).toBe(true);
    expect(statSync(redemption).size).toBeLessThan(50_000);
    expect(statSync(stamp).size).toBeLessThan(10_000);
    expect(feedbackSource).not.toMatch(/https?:\/\//);
  });

  test('audio config disables recording and background audio permissions', () => {
    expect(appConfigSource).toContain('microphonePermission: false');
    expect(appConfigSource).toContain('recordAudioAndroid: false');
    expect(appConfigSource).toContain('enableBackgroundRecording: false');
    expect(feedbackSource).toContain('allowsRecording: false');
    expect(feedbackSource).toContain('shouldPlayInBackground: false');
  });

  test('feedback failures are swallowed and never affect transaction semantics', () => {
    expect(feedbackSource).toContain('Promise.allSettled');
    expect(feedbackSource).toContain('progressive enhancement');
    expect(scannerSource).toContain(
      'playPunchSuccessFeedback(String(result.eventId));'
    );
  });

  test('the same stamp success key is not played twice', () => {
    const gate = { seen: new Set(), lastAt: 0 };

    expect(consumePunchFeedback(gate, 'event-1', 1_000)).toBe(true);
    expect(consumePunchFeedback(gate, 'event-1', 2_000)).toBe(false);
    expect(consumePunchFeedback(gate, 'event-2', 2_000)).toBe(true);
  });

  test('a failed rewind still attempts play and never rejects', async () => {
    const calls = [];
    const player = {
      isLoaded: true,
      seekTo: async () => {
        calls.push('seek');
        throw new Error('seek failed');
      },
      play: () => {
        calls.push('play');
      },
    };
    const failures = [];

    await expect(
      replayFeedbackClip(player, {
        onFailure: (stage) => {
          failures.push(stage);
        },
      })
    ).resolves.toBeUndefined();
    expect(calls).toEqual(['seek', 'play']);
    expect(failures).toEqual(['seek']);
  });

  test('a play failure is contained and a loaded clip still rewinds first', async () => {
    const calls = [];
    const player = {
      isLoaded: false,
      currentStatus: { playbackState: 'ended', isLoaded: true },
      addListener: () => {
        throw new Error('should not wait once the clip has ended');
      },
      seekTo: async () => {
        calls.push('seek');
      },
      play: () => {
        calls.push('play');
        throw new Error('play failed');
      },
    };
    const failures = [];

    await expect(
      replayFeedbackClip(player, {
        readyTimeoutMs: 5_000,
        onFailure: (stage) => {
          failures.push(stage);
        },
      })
    ).resolves.toBeUndefined();
    expect(calls).toEqual(['seek', 'play']);
    expect(failures).toEqual(['play']);
  });

  test('an unloaded player waits for the installed status event before rewind', async () => {
    const calls = [];
    let listener;
    const player = {
      isLoaded: false,
      currentStatus: { isLoaded: false, playbackState: 'buffering' },
      addListener: (_eventName, nextListener) => {
        listener = nextListener;
        return { remove() {} };
      },
      seekTo: async () => {
        calls.push('seek');
      },
      play: () => {
        calls.push('play');
      },
    };

    const playback = replayFeedbackClip(player, { readyTimeoutMs: 5_000 });
    expect(calls).toEqual([]);
    listener({ isLoaded: true, playbackState: 'ready' });
    await playback;
    expect(calls).toEqual(['seek', 'play']);
  });

  test('stamp confirmation ducks Android audio and stays quieter for redemption', () => {
    expect(resolveUiInterruptionMode('android')).toBe('duckOthers');
    expect(resolveUiInterruptionMode('ios')).toBe('mixWithOthers');
    expect(PUNCH_FEEDBACK_VOLUME).toBeGreaterThan(0.34);
    expect(PUNCH_FEEDBACK_VOLUME).toBeLessThanOrEqual(1);
    expect(REDEMPTION_FEEDBACK_VOLUME).toBe(0.46);
    expect(feedbackSource).toContain('PUNCH_FEEDBACK_VOLUME');
    expect(feedbackSource).toContain('REDEMPTION_FEEDBACK_VOLUME');
    expect(feedbackSource).toContain('playsInSilentMode: false');
  });
});
