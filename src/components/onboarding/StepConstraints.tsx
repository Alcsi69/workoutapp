import { StyleSheet, Text, View } from 'react-native';
import { Card } from '../Card';
import { Chip } from '../Badge';
import {
  deriveAutoSubstitutions,
  useOnboardingStore,
} from '../../store/useOnboardingStore';
import hu from '../../i18n/hu';
import { colors, spacing, typography } from '../../theme/tokens';
import type { JointArea, JointConstraintSeverity } from '../../types/workout';

const JOINT_AREAS: readonly JointArea[] = [
  'knees',
  'lower_back',
  'shoulders',
  'wrists',
  'elbows',
  'hips',
];

const SEVERITIES: readonly JointConstraintSeverity[] = [
  'mild_discomfort',
  'avoid_heavy_axial_load',
  'strict_exclude',
];

/** Display names for the exercise ids the auto rules can reference. */
const EXERCISE_LABELS: Record<string, string> = {
  hack_squat: 'Hack guggolás',
  belt_squat: 'Öves guggolás',
};

/** Step 3 — Ízületi korlátok & Gyakorlat cserék. */
export function StepConstraints() {
  const jointLimitations = useOnboardingStore((state) => state.jointLimitations);
  const upsertJointConstraint = useOnboardingStore((state) => state.upsertJointConstraint);
  const removeJointConstraint = useOnboardingStore((state) => state.removeJointConstraint);

  const autoSubstitutions = deriveAutoSubstitutions(jointLimitations);
  const autoEntries = Object.entries(autoSubstitutions);

  return (
    <View style={styles.container}>
      <Card title={hu.onboarding.constraints.title} caption={hu.onboarding.constraints.subtitle}>
        <View style={styles.wrap}>
          {JOINT_AREAS.map((area) => {
            const active = jointLimitations.find((item) => item.area === area);
            return (
              <Chip
                key={area}
                label={hu.onboarding.constraints.areas[area]}
                selected={active !== undefined}
                onPress={() => {
                  if (active === undefined) {
                    // Default to the middle severity: restrictive but not exclusionary.
                    upsertJointConstraint(area, 'avoid_heavy_axial_load');
                  } else {
                    removeJointConstraint(area);
                  }
                }}
              />
            );
          })}
        </View>

        {jointLimitations.map((limitation) => (
          <View key={limitation.area} style={styles.severityBlock}>
            <Text style={styles.areaLabel}>{hu.onboarding.constraints.areas[limitation.area]}</Text>
            <View style={styles.wrap}>
              {SEVERITIES.map((severity) => (
                <Chip
                  key={`${limitation.area}-${severity}`}
                  label={hu.onboarding.constraints.severity[severity]}
                  selected={limitation.severity === severity}
                  onPress={() => upsertJointConstraint(limitation.area, severity)}
                />
              ))}
            </View>
          </View>
        ))}
      </Card>

      {autoEntries.length > 0 ? (
        <Card
          title={hu.onboarding.constraints.substitutions.title}
          caption={hu.onboarding.constraints.substitutions.auto}
          tone="accent"
        >
          {autoEntries.map(([fromExerciseId, toExerciseId]) => (
            <Text key={fromExerciseId} style={styles.substitutionLine}>
              {EXERCISE_LABELS[fromExerciseId] ?? fromExerciseId} →{' '}
              {EXERCISE_LABELS[toExerciseId] ?? toExerciseId}
            </Text>
          ))}
          <Text style={styles.hint}>{hu.onboarding.constraints.substitutions.autoRuleHint}</Text>
        </Card>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    gap: spacing.md,
  },
  wrap: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.sm,
  },
  severityBlock: {
    marginTop: spacing.md,
    gap: spacing.sm,
  },
  areaLabel: {
    color: colors.textSecondary,
    fontSize: typography.sizes.xs,
    fontWeight: typography.weights.semibold,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  substitutionLine: {
    color: colors.textPrimary,
    fontSize: typography.sizes.sm,
  },
  hint: {
    color: colors.textMuted,
    fontSize: typography.sizes.xs,
    lineHeight: typography.sizes.xs * typography.lineHeights.relaxed,
  },
});