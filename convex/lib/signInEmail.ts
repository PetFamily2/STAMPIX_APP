/** Canonicalize before validation, so mail delivery and account identity agree. */
export function normalizeSignInEmail(identifier: unknown): string {
  if (typeof identifier !== 'string') {
    throw new Error('INVALID_EMAIL');
  }

  const trimmed = identifier.trim();
  const canonical = trimmed.normalize('NFKC');
  const normalized = canonical.toLowerCase();
  // SMTPUTF8, display names and recipient lists are deliberately unsupported.
  // Reject rather than letting the downstream delivery service reinterpret them.
  if (
    canonical !== trimmed ||
    normalized.length > 254 ||
    !/^[\x21-\x7e]+$/.test(normalized)
  ) {
    throw new Error('INVALID_EMAIL');
  }
  const parts = normalized.split('@');
  if (parts.length !== 2) {
    throw new Error('INVALID_EMAIL');
  }
  const [local, domain] = parts;
  if (
    local.length === 0 ||
    local.length > 64 ||
    !/^[a-z0-9.!#$%&'*+/=?^_`{|}~-]+$/.test(local) ||
    local.startsWith('.') ||
    local.endsWith('.') ||
    local.includes('..')
  ) {
    throw new Error('INVALID_EMAIL');
  }
  const labels = domain.split('.');
  if (
    labels.length < 2 ||
    labels.some(
      (label) =>
        label.length > 63 || !/^[a-z0-9](?:[a-z0-9-]*[a-z0-9])?$/.test(label)
    )
  ) {
    throw new Error('INVALID_EMAIL');
  }
  return normalized;
}
