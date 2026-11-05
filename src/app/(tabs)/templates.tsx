import { useCallback, useState } from 'react';
import { ActivityIndicator, StyleSheet, Text, View } from 'react-native';
import { router, useFocusEffect } from 'expo-router';
import { Button } from '../../components/Button';
import { Card } from '../../components/Card';
import { Pill, loadTone } from '../../components/Badge';
import { Screen } from '../../components/Screen';
import { ExercisePickerModal } from '../../components/ExercisePickerModal';
import { TemplateEditorModal } from '../../components/templates/TemplateEditorModal';
import { getDatabase } from '../../db/client';
import {
  getExerciseCatalog,
  getWorkoutTemplates,
  startSessionFromTemplate,
} from '../../db/repository';
import { generateProgramFromProfile } from '../../services/routineGenerator';
import { formatRestHu } from '../../services/format';
import hu from '../../i18n/hu';
import { colors, spacing, typography } from '../../theme/tokens';
import type { ExerciseCatalogItem, LoadScore, WorkoutTemplate } from '../../types/workout';

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

function TemplateCard({
  template,
  starting,
  onStart,
}: {
  template: WorkoutTemplate;
  starting: boolean;
  onStart: (template: WorkoutTemplate) => void;
}) {
  return (
    <Card>
      <View style={styles.headerRow}>
        <Text style={styles.title}>{template.title}</Text>
        <Pill
          label={hu.sessionTypes[template.sessionType]}
          tone={template.sessionType === 'running' ? 'accent' : 'success'}
        />
      </View>
      {template.coachNote !== undefined ? (
        <View style={styles.coachNote}>
          <Pill label={hu.screens.templates.coachNoteBadge} tone="accent" />
          <Text style={styles.coachNoteText}>{template.coachNote}</Text>
        </View>
      ) : null}
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

      <Button
        label={hu.screens.templates.start}
        onPress={() => onStart(template)}
        loading={starting}
      />
    </Card>
  );
}

function TemplateGroup({
  title,
  templates,
  startingId,
  onStart,
}: {
  title: string;
  templates: WorkoutTemplate[];
  startingId: string | null;
  onStart: (template: WorkoutTemplate) => void;
}) {
  if (templates.length === 0) {
    return null;
  }
  return (
    <View style={styles.group}>
      <Text style={styles.groupTitle}>{title}</Text>
      {templates.map((template) => (
        <TemplateCard
          key={template.id}
          template={template}
          starting={startingId === template.id}
          onStart={onStart}
        />
      ))}
    </View>
  );
}

export default function TemplatesScreen() {
  const [templates, setTemplates] = useState<WorkoutTemplate[] | null>(null);
  const [catalog, setCatalog] = useState<ExerciseCatalogItem[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [startingId, setStartingId] = useState<string | null>(null);
  const [editorVisible, setEditorVisible] = useState(false);
  const [catalogVisible, setCatalogVisible] = useState(false);
  const [regenerating, setRegenerating] = useState(false);
  const [banner, setBanner] = useState<string | null>(null);

  const loadTemplates = useCallback(async (): Promise<void> => {
    const db = await getDatabase();
    setTemplates(await getWorkoutTemplates(db));
  }, []);

  useFocusEffect(
    useCallback(() => {
      let cancelled = false;
      getDatabase()
        .then(async (db) => {
          const [nextTemplates, nextCatalog] = await Promise.all([
            getWorkoutTemplates(db),
            getExerciseCatalog(db),
          ]);
          if (!cancelled) {
            setTemplates(nextTemplates);
            setCatalog(nextCatalog);
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

  const handleStart = async (template: WorkoutTemplate): Promise<void> => {
    setStartingId(template.id);
    try {
      const db = await getDatabase();
      const sessionId = await startSessionFromTemplate(db, template);
      router.push(`/workout/${sessionId}`);
    } catch (cause: unknown) {
      setError(cause instanceof Error ? cause.message : String(cause));
    } finally {
      setStartingId(null);
    }
  };

  const handleRegenerate = async (): Promise<void> => {
    setRegenerating(true);
    setBanner(null);
    try {
      const db = await getDatabase();
      const result = await generateProgramFromProfile(db);
      await loadTemplates();
      setBanner(
        result.generated ? hu.screens.templates.regenerateDone : hu.screens.templates.regenerateNoProfile,
      );
    } catch (cause: unknown) {
      setError(cause instanceof Error ? cause.message : String(cause));
    } finally {
      setRegenerating(false);
    }
  };

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

  const coach = templates.filter((template) => template.source === 'coach');
  const own = templates.filter((template) => template.source !== 'coach');
  const custom = own.filter((template) => template.source === 'custom');
  const strength = own.filter(
    (template) => template.source !== 'custom' && template.sessionType === 'strength',
  );
  const running = own.filter(
    (template) => template.source !== 'custom' && template.sessionType !== 'strength',
  );

  return (
    <Screen title={hu.tabs.templates} subtitle={hu.screens.templates.subtitle}>
      <Card title={hu.screens.templates.regenerate} caption={hu.screens.templates.regenerateHint}>
        <Button
          label={hu.screens.templates.regenerate}
          onPress={() => {
            void handleRegenerate();
          }}
          loading={regenerating}
        />
        <Button
          label={hu.screens.templates.newTemplate}
          variant="secondary"
          onPress={() => setEditorVisible(true)}
        />
        <Button
          label={hu.screens.templates.browseCatalog}
          variant="secondary"
          onPress={() => setCatalogVisible(true)}
        />
        {banner !== null ? <Text style={styles.banner}>{banner}</Text> : null}
        {error !== null ? <Text style={styles.error}>{error}</Text> : null}
      </Card>

      {templates.length === 0 ? (
        <Card>
          <Text style={styles.meta}>{hu.screens.templates.empty}</Text>
        </Card>
      ) : (
        <>
          <TemplateGroup
            title={hu.screens.templates.coachGroup}
            templates={coach}
            startingId={startingId}
            onStart={handleStart}
          />
          {own.length > 0 ? (
            <Text style={styles.sectionTitle}>{hu.screens.templates.ownGroup}</Text>
          ) : null}
          <TemplateGroup
            title={hu.screens.templates.customGroup}
            templates={custom}
            startingId={startingId}
            onStart={handleStart}
          />
          <TemplateGroup
            title={hu.screens.templates.strengthGroup}
            templates={strength}
            startingId={startingId}
            onStart={handleStart}
          />
          <TemplateGroup
            title={hu.screens.templates.runningGroup}
            templates={running}
            startingId={startingId}
            onStart={handleStart}
          />
        </>
      )}

      <TemplateEditorModal
        visible={editorVisible}
        catalog={catalog}
        onClose={() => setEditorVisible(false)}
        onCreated={() => {
          setEditorVisible(false);
          void loadTemplates();
        }}
      />

      <ExercisePickerModal
        visible={catalogVisible}
        catalog={catalog}
        title={hu.screens.templates.catalogTitle}
        allowCreate={false}
        header={<Text style={styles.catalogCaption}>{hu.screens.templates.catalogCaption}</Text>}
        onClose={() => setCatalogVisible(false)}
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
  catalogCaption: {
    color: colors.textMuted,
    fontSize: typography.sizes.sm,
  },
  banner: {
    color: colors.success,
    fontSize: typography.sizes.sm,
  },
  sectionTitle: {
    marginTop: spacing.lg,
    color: colors.textPrimary,
    fontSize: typography.sizes.md,
    fontWeight: typography.weights.semibold,
  },
  coachNote: {
    flexDirection: 'row',
    alignItems: 'center',
    flexWrap: 'wrap',
    gap: spacing.sm,
    marginTop: spacing.xs,
  },
  coachNoteText: {
    flexShrink: 1,
    color: colors.textSecondary,
    fontSize: typography.sizes.xs,
    fontStyle: 'italic',
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
