/** Only a source-less Chromium diagnostic backed by a failed actual PushManager attempt. */
export function isUnavailableBrowserPushDiagnostic(entry, pushUnavailable) {
  return (
    pushUnavailable === true &&
    entry.sourceKind === 'BROWSER' &&
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
