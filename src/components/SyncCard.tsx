import { useCallback, useState } from 'react';
import { ActivityIndicator, StyleSheet, Text, View } from 'react-native';
import { useFocusEffect } from 'expo-router';
import { Button } from './Button';
import { Card } from './Card';
import { JsonPreviewModal } from './JsonPreviewModal';
import { getDatabase } from '../db/client';
import { countDirtySessions } from '../db/repository';
import { buildSyncBatchPayload, syncPendingWorkouts } from '../services/syncService';
import hu from '../i18n/hu';
import { colors, spacing, typography } from '../theme/tokens';
import type { SyncBatchPayload } from '../types/workout';

/**
 * Szinkronizálás card: shows how many sessions are still `local_dirty`, lets the
 * user flush them (dry-run export when no backend is configured), and previews
 * the exact outgoing JSON batch on device.
 */
export function SyncCard() {
  const [dirtyCount, setDirtyCount] = useState<number | null>(null);
  const [syncing, setSyncing] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [preview, setPreview] = useState<SyncBatchPayload | null>(null);
  const [previewVisible, setPreviewVisible] = useState(false);

  useFocusEffect(
    useCallback(() => {
      let cancelled = false;
      getDatabase()
        .then((db) => countDirtySessions(db))
        .then((count) => {
          if (!cancelled) {
            setDirtyCount(count);
          }
        })
        .catch(() => {
          if (!cancelled) {
            setDirtyCount(null);
          }
        });
      return () => {
        cancelled = true;
      };
    }, []),
  );

  const refreshCount = useCallback(async (): Promise<void> => {
    const db = await getDatabase();
    setDirtyCount(await countDirtySessions(db));
  }, []);

  const handleSync = async (): Promise<void> => {
    setSyncing(true);
    setMessage(null);
    try {
      const db = await getDatabase();
      const result = await syncPendingWorkouts(db);
      if (result.mode === 'noop') {
        setMessage(hu.sync.noop);
      } else if (result.mode === 'remote') {
        setMessage(`${hu.sync.remote} (${result.sessionCount})`);
      } else {
        const suffix = result.error !== undefined ? ` ${result.error}` : '';
        setMessage(
          `${hu.sync.dryRun} ${result.sessionCount} ${hu.sync.sessionsInBatch}.${suffix}`,
        );
      }
      setDirtyCount(await countDirtySessions(db));
    } catch (cause: unknown) {
      setMessage(cause instanceof Error ? cause.message : String(cause));
    } finally {
      setSyncing(false);
    }
  };

  const handlePreview = async (): Promise<void> => {
    const db = await getDatabase();
    setPreview(await buildSyncBatchPayload(db));
    setPreviewVisible(true);
  };

  const dirtyLabel =
    dirtyCount === null
      ? hu.common.loading
      : dirtyCount === 0
        ? hu.sync.allSynced
        : `${dirtyCount} ${hu.sync.pending}`;

  return (
    <Card title={hu.sync.title}>
      <View style={styles.statusRow}>
        {dirtyCount === null ? (
          <ActivityIndicator color={colors.accent} />
        ) : (
          <Text
            style={[styles.count, dirtyCount > 0 ? styles.countDirty : styles.countClean]}
          >
            {dirtyLabel}
          </Text>
        )}
      </View>

      {message !== null ? <Text style={styles.message}>{message}</Text> : null}

      <Button
        label={syncing ? hu.sync.syncing : hu.sync.syncNow}
        onPress={() => {
          void handleSync();
        }}
        loading={syncing}
      />
      <Button
        label={hu.sync.preview}
        variant="secondary"
        onPress={() => {
          void handlePreview();
        }}
      />

      <JsonPreviewModal
        visible={previewVisible}
        title={hu.sync.previewTitle}
        value={preview}
        onClose={() => setPreviewVisible(false)}
      />
    </Card>
  );
}

const styles = StyleSheet.create({
  statusRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
  },
  count: {
    fontSize: typography.sizes.md,
    fontWeight: typography.weights.semibold,
  },
  countDirty: {
    color: colors.warning,
  },
  countClean: {
    color: colors.success,
  },
  message: {
    color: colors.textSecondary,
    fontSize: typography.sizes.sm,
    lineHeight: typography.sizes.sm * typography.lineHeights.relaxed,
  },
});
