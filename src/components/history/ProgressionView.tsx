import { useEffect, useState } from 'react';
import { ActivityIndicator, ScrollView, StyleSheet, Text, View } from 'react-native';
import { Card } from '../Card';
import { Chip } from '../Badge';
import { ExercisePickerModal } from '../ExercisePickerModal';
import { RunningSummaryCard } from './RunningSummaryCard';
import { getDatabase } from '../../db/client';
import {
  getExerciseProgressionStats,
  getLastPerformanceForExercises,
  getRunningProgressionStats,
} from '../../db/repository';
import { formatDateHu, formatOneRepMaxKg, formatWeightKg } from '../../services/format';
import hu from '../../i18n/hu';
import { colors, radius, spacing, typography } from '../../theme/tokens';
import type {
  ExerciseCatalogItem,
  ExerciseProgressionPoint,
  LastPerformance,
  RunningProgressionPoint,
} from '../../types/workout';

/** Core lifts offered as one-tap chips; any other exercise is one picker away. */
export const CORE_LIFT_IDS: readonly string[] = [
  'front_squat',
  'romanian_deadlift',
  'belt_squat',
  'bench_press',
];

/** How many recent sessions the progression table shows. */
const PROGRESSION_SESSION_LIMIT = 12;

/** How many recent runs the summary reads. */
const RUNNING_SESSION_LIMIT = 12;

interface LoadedProgression {
  exerciseId: string;
  points: ExerciseProgressionPoint[];
  lastPerformance: LastPerformance | null;
}

function ProgressionRow({
  point,
  maxOneRepMaxKg,
}: {
  point: ExerciseProgressionPoint;
  maxOneRepMaxKg: number;
}) {
  const ratio = maxOneRepMaxKg > 0 ? point.estimatedOneRepMaxKg / maxOneRepMaxKg : 0;
  const widthPercent = Math.max(4, Math.round(ratio * 100));
  return (
    <View style={styles.chartRow}>
      <View style={styles.chartHead}>
        <Text style={styles.chartDate}>{formatDateHu(point.date)}</Text>
        <Text style={styles.chartTopSet}>
          {formatWeightKg(point.topWeightKg)} × {point.topReps}
        </Text>
      </View>
      <View style={styles.barTrack}>
        <View style={[styles.barFill, { width: `${widthPercent}%` }]} />
      </View>
      <View style={styles.chartFoot}>
        <Text style={styles.chartMeta}>
          {hu.screens.history.progress.oneRepMaxShort} {formatOneRepMaxKg(point.estimatedOneRepMaxKg)}
        </Text>
        <Text style={styles.chartMeta}>
          {hu.screens.history.progress.volume} {Math.round(point.volumeKg)} {hu.common.kg}
        </Text>
        <Text style={styles.chartMeta}>
          {point.setCount} {hu.screens.history.progress.setsShort}
        </Text>
      </View>
    </View>
  );
}

interface ProgressionViewProps {
  catalog: readonly ExerciseCatalogItem[];
  selectedExerciseId: string | null;
  onSelectExercise: (exerciseId: string) => void;
}

/**
 * Fejlődés & PR-ek: pick an exercise (core-lift chips or the full picker) to see
 * its all-time best set, best estimated 1RM, and a session-by-session bar list —
 * followed by the running summary card.
 */
export function ProgressionView({
  catalog,
  selectedExerciseId,
  onSelectExercise,
}: ProgressionViewProps) {
  const [loaded, setLoaded] = useState<LoadedProgression | null>(null);
  const [runningPoints, setRunningPoints] = useState<RunningProgressionPoint[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [pickerVisible, setPickerVisible] = useState(false);

  useEffect(() => {
    let cancelled = false;
    getDatabase()
      .then((db) => getRunningProgressionStats(db, RUNNING_SESSION_LIMIT))
      .then((next) => {
        if (!cancelled) {
          setRunningPoints(next);
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
  }, []);

  useEffect(() => {
    if (selectedExerciseId === null) {
      return;
    }
    let cancelled = false;
    getDatabase()
      .then(async (db) => {
        const [points, performance] = await Promise.all([
          getExerciseProgressionStats(db, selectedExerciseId, PROGRESSION_SESSION_LIMIT),
          getLastPerformanceForExercises(db, [selectedExerciseId]),
        ]);
        return { points, lastPerformance: performance.get(selectedExerciseId) ?? null };
      })
      .then((result) => {
        if (cancelled) {
          return;
        }
        setLoaded({
          exerciseId: selectedExerciseId,
          points: result.points,
          lastPerformance: result.lastPerformance,
        });
        setError(null);
      })
      .catch((cause: unknown) => {
        if (!cancelled) {
          setError(cause instanceof Error ? cause.message : String(cause));
        }
      });
    return () => {
      cancelled = true;
    };
  }, [selectedExerciseId]);

  const isStale = selectedExerciseId !== null && loaded?.exerciseId !== selectedExerciseId;
  const points = isStale || loaded === null ? [] : loaded.points;
  const lastPerformance = isStale || loaded === null ? null : loaded.lastPerformance;
  const newestFirst = [...points].reverse();
  const maxOneRepMaxKg = points.reduce(
    (max, point) => Math.max(max, point.estimatedOneRepMaxKg),
    0,
  );
  const selectedName =
    selectedExerciseId === null
      ? null
      : (catalog.find((item) => item.id === selectedExerciseId)?.nameHu ?? selectedExerciseId);

  return (
    <ScrollView
      contentContainerStyle={styles.content}
      showsVerticalScrollIndicator={false}
      keyboardShouldPersistTaps="handled"
    >
      <View style={styles.chipRow}>
        {CORE_LIFT_IDS.map((exerciseId) => {
          const name = catalog.find((item) => item.id === exerciseId)?.nameHu ?? exerciseId;
          return (
            <Chip
              key={exerciseId}
              label={name}
              selected={selectedExerciseId === exerciseId}
              onPress={() => onSelectExercise(exerciseId)}
            />
          );
        })}
        <Chip
          label={hu.screens.history.progress.allExercises}
          selected={selectedExerciseId !== null && !CORE_LIFT_IDS.includes(selectedExerciseId)}
          onPress={() => setPickerVisible(true)}
        />
      </View>

      {error !== null ? <Text style={styles.error}>{error}</Text> : null}

      {selectedExerciseId === null ? (
        <Card title={hu.screens.history.progress.exercisesTitle}>
          <Text style={styles.muted}>{hu.screens.history.progress.noSelection}</Text>
        </Card>
      ) : isStale ? (
        <ActivityIndicator color={colors.accent} style={styles.loader} />
      ) : (
        <Card
          title={selectedName ?? hu.screens.history.progress.exercisesTitle}
          caption={`${points.length} ${hu.screens.history.progress.sessionsShort}`}
        >
          {lastPerformance === null || points.length === 0 ? (
            <Text style={styles.muted}>{hu.screens.history.progress.noData}</Text>
          ) : (
            <>
              <View style={styles.statRow}>
                <Text style={styles.statLabel}>{hu.screens.history.progress.bestOneRepMax}</Text>
                <Text style={styles.statValue}>
                  {formatOneRepMaxKg(lastPerformance.bestOneRepMaxKg)}
                </Text>
              </View>
              {lastPerformance.bestSet !== undefined ? (
                <View style={styles.statRow}>
                  <Text style={styles.statLabel}>{hu.screens.history.progress.allTimeBest}</Text>
                  <Text style={styles.statValue}>
                    {formatWeightKg(lastPerformance.bestSet.weightKg)} ×{' '}
                    {lastPerformance.bestSet.reps}
                  </Text>
                </View>
              ) : null}
              {lastPerformance.bestSet !== undefined ? (
                <Text style={styles.statFootnote}>
                  {formatDateHu(lastPerformance.bestSet.completedAt)}
                </Text>
              ) : null}

              <Text style={styles.sectionTitle}>{hu.screens.history.progress.recentSessions}</Text>
              {newestFirst.map((point) => (
                <ProgressionRow key={point.sessionId} point={point} maxOneRepMaxKg={maxOneRepMaxKg} />
              ))}
            </>
          )}
        </Card>
      )}

      <RunningSummaryCard points={runningPoints} />

      <ExercisePickerModal
        visible={pickerVisible}
        catalog={catalog}
        title={hu.screens.history.progress.pickExercise}
        allowCreate={false}
        onPick={(exerciseId) => {
          setPickerVisible(false);
          onSelectExercise(exerciseId);
        }}
        onClose={() => setPickerVisible(false)}
      />
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  content: {
    gap: spacing.md,
    paddingBottom: spacing.xxl,
  },
  chipRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.xs,
  },
  loader: {
    marginTop: spacing.xl,
  },
  error: {
    color: colors.danger,
    fontSize: typography.sizes.sm,
  },
  muted: {
    color: colors.textMuted,
    fontSize: typography.sizes.sm,
  },
  statRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: spacing.sm,
  },
  statLabel: {
    color: colors.textMuted,
    fontSize: typography.sizes.xs,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  statValue: {
    color: colors.progress,
    fontSize: typography.sizes.sm,
    fontWeight: typography.weights.semibold,
    fontVariant: ['tabular-nums'],
  },
  statFootnote: {
    color: colors.textMuted,
    fontSize: typography.sizes.xs,
    fontVariant: ['tabular-nums'],
  },
  sectionTitle: {
    marginTop: spacing.md,
    color: colors.textSecondary,
    fontSize: typography.sizes.xs,
    fontWeight: typography.weights.semibold,
    textTransform: 'uppercase',
    letterSpacing: 0.8,
  },
  chartRow: {
    gap: spacing.xs,
    borderTopWidth: 1,
    borderTopColor: colors.border,
    paddingTop: spacing.sm,
  },
  chartHead: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: spacing.sm,
  },
  chartDate: {
    color: colors.textMuted,
    fontSize: typography.sizes.xs,
    fontVariant: ['tabular-nums'],
  },
  chartTopSet: {
    color: colors.textPrimary,
    fontSize: typography.sizes.sm,
    fontWeight: typography.weights.semibold,
    fontVariant: ['tabular-nums'],
  },
  barTrack: {
    height: 6,
    borderRadius: radius.pill,
    backgroundColor: colors.surfaceInput,
    overflow: 'hidden',
  },
  barFill: {
    height: 6,
    borderRadius: radius.pill,
    backgroundColor: colors.progress,
  },
  chartFoot: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.md,
  },
  chartMeta: {
    color: colors.textSecondary,
    fontSize: typography.sizes.xs,
    fontVariant: ['tabular-nums'],
  },
});
