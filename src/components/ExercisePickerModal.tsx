import { useMemo, useState } from 'react';
import type { ReactNode } from 'react';
import {
  FlatList,
  Modal,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Chip, LoadBadge, Pill } from './Badge';
import { Button } from './Button';
import { getDatabase } from '../db/client';
import { createCustomExercise } from '../db/repository';
import {
  filterExercises,
  MUSCLE_GROUPS,
} from '../services/exerciseSearch';
import type { EquipmentFilter, MuscleGroup } from '../services/exerciseSearch';
import hu from '../i18n/hu';
import { colors, radius, spacing, typography } from '../theme/tokens';
import type { Equipment, ExerciseCatalogItem } from '../types/workout';

const EQUIPMENT_FILTERS: readonly EquipmentFilter[] = [
  'barbell',
  'dumbbell',
  'machine',
  'cable',
  'bodyweight',
];

/** Concrete equipment value behind each custom-form chip. */
const EQUIPMENT_FILTER_VALUE: Record<EquipmentFilter, Equipment> = {
  barbell: 'barbell',
  dumbbell: 'dumbbell',
  machine: 'machine',
  cable: 'cable',
  bodyweight: 'bodyweight',
};

/** Representative muscles + category for a custom exercise's chosen group. */
const GROUP_TO_MUSCLES: Record<MuscleGroup, readonly string[]> = {
  quads: ['quadriceps'],
  hamstrings: ['hamstrings'],
  glutes: ['glutes'],
  adductors: ['adductors'],
  calves: ['calves'],
  chest: ['chest'],
  back: ['back'],
  shoulders: ['shoulders'],
  traps: ['trapezius'],
  biceps: ['biceps'],
  triceps: ['triceps'],
  forearms: ['forearms'],
  core: ['core'],
  cardio: ['cardiovascular'],
};

export interface ExercisePickerModalProps {
  visible: boolean;
  /** Every exercise the picker may list (candidates, or the full catalog). */
  catalog: readonly ExerciseCatalogItem[];
  title?: string;
  /** Optional content rendered under the header (e.g. the current exercise). */
  header?: ReactNode;
  /** Exercises pinned to the very top of the default (unfiltered) view. */
  pinned?: readonly ExerciseCatalogItem[];
  /** Omitted in browse-only mode, where rows are informational. */
  onPick?: (exerciseId: string) => void;
  onClose: () => void;
  /** Whether to offer the inline "create custom exercise" form. */
  allowCreate?: boolean;
}

function ExerciseRow({
  exercise,
  onPress,
  pinned,
}: {
  exercise: ExerciseCatalogItem;
  onPress?: () => void;
  pinned?: boolean;
}) {
  const body = (
    <>
      <View style={styles.rowHead}>
        <Text style={styles.rowName} numberOfLines={1}>
          {exercise.nameHu}
        </Text>
        {exercise.isCustom ? (
          <Pill label={hu.picker.customBadge} tone="accent" />
        ) : pinned ? (
          <Pill label={hu.picker.recommended} tone="accent" />
        ) : null}
      </View>
      <Text style={styles.rowSub} numberOfLines={1}>
        {exercise.nameEn}
      </Text>
      <View style={styles.badgeRow}>
        <LoadBadge label={hu.screens.load.kneeShort} score={exercise.kneeStressScore} />
        <LoadBadge label={hu.screens.load.axialShort} score={exercise.axialLoadScore} />
      </View>
    </>
  );

  // Browse-only mode (catalog viewer) renders a plain View so touches pass
  // straight through to the list; selection mode uses a Pressable card.
  if (onPress === undefined) {
    return <View style={styles.row}>{body}</View>;
  }
  return (
    <Pressable
      accessibilityRole="button"
      onPress={onPress}
      style={({ pressed }) => [styles.row, pressed ? styles.pressed : null]}
    >
      {body}
    </Pressable>
  );
}

/**
 * Reusable exercise picker: instant accent-insensitive search over Hungarian and
 * English names, muscle-group and equipment filter chips, and an inline form to
 * create a custom exercise on the fly. Used by the mid-workout substitution
 * sheet, the template editor, and the catalog browser.
 *
 * Android scroll architecture: the whole modal is ONE full-screen scroller. A
 * single FlatList owns the gesture — the search field, filter chips, and the
 * pinned block live in its ListHeaderComponent, so nothing nested ever competes
 * for the vertical pan responder. Filter chips wrap in a plain View (no nested
 * horizontal ScrollView), and the list is never re-keyed/unmounted, so changing
 * a filter never breaks touch-responder handoff inside the Android <Modal>.
 */
export function ExercisePickerModal({
  visible,
  catalog,
  title = hu.picker.title,
  header,
  pinned = [],
  onPick,
  onClose,
  allowCreate = true,
}: ExercisePickerModalProps) {
  const [query, setQuery] = useState('');
  const [muscleGroup, setMuscleGroup] = useState<MuscleGroup | null>(null);
  const [equipment, setEquipment] = useState<EquipmentFilter | null>(null);
  const [customItems, setCustomItems] = useState<ExerciseCatalogItem[]>([]);

  const [creating, setCreating] = useState(false);
  const [formNameHu, setFormNameHu] = useState('');
  const [formNameEn, setFormNameEn] = useState('');
  const [formEquipment, setFormEquipment] = useState<EquipmentFilter>('barbell');
  const [formGroup, setFormGroup] = useState<MuscleGroup>('chest');
  const [saving, setSaving] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);

  const pool = useMemo(() => [...catalog, ...customItems], [catalog, customItems]);

  const filtering = query.trim().length > 0 || muscleGroup !== null || equipment !== null;
  const filtered = useMemo(
    () => filterExercises(pool, { query, muscleGroup, equipment }),
    [pool, query, muscleGroup, equipment],
  );

  const pinnedIds = useMemo(() => new Set(pinned.map((item) => item.id)), [pinned]);
  const showPinned = !filtering && pinned.length > 0;
  const mainList = showPinned ? filtered.filter((item) => !pinnedIds.has(item.id)) : filtered;

  const resetForm = (): void => {
    setFormNameHu('');
    setFormNameEn('');
    setFormEquipment('barbell');
    setFormGroup('chest');
    setFormError(null);
  };

  const close = (): void => {
    setQuery('');
    setMuscleGroup(null);
    setEquipment(null);
    setCreating(false);
    resetForm();
    onClose();
  };

  const handleCreate = async (): Promise<void> => {
    if (formNameHu.trim().length === 0) {
      setFormError(hu.picker.customNameRequired);
      return;
    }
    setSaving(true);
    setFormError(null);
    try {
      const db = await getDatabase();
      const input: Parameters<typeof createCustomExercise>[1] = {
        nameHu: formNameHu.trim(),
        equipment: EQUIPMENT_FILTER_VALUE[formEquipment],
        primaryMuscles: [...GROUP_TO_MUSCLES[formGroup]],
        category: formGroup === 'cardio' ? 'cardio_run' : 'isolation',
      };
      const nameEn = formNameEn.trim();
      if (nameEn.length > 0) {
        input.nameEn = nameEn;
      }
      const created = await createCustomExercise(db, input);
      setCustomItems((current) => [...current, created]);
      // Surface the new exercise immediately under the default (unfiltered) view.
      setQuery('');
      setMuscleGroup(null);
      setEquipment(null);
      setCreating(false);
      resetForm();
    } catch (cause: unknown) {
      setFormError(cause instanceof Error ? cause.message : String(cause));
    } finally {
      setSaving(false);
    }
  };

  // Passed as a stable JSX element (never an inline component function) so the
  // search TextInput keeps focus and nothing remounts while typing or filtering.
  const listHeader = (
    <View style={styles.header}>
      <View style={styles.headerRow}>
        <Text style={styles.title}>{title}</Text>
        <Pressable accessibilityRole="button" onPress={close} style={styles.closeButton}>
          <Text style={styles.closeLabel}>{hu.common.cancel}</Text>
        </Pressable>
      </View>

      {header}

      <TextInput
        value={query}
        onChangeText={setQuery}
        placeholder={hu.picker.searchPlaceholder}
        placeholderTextColor={colors.textMuted}
        selectionColor={colors.accent}
        autoCorrect={false}
        style={styles.search}
      />

      <View style={styles.chipRow}>
        <Chip
          label={hu.picker.all}
          selected={muscleGroup === null}
          onPress={() => setMuscleGroup(null)}
        />
        {MUSCLE_GROUPS.map((group) => (
          <Chip
            key={group}
            label={hu.picker.muscleGroups[group]}
            selected={muscleGroup === group}
            onPress={() => setMuscleGroup(muscleGroup === group ? null : group)}
          />
        ))}
      </View>

      <View style={styles.chipRow}>
        <Chip
          label={hu.picker.all}
          selected={equipment === null}
          onPress={() => setEquipment(null)}
        />
        {EQUIPMENT_FILTERS.map((filter) => (
          <Chip
            key={filter}
            label={hu.picker.equipmentFilters[filter]}
            selected={equipment === filter}
            onPress={() => setEquipment(equipment === filter ? null : filter)}
          />
        ))}
      </View>

      <View style={styles.countRow}>
        <Text style={styles.count}>
          {mainList.length + (showPinned ? pinned.length : 0)} {hu.picker.resultCount}
        </Text>
      </View>

      {showPinned ? (
        <>
          <Text style={styles.groupTitle}>{hu.picker.recommended}</Text>
          {pinned.map((exercise) => (
            <ExerciseRow
              key={`pinned_${exercise.id}`}
              exercise={exercise}
              pinned
              onPress={onPick === undefined ? undefined : () => onPick(exercise.id)}
            />
          ))}
          {mainList.length > 0 ? (
            <Text style={styles.groupTitle}>{hu.picker.switchesTo}</Text>
          ) : null}
        </>
      ) : null}
    </View>
  );

  const listFooter = allowCreate ? (
    creating ? (
      <View style={styles.form}>
        <Text style={styles.formTitle}>{hu.picker.customTitle}</Text>
        <Text style={styles.label}>{hu.picker.customNameLabel}</Text>
        <TextInput
          value={formNameHu}
          onChangeText={setFormNameHu}
          placeholder={hu.picker.customNamePlaceholder}
          placeholderTextColor={colors.textMuted}
          selectionColor={colors.accent}
          style={styles.input}
        />
        <Text style={styles.label}>{hu.picker.customNameEnLabel}</Text>
        <TextInput
          value={formNameEn}
          onChangeText={setFormNameEn}
          placeholder={hu.picker.customNameEnPlaceholder}
          placeholderTextColor={colors.textMuted}
          selectionColor={colors.accent}
          autoCorrect={false}
          style={styles.input}
        />
        <Text style={styles.label}>{hu.picker.customEquipmentLabel}</Text>
        <View style={styles.chipRow}>
          {EQUIPMENT_FILTERS.map((filter) => (
            <Chip
              key={filter}
              label={hu.picker.equipmentFilters[filter]}
              selected={formEquipment === filter}
              onPress={() => setFormEquipment(filter)}
            />
          ))}
        </View>
        <Text style={styles.label}>{hu.picker.customMuscleLabel}</Text>
        <View style={styles.chipRow}>
          {MUSCLE_GROUPS.map((group) => (
            <Chip
              key={group}
              label={hu.picker.muscleGroups[group]}
              selected={formGroup === group}
              onPress={() => setFormGroup(group)}
            />
          ))}
        </View>
        {formError !== null ? <Text style={styles.error}>{formError}</Text> : null}
        <View style={styles.formActions}>
          <Button
            label={hu.picker.customCreate}
            onPress={() => {
              void handleCreate();
            }}
            loading={saving}
          />
          <Button
            label={hu.picker.customCancel}
            variant="ghost"
            onPress={() => {
              setCreating(false);
              resetForm();
            }}
          />
        </View>
      </View>
    ) : (
      <Button
        label={hu.picker.addCustom}
        variant="secondary"
        onPress={() => setCreating(true)}
      />
    )
  ) : undefined;

  return (
    <Modal visible={visible} animationType="slide" onRequestClose={close}>
      <SafeAreaView style={styles.container} edges={['top', 'bottom']}>
        <FlatList
          data={mainList}
          keyExtractor={(item) => item.id}
          style={styles.list}
          contentContainerStyle={styles.listContent}
          keyboardShouldPersistTaps="handled"
          keyboardDismissMode="on-drag"
          ListHeaderComponent={listHeader}
          ListEmptyComponent={
            mainList.length === 0 && (!showPinned || pinned.length === 0) ? (
              <Text style={styles.empty}>{hu.picker.noResults}</Text>
            ) : undefined
          }
          ListFooterComponent={listFooter}
          renderItem={({ item }) => (
            <ExerciseRow
              exercise={item}
              onPress={onPick === undefined ? undefined : () => onPick(item.id)}
            />
          )}
        />
      </SafeAreaView>
    </Modal>
  );
}

const styles = StyleSheet.create({
  // Full-screen modal: a fixed viewport (flex:1) that never depends on how many
  // items match the filter — no backdrop, no partial sheet, no nested scrollers.
  container: {
    flex: 1,
    backgroundColor: colors.background,
  },
  header: {
    gap: spacing.sm,
    paddingBottom: spacing.sm,
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
  search: {
    minHeight: 44,
    color: colors.textPrimary,
    fontSize: typography.sizes.md,
    backgroundColor: colors.surfaceInput,
    borderColor: colors.border,
    borderWidth: 1,
    borderRadius: radius.md,
    paddingHorizontal: spacing.md,
  },
  // Wrapped chip rows: no horizontal ScrollView, so nothing fights the single
  // vertical scroller for the pan responder inside the Android <Modal>.
  chipRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 6,
  },
  countRow: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
  },
  count: {
    color: colors.textMuted,
    fontSize: typography.sizes.xs,
  },
  list: {
    // flex:1 gives the single FlatList the whole (fixed) modal viewport.
    flex: 1,
  },
  listContent: {
    padding: 16,
    paddingBottom: 48,
    gap: 10,
  },
  groupTitle: {
    marginTop: spacing.sm,
    color: colors.textMuted,
    fontSize: typography.sizes.xs,
    fontWeight: typography.weights.semibold,
    textTransform: 'uppercase',
    letterSpacing: 0.8,
  },
  row: {
    backgroundColor: colors.surfaceElevated,
    borderColor: colors.border,
    borderWidth: 1,
    borderRadius: radius.md,
    padding: spacing.md,
    gap: spacing.xs,
  },
  rowHead: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: spacing.sm,
  },
  rowName: {
    flex: 1,
    color: colors.textPrimary,
    fontSize: typography.sizes.md,
    fontWeight: typography.weights.medium,
  },
  rowSub: {
    color: colors.textMuted,
    fontSize: typography.sizes.xs,
  },
  badgeRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.xs,
  },
  empty: {
    color: colors.textMuted,
    fontSize: typography.sizes.sm,
    paddingVertical: spacing.md,
  },
  form: {
    borderTopWidth: 1,
    borderTopColor: colors.border,
    paddingTop: spacing.md,
    gap: spacing.sm,
  },
  formTitle: {
    color: colors.textPrimary,
    fontSize: typography.sizes.md,
    fontWeight: typography.weights.semibold,
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
  formActions: {
    gap: spacing.sm,
  },
  error: {
    color: colors.danger,
    fontSize: typography.sizes.sm,
  },
  pressed: {
    opacity: 0.85,
  },
});
