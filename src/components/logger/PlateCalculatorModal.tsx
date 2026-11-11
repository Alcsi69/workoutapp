import { useState } from 'react';
import { Modal, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { Button } from '../Button';
import { NumberInput } from './NumberInput';
import {
  DEFAULT_BAR_WEIGHT_KG,
  DEFAULT_PLATE_KG,
  calculatePlatesPerSide,
  totalPlateCount,
} from '../../services/plateCalculator';
import { formatWeightKg } from '../../services/format';
import hu from '../../i18n/hu';
import { colors, radius, spacing, typography } from '../../theme/tokens';

interface PlateCalculatorModalProps {
  /** Weight to prefill the target field with (e.g. the set's current weight). */
  initialWeightKg?: number | null;
  /** Optional exercise name shown under the title. */
  exerciseName?: string;
  onClose: () => void;
}

/** Plate colour by denomination, in the spirit of competition bumper plates. */
const PLATE_COLOR: Record<number, string> = {
  25: colors.danger,
  20: colors.accent,
  15: colors.warning,
  10: colors.success,
  5: colors.textSecondary,
  2.5: colors.textMuted,
  1.25: colors.borderStrong,
};

function parseKg(text: string, fallback: number): number {
  const value = Number.parseFloat(text.replace(',', '.'));
  return Number.isFinite(value) && value >= 0 ? value : fallback;
}

/**
 * Visual barbell plate loader. Given a target weight and the plates on hand it
 * shows exactly what to slide onto each side (heaviest first) and the closest
 * weight the stack can actually build — the gym-floor "how do I load 92.5?" sheet.
 */
export function PlateCalculatorModal({
  initialWeightKg = null,
  exerciseName,
  onClose,
}: PlateCalculatorModalProps) {
  const [target, setTarget] = useState<string>(
    initialWeightKg !== null && initialWeightKg > 0 ? String(initialWeightKg) : '',
  );
  const [bar, setBar] = useState<string>(String(DEFAULT_BAR_WEIGHT_KG));

  const barWeightKg = parseKg(bar, DEFAULT_BAR_WEIGHT_KG);
  const targetWeightKg = parseKg(target, barWeightKg);
  const calculation = calculatePlatesPerSide(targetWeightKg, barWeightKg, DEFAULT_PLATE_KG);
  const plateCount = totalPlateCount(calculation);

  return (
    <Modal visible transparent animationType="slide" onRequestClose={onClose}>
      {/* Backdrop is a sibling of the sheet so it never steals scroll gestures. */}
      <View style={styles.overlay}>
        <Pressable
          style={StyleSheet.absoluteFill}
          onPress={onClose}
          accessibilityRole="button"
          accessibilityLabel={hu.plate.close}
        />

        {/* Claims taps that miss the children so they never close via backdrop. */}
        <View style={styles.sheet} onStartShouldSetResponder={() => true}>
          <ScrollView
            style={styles.body}
            contentContainerStyle={styles.bodyContent}
            nestedScrollEnabled
            keyboardShouldPersistTaps="handled"
            keyboardDismissMode="on-drag"
            showsVerticalScrollIndicator={false}
          >
          <View style={styles.headerRow}>
            <View style={styles.headerText}>
              <Text style={styles.title}>{hu.plate.title}</Text>
              {exerciseName !== undefined ? (
                <Text style={styles.subtitle}>{exerciseName}</Text>
              ) : null}
            </View>
            <Pressable accessibilityRole="button" onPress={onClose} style={styles.closeButton}>
              <Text style={styles.closeLabel}>{hu.plate.close}</Text>
            </Pressable>
          </View>

          <View style={styles.inputRow}>
            <NumberInput
              label={hu.plate.targetWeight}
              value={target}
              unit={hu.common.kg}
              allowDecimal
              placeholder={String(barWeightKg)}
              onChangeText={setTarget}
            />
            <NumberInput
              label={hu.plate.barWeight}
              value={bar}
              unit={hu.common.kg}
              allowDecimal
              placeholder={String(DEFAULT_BAR_WEIGHT_KG)}
              onChangeText={setBar}
            />
          </View>

          <View style={styles.resultBox}>
            <Text style={styles.resultLabel}>{hu.plate.achievable}</Text>
            <Text style={styles.resultValue}>{formatWeightKg(calculation.achievableWeightKg)}</Text>
            {calculation.exact ? (
              <Text style={styles.resultExact}>{hu.plate.exact}</Text>
            ) : (
              <Text style={styles.resultShortfall}>
                {hu.plate.shortfall}: {formatWeightKg(calculation.achievableWeightKg)} (−
                {formatWeightKg(calculation.shortfallKg)})
              </Text>
            )}
          </View>

          <Text style={styles.sectionTitle}>{hu.plate.platesEachSide}</Text>
          {calculation.platesPerSide.length === 0 ? (
            <Text style={styles.empty}>{hu.plate.noPlates}</Text>
          ) : (
            <ScrollView
              horizontal
              nestedScrollEnabled
              style={styles.plateStripScroll}
              showsHorizontalScrollIndicator={false}
              contentContainerStyle={styles.plateStrip}
            >
              {calculation.platesPerSide.map((stack) => (
                <View key={stack.plateKg} style={styles.plateColumn}>
                  <View
                    style={[
                      styles.plate,
                      {
                        backgroundColor: PLATE_COLOR[stack.plateKg] ?? colors.borderStrong,
                        height: 40 + stack.plateKg * 3,
                      },
                    ]}
                  />
                  <Text style={styles.plateCount}>×{stack.countPerSide}</Text>
                  <Text style={styles.plateLabel}>{formatWeightKg(stack.plateKg)}</Text>
                </View>
              ))}
            </ScrollView>
          )}

          {plateCount > 0 ? (
            <Text style={styles.total}>
              {plateCount} {hu.plate.totalPlates}
            </Text>
          ) : null}

          <Button label={hu.plate.close} variant="ghost" onPress={onClose} />
          </ScrollView>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    justifyContent: 'flex-end',
    backgroundColor: colors.overlay,
  },
  sheet: {
    // Explicit height so the flex:1 body gets a bounded scroll viewport.
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
  },
  body: {
    flex: 1,
    minHeight: 0,
  },
  bodyContent: {
    gap: spacing.md,
    paddingBottom: spacing.md,
  },
  headerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: spacing.sm,
  },
  headerText: {
    flex: 1,
    gap: 2,
  },
  title: {
    color: colors.textPrimary,
    fontSize: typography.sizes.lg,
    fontWeight: typography.weights.semibold,
  },
  subtitle: {
    color: colors.textMuted,
    fontSize: typography.sizes.xs,
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
  inputRow: {
    flexDirection: 'row',
    gap: spacing.md,
  },
  resultBox: {
    backgroundColor: colors.surfaceElevated,
    borderColor: colors.border,
    borderWidth: 1,
    borderRadius: radius.md,
    padding: spacing.md,
    gap: spacing.xs,
  },
  resultLabel: {
    color: colors.textSecondary,
    fontSize: typography.sizes.xs,
    fontWeight: typography.weights.semibold,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  resultValue: {
    color: colors.accent,
    fontSize: typography.sizes.xxl,
    fontWeight: typography.weights.bold,
    fontVariant: ['tabular-nums'],
  },
  resultExact: {
    color: colors.success,
    fontSize: typography.sizes.sm,
  },
  resultShortfall: {
    color: colors.warning,
    fontSize: typography.sizes.sm,
    fontVariant: ['tabular-nums'],
  },
  sectionTitle: {
    color: colors.textSecondary,
    fontSize: typography.sizes.xs,
    fontWeight: typography.weights.semibold,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  empty: {
    color: colors.textMuted,
    fontSize: typography.sizes.sm,
  },
  plateStripScroll: {
    // Keep the plate row from collapsing inside the vertically-scrolling sheet.
    flexGrow: 0,
    flexShrink: 0,
  },
  plateStrip: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    gap: spacing.sm,
    paddingVertical: spacing.xs,
  },
  plateColumn: {
    alignItems: 'center',
    gap: 2,
  },
  plate: {
    width: 26,
    borderRadius: radius.sm,
    borderWidth: 1,
    borderColor: colors.borderStrong,
  },
  plateCount: {
    color: colors.textPrimary,
    fontSize: typography.sizes.sm,
    fontWeight: typography.weights.bold,
    fontVariant: ['tabular-nums'],
  },
  plateLabel: {
    color: colors.textMuted,
    fontSize: typography.sizes.xs,
    fontVariant: ['tabular-nums'],
  },
  total: {
    color: colors.textSecondary,
    fontSize: typography.sizes.sm,
  },
});
