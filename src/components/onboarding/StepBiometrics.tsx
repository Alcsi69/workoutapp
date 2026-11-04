import { StyleSheet, Text, View } from 'react-native';
import { Card } from '../Card';
import { Chip } from '../Badge';
import { NumberField } from '../NumberField';
import { useOnboardingStore } from '../../store/useOnboardingStore';
import hu from '../../i18n/hu';
import { spacing } from '../../theme/tokens';
import type { TrainingGoal } from '../../types/workout';

const GOALS: readonly TrainingGoal[] = [
  'strength',
  'hypertrophy',
  'powerbuilding',
  'hybrid_strength_running',
];

const EXPERIENCE_PRESETS: readonly { months: number; label: string }[] = [
  { months: 6, label: hu.onboarding.experience.beginner },
  { months: 24, label: hu.onboarding.experience.intermediate },
  { months: 60, label: hu.onboarding.experience.advanced },
];

/** Step 1 — Testalkat & Célok. */
export function StepBiometrics() {
  const age = useOnboardingStore((state) => state.age);
  const weightKg = useOnboardingStore((state) => state.weightKg);
  const heightCm = useOnboardingStore((state) => state.heightCm);
  const primaryGoal = useOnboardingStore((state) => state.primaryGoal);
  const experienceMonths = useOnboardingStore((state) => state.experienceMonths);
  const updateBiometrics = useOnboardingStore((state) => state.updateBiometrics);
  const setPrimaryGoal = useOnboardingStore((state) => state.setPrimaryGoal);
  const setExperienceMonths = useOnboardingStore((state) => state.setExperienceMonths);

  return (
    <View style={styles.container}>
      <Card title={hu.onboarding.biometrics.title} caption={hu.onboarding.biometrics.subtitle}>
        <View style={styles.row}>
          <NumberField
            label={hu.onboarding.biometrics.age}
            value={age}
            unit={hu.onboarding.biometrics.ageUnit}
            onChange={(next) => updateBiometrics({ age: Math.round(next) })}
          />
          <NumberField
            label={hu.onboarding.biometrics.weight}
            value={weightKg}
            unit={hu.common.kg}
            allowDecimal
            onChange={(next) => updateBiometrics({ weightKg: next })}
          />
          <NumberField
            label={hu.onboarding.biometrics.height}
            value={heightCm}
            unit="cm"
            onChange={(next) => updateBiometrics({ heightCm: Math.round(next) })}
          />
        </View>
      </Card>

      <Card title={hu.onboarding.goals.title} caption={hu.onboarding.goals.subtitle}>
        <View style={styles.wrap}>
          {GOALS.map((goal) => (
            <Chip
              key={goal}
              label={hu.onboarding.goals[goal]}
              selected={primaryGoal === goal}
              onPress={() => setPrimaryGoal(goal)}
            />
          ))}
        </View>
      </Card>

      <Card title={hu.onboarding.experience.title}>
        <View style={styles.wrap}>
          {EXPERIENCE_PRESETS.map((preset) => (
            <Chip
              key={preset.months}
              label={preset.label}
              selected={experienceMonths === preset.months}
              onPress={() => setExperienceMonths(preset.months)}
            />
          ))}
        </View>
        <View style={styles.row}>
          <NumberField
            label={hu.onboarding.experience.monthsLabel}
            value={experienceMonths}
            unit={hu.onboarding.constraints.monthsUnit}
            onChange={(next) => setExperienceMonths(Math.round(next))}
          />
        </View>
      </Card>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    gap: spacing.md,
  },
  row: {
    flexDirection: 'row',
    gap: spacing.md,
  },
  wrap: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.sm,
  },
});