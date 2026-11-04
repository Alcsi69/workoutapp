import { Text, StyleSheet } from 'react-native';
import { ExercisePickerModal } from '../ExercisePickerModal';
import hu from '../../i18n/hu';
import { colors, typography } from '../../theme/tokens';
import type { ExerciseCatalogItem } from '../../types/workout';

interface SubstitutionModalProps {
  visible: boolean;
  /** The exercise currently prescribed for the block. */
  currentExercise: ExerciseCatalogItem | null;
  /** Options, best first (see repository.getSubstitutionCandidates). */
  candidates: ExerciseCatalogItem[];
  /** Ids that are the current exercise's default substitutes (pinned on top). */
  recommendedIds: string[];
  onPick: (exerciseId: string) => void;
  onClose: () => void;
}

/**
 * Bottom-sheet picker for swapping a block's exercise mid-workout. Thin wrapper
 * around the shared ExercisePickerModal: the joint-safe recommended substitutes
 * are pinned to the very top, and the full searchable/filterable catalog (plus
 * custom-exercise creation) sits below.
 */
export function SubstitutionModal({
  visible,
  currentExercise,
  candidates,
  recommendedIds,
  onPick,
  onClose,
}: SubstitutionModalProps) {
  const pinned = candidates.filter((item) => recommendedIds.includes(item.id));

  return (
    <ExercisePickerModal
      visible={visible}
      catalog={candidates}
      title={hu.logger.substitution}
      pinned={pinned}
      onPick={onPick}
      onClose={onClose}
      header={
        currentExercise !== null ? (
          <Text style={styles.current}>
            {hu.logger.substitutionCurrent}:{' '}
            <Text style={styles.currentName}>{currentExercise.nameHu}</Text>
          </Text>
        ) : null
      }
    />
  );
}

const styles = StyleSheet.create({
  current: {
    color: colors.textMuted,
    fontSize: typography.sizes.sm,
  },
  currentName: {
    color: colors.textSecondary,
    fontWeight: typography.weights.semibold,
  },
});
