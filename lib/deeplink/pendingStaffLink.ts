const KEY = 'stampaix:pending-staff-link';
const TTL = 24 * 60 * 60 * 1000;

export function isStaffLinkCode(value: unknown): value is string {
  return typeof value === 'string' && /^wa_[A-Za-z0-9_-]{32}$/.test(value);
}

export function staffLinkHref(code: string) {
  return `/(authenticated)/accept-invite?inviteCode=${encodeURIComponent(code)}`;
}

export function rememberPendingStaffLink(code: string) {
  if (!isStaffLinkCode(code)) return;
  try {
    sessionStorage.setItem(KEY, JSON.stringify({ code, savedAt: Date.now() }));
  } catch {
    // The original link can still be opened after sign-in.
  }
}

export function getPendingStaffLink(): string | null {
  try {
    const raw = sessionStorage.getItem(KEY);
    if (!raw) return null;
    const value = JSON.parse(raw);
    if (isStaffLinkCode(value.code) && Number.isFinite(value.savedAt) &&
        Date.now() >= value.savedAt && Date.now() - value.savedAt < TTL) return value.code;
    clearPendingStaffLink();
  } catch {
    return null;
  }
  return null;
}

export function clearPendingStaffLink() {
  try {
    sessionStorage.removeItem(KEY);
  } catch {
    // Storage may be disabled.
  }
}
