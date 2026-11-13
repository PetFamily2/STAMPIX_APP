/** Process memory only: no payload, identity or replayable command is retained. */
let count = 0;
const listeners = new Set<() => void>();
const notify = () => {
  for (const listener of listeners) listener();
};
export const pendingWriteCount = () => count;
export function subscribePendingWrites(listener: () => void) {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}
export function beginPendingWrite() {
  count++;
  notify();
  let ended = false;
  return () => {
    if (!ended) {
      ended = true;
      count--;
      notify();
    }
  };
}
