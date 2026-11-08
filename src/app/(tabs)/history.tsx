import { useCallback, useState } from 'react';
import {
  ActivityIndicator,
  FlatList,
  Pressable,
  RefreshControl,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { router, useFocusEffect } from 'expo-router';
import { Button } from '../../components/Button';
import { Chip, Pill } from '../../components/Badge';
import { Screen } from '../../components/Screen';
import { CORE_LIFT_IDS, ProgressionView } from '../../components/history/ProgressionView';
import { getDatabase } from '../../db/client';
import {
  getExerciseCatalog,
  getSessionDetail,
  getSessionHistory,
} from '../../db/repository';
import type { SessionHistorySummary } from '../../db/repository';
import { useSyncRefresh } from '../../hooks/useSyncRefresh';
import { totalVolumeKg } from '../../services/analytics';
import { formatDateTimeHu, formatDurationHu, formatPaceHu } from '../../services/format';
import hu from '../../i18n/hu';
import { colors, radius, spacing, typography } from '../../theme/tokens';
import type { ExerciseCatalogItem, WorkoutSessionLog } from '../../types/workout';

/** Which list the Előzmények tab shows. */
type HistoryView = 'log' | 'progress';

/** Total tonnage (kg) over every logged set in a session, warmups included. */
function sessionVolumeKg(detail: WorkoutSessionLog): number {
  return totalVolumeKg(
    detail.exerciseBlocks.flatMap((block) => block.sets),
    { includeWarmups: true },
  );
}

function SessionRow({ session }: { session: SessionHistorySummary }) {
  const [expanded, setExpanded] = useState(false);
  const [detail, setDetail] = useState<WorkoutSessionLog | null>(null);
  const [loading, setLoading] = useState(false);

  const handleToggle = async (): Promise<void> => {
    if (expanded) {
      setExpanded(false);
      return;
    }
    setExpanded(true);
    if (detail === null) {
      setLoading(true);
      try {
        const db = await getDatabase();
        setDetail(await getSessionDetail(db, session.id));
      } finally {
        setLoading(false);
      }
    }
  };

  const showStrength =
    detail !== null && (detail.sessionType === 'strength' || detail.sessionType === 'hybrid');
  const showRunning =
    detail !== null && (detail.sessionType === 'running' || detail.sessionType === 'hybrid');

  return (
    <View style={styles.row}>
      <View style={styles.rowHeader}>
        <Text style={styles.title}>{session.title}</Text>
        <Pill
          label={hu.sessionTypes[session.sessionType]}
          tone={session.sessionType === 'running' ? 'accent' : 'success'}
        />
      </View>
      <Text style={styles.muted}>
        {hu.screens.history.completedLabel}: {formatDateTimeHu(session.completedAt)}
      </Text>
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

      <Pressable
        accessibilityRole="button"
        onPress={() => {
          void handleToggle();
        }}
        style={({ pressed }) => [styles.detailsToggle, pressed ? styles.pressed : null]}
      >
        <Text style={styles.detailsLabel}>
          {expanded ? hu.screens.history.hide : hu.screens.history.details}
        </Text>
      </Pressable>

      {expanded ? (
        <View style={styles.details}>
          {loading ? <ActivityIndicator color={colors.accent} /> : null}

          {showStrength && detail !== null
            ? detail.exerciseBlocks.map((block) => (
                <View key={block.id} style={styles.detailBlock}>
                  <Text style={styles.detailBlockName}>
                    {block.exercise.nameHu}
                    {block.substitutedFromExerciseId !== undefined
                      ? ` · ${hu.logger.replacedFrom}`
                      : ''}
                  </Text>
                  {block.sets.length === 0 ? (
                    <Text style={styles.muted}>{hu.screens.history.noSets}</Text>
                  ) : (
                    block.sets.map((set) => (
                      <View key={set.id} style={styles.setRow}>
                        <Text style={styles.setIndex}>{set.setNumber}.</Text>
                        <Text style={styles.setType}>{hu.setTypes[set.setType]}</Text>
                        <Text style={styles.setValue}>
                          {set.actualWeightKg} {hu.common.kg} × {set.actualReps}
                        </Text>
                        {set.rpe !== undefined ? (
                          <Text style={styles.setValue}>
                            {hu.logger.rpe} {set.rpe}
                          </Text>
                        ) : null}
                      </View>
                    ))
                  )}
                </View>
              ))
            : null}

          {showStrength && detail !== null ? (
            <View style={styles.summaryRow}>
              <Text style={styles.summaryLabel}>{hu.screens.history.volume}</Text>
              <Text style={styles.summaryValue}>
                {Math.round(sessionVolumeKg(detail))} {hu.common.kg}
              </Text>
            </View>
          ) : null}

          {showRunning && detail?.runningMetrics !== undefined ? (
            <>
              <View style={styles.summaryRow}>
                <Text style={styles.summaryLabel}>{hu.logger.running.distance}</Text>
                <Text style={styles.summaryValue}>
                  {detail.runningMetrics.distanceKm} {hu.common.km}
                </Text>
              </View>
              <View style={styles.summaryRow}>
                <Text style={styles.summaryLabel}>{hu.logger.running.duration}</Text>
                <Text style={styles.summaryValue}>
                  {formatDurationHu(detail.runningMetrics.durationSeconds)}
                </Text>
              </View>
              <View style={styles.summaryRow}>
                <Text style={styles.summaryLabel}>{hu.logger.running.pace}</Text>
                <Text style={styles.summaryValue}>
                  {formatPaceHu(detail.runningMetrics.avgPaceSecondsPerKm)}
                </Text>
              </View>
            </>
          ) : null}
        </View>
      ) : null}
    </View>
  );
}

export default function HistoryScreen() {
  const [sessions, setSessions] = useState<SessionHistorySummary[] | null>(null);
  const [catalog, setCatalog] = useState<ExerciseCatalogItem[]>([]);
  const [view, setView] = useState<HistoryView>('log');
  const [selectedExerciseId, setSelectedExerciseId] = useState<string | null>(CORE_LIFT_IDS[0]);
  const [error, setError] = useState<string | null>(null);

  /** Re-reads the local log — used by the pull-to-refresh control after a sync. */
  const reload = useCallback(async (): Promise<void> => {
    const db = await getDatabase();
    const [nextSessions, nextCatalog] = await Promise.all([
      getSessionHistory(db),
      getExerciseCatalog(db),
    ]);
    setSessions(nextSessions);
    setCatalog(nextCatalog);
    setError(null);
  }, []);

  const { refreshing, refresh } = useSyncRefresh(reload);

  useFocusEffect(
    useCallback(() => {
      let cancelled = false;
      getDatabase()
        .then(async (db) => {
          const [nextSessions, nextCatalog] = await Promise.all([
            getSessionHistory(db),
            getExerciseCatalog(db),
          ]);
          return { nextSessions, nextCatalog };
        })
        .then(({ nextSessions, nextCatalog }) => {
          if (!cancelled) {
            setSessions(nextSessions);
            setCatalog(nextCatalog);
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
      <View style={styles.toggleRow}>
        <Chip
          label={hu.screens.history.tabs.log}
          selected={view === 'log'}
          onPress={() => setView('log')}
        />
        <Chip
          label={hu.screens.history.tabs.progress}
          selected={view === 'progress'}
          onPress={() => setView('progress')}
        />
      </View>

      {view === 'log' ? (
        <FlatList
          data={sessions}
          keyExtractor={(item) => item.id}
          renderItem={({ item }) => <SessionRow session={item} />}
          contentContainerStyle={styles.list}
          style={styles.listBody}
          showsVerticalScrollIndicator={false}
          refreshControl={
            <RefreshControl
              refreshing={refreshing}
              onRefresh={refresh}
              tintColor={colors.accent}
              colors={[colors.accent]}
              progressBackgroundColor={colors.surface}
            />
          }
        />
      ) : (
        <ProgressionView
          catalog={catalog}
          selectedExerciseId={selectedExerciseId}
          onSelectExercise={setSelectedExerciseId}
        />
      )}
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
  toggleRow: {
    flexDirection: 'row',
    gap: spacing.xs,
    paddingBottom: spacing.md,
  },
  listBody: {
    flex: 1,
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
  detailsToggle: {
    alignSelf: 'flex-start',
    marginTop: spacing.xs,
    paddingVertical: spacing.xs,
    paddingHorizontal: spacing.md,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.borderStrong,
    backgroundColor: colors.surfaceElevated,
  },
  detailsLabel: {
    color: colors.textSecondary,
    fontSize: typography.sizes.sm,
    fontWeight: typography.weights.medium,
  },
  pressed: {
    opacity: 0.8,
  },
  details: {
    marginTop: spacing.sm,
    gap: spacing.sm,
    borderTopWidth: 1,
    borderTopColor: colors.border,
    paddingTop: spacing.sm,
  },
  detailBlock: {
    gap: 2,
  },
  detailBlockName: {
    color: colors.textPrimary,
    fontSize: typography.sizes.sm,
    fontWeight: typography.weights.semibold,
  },
  setRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
  },
  setIndex: {
    width: 24,
    color: colors.textMuted,
    fontSize: typography.sizes.xs,
    fontVariant: ['tabular-nums'],
  },
  setType: {
    flex: 1,
    color: colors.textSecondary,
    fontSize: typography.sizes.xs,
  },
  setValue: {
    color: colors.textPrimary,
    fontSize: typography.sizes.xs,
    fontVariant: ['tabular-nums'],
  },
  summaryRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: spacing.sm,
  },
  summaryLabel: {
    color: colors.textMuted,
    fontSize: typography.sizes.xs,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  summaryValue: {
    color: colors.accent,
    fontSize: typography.sizes.sm,
    fontWeight: typography.weights.semibold,
    fontVariant: ['tabular-nums'],
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