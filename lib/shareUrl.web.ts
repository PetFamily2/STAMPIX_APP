export function previewInviteUrl(
  url: string,
  environment?: string,
  origin?: string
) {
  if (
    environment !== 'preview' ||
    !origin ||
    !/^https:\/\/stampaix-business--[a-z0-9]+\.expo\.app$/.test(origin)
  )
    return url;
  try {
    const parsed = new URL(url);
    if (
      parsed.origin !== 'https://stampaix.com' ||
      parsed.pathname !== '/join' ||
      parsed.hash
    )
      return url;
    parsed.protocol = 'https:';
    parsed.host = new URL(origin).host;
    return parsed.toString();
  } catch {
    return url;
  }
}
export const shareUrl = (url: string) =>
  previewInviteUrl(
    url,
    process.env.EXPO_PUBLIC_APP_ENV,
    typeof window === 'undefined' ? undefined : window.location.origin
  );
