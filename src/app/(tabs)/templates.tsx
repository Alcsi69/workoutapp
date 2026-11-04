import { useCallback, useState } from 'react';
import { ActivityIndicator, StyleSheet, Text, View } from 'react-native';
import { useFocusEffect } from 'expo-router';
import { Card } from '../../components/Card';
import { Pill, loadTone } from '../../components/Badge';
import { Screen } from '../../components/Screen';
import { getDatabase } from '../../db/client';
import { getWorkoutTemplates } from '../../db/repository';
import { formatRestHu } from '../../services/format';
import hu from '../../i18n/hu';
import { colors, spacing, typography } from '../../theme/tokens';
import type { LoadScore, WorkoutTemplate } from '../../types/workout';

function loadColor(score: LoadScore): string {
  const tone = loadTone(score);
  if (tone === 'danger') {
    return colors.danger;
  }
  if (tone === 'warning') {
    return colors.warning;
  }
  return colors.textMuted;
}

function TemplateCard({ template }: { template: WorkoutTemplate }) {
  return (
    <Card>
      <View style={styles.headerRow}>
        <Text style={styles.title}>{template.title}</Text>
        <Pill
          label={hu.sessionTypes[template.sessionType]}
          tone={template.sessionType === 'running' ? 'accent' : 'success'}
        />
      </View>
      <Text style={styles.caption}>
        {template.exercises.length} {hu.screens.templates.exerciseCount}
      </Text>

      <View style={styles.blockList}>
        {template.exercises.map((block) => (
          <View key={block.id} style={styles.block}>
            <View style={styles.blockHeadRow}>
              <Text style={styles.blockName}>{block.exercise.nameHu}</Text>
              <Text style={styles.blockTarget}>
                {block.targetSets ?? 1} × {block.targetReps ?? '—'}
              </Text>
            </View>
            <View style={styles.blockMetaRow}>
              {block.restSeconds > 0 ? (
                <Text style={styles.meta}>
                  {hu.screens.templates.restShort} {formatRestHu(block.restSeconds)}
                </Text>
              ) : null}
              <Text style={[styles.meta, { color: loadColor(block.exercise.kneeStressScore) }]}>
                {hu.screens.load.kneeShort} {block.exercise.kneeStressScore}/5
              </Text>
              <Text style={[styles.meta, { color: loadColor(block.exercise.axialLoadScore) }]}>
                {hu.screens.load.axialShort} {block.exercise.axialLoadScore}/5
              </Text>
            </View>
            {block.notes !== undefined ? <Text style={styles.note}>{block.notes}</Text> : null}
          </View>
        ))}
      </View>
    </Card>
  );
}

function TemplateGroup({ title, templates }: { title: string; templates: WorkoutTemplate[] }) {
  if (templates.length === 0) {
    return null;
  }
  return (
    <View style={styles.group}>
      <Text style={styles.groupTitle}>{title}</Text>
      {templates.map((template) => (
        <TemplateCard key={template.id} template={template} />
      ))}
    </View>
  );
}

export default function TemplatesScreen() {
  const [templates, setTemplates] = useState<WorkoutTemplate[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  useFocusEffect(
    useCallback(() => {
      let cancelled = false;
      getDatabase()
        .then((db) => getWorkoutTemplates(db))
        .then((next) => {
          if (!cancelled) {
            setTemplates(next);
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

  if (templates === null) {
    return (
      <Screen title={hu.tabs.templates} subtitle={hu.screens.templates.subtitle}>
        {error !== null ? (
          <Text style={styles.error}>{error}</Text>
        ) : (
          <ActivityIndicator color={colors.accent} style={styles.loader} />
        )}
      </Screen>
    );
  }

  const strength = templates.filter((template) => template.sessionType === 'strength');
  const running = templates.filter((template) => template.sessionType !== 'strength');

  return (
    <Screen title={hu.tabs.templates} subtitle={hu.screens.templates.subtitle}>
      {templates.length === 0 ? (
        <Card>
          <Text style={styles.meta}>{hu.screens.templates.empty}</Text>
        </Card>
      ) : (
        <>
          <TemplateGroup title={hu.screens.templates.strengthGroup} templates={strength} />
          <TemplateGroup title={hu.screens.templates.runningGroup} templates={running} />
        </>
      )}
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
  group: {
    gap: spacing.md,
  },
  groupTitle: {
    marginTop: spacing.sm,
    color: colors.textSecondary,
    fontSize: typography.sizes.xs,
    fontWeight: typography.weights.semibold,
    textTransform: 'uppercase',
    letterSpacing: 0.8,
  },
  headerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: spacing.sm,
  },
  title: {
    flex: 1,
    color: colors.textPrimary,
    fontSize: typography.sizes.lg,
    fontWeight: typography.weights.semibold,
  },
  caption: {
    color: colors.textMuted,
    fontSize: typography.sizes.xs,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  blockList: {
    marginTop: spacing.sm,
    gap: spacing.md,
  },
  block: {
    borderTopWidth: 1,
    borderTopColor: colors.border,
    paddingTop: spacing.sm,
    gap: 2,
  },
  blockHeadRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: spacing.sm,
  },
  blockName: {
    flex: 1,
    color: colors.textPrimary,
    fontSize: typography.sizes.md,
  },
  blockTarget: {
    color: colors.accent,
    fontSize: typography.sizes.sm,
    fontWeight: typography.weights.semibold,
    fontVariant: ['tabular-nums'],
  },
  blockMetaRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.md,
  },
  meta: {
    color: colors.textMuted,
    fontSize: typography.sizes.xs,
  },
  note: {
    marginTop: 2,
    color: colors.textMuted,
    fontSize: typography.sizes.xs,
    fontStyle: 'italic',
  },
});