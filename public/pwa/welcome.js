/* Public document has no commands. Inspect only recovery metadata before its own update consent. */
function publicEntryUpdateSafe() {
  try {
    for (let index = 0; index < sessionStorage.length; index++) {
      const key = sessionStorage.key(index);
      if (!key?.startsWith('stampaix:web-scanner-recovery:')) continue;
      const record = JSON.parse(sessionStorage.getItem(key) ?? '{}');
      if (record.uncertain !== false) return false;
    }
    return true;
  } catch {
    return false;
  }
}
if (
  isSecureContext &&
  location.protocol === 'https:' &&
  'serviceWorker' in navigator
) {
  const answerUpdate = (nonce) => {
    navigator.serviceWorker.getRegistration().then((registration) => {
      const worker = registration?.waiting ?? registration?.active;
      worker?.postMessage({
        type: 'UPDATE_SAFETY',
        nonce,
        safe: publicEntryUpdateSafe(),
      });
    });
  };
  if (typeof BroadcastChannel === 'function') {
    const updateChannel = new BroadcastChannel('stampaix-pwa-update');
    updateChannel.addEventListener('message', (event) => {
      if (event.data?.type === 'CHECK_UPDATE_SAFE') {
        answerUpdate(event.data.nonce);
      }
    });
  }
  navigator.serviceWorker.addEventListener('message', (event) => {
    if (event.data?.type !== 'CHECK_UPDATE_SAFE' || !event.source?.scriptURL)
      return;
    const source = new URL(event.source.scriptURL);
    if (
      source.origin !== location.origin ||
      source.pathname !== '/service-worker.js'
    )
      return;
    event.source.postMessage({
      type: 'UPDATE_SAFETY',
      nonce: event.data.nonce,
      safe: publicEntryUpdateSafe(),
    });
  });
  void navigator.serviceWorker
    .register('/service-worker.js', {
      scope: '/',
      updateViaCache: 'none',
    })
    .catch(() => {
      /* App entry exposes registration errors; navigation remains available here. */
    });
}
