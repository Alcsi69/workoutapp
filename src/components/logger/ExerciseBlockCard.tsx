import { useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { LoadBadge, Pill } from '../Badge';
import { NumberInput } from './NumberInput';
import { RpeSelector, SetTypeSelector } from './Selectors';
import { formatRestHu } from '../../services/format';
import hu from '../../i18n/hu';
import { colors, radius, spacing, typography } from '../../theme/tokens';
import type { SetType, SessionExerciseBlock } from '../../types/workout';

/** Local, editable draft of one set row (raw text until persisted). */
export interface SetDraft {
  key: string;
  setNumber: number;
  setType: SetType;
  weight: string;
  reps: string;
  rpe: number | null;
  /** Persisted set id once completed, else null. */
  setLogId: string | null;
  completed: boolean;
}

function emptyDraft(blockId: string, setNumber: number, setType: SetType): SetDraft {
  return {
    key: `${blockId}:${setNumber}`,
    setNumber,
    setType,
    weight: '',
    reps: '',
    rpe: null,
    setLogId: null,
    completed: false,
  };
}

/** Logged sets first (completed), then empty rows up to the target set count. */
function buildInitialDrafts(block: SessionExerciseBlock): SetDraft[] {
  const drafts: SetDraft[] = block.sets.map((set) => ({
    key: `${block.id}:${set.setNumber}`,
    setNumber: set.setNumber,
    setType: set.setType,
    weight: String(set.actualWeightKg),
    reps: String(set.actualReps),
    rpe: set.rpe ?? null,
    setLogId: set.id,
    completed: true,
  }));

  const target = block.targetSets ?? drafts.length;
  const maxNumber = drafts.reduce((max, draft) => Math.max(max, draft.setNumber), 0);
  const total = Math.max(target, maxNumber);
  const lastType = drafts.length > 0 ? drafts[drafts.length - 1].setType : 'working';
  for (let setNumber = maxNumber + 1; setNumber <= total; setNumber += 1) {
    drafts.push(emptyDraft(block.id, setNumber, lastType));
  }
  return drafts;
}

interface ExerciseBlockCardProps {
  block: SessionExerciseBlock;
  /** Persists a set (create or edit); resolves with the stored set id. */
  onPersistSet: (block: SessionExerciseBlock, draft: SetDraft) => Promise<string>;
  onDeleteSet: (draft: SetDraft) => Promise<void>;
  onSubstitute: (block: SessionExerciseBlock) => void;
}

/**
 * One exercise block in the logger: header (target reps, knee/axial badges,
 * substitute action) plus an editable row per set. Draft state lives here so
 * typing stays responsive; every completion writes straight through to SQLite.
 */
export function ExerciseBlockCard({
  block,
  onPersistSet,
  onDeleteSet,
  onSubstitute,
}: ExerciseBlockCardProps) {
  const [drafts, setDrafts] = useState<SetDraft[]>(() => buildInitialDrafts(block));
  const [busyKey, setBusyKey] = useState<string | null>(null);

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
      return [...previous, emptyDraft(block.id, maxNumber + 1, lastType)];
    });
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
        <Pressable
          accessibilityRole="button"
          onPress={() => onSubstitute(block)}
          style={({ pressed }) => [styles.substituteButton, pressed ? styles.pressed : null]}
        >
          <Text style={styles.substituteLabel}>{hu.logger.substitution}</Text>
        </Pressable>
      </View>

      <View style={styles.setList}>
        {drafts.map((draft) => (
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
        ))}
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
