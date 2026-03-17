const SCAN_TOKEN_PREFIX = 'scanToken:';
const SCAN_TOKEN_VALID_MS = 2 * 60 * 1000; // Tokens expire after two minutes.
const SCAN_TOKEN_MAX_FUTURE_SKEW_MS = 1_000;

export type ScanTokenPayloadV1 = {
  customerId: string;
  timestamp: number;
  signature: string;
};

export type ScanTokenPayloadV2 = {
  v: 2;
  customerId: string;
  iat: number;
  exp: number;
  nonce: string;
  kid: string;
  sig: string;
};

export type ScanTokenPayload = ScanTokenPayloadV1 | ScanTokenPayloadV2;

export type ScanTokenIdentity = {
  customerId: string;
  signature: string;
  nonce: string | null;
  issuedAt: number;
  expiresAt: number;
  version: 1 | 2;
};

function isScanTokenPayloadV2(
  payload: ScanTokenPayload
): payload is ScanTokenPayloadV2 {
  return (payload as ScanTokenPayloadV2).v === 2;
}

function getScanTokenSecret() {
  const secret = process.env.SCAN_TOKEN_SECRET;
  if (!secret) {
    throw new Error('SCAN_TOKEN_SECRET_MISSING');
  }
  return secret;
}

function getScanTokenKid() {
  const kid = process.env.SCAN_TOKEN_KID?.trim();
  return kid && kid.length > 0 ? kid : 'v1';
}

const encoder = new TextEncoder();
const decoder = new TextDecoder();

function base64UrlEncode(bytes: Uint8Array) {
  let bin = '';
  for (const b of bytes) {
    bin += String.fromCharCode(b);
  }
  return btoa(bin).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

function base64UrlDecode(encoded: string) {
  const padded = encoded
    .replace(/-/g, '+')
    .replace(/_/g, '/')
    .padEnd(Math.ceil(encoded.length / 4) * 4, '=');
  const bin = atob(padded);
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i += 1) {
    bytes[i] = bin.charCodeAt(i);
  }
  return bytes;
}

function formatPayload(payload: ScanTokenPayload) {
  const body = JSON.stringify(payload);
  const encoded = base64UrlEncode(encoder.encode(body));
  return `${SCAN_TOKEN_PREFIX}${encoded}`;
}

function buildCanonicalSignaturePayload(payload: ScanTokenPayload) {
  if (isScanTokenPayloadV2(payload)) {
    return `v2|${payload.customerId}|${payload.iat}|${payload.exp}|${payload.nonce}|${payload.kid}`;
  }
  return `${payload.customerId}:${payload.timestamp}`;
}

async function buildSignature(payload: ScanTokenPayload) {
  const secret = getScanTokenSecret();
  const key = await crypto.subtle.importKey(
    'raw',
    encoder.encode(secret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign']
  );
  const signature = await crypto.subtle.sign(
    'HMAC',
    key,
    encoder.encode(buildCanonicalSignaturePayload(payload))
  );
  return base64UrlEncode(new Uint8Array(signature));
}

function buildNonce(bytesLength = 16) {
  const bytes = new Uint8Array(bytesLength);
  crypto.getRandomValues(bytes);
  return base64UrlEncode(bytes);
}

export async function buildScanToken(
  customerId: string,
  issuedAt = Date.now()
) {
  const normalizedIssuedAt = Math.floor(issuedAt);
  const payloadWithoutSig: Omit<ScanTokenPayloadV2, 'sig'> = {
    v: 2,
    customerId,
    iat: normalizedIssuedAt,
    exp: normalizedIssuedAt + SCAN_TOKEN_VALID_MS,
    nonce: buildNonce(),
    kid: getScanTokenKid(),
  };
  const sig = await buildSignature({
    ...payloadWithoutSig,
    sig: '',
  });
  const payload: ScanTokenPayloadV2 = {
    ...payloadWithoutSig,
    sig,
  };
  return {
    scanToken: formatPayload(payload),
    payload,
  };
}

function parseV1Token(obj: Record<string, unknown>): ScanTokenPayloadV1 {
  const keys = Object.keys(obj);
  if (
    keys.length !== 3 ||
    !keys.includes('customerId') ||
    !keys.includes('timestamp') ||
    !keys.includes('signature')
  ) {
    throw new Error('INVALID_SCAN_TOKEN');
  }

  const customerId = obj.customerId;
  const timestamp = obj.timestamp;
  const signature = obj.signature;
  if (
    typeof customerId !== 'string' ||
    typeof timestamp !== 'number' ||
    typeof signature !== 'string'
  ) {
    throw new Error('INVALID_SCAN_TOKEN');
  }
  return { customerId, timestamp, signature };
}

function parseV2Token(obj: Record<string, unknown>): ScanTokenPayloadV2 {
  const keys = Object.keys(obj);
  if (
    keys.length !== 7 ||
    !keys.includes('v') ||
    !keys.includes('customerId') ||
    !keys.includes('iat') ||
    !keys.includes('exp') ||
    !keys.includes('nonce') ||
    !keys.includes('kid') ||
    !keys.includes('sig')
  ) {
    throw new Error('INVALID_SCAN_TOKEN');
  }

  const v = obj.v;
  const customerId = obj.customerId;
  const iat = obj.iat;
  const exp = obj.exp;
  const nonce = obj.nonce;
  const kid = obj.kid;
  const sig = obj.sig;
  if (
    v !== 2 ||
    typeof customerId !== 'string' ||
    typeof iat !== 'number' ||
    typeof exp !== 'number' ||
    typeof nonce !== 'string' ||
    typeof kid !== 'string' ||
    typeof sig !== 'string'
  ) {
    throw new Error('INVALID_SCAN_TOKEN');
  }
  return { v: 2, customerId, iat, exp, nonce, kid, sig };
}

export function parseScanToken(qrData: string): ScanTokenPayload {
  if (!qrData.startsWith(SCAN_TOKEN_PREFIX)) {
    throw new Error('INVALID_SCAN_TOKEN');
  }
  const encoded = qrData.slice(SCAN_TOKEN_PREFIX.length);
  let decoded: string;
  try {
    decoded = decoder.decode(base64UrlDecode(encoded));
  } catch {
    throw new Error('INVALID_SCAN_TOKEN');
  }

  let obj: Record<string, unknown>;
  try {
    obj = JSON.parse(decoded) as Record<string, unknown>;
  } catch {
    throw new Error('INVALID_SCAN_TOKEN');
  }

  if (obj.v === 2) {
    return parseV2Token(obj);
  }
  return parseV1Token(obj);
}

export async function assertScanTokenSignature(payload: ScanTokenPayload) {
  if (isScanTokenPayloadV2(payload)) {
    const expected = await buildSignature({
      ...payload,
      sig: '',
    });
    if (expected !== payload.sig) {
      throw new Error('INVALID_SCAN_TOKEN');
    }
    return;
  }

  const expected = await buildSignature(payload);
  if (expected !== payload.signature) {
    throw new Error('INVALID_SCAN_TOKEN');
  }
}

export function getScanTokenIdentity(
  payload: ScanTokenPayload
): ScanTokenIdentity {
  if (isScanTokenPayloadV2(payload)) {
    return {
      customerId: payload.customerId,
      signature: payload.sig,
      nonce: payload.nonce,
      issuedAt: payload.iat,
      expiresAt: payload.exp,
      version: 2,
    };
  }

  return {
    customerId: payload.customerId,
    signature: payload.signature,
    nonce: null,
    issuedAt: payload.timestamp,
    expiresAt: payload.timestamp + SCAN_TOKEN_VALID_MS,
    version: 1,
  };
}

export function isScanTokenExpired(
  payload: ScanTokenPayload,
  now = Date.now()
) {
  const token = getScanTokenIdentity(payload);
  if (!Number.isFinite(token.issuedAt) || !Number.isFinite(token.expiresAt)) {
    return true;
  }
  if (token.issuedAt > now + SCAN_TOKEN_MAX_FUTURE_SKEW_MS) {
    return true;
  }
  return now > token.expiresAt;
}
