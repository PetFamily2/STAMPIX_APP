export function normalizeEmailAddress(value: unknown): string | null {
  if (typeof value !== 'string') {
    return null;
  }

  const normalized = value.trim().toLowerCase();
  return normalized.length > 0 ? normalized : null;
}

export function normalizeEmailAddressOrThrow(value: string): string {
  const normalized = normalizeEmailAddress(value);
  if (!normalized) {
    throw new Error('EMAIL_REQUIRED');
  }
  return normalized;
}
