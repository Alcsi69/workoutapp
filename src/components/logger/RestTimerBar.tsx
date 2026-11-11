import { Pressable, StyleSheet, Text, View } from 'react-native';
import { REST_ADJUST_STEP_SECONDS, formatRestClock } from '../../store/useActiveWorkoutStore';
import hu from '../../i18n/hu';
import { colors, radius, spacing, typography } from '../../theme/tokens';

interface RestTimerBarProps {
  /** Milliseconds left, derived from the store's absolute end timestamp. */
  remainingMs: number;
  onAdjust: (deltaSeconds: number) => void;
  onSkip: () => void;
}

/**
 * Rest-timer banner shown while a rest period runs. The remaining time is
 * recomputed from Date.now() by the parent each tick, so this stays a pure
 * presentational component.
 */
export function RestTimerBar({ remainingMs, onAdjust, onSkip }: RestTimerBarProps) {
  return (
    <View style={styles.bar}>
      <View style={styles.info}>
        <Text style={styles.label}>{hu.logger.restTimer}</Text>
        <Text style={styles.clock}>{formatRestClock(remainingMs)}</Text>
      </View>
      <View style={styles.controls}>
        <Pressable
          accessibilityRole="button"
          onPress={() => onAdjust(-REST_ADJUST_STEP_SECONDS)}
          style={({ pressed }) => [styles.control, pressed ? styles.pressed : null]}
        >
          <Text style={styles.controlLabel}>{hu.logger.restSubtract}</Text>
        </Pressable>
        <Pressable
          accessibilityRole="button"
          onPress={() => onAdjust(REST_ADJUST_STEP_SECONDS)}
          style={({ pressed }) => [styles.control, pressed ? styles.pressed : null]}
        >
          <Text style={styles.controlLabel}>{hu.logger.restAdd}</Text>
        </Pressable>
        <Pressable
          accessibilityRole="button"
          onPress={onSkip}
          style={({ pressed }) => [styles.control, styles.skip, pressed ? styles.pressed : null]}
        >
          <Text style={[styles.controlLabel, styles.skipLabel]}>{hu.logger.restSkipShort}</Text>
        </Pressable>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  bar: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: spacing.md,
    backgroundColor: colors.progressMuted,
    borderColor: colors.progress,
    borderWidth: 1,
    borderRadius: radius.lg,
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.md,
  },
  info: {
    gap: 2,
  },
  label: {
    color: colors.progress,
    fontSize: typography.sizes.xs,
    fontWeight: typography.weights.semibold,
    textTransform: 'uppercase',
    letterSpacing: 0.6,
  },
  clock: {
    color: colors.textPrimary,
    fontSize: typography.sizes.xxl,
    fontWeight: typography.weights.bold,
    fontVariant: ['tabular-nums'],
  },
  controls: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
  },
  control: {
    minWidth: 52,
    paddingHorizontal: spacing.sm,
    paddingVertical: spacing.sm,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.borderStrong,
    backgroundColor: colors.surfaceElevated,
    alignItems: 'center',
  },
  skip: {
    backgroundColor: colors.transparent,
  },
  pressed: {
    opacity: 0.8,
  },
  controlLabel: {
    color: colors.textPrimary,
    fontSize: typography.sizes.sm,
    fontWeight: typography.weights.semibold,
  },
  skipLabel: {
    color: colors.textSecondary,
  },
});
