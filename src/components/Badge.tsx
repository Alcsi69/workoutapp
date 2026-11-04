import type { ReactNode } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import type { LoadScore } from '../types/workout';
import { colors, radius, spacing, typography } from '../theme/tokens';

// --- Selectable chip --------------------------------------------------------

interface ChipProps {
  label: string;
  selected: boolean;
  onPress: () => void;
}

export function Chip({ label, selected, onPress }: ChipProps) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityState={{ selected }}
      onPress={onPress}
      style={({ pressed }) => [
        styles.chip,
        selected ? styles.chipSelected : null,
        pressed ? styles.pressed : null,
      ]}
    >
      <Text style={[styles.chipLabel, selected ? styles.chipLabelSelected : null]}>{label}</Text>
    </Pressable>
  );
}

// --- Static pill ------------------------------------------------------------

export type PillTone = 'neutral' | 'accent' | 'success' | 'warning' | 'danger';

const PILL_COLORS: Record<PillTone, { background: string; text: string }> = {
  neutral: { background: colors.surfaceElevated, text: colors.textSecondary },
  accent: { background: colors.accentMuted, text: colors.accent },
  success: { background: colors.successMuted, text: colors.success },
  warning: { background: colors.warningMuted, text: colors.warning },
  danger: { background: colors.dangerMuted, text: colors.danger },
};

interface PillProps {
  label: string;
  tone?: PillTone;
  icon?: ReactNode;
}

export function Pill({ label, tone = 'neutral', icon }: PillProps) {
  const palette = PILL_COLORS[tone];
  return (
    <View style={[styles.pill, { backgroundColor: palette.background }]}>
      {icon}
      <Text style={[styles.pillLabel, { color: palette.text }]}>{label}</Text>
    </View>
  );
}

// --- Load indicator ---------------------------------------------------------

/**
 * Score 1-2 renders success, 3 warning, 4-5 danger — the same thresholds the
 * routine builder uses for knee/axial alerts.
 */
export function loadTone(score: LoadScore): PillTone {
  if (score >= 4) {
    return 'danger';
  }
  if (score === 3) {
    return 'warning';
  }
  return 'success';
}

interface LoadBadgeProps {
  label: string;
  score: LoadScore;
}

export function LoadBadge({ label, score }: LoadBadgeProps) {
  return <Pill label={`${label} ${score}/5`} tone={loadTone(score)} />;
}

const styles = StyleSheet.create({
  chip: {
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.sm,
    borderRadius: radius.pill,
    borderWidth: 1,
    borderColor: colors.borderStrong,
    backgroundColor: colors.surfaceInput,
  },
  chipSelected: {
    backgroundColor: colors.accentMuted,
    borderColor: colors.accent,
  },
  pressed: {
    opacity: 0.8,
  },
  chipLabel: {
    color: colors.textSecondary,
    fontSize: typography.sizes.sm,
    fontWeight: typography.weights.medium,
  },
  chipLabelSelected: {
    color: colors.accent,
    fontWeight: typography.weights.semibold,
  },
  pill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
    alignSelf: 'flex-start',
    paddingHorizontal: spacing.sm,
    paddingVertical: spacing.xs,
    borderRadius: radius.pill,
  },
  pillLabel: {
    fontSize: typography.sizes.xs,
    fontWeight: typography.weights.semibold,
    letterSpacing: 0.2,
  },
});