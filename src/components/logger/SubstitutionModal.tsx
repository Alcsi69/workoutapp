import { Modal, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { LoadBadge, Pill } from '../Badge';
import hu from '../../i18n/hu';
import { colors, radius, spacing, typography } from '../../theme/tokens';
import type { ExerciseCatalogItem } from '../../types/workout';

interface SubstitutionModalProps {
  visible: boolean;
  /** The exercise currently prescribed for the block. */
  currentExercise: ExerciseCatalogItem | null;
  /** Options, best first (see repository.getSubstitutionCandidates). */
  candidates: ExerciseCatalogItem[];
  /** Ids that are the current exercise's default substitutes (highlighted on top). */
  recommendedIds: string[];
  onPick: (exerciseId: string) => void;
  onClose: () => void;
}

function CandidateRow({
  exercise,
  recommended,
  onPress,
}: {
  exercise: ExerciseCatalogItem;
  recommended: boolean;
  onPress: () => void;
}) {
  return (
    <Pressable
      accessibilityRole="button"
      onPress={onPress}
      style={({ pressed }) => [styles.candidate, pressed ? styles.pressed : null]}
    >
      <View style={styles.candidateHead}>
        <Text style={styles.candidateName}>{exercise.nameHu}</Text>
        {recommended ? <Pill label={hu.logger.substitutionRecommended} tone="accent" /> : null}
      </View>
      <View style={styles.badgeRow}>
        <LoadBadge label={hu.screens.load.kneeShort} score={exercise.kneeStressScore} />
        <LoadBadge label={hu.screens.load.axialShort} score={exercise.axialLoadScore} />
      </View>
    </Pressable>
  );
}

/** Bottom-sheet picker for swapping a block's exercise mid-workout. */
export function SubstitutionModal({
  visible,
  currentExercise,
  candidates,
  recommendedIds,
  onPick,
  onClose,
}: SubstitutionModalProps) {
  const recommended = candidates.filter((item) => recommendedIds.includes(item.id));
  const others = candidates.filter((item) => !recommendedIds.includes(item.id));

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <Pressable style={styles.backdrop} onPress={onClose}>
        <Pressable style={styles.sheet} onPress={() => undefined}>
          <View style={styles.headerRow}>
            <Text style={styles.title}>{hu.logger.substitution}</Text>
            <Pressable accessibilityRole="button" onPress={onClose} style={styles.closeButton}>
              <Text style={styles.closeLabel}>{hu.common.cancel}</Text>
            </Pressable>
          </View>

          {currentExercise !== null ? (
            <Text style={styles.current}>
              {hu.logger.substitutionCurrent}: <Text style={styles.currentName}>{currentExercise.nameHu}</Text>
            </Text>
          ) : null}

          <ScrollView
            style={styles.list}
            contentContainerStyle={styles.listContent}
            showsVerticalScrollIndicator={false}
          >
            {candidates.length === 0 ? (
              <Text style={styles.empty}>{hu.logger.substitutionEmpty}</Text>
            ) : null}

            {recommended.length > 0 ? (
              <Text style={styles.groupTitle}>{hu.logger.substitutionRecommended}</Text>
            ) : null}
            {recommended.map((exercise) => (
              <CandidateRow
                key={exercise.id}
                exercise={exercise}
                recommended
                onPress={() => onPick(exercise.id)}
              />
            ))}

            {others.length > 0 ? (
              <Text style={styles.groupTitle}>{hu.logger.substitutionTo}</Text>
            ) : null}
            {others.map((exercise) => (
              <CandidateRow
                key={exercise.id}
                exercise={exercise}
                recommended={false}
                onPress={() => onPick(exercise.id)}
              />
            ))}
          </ScrollView>
        </Pressable>
      </Pressable>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
    justifyContent: 'flex-end',
    backgroundColor: colors.overlay,
  },
  sheet: {
    maxHeight: '82%',
    backgroundColor: colors.surface,
    borderTopLeftRadius: radius.xl,
    borderTopRightRadius: radius.xl,
    borderTopWidth: 1,
    borderColor: colors.border,
    paddingTop: spacing.lg,
    paddingHorizontal: spacing.lg,
    paddingBottom: spacing.xxl,
    gap: spacing.sm,
  },
  headerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  title: {
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
  current: {
    color: colors.textMuted,
    fontSize: typography.sizes.sm,
  },
  currentName: {
    color: colors.textSecondary,
    fontWeight: typography.weights.semibold,
  },
  list: {
    marginTop: spacing.xs,
  },
  listContent: {
    gap: spacing.sm,
    paddingBottom: spacing.lg,
  },
  groupTitle: {
    marginTop: spacing.sm,
    color: colors.textMuted,
    fontSize: typography.sizes.xs,
    fontWeight: typography.weights.semibold,
    textTransform: 'uppercase',
    letterSpacing: 0.8,
  },
  candidate: {
    backgroundColor: colors.surfaceElevated,
    borderColor: colors.border,
    borderWidth: 1,
    borderRadius: radius.md,
    padding: spacing.md,
    gap: spacing.xs,
  },
  candidateHead: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: spacing.sm,
  },
  candidateName: {
    flex: 1,
    color: colors.textPrimary,
    fontSize: typography.sizes.md,
    fontWeight: typography.weights.medium,
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
  pressed: {
    opacity: 0.85,
  },
});
