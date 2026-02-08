/**
 * Stores and retrieves pending join parameters across the auth flow.
 *
 * When a user opens a deep link like https://stampix.app/join?biz=X&src=Y&camp=Z
 * but is not yet authenticated, we stash the params in AsyncStorage.
 * After sign-in, the app checks for pending params and completes the join.
 */
import AsyncStorage from '@react-native-async-storage/async-storage';

const STORAGE_KEY = 'pending_join_params';

export type PendingJoinParams = {
  biz: string;
  src?: string;
  camp?: string;
  savedAt: number;
};

/** Max age for pending params: 1 hour */
const MAX_AGE_MS = 60 * 60 * 1000;

/**
 * Save join params for later (e.g. before auth redirect).
 */
export async function savePendingJoin(params: Omit<PendingJoinParams, 'savedAt'>): Promise<void> {
  if (!params.biz) return;
  const data: PendingJoinParams = { ...params, savedAt: Date.now() };
  await AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(data));
}

/**
 * Load and consume pending join params. Returns null if none or expired.
 */
export async function consumePendingJoin(): Promise<PendingJoinParams | null> {
  try {
    const raw = await AsyncStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    await AsyncStorage.removeItem(STORAGE_KEY);

    const data = JSON.parse(raw) as PendingJoinParams;
    if (!data.biz) return null;
    if (Date.now() - data.savedAt > MAX_AGE_MS) return null;

    return data;
  } catch {
    return null;
  }
}

/**
 * Clear any pending join params (e.g. on successful join).
 */
export async function clearPendingJoin(): Promise<void> {
  await AsyncStorage.removeItem(STORAGE_KEY);
}
