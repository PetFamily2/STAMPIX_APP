import { useSyncExternalStore } from 'react';
import { isAppleMobile } from './browserPermissions';

type InstallEvent = Event & {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>;
};
const serverSnapshot = {
  installed: false,
  appleMobile: false,
  available: false,
};
let snapshot = serverSnapshot;
let pending: InstallEvent | null = null;
let prompting = false;
const listeners = new Set<() => void>();
function publish() {
  snapshot = {
    installed:
      window.matchMedia('(display-mode: standalone)').matches ||
      (navigator as Navigator & { standalone?: boolean }).standalone === true,
    appleMobile: isAppleMobile(navigator.userAgent, navigator.maxTouchPoints),
    available: pending !== null,
  };
  for (const notify of listeners) {
    notify();
  }
}
function offered(event: Event) {
  event.preventDefault();
  pending = event as InstallEvent;
  publish();
}
function installed() {
  pending = null;
  publish();
}
function subscribe(notify: () => void) {
  listeners.add(notify);
  if (listeners.size === 1) {
    window.addEventListener('beforeinstallprompt', offered);
    window.addEventListener('appinstalled', installed);
    window.addEventListener('focus', publish);
    publish();
  }
  return () => {
    listeners.delete(notify);
    if (!listeners.size) {
      window.removeEventListener('beforeinstallprompt', offered);
      window.removeEventListener('appinstalled', installed);
      window.removeEventListener('focus', publish);
    }
  };
}
export function useWebInstall() {
  return useSyncExternalStore(
    subscribe,
    () => snapshot,
    () => serverSnapshot
  );
}
/** Never prompt on mount or retry a browser event that has already been consumed. */
export async function requestWebInstall() {
  if (!pending || prompting) {
    return 'unavailable';
  }
  const event = pending;
  pending = null;
  prompting = true;
  publish();
  try {
    await event.prompt();
    return (await event.userChoice).outcome;
  } finally {
    prompting = false;
    publish();
  }
}
