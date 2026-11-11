import { useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { Card } from '../Card';
import { NumberInput } from './NumberInput';
import { RpeSelector } from './Selectors';
import { computeAvgPaceSecondsPerKm } from '../../db/repository';
import type { RunningMetricsInput } from '../../db/repository';
import { formatPaceHu } from '../../services/format';
import hu from '../../i18n/hu';
import { colors, spacing, typography } from '../../theme/tokens';
import type { RunningMetrics } from '../../types/workout';

function parseDecimal(value: string): number {
  return Number.parseFloat(value.replace(',', '.')) || 0;
}

function parseInteger(value: string): number {
  return Number.parseInt(value, 10) || 0;
}

interface RunningLoggerCardProps {
  metrics: RunningMetrics | undefined;
  onSave: (input: RunningMetricsInput) => Promise<void>;
}

/**
 * Running Logger card: distance, duration (min:sec), auto-computed pace, and
 * RPE. Values persist on field blur, so finishing the session keeps whatever
 * was last entered.
 */
export function RunningLoggerCard({ metrics, onSave }: RunningLoggerCardProps) {
  const [distance, setDistance] = useState<string>(
    metrics !== undefined ? String(metrics.distanceKm) : '',
  );
  const [minutes, setMinutes] = useState<string>(
    metrics !== undefined ? String(Math.floor(metrics.durationSeconds / 60)) : '',
  );
  const [seconds, setSeconds] = useState<string>(
    metrics !== undefined ? String(metrics.durationSeconds % 60) : '',
  );
  const [rpe, setRpe] = useState<number | null>(metrics?.perceivedEffortRpe ?? null);

  const distanceKm = parseDecimal(distance);
  const durationSeconds = parseInteger(minutes) * 60 + parseInteger(seconds);
  const pace = computeAvgPaceSecondsPerKm(distanceKm, durationSeconds);

  const persist = async (nextRpe: number | null): Promise<void> => {
    if (distanceKm <= 0 && durationSeconds <= 0) {
      return;
    }
    const input: RunningMetricsInput = { distanceKm, durationSeconds };
    if (nextRpe !== null) {
      input.perceivedEffortRpe = nextRpe;
    }
    await onSave(input);
  };

  return (
    <Card title={hu.logger.running.title}>
      <NumberInput
        label={hu.logger.running.distance}
        value={distance}
        unit={hu.common.km}
        allowDecimal
        placeholder="0"
        onChangeText={setDistance}
        onCommit={() => {
          void persist(rpe);
        }}
      />

      <View style={styles.durationRow}>
        <Text style={styles.durationLabel}>{hu.logger.running.duration}</Text>
      </View>
      <View style={styles.inputRow}>
        <NumberInput
          value={minutes}
          unit={hu.logger.running.minutes}
          placeholder="0"
          onChangeText={setMinutes}
          onCommit={() => {
            void persist(rpe);
          }}
        />
        <NumberInput
          value={seconds}
          unit={hu.logger.running.secondsShort}
          placeholder="0"
          onChangeText={setSeconds}
          onCommit={() => {
            void persist(rpe);
          }}
        />
      </View>

      <View style={styles.paceRow}>
        <Text style={styles.paceLabel}>{hu.logger.running.pace}</Text>
        <Text style={styles.paceValue}>{formatPaceHu(pace)}</Text>
      </View>

      <RpeSelector
        value={rpe}
        onChange={(next) => {
          setRpe(next);
          void persist(next);
        }}
      />
    </Card>
  );
}

const styles = StyleSheet.create({
  durationRow: {
    marginTop: spacing.xs,
  },
  durationLabel: {
    color: colors.textSecondary,
    fontSize: typography.sizes.xs,
    fontWeight: typography.weights.medium,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  inputRow: {
    flexDirection: 'row',
    gap: spacing.md,
  },
  paceRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: colors.surfaceInput,
    borderColor: colors.border,
    borderWidth: 1,
    borderRadius: 10,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.md,
  },
  paceLabel: {
    color: colors.textSecondary,
    fontSize: typography.sizes.sm,
  },
  paceValue: {
    color: colors.progress,
    fontSize: typography.sizes.lg,
    fontWeight: typography.weights.bold,
    fontVariant: ['tabular-nums'],
  },
});
