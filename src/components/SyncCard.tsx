import { useCallback, useState } from 'react';
import { ActivityIndicator, StyleSheet, Text, TextInput, View } from 'react-native';
import { useFocusEffect } from 'expo-router';
import { Button } from './Button';
import { Card } from './Card';
import { JsonPreviewModal } from './JsonPreviewModal';
import { getDatabase } from '../db/client';
import {
  DEFAULT_SYNC_SERVER_URL,
  countDirtySessions,
  getSyncServerUrl,
  setSyncServerUrl,
} from '../db/repository';
import {
  buildClientSyncPushPayload,
  syncPendingWorkouts,
} from '../services/syncService';
import hu from '../i18n/hu';
import { colors, radius, spacing, typography } from '../theme/tokens';
import type { ClientSyncPushPayload } from '../types/workout';

/**
 * Settings card for the Profil tab. Shows how many sessions are still
 * `local_dirty`, lets the user edit the coach backend URL, and exposes the single
 * manual "Force Sync" fallback (a full Push + Pull) plus the outgoing-JSON preview
 * for troubleshooting. Routine sync happens automatically in the background, so
 * this card is the only place a manual sync lives.
 */
export function SyncCard() {
  const [dirtyCount, setDirtyCount] = useState<number | null>(null);
  const [serverUrl, setServerUrlInput] = useState('');
  const [syncing, setSyncing] = useState(false);
  const [savingUrl, setSavingUrl] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [preview, setPreview] = useState<ClientSyncPushPayload | null>(null);
  const [previewVisible, setPreviewVisible] = useState(false);

  useFocusEffect(
    useCallback(() => {
      let cancelled = false;
      getDatabase()
        .then(async (db) => {
          const [count, url] = await Promise.all([
            countDirtySessions(db),
            getSyncServerUrl(db),
          ]);
          if (!cancelled) {
            setDirtyCount(count);
            setServerUrlInput(url);
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

  const handleSaveUrl = async (): Promise<void> => {
    setSavingUrl(true);
    setMessage(null);
    try {
      const db = await getDatabase();
      await setSyncServerUrl(db, serverUrl);
      const stored = await getSyncServerUrl(db);
      setServerUrlInput(stored);
      setMessage(hu.sync.serverUrlSaved);
    } catch (cause: unknown) {
      setMessage(cause instanceof Error ? cause.message : String(cause));
    } finally {
      setSavingUrl(false);
    }
  };

  const handleSync = async (): Promise<void> => {
    setSyncing(true);
    setMessage(null);
    try {
      const db = await getDatabase();
      const result = await syncPendingWorkouts(db, serverUrl);
      if (result.mode === 'noop') {
        setMessage(hu.sync.noop);
      } else if (result.mode === 'remote') {
        const parts = [`${result.sessionCount} ${hu.sync.sessionsInBatch}`];
        if (result.bookingCount > 0) {
          parts.push(`${result.bookingCount} ${hu.sync.bookingsInBatch}`);
        }
        const pulled =
          result.appliedTemplateCount > 0 || result.appliedBookingCount > 0
            ? ` ${hu.sync.pullApplied}`
            : '';
        setMessage(`${hu.sync.remoteFull} (${parts.join(', ')}).${pulled}`);
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
    setPreview(await buildClientSyncPushPayload(db));
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

      <Text style={styles.hint}>{hu.sync.serverUrlLabel}</Text>
      <TextInput
        value={serverUrl}
        onChangeText={setServerUrlInput}
        placeholder={hu.sync.serverUrlPlaceholder}
        placeholderTextColor={colors.textMuted}
        selectionColor={colors.accent}
        autoCorrect={false}
        autoCapitalize="none"
        keyboardType="url"
        style={styles.input}
      />
      <Text style={styles.caption}>{hu.sync.serverUrlHint}</Text>
      <View style={styles.buttonRow}>
        <View style={styles.flex}>
          <Button
            label={hu.common.save}
            variant="secondary"
            onPress={() => {
              void handleSaveUrl();
            }}
            loading={savingUrl}
          />
        </View>
        <View style={styles.flex}>
          <Button
            label={hu.sync.serverUrlDefault}
            variant="ghost"
            onPress={() => {
              setServerUrlInput(DEFAULT_SYNC_SERVER_URL);
            }}
          />
        </View>
      </View>

      {message !== null ? <Text style={styles.message}>{message}</Text> : null}

      <Text style={styles.caption}>{hu.sync.forceSyncHint}</Text>
      <Button
        label={syncing ? hu.sync.syncing : hu.sync.forceSync}
        variant="secondary"
        onPress={() => {
          void handleSync();
        }}
        loading={syncing}
      />
      <Button
        label={hu.sync.preview}
        variant="ghost"
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
  hint: {
    color: colors.textSecondary,
    fontSize: typography.sizes.xs,
    fontWeight: typography.weights.medium,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  input: {
    color: colors.textPrimary,
    fontSize: typography.sizes.sm,
    backgroundColor: colors.surfaceInput,
    borderColor: colors.border,
    borderWidth: 1,
    borderRadius: radius.md,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
  },
  caption: {
    color: colors.textMuted,
    fontSize: typography.sizes.xs,
    lineHeight: typography.sizes.xs * typography.lineHeights.relaxed,
  },
  buttonRow: {
    flexDirection: 'row',
    gap: spacing.sm,
  },
  flex: {
    flex: 1,
  },
  message: {
    color: colors.textSecondary,
    fontSize: typography.sizes.sm,
    lineHeight: typography.sizes.sm * typography.lineHeights.relaxed,
  },
});
