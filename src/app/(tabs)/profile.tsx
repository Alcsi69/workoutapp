import { useCallback, useState } from 'react';
import { ActivityIndicator, StyleSheet, Text, View } from 'react-native';
import { router, useFocusEffect } from 'expo-router';
import { Button } from '../../components/Button';
import { Card } from '../../components/Card';
import { Pill } from '../../components/Badge';
import { Screen } from '../../components/Screen';
import { SyncCard } from '../../components/SyncCard';
import { getDatabase } from '../../db/client';
import { getExerciseCatalog, getUserProfile } from '../../db/repository';
import { formatDateHu } from '../../services/format';
import hu from '../../i18n/hu';
import { colors, spacing, typography } from '../../theme/tokens';
import type { JointConstraintSeverity, UserProfile } from '../../types/workout';

interface ProfileData {
  profile: UserProfile | null;
  exerciseNames: Record<string, string>;
}

function severityTone(severity: JointConstraintSeverity): 'danger' | 'warning' | 'neutral' {
  switch (severity) {
    case 'strict_exclude':
      return 'danger';
    case 'avoid_heavy_axial_load':
      return 'warning';
    case 'mild_discomfort':
      return 'neutral';
  }
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <View style={styles.stat}>
      <Text style={styles.statValue}>{value}</Text>
      <Text style={styles.statLabel}>{label}</Text>
    </View>
  );
}

export default function ProfileScreen() {
  const [data, setData] = useState<ProfileData | null>(null);
  const [error, setError] = useState<string | null>(null);

  useFocusEffect(
    useCallback(() => {
      let cancelled = false;
      getDatabase()
        .then(async (db): Promise<ProfileData> => {
          const [profile, catalog] = await Promise.all([
            getUserProfile(db),
            getExerciseCatalog(db),
          ]);
          const exerciseNames: Record<string, string> = {};
          for (const item of catalog) {
            exerciseNames[item.id] = item.nameHu;
          }
          return { profile, exerciseNames };
        })
        .then((next) => {
          if (!cancelled) {
            setData(next);
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

  if (data === null) {
    return (
      <Screen title={hu.screens.profile.title}>
        {error !== null ? (
          <Text style={styles.error}>{error}</Text>
        ) : (
          <ActivityIndicator color={colors.accent} style={styles.loader} />
        )}
      </Screen>
    );
  }

  const { profile, exerciseNames } = data;

  if (profile === null) {
    return (
      <Screen title={hu.screens.profile.title}>
        <Card title={hu.screens.profile.missing} caption={hu.screens.profile.missingHint}>
          <Button
            label={hu.screens.profile.startOnboarding}
            onPress={() => router.replace('/onboarding')}
          />
        </Card>
      </Screen>
    );
  }

  const { biometrics, trainingProfile, constraints } = profile;
  const substitutionEntries = Object.entries(constraints.preferredSubstitutions);

  return (
    <Screen title={hu.screens.profile.title}>
      <Card title={hu.screens.profile.biometrics}>
        <View style={styles.statRow}>
          <Stat
            label={hu.screens.profile.ageUnit}
            value={String(biometrics.age)}
          />
          <Stat label={hu.common.kg} value={String(biometrics.weightKg)} />
          <Stat label="cm" value={String(biometrics.heightCm)} />
        </View>
      </Card>

      <Card>
        <View style={styles.kvRow}>
          <Text style={styles.kvLabel}>{hu.screens.profile.goal}</Text>
          <Text style={styles.kvValue}>{hu.onboarding.goals[trainingProfile.primaryGoal]}</Text>
        </View>
        <View style={styles.kvRow}>
          <Text style={styles.kvLabel}>{hu.screens.profile.experience}</Text>
          <Text style={styles.kvValue}>
            {trainingProfile.experienceMonths} {hu.onboarding.constraints.monthsUnit}
          </Text>
        </View>
        <View style={styles.kvRow}>
          <Text style={styles.kvLabel}>{hu.screens.profile.equipment}</Text>
          <Text style={styles.kvValue}>{hu.onboarding.equipment[trainingProfile.equipment]}</Text>
        </View>
      </Card>

      <Card title={hu.screens.profile.weeklySplit}>
        <View style={styles.statRow}>
          <Stat
            label={hu.screens.profile.strengthSuffix}
            value={`${trainingProfile.strengthDaysPerWeek}×`}
          />
          <Stat
            label={hu.screens.profile.runningSuffix}
            value={`${trainingProfile.runningDaysPerWeek}×`}
          />
          <Stat
            label={hu.screens.profile.targetDistance}
            value={
              trainingProfile.targetRunDistanceKm !== undefined
                ? `${trainingProfile.targetRunDistanceKm} ${hu.common.km}`
                : hu.onboarding.constraints.targetDistanceNone
            }
          />
        </View>
      </Card>

      <Card title={hu.screens.profile.constraints}>
        {constraints.jointLimitations.length === 0 ? (
          <Text style={styles.muted}>{hu.screens.profile.noConstraints}</Text>
        ) : (
          <View style={styles.wrap}>
            {constraints.jointLimitations.map((limitation) => (
              <Pill
                key={limitation.area}
                label={`${hu.onboarding.constraints.areas[limitation.area]} · ${
                  hu.onboarding.constraints.severity[limitation.severity]
                }`}
                tone={severityTone(limitation.severity)}
              />
            ))}
          </View>
        )}
      </Card>

      <Card title={hu.screens.profile.substitutions}>
        {substitutionEntries.length === 0 ? (
          <Text style={styles.muted}>{hu.screens.profile.noSubstitutions}</Text>
        ) : (
          substitutionEntries.map(([from, to]) => (
            <Text key={from} style={styles.substitution}>
              {exerciseNames[from] ?? from} → {exerciseNames[to] ?? to}
            </Text>
          ))
        )}
      </Card>

      <SyncCard />

      <Text style={styles.updated}>
        {hu.screens.profile.updatedAt}: {formatDateHu(profile.updatedAt)}
      </Text>

      <Button
        label={hu.screens.profile.restart}
        variant="secondary"
        onPress={() => router.push('/onboarding')}
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
  statRow: {
    flexDirection: 'row',
    gap: spacing.md,
  },
  stat: {
    flex: 1,
    backgroundColor: colors.surfaceElevated,
    borderRadius: spacing.sm,
    paddingVertical: spacing.md,
    paddingHorizontal: spacing.sm,
    alignItems: 'center',
    gap: 2,
  },
  statValue: {
    color: colors.textPrimary,
    fontSize: typography.sizes.lg,
    fontWeight: typography.weights.semibold,
    fontVariant: ['tabular-nums'],
  },
  statLabel: {
    color: colors.textMuted,
    fontSize: typography.sizes.xs,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  kvRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    gap: spacing.md,
    paddingVertical: spacing.xs,
  },
  kvLabel: {
    color: colors.textSecondary,
    fontSize: typography.sizes.sm,
  },
  kvValue: {
    flexShrink: 1,
    color: colors.textPrimary,
    fontSize: typography.sizes.sm,
    fontWeight: typography.weights.medium,
    textAlign: 'right',
  },
  wrap: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.xs,
  },
  muted: {
    color: colors.textMuted,
    fontSize: typography.sizes.sm,
  },
  substitution: {
    color: colors.textPrimary,
    fontSize: typography.sizes.sm,
  },
  updated: {
    color: colors.textMuted,
    fontSize: typography.sizes.xs,
    textAlign: 'center',
  },
});