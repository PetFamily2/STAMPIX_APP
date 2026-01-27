const SCAN_TOKEN_PREFIX = 'scanToken:';
const SCAN_TOKEN_VALID_MS = 2 * 60 * 1000; // Tokens expire after two minutes.

function getScanTokenSecret() {
  const secret = process.env.SCAN_TOKEN_SECRET;
  if (!secret) {
    throw new Error('SCAN_TOKEN_SECRET_MISSING');
  }
  return secret;
}

export type ScanTokenPayload = {
  customerId: string;
  timestamp: number;
  signature: string;
};

const encoder = new TextEncoder();
const decoder = new TextDecoder();

function base64UrlEncode(bytes: Uint8Array) {
  let bin = '';
  for (const b of bytes) bin += String.fromCharCode(b);
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

async function buildSignature(customerId: string, timestamp: number) {
  const secret = getScanTokenSecret();
  const payload = `${customerId}:${timestamp}`;
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
    encoder.encode(payload)
  );
  return base64UrlEncode(new Uint8Array(signature));
}

function formatPayload(payload: ScanTokenPayload) {
  const body = JSON.stringify(payload);
  const encoded = base64UrlEncode(encoder.encode(body));
  return `${SCAN_TOKEN_PREFIX}${encoded}`;
}

export async function buildScanToken(
  customerId: string,
  timestamp = Date.now()
) {
  const normalizedTimestamp = Math.floor(timestamp);
  const signature = await buildSignature(customerId, normalizedTimestamp);
  const payload: ScanTokenPayload = {
    customerId,
    timestamp: normalizedTimestamp,
    signature,
  };
  return {
    scanToken: formatPayload(payload),
    payload,
  };
}

export function parseScanToken(qrData: string): ScanTokenPayload {
  if (!qrData.startsWith(SCAN_TOKEN_PREFIX)) {
    throw new Error('INVALID_SCAN_TOKEN');
  }
  const encoded = qrData.slice(SCAN_TOKEN_PREFIX.length);
  let decoded: string;
  try {
    decoded = decoder.decode(base64UrlDecode(encoded));
  } catch (error) {
    throw new Error('INVALID_SCAN_TOKEN');
  }

  let obj: Record<string, unknown>;
  try {
    obj = JSON.parse(decoded) as Record<string, unknown>;
  } catch (error) {
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

export async function assertScanTokenSignature(payload: ScanTokenPayload) {
  const expected = await buildSignature(payload.customerId, payload.timestamp);
  if (expected !== payload.signature) {
    throw new Error('INVALID_SCAN_TOKEN');
  }
}

export function isScanTokenExpired(timestamp: number, now = Date.now()) {
  if (!Number.isFinite(timestamp)) {
    return true;
  }
  if (timestamp > now + 1000) {
    return true;
  }
  return now - timestamp > SCAN_TOKEN_VALID_MS;
}
