import { StyleSheet, Text, View } from 'react-native';
import { Card } from '../Card';
import { summarizeRunningProgression } from '../../services/analytics';
import { formatDateHu, formatDurationHu, formatPaceHu } from '../../services/format';
import hu from '../../i18n/hu';
import { colors, spacing, typography } from '../../theme/tokens';
import type { RunningProgressionPoint } from '../../types/workout';

/** How many recent runs the trend list shows. */
const RECENT_RUN_COUNT = 3;

function StatRow({ label, value }: { label: string; value: string }) {
  return (
    <View style={styles.statRow}>
      <Text style={styles.statLabel}>{label}</Text>
      <Text style={styles.statValue}>{value}</Text>
    </View>
  );
}

/**
 * Running summary for the Fejlődés view: total km, mean pace, the best logged
 * 5K/7K effort, the recent trend, and the last few runs. All numbers come from
 * `summarizeRunningProgression`, so this card only formats.
 */
export function RunningSummaryCard({ points }: { points: RunningProgressionPoint[] }) {
  const summary = summarizeRunningProgression(points);
  const recent = [...points].slice(-RECENT_RUN_COUNT).reverse();

  return (
    <Card
      title={hu.screens.history.progress.runningTitle}
      caption={`${summary.sessionCount} ${hu.screens.history.progress.runsLogged}`}
    >
      {summary.sessionCount === 0 ? (
        <Text style={styles.muted}>{hu.screens.history.progress.noRuns}</Text>
      ) : (
        <>
          <StatRow
            label={hu.screens.history.progress.totalDistance}
            value={`${summary.totalDistanceKm} ${hu.common.km}`}
          />
          <StatRow
            label={hu.screens.history.progress.averagePace}
            value={`${formatPaceHu(summary.averagePaceSecondsPerKm)} ${hu.common.minutesShort}/${hu.common.km}`}
          />
          <StatRow
            label={hu.screens.history.progress.best5k}
            value={
              summary.best5k === undefined
                ? '—'
                : `${formatPaceHu(summary.best5k.paceSecondsPerKm)} ${hu.common.minutesShort}/${hu.common.km}`
            }
          />
          <StatRow
            label={hu.screens.history.progress.best7k}
            value={
              summary.best7k === undefined
                ? '—'
                : `${formatPaceHu(summary.best7k.paceSecondsPerKm)} ${hu.common.minutesShort}/${hu.common.km}`
            }
          />
          <StatRow
            label={hu.screens.history.progress.trend}
            value={hu.screens.history.progress.trends[summary.trend]}
          />

          <View style={styles.recentList}>
            {recent.map((run) => (
              <View key={run.sessionId} style={styles.recentRow}>
                <Text style={styles.recentDate}>{formatDateHu(run.date)}</Text>
                <Text style={styles.recentValue}>
                  {run.distanceKm} {hu.common.km}
                </Text>
                <Text style={styles.recentValue}>
                  {formatPaceHu(run.avgPaceSecondsPerKm)} /{hu.common.km}
                </Text>
                <Text style={styles.recentMuted}>{formatDurationHu(run.durationSeconds)}</Text>
                {run.rpe !== undefined ? (
                  <Text style={styles.recentMuted}>
                    {hu.logger.rpe} {run.rpe}
                  </Text>
                ) : null}
              </View>
            ))}
          </View>
        </>
      )}
    </Card>
  );
}

const styles = StyleSheet.create({
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
    color: colors.accent,
    fontSize: typography.sizes.sm,
    fontWeight: typography.weights.semibold,
    fontVariant: ['tabular-nums'],
  },
  recentList: {
    marginTop: spacing.sm,
    borderTopWidth: 1,
    borderTopColor: colors.border,
    paddingTop: spacing.sm,
    gap: spacing.xs,
  },
  recentRow: {
    flexDirection: 'row',
    alignItems: 'center',
    flexWrap: 'wrap',
    gap: spacing.md,
  },
  recentDate: {
    color: colors.textMuted,
    fontSize: typography.sizes.xs,
    fontVariant: ['tabular-nums'],
  },
  recentValue: {
    color: colors.textPrimary,
    fontSize: typography.sizes.xs,
    fontVariant: ['tabular-nums'],
  },
  recentMuted: {
    color: colors.textSecondary,
    fontSize: typography.sizes.xs,
    fontVariant: ['tabular-nums'],
  },
  muted: {
    color: colors.textMuted,
    fontSize: typography.sizes.sm,
  },
});
