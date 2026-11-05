import { useRef, useState } from 'react';
import {
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { Chip } from '../Badge';
import { Button } from '../Button';
import { ExercisePickerModal } from '../ExercisePickerModal';
import { NumberInput } from '../logger/NumberInput';
import { getDatabase } from '../../db/client';
import { createCustomTemplate } from '../../db/repository';
import hu from '../../i18n/hu';
import { colors, radius, spacing, typography } from '../../theme/tokens';
import type {
  ExerciseCatalogItem,
  SessionType,
  WorkoutTemplate,
} from '../../types/workout';

const SESSION_TYPES: readonly SessionType[] = ['strength', 'running', 'hybrid'];

interface DraftBlock {
  key: string;
  exerciseId: string;
  sets: string;
  reps: string;
  rest: string;
}

function toPositiveIntOrUndefined(raw: string): number | undefined {
  const value = Number.parseInt(raw, 10);
  return Number.isFinite(value) && value > 0 ? value : undefined;
}

interface TemplateEditorModalProps {
  visible: boolean;
  /** Full catalog the user can pick exercises from. */
  catalog: ExerciseCatalogItem[];
  onClose: () => void;
  onCreated: (template: WorkoutTemplate) => void;
}

/**
 * "Új sablon" flow: name the template, pick a session type, add catalog
 * exercises with set/rep/rest prescriptions, and persist via createCustomTemplate.
 */
export function TemplateEditorModal({
  visible,
  catalog,
  onClose,
  onCreated,
}: TemplateEditorModalProps) {
  const [title, setTitle] = useState('');
  const [sessionType, setSessionType] = useState<SessionType>('strength');
  const [blocks, setBlocks] = useState<DraftBlock[]>([]);
  const [pickerVisible, setPickerVisible] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const counter = useRef(0);

  const nameById = new Map(catalog.map((item) => [item.id, item.nameHu]));

  const reset = (): void => {
    setTitle('');
    setSessionType('strength');
    setBlocks([]);
    setError(null);
  };

  const close = (): void => {
    reset();
    onClose();
  };

  const addExercise = (exerciseId: string): void => {
    counter.current += 1;
    setBlocks((current) => [
      ...current,
      {
        key: `${exerciseId}_${counter.current}`,
        exerciseId,
        sets: '3',
        reps: '8-10',
        rest: '90',
      },
    ]);
    setPickerVisible(false);
  };

  const updateBlock = (key: string, patch: Partial<DraftBlock>): void => {
    setBlocks((current) =>
      current.map((block) => (block.key === key ? { ...block, ...patch } : block)),
    );
  };

  const removeBlock = (key: string): void => {
    setBlocks((current) => current.filter((block) => block.key !== key));
  };

  const handleSave = async (): Promise<void> => {
    if (title.trim().length === 0) {
      setError(hu.templateEditor.nameRequired);
      return;
    }
    if (blocks.length === 0) {
      setError(hu.templateEditor.needsExercise);
      return;
    }
    setSaving(true);
    setError(null);
    try {
      const db = await getDatabase();
      const created = await createCustomTemplate(db, {
        title: title.trim(),
        sessionType,
        blocks: blocks.map((block) => {
          const reps = block.reps.trim();
          return {
            exerciseId: block.exerciseId,
            targetSets: toPositiveIntOrUndefined(block.sets),
            targetReps: reps.length > 0 ? reps : undefined,
            restSeconds: toPositiveIntOrUndefined(block.rest),
          };
        }),
      });
      onCreated(created);
      reset();
    } catch (cause: unknown) {
      setError(cause instanceof Error ? cause.message : String(cause));
    } finally {
      setSaving(false);
    }
  };

  return (
    <>
      <Modal visible={visible} transparent animationType="slide" onRequestClose={close}>
        {/* Backdrop is a sibling of the sheet so it never steals scroll gestures. */}
        <View style={styles.overlay}>
          <Pressable
            style={StyleSheet.absoluteFill}
            onPress={close}
            accessibilityRole="button"
            accessibilityLabel={hu.templateEditor.cancel}
          />

          {/* Claims taps that miss the children so they never close via backdrop. */}
          <View style={styles.sheet} onStartShouldSetResponder={() => true}>
          <View style={styles.headerRow}>
            <Text style={styles.title}>{hu.templateEditor.title}</Text>
            <Pressable accessibilityRole="button" onPress={close} style={styles.closeButton}>
              <Text style={styles.closeLabel}>{hu.templateEditor.cancel}</Text>
            </Pressable>
          </View>

          <ScrollView
            style={styles.body}
            contentContainerStyle={styles.bodyContent}
            nestedScrollEnabled
            keyboardShouldPersistTaps="handled"
            keyboardDismissMode="on-drag"
            showsVerticalScrollIndicator={false}
          >
            <Text style={styles.label}>{hu.templateEditor.nameLabel}</Text>
            <TextInput
              value={title}
              onChangeText={setTitle}
              placeholder={hu.templateEditor.namePlaceholder}
              placeholderTextColor={colors.textMuted}
              selectionColor={colors.accent}
              style={styles.input}
            />

            <Text style={styles.label}>{hu.templateEditor.sessionTypeLabel}</Text>
            <View style={styles.chipRow}>
              {SESSION_TYPES.map((type) => (
                <Chip
                  key={type}
                  label={hu.sessionTypes[type]}
                  selected={sessionType === type}
                  onPress={() => setSessionType(type)}
                />
              ))}
            </View>

            <Text style={styles.label}>{hu.templateEditor.exercisesLabel}</Text>
            {blocks.length === 0 ? (
              <Text style={styles.muted}>{hu.templateEditor.empty}</Text>
            ) : (
              blocks.map((block) => (
                <View key={block.key} style={styles.blockCard}>
                  <View style={styles.blockHead}>
                    <Text style={styles.blockName}>
                      {nameById.get(block.exerciseId) ?? block.exerciseId}
                    </Text>
                    <Pressable
                      accessibilityRole="button"
                      onPress={() => removeBlock(block.key)}
                      style={styles.removeButton}
                    >
                      <Text style={styles.removeLabel}>{hu.templateEditor.remove}</Text>
                    </Pressable>
                  </View>
                  <View style={styles.blockFields}>
                    <NumberInput
                      label={hu.templateEditor.setsLabel}
                      value={block.sets}
                      onChangeText={(text) => updateBlock(block.key, { sets: text })}
                    />
                    <View style={styles.repsField}>
                      <Text style={styles.label}>{hu.templateEditor.repsLabel}</Text>
                      <TextInput
                        value={block.reps}
                        onChangeText={(text) => updateBlock(block.key, { reps: text })}
                        placeholder="8-10"
                        placeholderTextColor={colors.textMuted}
                        selectionColor={colors.accent}
                        style={styles.input}
                      />
                    </View>
                    <NumberInput
                      label={hu.templateEditor.restLabel}
                      value={block.rest}
                      onChangeText={(text) => updateBlock(block.key, { rest: text })}
                      unit={hu.common.secondsShort}
                    />
                  </View>
                </View>
              ))
            )}

            <Button
              label={hu.templateEditor.addExercise}
              variant="secondary"
              onPress={() => setPickerVisible(true)}
            />

            {error !== null ? <Text style={styles.error}>{error}</Text> : null}

            <Button
              label={hu.templateEditor.save}
              onPress={() => {
                void handleSave();
              }}
              loading={saving}
            />
          </ScrollView>
          </View>
        </View>
      </Modal>

      {/*
       * Rendered as a SIBLING of the editor's Modal: nesting a Modal inside
       * another Modal is unreliable on Android. When this picker closes the tab
       * bar / header styles behind it can otherwise go stale.
       */}
      <ExercisePickerModal
        visible={pickerVisible}
        catalog={catalog}
        onPick={addExercise}
        onClose={() => setPickerVisible(false)}
      />
    </>
  );
}

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    justifyContent: 'flex-end',
    backgroundColor: colors.overlay,
  },
  sheet: {
    // Explicit height (not just maxHeight) so the flex:1 body scrolls on Android.
    height: '88%',
    overflow: 'hidden',
    backgroundColor: colors.surface,
    borderTopLeftRadius: radius.xl,
    borderTopRightRadius: radius.xl,
    borderTopWidth: 1,
    borderColor: colors.border,
    paddingTop: spacing.lg,
    paddingHorizontal: spacing.lg,
    paddingBottom: spacing.lg,
    gap: spacing.sm,
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
  closeButton: {
    paddingHorizontal: spacing.sm,
    paddingVertical: spacing.xs,
  },
  closeLabel: {
    color: colors.textSecondary,
    fontSize: typography.sizes.sm,
    fontWeight: typography.weights.medium,
  },
  body: {
    // Bounded scroll viewport inside the explicit-height sheet.
    flex: 1,
    minHeight: 0,
    marginTop: spacing.xs,
  },
  bodyContent: {
    gap: spacing.sm,
    paddingBottom: spacing.lg,
  },
  label: {
    color: colors.textSecondary,
    fontSize: typography.sizes.xs,
    fontWeight: typography.weights.medium,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  input: {
    minHeight: 44,
    color: colors.textPrimary,
    fontSize: typography.sizes.md,
    backgroundColor: colors.surfaceInput,
    borderColor: colors.border,
    borderWidth: 1,
    borderRadius: radius.md,
    paddingHorizontal: spacing.md,
  },
  chipRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.xs,
  },
  blockCard: {
    backgroundColor: colors.surfaceElevated,
    borderColor: colors.border,
    borderWidth: 1,
    borderRadius: radius.md,
    padding: spacing.md,
    gap: spacing.sm,
  },
  blockHead: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: spacing.sm,
  },
  blockName: {
    flex: 1,
    color: colors.textPrimary,
    fontSize: typography.sizes.md,
    fontWeight: typography.weights.medium,
  },
  removeButton: {
    paddingHorizontal: spacing.sm,
    paddingVertical: spacing.xs,
  },
  removeLabel: {
    color: colors.danger,
    fontSize: typography.sizes.sm,
    fontWeight: typography.weights.medium,
  },
  blockFields: {
    flexDirection: 'row',
    gap: spacing.sm,
  },
  repsField: {
    flex: 1,
    gap: spacing.xs,
  },
  muted: {
    color: colors.textMuted,
    fontSize: typography.sizes.sm,
  },
  error: {
    color: colors.danger,
    fontSize: typography.sizes.sm,
  },
});
