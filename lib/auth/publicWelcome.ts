/** Only this public path can paint before the authenticated session resolves. */
export function canPaintPublicWelcome(platform: string, pathname: string) {
  return platform === 'web' && pathname === '/welcome';
}
