/** Chromium may attribute an OS diagnostic to the document; never accept a JS call site. */
export function isUnavailableBrowserPushDiagnostic(entry, pushUnavailable) {
  return (
    pushUnavailable === true &&
    ['BROWSER', 'DOCUMENT'].includes(entry.sourceKind) &&
    entry.sourceLine === 0 &&
    entry.arguments?.length === 0 &&
    [
      'CONSOLE_ERROR',
      'Registration failed - push service error',
      'Registration failed - push service not available',
    ].includes(entry.kind) &&
    (entry.vocabulary?.includes('Push') || entry.vocabulary?.includes('push'))
  );
}

export function isBrowserBeforeUnloadIntervention(entry) {
  return (
    ['BROWSER', 'DOCUMENT'].includes(entry.sourceKind) &&
    entry.sourceLine === 0 &&
    entry.arguments?.length === 0 &&
    entry.kind === 'BROWSER_BEFOREUNLOAD_NO_GESTURE' &&
    entry.duringNavigation === true
  );
}
