import AsyncStorage from '@react-native-async-storage/async-storage';

const STORAGE_KEY = 'onboarding_session_id';
let cachedSessionId: string | null | undefined;

function generateUuid(): string {
  if (globalThis.crypto?.randomUUID) {
    return globalThis.crypto.randomUUID();
  }

  const bytes = new Uint8Array(16);
  if (globalThis.crypto?.getRandomValues) {
    globalThis.crypto.getRandomValues(bytes);
  } else {
    for (let i = 0; i < bytes.length; i += 1) {
      bytes[i] = Math.floor(Math.random() * 256);
    }
  }

  bytes[6] = (bytes[6] & 0x0f) | 0x40;
  bytes[8] = (bytes[8] & 0x3f) | 0x80;

  const toHex = (value: number) => value.toString(16).padStart(2, '0');
  const hex = Array.from(bytes, toHex).join('');
  return [
    hex.slice(0, 8),
    hex.slice(8, 12),
    hex.slice(12, 16),
    hex.slice(16, 20),
    hex.slice(20),
  ].join('-');
}

async function readSessionId(): Promise<string | null> {
  if (cachedSessionId !== undefined) {
    return cachedSessionId;
  }

  const stored = await AsyncStorage.getItem(STORAGE_KEY);
  cachedSessionId = stored;
  return stored;
}

export async function getOnboardingSessionId(): Promise<string | null> {
  return readSessionId();
}

export async function getOrCreateOnboardingSessionId(): Promise<string> {
  const existing = await readSessionId();
  if (existing) {
    return existing;
  }

  const newId = generateUuid();
  await AsyncStorage.setItem(STORAGE_KEY, newId);
  cachedSessionId = newId;
  return newId;
}

export async function clearOnboardingSessionId(): Promise<void> {
  await AsyncStorage.removeItem(STORAGE_KEY);
  cachedSessionId = null;
}
