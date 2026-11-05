import { ScrollView, StyleSheet, Text, View } from 'react-native';
import { Chip } from '../Badge';
import hu from '../../i18n/hu';
import { colors, spacing, typography } from '../../theme/tokens';
import type { SetType } from '../../types/workout';

// The five set types the logger offers, in the order they are shown. `drop_set`
// stays out of the quick picker (Backoff/Bukásig cover the working cases).
export const SET_TYPE_ORDER: readonly SetType[] = [
  'warmup',
  'working',
  'top_set',
  'backoff',
  'failure',
];

interface SetTypeSelectorProps {
  value: SetType;
  onChange: (setType: SetType) => void;
}

/** Horizontal pill row for choosing a set's SetType. */
export function SetTypeSelector({ value, onChange }: SetTypeSelectorProps) {
  return (
    <ScrollView
      horizontal
      style={styles.stripScroll}
      showsHorizontalScrollIndicator={false}
      contentContainerStyle={styles.strip}
      keyboardShouldPersistTaps="handled"
    >
      {SET_TYPE_ORDER.map((setType) => (
        <Chip
          key={setType}
          label={hu.setTypes[setType]}
          selected={value === setType}
          onPress={() => onChange(setType)}
        />
      ))}
    </ScrollView>
  );
}

/** RPE options: 5.0 - 10.0 in 0.5 steps. */
export const RPE_OPTIONS: readonly number[] = [
  5, 5.5, 6, 6.5, 7, 7.5, 8, 8.5, 9, 9.5, 10,
];

function formatRpe(value: number): string {
  return Number.isInteger(value) ? value.toFixed(1) : value.toString();
}

interface RpeSelectorProps {
  value: number | null;
  onChange: (rpe: number | null) => void;
}

/** Optional RPE chip row; the leading "—" clears the value. */
export function RpeSelector({ value, onChange }: RpeSelectorProps) {
  return (
    <View style={styles.field}>
      <Text style={styles.label}>{hu.logger.rpeLabel}</Text>
      <ScrollView
        horizontal
        style={styles.stripScroll}
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={styles.strip}
        keyboardShouldPersistTaps="handled"
      >
        <Chip label={hu.logger.rpeNone} selected={value === null} onPress={() => onChange(null)} />
        {RPE_OPTIONS.map((option) => (
          <Chip
            key={option}
            label={formatRpe(option)}
            selected={value === option}
            onPress={() => onChange(option)}
          />
        ))}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  field: {
    gap: spacing.xs,
  },
  label: {
    color: colors.textSecondary,
    fontSize: typography.sizes.xs,
    fontWeight: typography.weights.medium,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  stripScroll: {
    // Keep the chip strip from being squeezed by the rows below it.
    flexGrow: 0,
    flexShrink: 0,
  },
  strip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    paddingVertical: 4,
  },
});
