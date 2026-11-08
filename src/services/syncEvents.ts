// Dependency-free sync signal bus.
//
// The DB layer calls `requestSyncPush()` right after any local mutation, and the
// mounted <AutoSync /> component subscribes to it to run a debounced background
// push. Keeping this module import-free lets `db/repository.ts` emit the signal
// without importing the sync service (which imports the repository back) and
// creating an import cycle.

type SyncPushListener = () => void;

const listeners = new Set<SyncPushListener>();

/** Registers a push listener; returns an unsubscribe function. */
export function subscribeSyncPush(listener: SyncPushListener): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

/**
 * Signals that local data changed and a background push should be scheduled.
 * Safe to call when nothing is subscribed (e.g. from the headless verify build):
 * it then does nothing.
 */
export function requestSyncPush(): void {
  for (const listener of listeners) {
    listener();
  }
}
