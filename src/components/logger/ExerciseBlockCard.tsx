import { useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { LoadBadge, Pill } from '../Badge';
import { NumberInput } from './NumberInput';
import { RpeSelector, SetTypeSelector } from './Selectors';
import {
  formatDateHu,
  formatOneRepMaxKg,
  formatRestHu,
  formatWeightKg,
} from '../../services/format';
import { computeNextTargetHint } from '../../services/analytics';
import {
  buildInitialDrafts,
  emptyDraft,
  exactPreviousSet,
  findPersonalRecords,
  prefillValues,
} from '../../services/loggerDrafts';
import type { SetDraft } from '../../services/loggerDrafts';
import hu from '../../i18n/hu';
import { colors, radius, spacing, typography } from '../../theme/tokens';
import type {
  LastPerformance,
  PreviousPerformanceSet,
  SessionExerciseBlock,
  TrainingGoal,
} from '../../types/workout';

export type { SetDraft };

const NO_PREVIOUS_SETS: readonly PreviousPerformanceSet[] = [];

/** "80 kg × 5 @8" — one previous set, compact enough for a summary line. */
function describePreviousSet(set: PreviousPerformanceSet): string {
  const rpe = set.rpe === undefined ? '' : ` @${set.rpe}`;
  return `${formatWeightKg(set.actualWeightKg)} × ${set.actualReps}${rpe}`;
}

interface ExerciseBlockCardProps {
  block: SessionExerciseBlock;
  /** Last session's sets plus the all-time best 1RM, when the exercise has history. */
  lastPerformance?: LastPerformance;
  /** Drives the progressive overload ceiling; defaults to the seeded program's goal. */
  primaryGoal?: TrainingGoal;
  /** Persists a set (create or edit); resolves with the stored set id. */
  onPersistSet: (block: SessionExerciseBlock, draft: SetDraft) => Promise<string>;
  onDeleteSet: (draft: SetDraft) => Promise<void>;
  onSubstitute: (block: SessionExerciseBlock) => void;
}

/**
 * One exercise block in the logger: header (target reps, knee/axial badges,
 * substitute action), the "Előző edzés" memory for this exercise (last sets, a
 * progressive overload suggestion, all-time best 1RM, and a one-tap prefill),
 * and an editable row per set with an "Új PR!" badge. Draft state lives here so
 * typing stays responsive; every completion writes straight through to SQLite.
 */
export function ExerciseBlockCard({
  block,
  lastPerformance,
  primaryGoal = 'powerbuilding',
  onPersistSet,
  onDeleteSet,
  onSubstitute,
}: ExerciseBlockCardProps) {
  const previousSets = lastPerformance?.sets ?? NO_PREVIOUS_SETS;
  const [drafts, setDrafts] = useState<SetDraft[]>(() =>
    buildInitialDrafts(block, previousSets),
  );
  const [busyKey, setBusyKey] = useState<string | null>(null);

  const hint = computeNextTargetHint(previousSets, primaryGoal, block.targetReps);
  const personalRecords = findPersonalRecords(drafts, lastPerformance?.bestOneRepMaxKg ?? 0);

  const patchDraft = (key: string, patch: Partial<SetDraft>): void => {
    setDrafts((previous) =>
      previous.map((draft) => (draft.key === key ? { ...draft, ...patch } : draft)),
    );
  };

  const persistCompleted = async (draft: SetDraft): Promise<void> => {
    if (!draft.completed || draft.setLogId === null) {
      return;
    }
    await onPersistSet(block, draft);
  };

  const handleToggle = async (draft: SetDraft): Promise<void> => {
    if (busyKey !== null) {
      return;
    }
    setBusyKey(draft.key);
    try {
      if (!draft.completed) {
        const setLogId = await onPersistSet(block, draft);
        patchDraft(draft.key, { completed: true, setLogId });
      } else if (draft.setLogId !== null) {
        await onDeleteSet(draft);
        patchDraft(draft.key, { completed: false, setLogId: null });
      }
    } finally {
      setBusyKey(null);
    }
  };

  /** Updates a field and, when the row is already logged, re-persists it. */
  const applyAndPersist = (draft: SetDraft, patch: Partial<SetDraft>): void => {
    const next = { ...draft, ...patch };
    patchDraft(draft.key, patch);
    void persistCompleted(next);
  };

  const addSet = (): void => {
    setDrafts((previous) => {
      const maxNumber = previous.reduce((max, draft) => Math.max(max, draft.setNumber), 0);
      const lastType = previous.length > 0 ? previous[previous.length - 1].setType : 'working';
      const draft = emptyDraft(block.id, maxNumber + 1, lastType);
      const prefill = prefillValues(maxNumber + 1, previousSets);
      return [...previous, prefill === null ? draft : { ...draft, ...prefill }];
    });
  };

  /** Re-applies last session's weight/reps to every row that is not logged yet. */
  const loadPreviousSession = (): void => {
    if (previousSets.length === 0) {
      return;
    }
    setDrafts((previous) =>
      previous.map((draft) => {
        if (draft.completed) {
          return draft;
        }
        const prefill = prefillValues(draft.setNumber, previousSets);
        return prefill === null ? draft : { ...draft, weight: prefill.weight, reps: prefill.reps };
      }),
    );
  };

  const target = `${block.targetSets ?? 1} × ${block.targetReps ?? '—'}`;

  return (
    <View style={styles.card}>
      <View style={styles.header}>
        <View style={styles.headerTop}>
          <Text style={styles.exerciseName}>{block.exercise.nameHu}</Text>
          <Text style={styles.target}>{target}</Text>
        </View>
        <View style={styles.badgeRow}>
          <LoadBadge label={hu.screens.load.kneeShort} score={block.exercise.kneeStressScore} />
          <LoadBadge label={hu.screens.load.axialShort} score={block.exercise.axialLoadScore} />
          {block.substitutedFromExerciseId !== undefined ? (
            <Pill label={hu.logger.replacedFrom} tone="warning" />
          ) : null}
          {block.restSeconds > 0 ? (
            <Pill label={`${hu.screens.templates.restShort} ${formatRestHu(block.restSeconds)}`} />
          ) : null}
        </View>
        {block.notes !== undefined ? <Text style={styles.note}>{block.notes}</Text> : null}

        <View style={styles.previousBox}>
          {lastPerformance === undefined ? (
            <Text style={styles.previousEmpty}>{hu.logger.previousNoHistory}</Text>
          ) : (
            <>
              <Text style={styles.previousTitle}>
                {hu.logger.previousSession} · {formatDateHu(lastPerformance.completedAt)}
              </Text>
              <Text style={styles.previousSets}>
                {lastPerformance.sets.map(describePreviousSet).join('  ·  ')}
              </Text>
              <Text style={styles.previousBest}>
                {hu.logger.bestOneRepMax}: {formatOneRepMaxKg(lastPerformance.bestOneRepMaxKg)}
              </Text>
              {hint !== null ? (
                <View style={styles.hintRow}>
                  <Pill
                    label={`${hu.logger.hint}: ${formatWeightKg(hint.weightKg)} × ${hint.reps}`}
                    tone="accent"
                  />
                </View>
              ) : null}
              {hint !== null ? (
                <Text style={styles.hintReason}>{hu.logger.hintReasons[hint.reason]}</Text>
              ) : null}
              <Pressable
                accessibilityRole="button"
                onPress={loadPreviousSession}
                style={({ pressed }) => [styles.prefillButton, pressed ? styles.pressed : null]}
              >
                <Text style={styles.prefillLabel}>{hu.logger.previousPrefill}</Text>
              </Pressable>
            </>
          )}
        </View>

        <Pressable
          accessibilityRole="button"
          onPress={() => onSubstitute(block)}
          style={({ pressed }) => [styles.substituteButton, pressed ? styles.pressed : null]}
        >
          <Text style={styles.substituteLabel}>{hu.logger.substitution}</Text>
        </Pressable>
      </View>

      <View style={styles.setList}>
        {drafts.map((draft) => {
          const previous = exactPreviousSet(draft.setNumber, previousSets);
          const prOneRepMaxKg = personalRecords[draft.key];
          return (
            <View key={draft.key} style={[styles.setRow, draft.completed ? styles.setRowDone : null]}>
              <View style={styles.setHead}>
                <Text style={styles.setTitle}>
                  {draft.setNumber}. {hu.logger.set}
                </Text>
                <Pressable
                  accessibilityRole="checkbox"
                  accessibilityState={{ checked: draft.completed, busy: busyKey === draft.key }}
                  onPress={() => {
                    void handleToggle(draft);
                  }}
                  style={({ pressed }) => [
                    styles.checkbox,
                    draft.completed ? styles.checkboxOn : null,
                    pressed ? styles.pressed : null,
                  ]}
                >
                  <Text style={styles.checkboxMark}>{draft.completed ? '✓' : ''}</Text>
                </Pressable>
              </View>

              {previous !== null ? (
                <Text style={styles.previousBadge}>
                  {hu.logger.previous}: {describePreviousSet(previous)}
                </Text>
              ) : null}

              {prOneRepMaxKg !== undefined ? (
                <View style={styles.prRow}>
                  <Pill
                    label={`${hu.logger.newPr} (${hu.logger.estimatedOneRepMax}: ${formatOneRepMaxKg(
                      prOneRepMaxKg,
                    )})`}
                    tone="success"
                  />
                </View>
              ) : null}

              <SetTypeSelector
                value={draft.setType}
                onChange={(setType) => applyAndPersist(draft, { setType })}
              />

              <View style={styles.inputRow}>
                <NumberInput
                  label={hu.logger.weight}
                  value={draft.weight}
                  unit={hu.common.kg}
                  placeholder="0"
                  allowDecimal
                  onChangeText={(weight) => patchDraft(draft.key, { weight })}
                  onCommit={() => {
                    void persistCompleted(draft);
                  }}
                />
                <NumberInput
                  label={hu.logger.reps}
                  value={draft.reps}
                  unit={hu.logger.repsShort}
                  placeholder="0"
                  onChangeText={(reps) => patchDraft(draft.key, { reps })}
                  onCommit={() => {
                    void persistCompleted(draft);
                  }}
                />
              </View>

              <RpeSelector value={draft.rpe} onChange={(rpe) => applyAndPersist(draft, { rpe })} />
            </View>
          );
        })}
      </View>

      <Pressable
        accessibilityRole="button"
        onPress={addSet}
        style={({ pressed }) => [styles.addButton, pressed ? styles.pressed : null]}
      >
        <Text style={styles.addLabel}>+ {hu.logger.addSet}</Text>
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: colors.surface,
    borderColor: colors.border,
    borderWidth: 1,
    borderRadius: radius.lg,
    padding: spacing.lg,
    gap: spacing.md,
  },
  header: {
    gap: spacing.sm,
  },
  headerTop: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: spacing.sm,
  },
  exerciseName: {
    flex: 1,
    color: colors.textPrimary,
    fontSize: typography.sizes.lg,
    fontWeight: typography.weights.semibold,
  },
  target: {
    color: colors.accent,
    fontSize: typography.sizes.md,
    fontWeight: typography.weights.semibold,
    fontVariant: ['tabular-nums'],
  },
  badgeRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.xs,
  },
  note: {
    color: colors.textMuted,
    fontSize: typography.sizes.xs,
    fontStyle: 'italic',
  },
  previousBox: {
    backgroundColor: colors.surfaceElevated,
    borderColor: colors.border,
    borderWidth: 1,
    borderRadius: radius.md,
    padding: spacing.md,
    gap: spacing.xs,
  },
  previousTitle: {
    color: colors.textSecondary,
    fontSize: typography.sizes.xs,
    fontWeight: typography.weights.semibold,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  previousSets: {
    color: colors.textPrimary,
    fontSize: typography.sizes.sm,
    fontVariant: ['tabular-nums'],
  },
  previousBest: {
    color: colors.textMuted,
    fontSize: typography.sizes.xs,
    fontVariant: ['tabular-nums'],
  },
  previousEmpty: {
    color: colors.textMuted,
    fontSize: typography.sizes.xs,
  },
  hintRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.xs,
  },
  hintReason: {
    color: colors.textSecondary,
    fontSize: typography.sizes.xs,
  },
  prefillButton: {
    alignSelf: 'flex-start',
    marginTop: spacing.xs,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.borderStrong,
    backgroundColor: colors.surfaceInput,
  },
  prefillLabel: {
    color: colors.textSecondary,
    fontSize: typography.sizes.sm,
    fontWeight: typography.weights.medium,
  },
  substituteButton: {
    alignSelf: 'flex-start',
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.borderStrong,
    backgroundColor: colors.surfaceElevated,
  },
  substituteLabel: {
    color: colors.textSecondary,
    fontSize: typography.sizes.sm,
    fontWeight: typography.weights.medium,
  },
  setList: {
    gap: spacing.sm,
  },
  setRow: {
    backgroundColor: colors.surfaceInput,
    borderColor: colors.border,
    borderWidth: 1,
    borderRadius: radius.md,
    padding: spacing.md,
    gap: spacing.sm,
  },
  setRowDone: {
    borderColor: colors.success,
  },
  setHead: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  setTitle: {
    color: colors.textSecondary,
    fontSize: typography.sizes.sm,
    fontWeight: typography.weights.semibold,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  previousBadge: {
    color: colors.textMuted,
    fontSize: typography.sizes.xs,
    fontVariant: ['tabular-nums'],
  },
  prRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
  },
  checkbox: {
    width: 32,
    height: 32,
    borderRadius: radius.sm,
    borderWidth: 1,
    borderColor: colors.borderStrong,
    backgroundColor: colors.surface,
    alignItems: 'center',
    justifyContent: 'center',
  },
  checkboxOn: {
    backgroundColor: colors.success,
    borderColor: colors.success,
  },
  checkboxMark: {
    color: colors.textInverse,
    fontSize: typography.sizes.md,
    fontWeight: typography.weights.bold,
  },
  inputRow: {
    flexDirection: 'row',
    gap: spacing.md,
  },
  addButton: {
    alignSelf: 'flex-start',
    paddingVertical: spacing.sm,
    paddingHorizontal: spacing.md,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.border,
    borderStyle: 'dashed',
  },
  addLabel: {
    color: colors.textSecondary,
    fontSize: typography.sizes.sm,
    fontWeight: typography.weights.medium,
  },
  pressed: {
    opacity: 0.8,
  },
});
