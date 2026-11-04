import { StyleSheet, Text, View } from 'react-native';
import { Card } from '../Card';
import { Chip } from '../Badge';
import { useOnboardingStore } from '../../store/useOnboardingStore';
import hu from '../../i18n/hu';
import { colors, spacing, typography } from '../../theme/tokens';
import type { EquipmentTier } from '../../types/workout';

const STRENGTH_DAY_OPTIONS: readonly number[] = [2, 3, 4, 5, 6];
const RUNNING_DAY_OPTIONS: readonly number[] = [0, 1, 2, 3, 4];
const TARGET_DISTANCE_OPTIONS: readonly { value: number | null; label: string }[] = [
  { value: 5, label: `5 ${hu.common.km}` },
  { value: 7, label: `7 ${hu.common.km}` },
  { value: null, label: hu.onboarding.constraints.targetDistanceNone },
];
const SESSION_DURATION_OPTIONS: readonly number[] = [45, 60, 75, 90];
const EQUIPMENT: readonly EquipmentTier[] = ['full_gym', 'barbell_rack', 'dumbbell_only', 'bodyweight'];

/** Step 2 — Heti beosztás. */
export function StepSchedule() {
  const strengthDaysPerWeek = useOnboardingStore((state) => state.strengthDaysPerWeek);
  const runningDaysPerWeek = useOnboardingStore((state) => state.runningDaysPerWeek);
  const targetRunDistanceKm = useOnboardingStore((state) => state.targetRunDistanceKm);
  const sessionDurationMinutes = useOnboardingStore((state) => state.sessionDurationMinutes);
  const equipment = useOnboardingStore((state) => state.equipment);
  const updateSchedule = useOnboardingStore((state) => state.updateSchedule);
  const setEquipment = useOnboardingStore((state) => state.setEquipment);

  return (
    <View style={styles.container}>
      <Card title={hu.onboarding.schedule.title}>
        <Text style={styles.groupLabel}>{hu.onboarding.schedule.strengthDays}</Text>
        <View style={styles.wrap}>
          {STRENGTH_DAY_OPTIONS.map((days) => (
            <Chip
              key={`strength-${days}`}
              label={`${days} ${hu.onboarding.constraints.daysUnit}`}
              selected={strengthDaysPerWeek === days}
              onPress={() => updateSchedule({ strengthDaysPerWeek: days })}
            />
          ))}
        </View>

        <Text style={styles.groupLabel}>{hu.onboarding.schedule.runningDays}</Text>
        <View style={styles.wrap}>
          {RUNNING_DAY_OPTIONS.map((days) => (
            <Chip
              key={`running-${days}`}
              label={`${days} ${hu.onboarding.constraints.daysUnit}`}
              selected={runningDaysPerWeek === days}
              onPress={() => updateSchedule({ runningDaysPerWeek: days })}
            />
          ))}
        </View>
      </Card>

      <Card title={hu.onboarding.schedule.targetDistance}>
        <View style={styles.wrap}>
          {TARGET_DISTANCE_OPTIONS.map((option) => (
            <Chip
              key={option.label}
              label={option.label}
              selected={targetRunDistanceKm === option.value}
              onPress={() => updateSchedule({ targetRunDistanceKm: option.value })}
            />
          ))}
        </View>
      </Card>

      <Card title={hu.onboarding.schedule.sessionDuration}>
        <View style={styles.wrap}>
          {SESSION_DURATION_OPTIONS.map((minutes) => (
            <Chip
              key={`duration-${minutes}`}
              label={`${minutes} ${hu.common.minutesShort}`}
              selected={sessionDurationMinutes === minutes}
              onPress={() => updateSchedule({ sessionDurationMinutes: minutes })}
            />
          ))}
        </View>
      </Card>

      <Card title={hu.onboarding.equipment.title}>
        <View style={styles.wrap}>
          {EQUIPMENT.map((tier) => (
            <Chip
              key={tier}
              label={hu.onboarding.equipment[tier]}
              selected={equipment === tier}
              onPress={() => setEquipment(tier)}
            />
          ))}
        </View>
      </Card>
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
  groupLabel: {
    marginTop: spacing.sm,
    color: colors.textSecondary,
    fontSize: typography.sizes.xs,
    fontWeight: typography.weights.medium,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
});