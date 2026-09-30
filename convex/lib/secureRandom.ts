const DIGIT_ALPHABET = '0123456789';
const BASE36_ALPHABET = '0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZ';
const DIGIT_ACCEPT_LIMIT = 250;
const BASE36_ACCEPT_LIMIT = 252;
const MAX_FILL_ATTEMPTS = 32;

export type RandomByteFill = (bytes: Uint8Array) => Uint8Array;

function fillSecureRandom(bytes: Uint8Array): Uint8Array {
  const webCrypto = globalThis.crypto;
  if (!webCrypto?.getRandomValues) {
    throw new Error('SECURE_RANDOM_UNAVAILABLE');
  }
  webCrypto.getRandomValues(bytes);
  return bytes;
}

function collectUnbiasedCharacters(
  length: number,
  alphabet: string,
  acceptLimit: number,
  fillRandom: RandomByteFill
) {
  let result = '';
  for (
    let attempt = 0;
    attempt < MAX_FILL_ATTEMPTS && result.length < length;
    attempt += 1
  ) {
    const bytes = fillRandom(new Uint8Array(length - result.length));
    for (const byte of bytes) {
      if (byte >= acceptLimit) {
        continue;
      }
      result += alphabet[byte % alphabet.length];
      if (result.length === length) {
        break;
      }
    }
  }

  if (result.length !== length) {
    throw new Error('SECURE_RANDOM_EXHAUSTED');
  }

  return result;
}

export function generateNumericCode(
  length: number,
  fillRandom: RandomByteFill = fillSecureRandom
) {
  if (!Number.isInteger(length) || length <= 0) {
    throw new Error('INVALID_CODE_LENGTH');
  }
  return collectUnbiasedCharacters(
    length,
    DIGIT_ALPHABET,
    DIGIT_ACCEPT_LIMIT,
    fillRandom
  );
}

export function generateReferralCode(
  prefix: 'ref' | 'bref',
  now = Date.now(),
  fillRandom: RandomByteFill = fillSecureRandom
) {
  const randomPart = collectUnbiasedCharacters(
    6,
    BASE36_ALPHABET,
    BASE36_ACCEPT_LIMIT,
    fillRandom
  );
  const timePart = now.toString(36).slice(-4).toUpperCase();
  return `${prefix}_${randomPart}${timePart}`.toUpperCase();
}
