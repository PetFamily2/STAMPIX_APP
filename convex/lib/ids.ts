/**
 * Lightweight ID generators for Convex server-side use.
 * No external dependencies -- uses Web Crypto API available in Convex runtime.
 */

const DEFAULT_ALPHABET =
  'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_';

// Uppercase alphanumeric without ambiguous chars (no I/O/1/0)
const JOIN_CODE_ALPHABET = '23456789ABCDEFGHJKLMNPQRSTUVWXYZ';

/**
 * Generate a random string of `size` characters from the given `alphabet`.
 */
function generate(alphabet: string, size: number): string {
  const bytes = new Uint8Array(size);
  crypto.getRandomValues(bytes);
  let id = '';
  for (let i = 0; i < size; i++) {
    id += alphabet[bytes[i] % alphabet.length];
  }
  return id;
}

/**
 * Generate an opaque public ID (default 12 chars, ~72 bits entropy).
 * Used for `businessPublicId`.
 */
export function generatePublicId(size = 12): string {
  return generate(DEFAULT_ALPHABET, size);
}

/**
 * Generate a short join code (default 8 chars, uppercase, no ambiguous chars).
 * Used for manual entry fallback (`joinCode`).
 */
export function generateJoinCode(size = 8): string {
  return generate(JOIN_CODE_ALPHABET, size);
}
