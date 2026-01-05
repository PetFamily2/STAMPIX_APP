import { hmac } from '@noble/hashes/hmac.js';
import { sha256 } from '@noble/hashes/sha2.js';

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

function toHex(bytes: Uint8Array) {
  return Array.from(bytes)
    .map((byte) => byte.toString(16).padStart(2, '0'))
    .join('');
}

function buildSignature(customerId: string, timestamp: number) {
  const secret = getScanTokenSecret();
  const payload = `${customerId}:${timestamp}`;
  const signature = hmac(sha256, encoder.encode(secret), encoder.encode(payload));
  return toHex(signature);
}

function formatPayload(payload: ScanTokenPayload) {
  const body = JSON.stringify(payload);
  const encoded = Buffer.from(body).toString('base64');
  return `${SCAN_TOKEN_PREFIX}${encoded}`;
}

export function buildScanToken(customerId: string, timestamp = Date.now()) {
  const normalizedTimestamp = Math.floor(timestamp);
  const payload: ScanTokenPayload = {
    customerId,
    timestamp: normalizedTimestamp,
    signature: buildSignature(customerId, normalizedTimestamp),
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
    decoded = Buffer.from(encoded, 'base64').toString('utf8');
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

    if (typeof customerId !== 'string' || typeof timestamp !== 'number' || typeof signature !== 'string') {
      throw new Error('INVALID_SCAN_TOKEN');
    }

    return { customerId, timestamp, signature };
  }

export function assertScanTokenSignature(payload: ScanTokenPayload) {
  const expected = buildSignature(payload.customerId, payload.timestamp);
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

