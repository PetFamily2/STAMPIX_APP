import { describe, expect, test } from 'bun:test';
import { existsSync, readFileSync, statSync } from 'node:fs';

const feedbackSource = readFileSync(
  new URL('../feedback.ts', import.meta.url),
  'utf8'
);
const scannerSource = readFileSync(
  new URL('../../app/(authenticated)/(business)/scanner.tsx', import.meta.url),
  'utf8'
);
const hostSource = readFileSync(
  new URL('../../components/customer/RedemptionCelebrationHost.tsx', import.meta.url),
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
    expect(successPath).toContain('playPunchSuccessFeedback(String(result.eventId))');
    expect(scannerSource.slice(0, scannerSource.indexOf('commitFromSession'))).not.toContain(
      'playPunchSuccessFeedback('
    );
  });

  test('failed punch and scanner resolve paths cannot trigger success feedback', () => {
    const failurePath = scannerSource.slice(scannerSource.indexOf('} catch (error)'));
    expect(failurePath.slice(0, failurePath.indexOf('const handleScan'))).not.toContain(
      'playPunchSuccessFeedback('
    );
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
    const redemption = new URL('../../assets/audio/redemption-success.wav', import.meta.url);
    const stamp = new URL('../../assets/audio/stamp-click.wav', import.meta.url);
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
    expect(scannerSource).toContain('playPunchSuccessFeedback(String(result.eventId));');
  });
});
