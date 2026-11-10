import type { RedemptionShareError } from './redemptionShare';

type Result =
  | { status: 'shared' | 'downloaded' | 'ignored' }
  | { status: 'error'; error: RedemptionShareError };

/** Explicit gesture only. The PNG never enters a network URL, server, cache or storage. */
export async function shareRedemptionImage(input: {
  valid: () => boolean;
  authorize: () => Promise<boolean>;
  capture: () => Promise<string>;
  canShare: (file: File) => boolean;
  share: (file: File) => Promise<void>;
  download: (file: File) => void;
}): Promise<Result> {
  if (!input.valid()) return { status: 'ignored' };
  try {
    if (!(await input.authorize()) || !input.valid())
      return { status: 'ignored' };
  } catch {
    return { status: 'ignored' };
  }
  let file: File;
  try {
    const data = await input.capture();
    if (!input.valid()) return { status: 'ignored' };
    if (!data.startsWith('data:image/png;base64,') || data.length > 12_000_000)
      throw new Error('INVALID_IMAGE');
    const bytes = Uint8Array.from(atob(data.slice(22)), (c) => c.charCodeAt(0));
    if (![137, 80, 78, 71, 13, 10, 26, 10].every((v, i) => bytes[i] === v))
      throw new Error('INVALID_PNG');
    file = new File([bytes], 'stampaix-reward.png', { type: 'image/png' });
  } catch {
    return { status: 'error', error: 'capture-failed' };
  }
  if (!input.valid()) return { status: 'ignored' };
  try {
    if (input.canShare(file)) {
      await input.share(file);
      return { status: 'shared' };
    }
    input.download(file);
    return { status: 'downloaded' };
  } catch (error) {
    if (error instanceof DOMException && error.name === 'AbortError')
      return { status: 'ignored' };
    return { status: 'error', error: 'native-share-failed' };
  }
}
