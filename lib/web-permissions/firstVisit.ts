import { WEB_LEGAL_VERSION as CANONICAL_PRIVACY_VERSION } from '../legalWebContract';

// Local presentation preferences only; NOT server legal consent or marketing opt-in.
export const PRIVACY_NOTICE_KEY = 'stampaix:privacy-notice-version';
export const setupNoticeKey = (actorId: string, role = 'customer') =>
  `stampaix:permission-intro:v2:${actorId}:${role}`;
export type FirstVisitStep = 'privacy' | 'install' | 'notifications' | null;
export function firstVisitStep(input: {
  privacyVersion: string | null;
  setupDone: boolean;
  signedIn: boolean;
  installed: boolean;
}): FirstVisitStep {
  if (input.privacyVersion !== CANONICAL_PRIVACY_VERSION) {
    return 'privacy';
  }
  if (!input.signedIn || input.setupDone) {
    return null;
  }
  return input.installed ? 'notifications' : 'install';
}
