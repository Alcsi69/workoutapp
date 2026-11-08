import { useEffect } from 'react';
import { AppState } from 'react-native';
import { runAutoPull, scheduleAutoPush } from '../services/autoSync';
import { subscribeSyncPush } from '../services/syncEvents';

/**
 * Headless auto-sync coordinator, mounted once by the root layout. Renders
 * nothing: it pulls the coach's state on mount and on every return to the
 * foreground, and runs a debounced background push after any local mutation.
 */
export function AutoSync() {
  useEffect(() => {
    void runAutoPull();

    const appStateSub = AppState.addEventListener('change', (nextState) => {
      if (nextState === 'active') {
        void runAutoPull();
      }
    });
    const unsubscribePush = subscribeSyncPush(scheduleAutoPush);

    return () => {
      appStateSub.remove();
      unsubscribePush();
    };
  }, []);

  return null;
}
