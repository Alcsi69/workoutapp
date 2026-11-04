import { useCallback, useState } from 'react';
import { ActivityIndicator, StyleSheet, Text, View } from 'react-native';
import { router, useFocusEffect } from 'expo-router';
import { Button } from '../../components/Button';
import { Card } from '../../components/Card';
import { LoadBadge, Pill } from '../../components/Badge';
import { Screen } from '../../components/Screen';
import { getDatabase } from '../../db/client';
import {
  getActiveSession,
  getWorkoutTemplates,
  getUserProfile,
  startSessionFromTemplate,
} from '../../db/repository';
import type { ActiveSessionSummary } from '../../db/repository';
import { pickRecommendedSession } from '../../services/recommendation';
import { formatTodayHu } from '../../services/format';
import hu from '../../i18n/hu';
import { colors, spacing, typography } from '../../theme/tokens';
import type {
  JointConstraintSeverity,
  LoadScore,
  UserProfile,
  WorkoutTemplate,
} from '../../types/workout';

interface HomeData {
  profile: UserProfile | null;
  templates: WorkoutTemplate[];
  active: ActiveSessionSummary | null;
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

/** Highest knee/axial score in a template, for the at-a-glance load row. */
function peakLoad(template: WorkoutTemplate): { knee: LoadScore; axial: LoadScore } {
  return template.exercises.reduce<{ knee: LoadScore; axial: LoadScore }>(
    (peak, block) => ({
      knee: Math.max(peak.knee, block.exercise.kneeStressScore) as LoadScore,
      axial: Math.max(peak.axial, block.exercise.axialLoadScore) as LoadScore,
    }),
    { knee: 1, axial: 1 },
  );
}

export default function WorkoutHomeScreen() {
  const [data, setData] = useState<HomeData | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [starting, setStarting] = useState<boolean>(false);

  const load = useCallback(async (): Promise<HomeData> => {
    const db = await getDatabase();
    const [profile, templates, active] = await Promise.all([
      getUserProfile(db),
      getWorkoutTemplates(db),
      getActiveSession(db),
    ]);
    return { profile, templates, active };
  }, []);

  useFocusEffect(
    useCallback(() => {
      let cancelled = false;
      load()
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
    }, [load]),
  );

  const handleStart = async (template: WorkoutTemplate): Promise<void> => {
    setStarting(true);
    try {
      const db = await getDatabase();
      const sessionId = await startSessionFromTemplate(db, template);
      router.push(`/workout/${sessionId}`);
    } catch (cause: unknown) {
      setError(cause instanceof Error ? cause.message : String(cause));
    } finally {
      setStarting(false);
    }
  };

  if (data === null) {
    return (
      <Screen title={hu.tabs.workout} subtitle={formatTodayHu()}>
        {error !== null ? (
          <Text style={styles.error}>{error}</Text>
        ) : (
          <ActivityIndicator color={colors.accent} style={styles.loader} />
        )}
      </Screen>
    );
  }

  const { profile, templates, active } = data;

  if (profile === null) {
    return (
      <Screen title={hu.tabs.workout} subtitle={formatTodayHu()}>
        <Card title={hu.screens.profile.missing} caption={hu.screens.profile.missingHint}>
          <Button
            label={hu.screens.profile.startOnboarding}
            onPress={() => router.replace('/onboarding')}
          />
        </Card>
      </Screen>
    );
  }

  const recommended = pickRecommendedSession(templates, profile);
  const peak = recommended !== null ? peakLoad(recommended.template) : null;

  return (
    <Screen title={hu.tabs.workout} subtitle={formatTodayHu()}>
      {active !== null ? (
        <Card
          tone="accent"
          title={hu.screens.home.activeSession}
          caption={`${hu.status.inProgress} · ${hu.screens.home.activeSessionHint}`}
        >
          <Text style={styles.sessionTitle}>{active.title}</Text>
          <Text style={styles.muted}>
            {active.exerciseCount} {hu.screens.home.blocksLabel}
          </Text>
          <Button
            label={hu.screens.home.resume}
            onPress={() => router.push(`/workout/${active.id}`)}
          />
        </Card>
      ) : null}

      {recommended === null ? (
        <Card title={hu.screens.home.restDay} caption={hu.tabs.templates}>
          <Text style={styles.bodyText}>{hu.screens.home.restDayHint}</Text>
          <Button
            label={hu.screens.home.openTemplates}
            variant="secondary"
            onPress={() => router.push('/(tabs)/templates')}
          />
        </Card>
      ) : (
        <Card title={hu.screens.home.recommended} caption={hu.screens.home.quickStart}>
          <View style={styles.pillRow}>
            <Pill
              label={hu.sessionTypes[recommended.template.sessionType]}
              tone={recommended.slot === 'running' ? 'accent' : 'success'}
            />
            {peak !== null ? (
              <>
                <LoadBadge label={hu.screens.load.kneeShort} score={peak.knee} />
                <LoadBadge label={hu.screens.load.axialShort} score={peak.axial} />
              </>
            ) : null}
          </View>

          <Text style={styles.sessionTitle}>{recommended.template.title}</Text>

          <View style={styles.blockList}>
            {recommended.template.exercises.map((block) => (
              <View key={block.id} style={styles.blockRow}>
                <Text style={styles.blockName}>{block.exercise.nameHu}</Text>
                <Text style={styles.blockTarget}>
                  {block.targetSets ?? 1} × {block.targetReps ?? '—'}
                </Text>
              </View>
            ))}
          </View>

          <Button
            label={hu.screens.home.quickStart}
            onPress={() => {
              void handleStart(recommended.template);
            }}
            loading={starting}
          />
        </Card>
      )}

      <Card title={hu.screens.home.constraintsTitle}>
        {profile.constraints.jointLimitations.length === 0 ? (
          <Text style={styles.muted}>{hu.screens.home.noConstraints}</Text>
        ) : (
          <View style={styles.pillRow}>
            {profile.constraints.jointLimitations.map((limitation) => (
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
  sessionTitle: {
    color: colors.textPrimary,
    fontSize: typography.sizes.xl,
    fontWeight: typography.weights.semibold,
  },
  bodyText: {
    color: colors.textSecondary,
    fontSize: typography.sizes.sm,
    lineHeight: typography.sizes.sm * typography.lineHeights.relaxed,
  },
  muted: {
    color: colors.textMuted,
    fontSize: typography.sizes.sm,
  },
  pillRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.xs,
  },
  blockList: {
    gap: spacing.xs,
  },
  blockRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    gap: spacing.md,
  },
  blockName: {
    flex: 1,
    color: colors.textPrimary,
    fontSize: typography.sizes.sm,
  },
  blockTarget: {
    color: colors.textSecondary,
    fontSize: typography.sizes.sm,
    fontVariant: ['tabular-nums'],
  },
});