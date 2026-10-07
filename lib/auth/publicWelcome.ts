/** Public marketing content may paint while auth hydrates; protected routes never use this exception. */
export function canPaintPublicWelcome(platform: string, segments: string[]) {
  return platform === 'web' && segments.length === 2 && segments[0] === '(auth)' && segments[1] === 'welcome';
}
