type InviteLink = { code: string; url: string };

/** Ignore late responses after switching business or leaving the page. */
export async function completeWebBusinessInvite(input: {
  isCurrent: () => boolean;
  mode: 'invite' | 'whatsapp';
  createLink: () => Promise<InviteLink>;
  creative: (code: string) => { shareText: string; url: string };
  openWhatsApp: (text: string) => Promise<unknown>;
  share: (text: string, url: string) => Promise<boolean>;
  copy: (url: string) => Promise<boolean>;
}) {
  if (!input.isCurrent()) return 'stale';
  const link = await input.createLink();
  if (!input.isCurrent()) return 'stale';
  const creative = input.creative(link.code);
  if (input.mode === 'whatsapp') {
    await input.openWhatsApp(creative.shareText);
    return input.isCurrent() ? 'shared' : 'stale';
  }
  const shared = await input.share(creative.shareText, creative.url);
  if (!input.isCurrent()) return 'stale';
  if (shared) return 'shared';
  const copied = await input.copy(link.url);
  if (!input.isCurrent()) return 'stale';
  return copied ? 'copied' : 'shown';
}
