import { useCallback, useState } from 'react';
import { ActivityIndicator, FlatList, StyleSheet, Text, View } from 'react-native';
import { router, useFocusEffect } from 'expo-router';
import { Button } from '../../components/Button';
import { Pill } from '../../components/Badge';
import { Screen } from '../../components/Screen';
import { getDatabase } from '../../db/client';
import { getSessionHistory } from '../../db/repository';
import type { SessionHistorySummary } from '../../db/repository';
import { formatDateTimeHu, formatDurationHu } from '../../services/format';
import hu from '../../i18n/hu';
import { colors, radius, spacing, typography } from '../../theme/tokens';

function SessionRow({ session }: { session: SessionHistorySummary }) {
  return (
    <View style={styles.row}>
      <View style={styles.rowHeader}>
        <Text style={styles.title}>{session.title}</Text>
        <Pill
          label={hu.sessionTypes[session.sessionType]}
          tone={session.sessionType === 'running' ? 'accent' : 'success'}
        />
      </View>
      <Text style={styles.muted}>{hu.screens.history.completedLabel}: {formatDateTimeHu(session.completedAt)}</Text>
      <View style={styles.metaRow}>
        <Text style={styles.meta}>
          {session.exerciseCount} {hu.screens.history.exercisesLabel}
        </Text>
        {session.distanceKm !== undefined ? (
          <Text style={styles.meta}>
            {session.distanceKm} {hu.common.km}
          </Text>
        ) : null}
        {session.durationSeconds !== undefined ? (
          <Text style={styles.meta}>{formatDurationHu(session.durationSeconds)}</Text>
        ) : null}
        <Text style={styles.meta}>
          {session.syncStatus === 'synced' ? hu.status.synced : hu.status.localDirty}
        </Text>
      </View>
    </View>
  );
}

export default function HistoryScreen() {
  const [sessions, setSessions] = useState<SessionHistorySummary[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  useFocusEffect(
    useCallback(() => {
      let cancelled = false;
      getDatabase()
        .then((db) => getSessionHistory(db))
        .then((next) => {
          if (!cancelled) {
            setSessions(next);
            setError(null);
          }
        })
        .catch((cause: unknown) => {
          if (!cancelled) {
            setError(cause instanceof Error ? cause.message : String(cause));
          }
        });
      return () => {
        cancelled = true;
      };
    }, []),
  );

  if (sessions === null) {
    return (
      <Screen title={hu.tabs.history} subtitle={hu.screens.history.subtitle}>
        {error !== null ? (
          <Text style={styles.error}>{error}</Text>
        ) : (
          <ActivityIndicator color={colors.accent} style={styles.loader} />
        )}
      </Screen>
    );
  }

  if (sessions.length === 0) {
    return (
      <Screen title={hu.tabs.history} subtitle={hu.screens.history.subtitle}>
        <View style={styles.empty}>
          <Text style={styles.emptyTitle}>{hu.screens.history.emptyTitle}</Text>
          <Text style={styles.emptyHint}>{hu.screens.history.emptyHint}</Text>
          <Button
            label={hu.screens.history.emptyCta}
            onPress={() => router.push('/(tabs)')}
            style={styles.emptyButton}
          />
        </View>
      </Screen>
    );
  }

  return (
    <Screen title={hu.tabs.history} subtitle={hu.screens.history.subtitle} scroll={false}>
      <FlatList
        data={sessions}
        keyExtractor={(item) => item.id}
        renderItem={({ item }) => <SessionRow session={item} />}
        contentContainerStyle={styles.list}
        showsVerticalScrollIndicator={false}
      />
    </Screen>
  );
}

const styles = StyleSheet.create({
  loader: {
    marginTop: spacing.xl,
  },
  error: {
    color: colors.danger,
    fontSize: typography.sizes.sm,
  },
  list: {
    gap: spacing.md,
    paddingBottom: spacing.xxl,
  },
  row: {
    backgroundColor: colors.surface,
    borderColor: colors.border,
    borderWidth: 1,
    borderRadius: radius.lg,
    padding: spacing.lg,
    gap: spacing.xs,
  },
  rowHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: spacing.sm,
  },
  title: {
    flex: 1,
    color: colors.textPrimary,
    fontSize: typography.sizes.md,
    fontWeight: typography.weights.semibold,
  },
  muted: {
    color: colors.textMuted,
    fontSize: typography.sizes.xs,
  },
  metaRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.md,
    marginTop: spacing.xs,
  },
  meta: {
    color: colors.textSecondary,
    fontSize: typography.sizes.xs,
  },
  empty: {
    alignItems: 'center',
    paddingTop: spacing.xxl,
    gap: spacing.sm,
  },
  emptyTitle: {
    color: colors.textPrimary,
    fontSize: typography.sizes.lg,
    fontWeight: typography.weights.semibold,
    textAlign: 'center',
  },
  emptyHint: {
    color: colors.textMuted,
    fontSize: typography.sizes.sm,
    textAlign: 'center',
    lineHeight: typography.sizes.sm * typography.lineHeights.relaxed,
  },
  emptyButton: {
    marginTop: spacing.md,
  },
});