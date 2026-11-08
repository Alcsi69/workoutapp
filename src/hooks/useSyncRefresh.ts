import { useCallback, useState } from 'react';
import { getDatabase } from '../db/client';
import { getSyncServerUrl } from '../db/repository';
import { syncPendingWorkouts } from '../services/syncService';

/**
 * Pull-to-refresh helper for the main list views. On refresh it runs a FULL sync
 * (Push then Pull, `syncPendingWorkouts`) against the configured backend, then
 * re-reads the screen's local data via `reload`, keeping the RefreshControl
 * spinner up for the whole round trip. Offline-safe: a failed/skipped sync still
 * reloads the local view, so the control never hangs.
 */
export function useSyncRefresh(reload: () => void | Promise<void>): {
  refreshing: boolean;
  refresh: () => void;
} {
  const [refreshing, setRefreshing] = useState(false);

  const refresh = useCallback((): void => {
    setRefreshing(true);
    void (async () => {
      try {
        const db = await getDatabase();
        const url = await getSyncServerUrl(db);
        await syncPendingWorkouts(db, url);
      } catch {
        // Offline or backend unreachable: fall through and re-read local data.
      } finally {
        try {
          await reload();
        } finally {
          setRefreshing(false);
        }
      }
    })();
  }, [reload]);

  return { refreshing, refresh };
}
