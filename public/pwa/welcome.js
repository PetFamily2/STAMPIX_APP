/* Public entry page only. Register; never activate an update or acknowledge another client's writes. */
if (
  isSecureContext &&
  location.protocol === 'https:' &&
  'serviceWorker' in navigator
) {
  void navigator.serviceWorker
    .register('/service-worker.js', {
      scope: '/',
      updateViaCache: 'none',
    })
    .catch(() => {
      /* App entry exposes registration errors; navigation remains available here. */
    });
}
