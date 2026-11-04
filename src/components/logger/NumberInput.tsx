import { StyleSheet, Text, TextInput, View } from 'react-native';
import { colors, radius, spacing, typography } from '../../theme/tokens';

interface NumberInputProps {
  label?: string;
  /** Raw draft text owned by the parent (never coerced here). */
  value: string;
  onChangeText: (text: string) => void;
  /** Fired on blur — the parent persists here. */
  onCommit?: () => void;
  unit?: string;
  allowDecimal?: boolean;
  placeholder?: string;
  editable?: boolean;
}

/**
 * Logger numeric cell. Unlike NumberField it accepts 0 and an empty draft (a
 * warm-up bar can be 0 kg, a set can be cleared), so it only filters characters
 * and hands the raw string to the caller.
 */
export function NumberInput({
  label,
  value,
  onChangeText,
  onCommit,
  unit,
  allowDecimal = false,
  placeholder,
  editable = true,
}: NumberInputProps) {
  const pattern = allowDecimal ? /^\d*[.,]?\d*$/ : /^\d*$/;

  return (
    <View style={styles.field}>
      {label !== undefined ? <Text style={styles.label}>{label}</Text> : null}
      <View style={[styles.row, editable ? null : styles.rowDisabled]}>
        <TextInput
          value={value}
          onChangeText={(next) => {
            if (pattern.test(next)) {
              onChangeText(next);
            }
          }}
          onBlur={onCommit}
          editable={editable}
          placeholder={placeholder}
          placeholderTextColor={colors.textMuted}
          keyboardType={allowDecimal ? 'decimal-pad' : 'number-pad'}
          inputMode={allowDecimal ? 'decimal' : 'numeric'}
          selectionColor={colors.accent}
          style={styles.input}
        />
        {unit !== undefined ? <Text style={styles.unit}>{unit}</Text> : null}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  field: {
    flex: 1,
    gap: spacing.xs,
  },
  label: {
    color: colors.textSecondary,
    fontSize: typography.sizes.xs,
    fontWeight: typography.weights.medium,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.surfaceInput,
    borderColor: colors.border,
    borderWidth: 1,
    borderRadius: radius.md,
    paddingHorizontal: spacing.md,
  },
  rowDisabled: {
    opacity: 0.6,
  },
  input: {
    flex: 1,
    minHeight: 44,
    color: colors.textPrimary,
    fontSize: typography.sizes.md,
    fontWeight: typography.weights.medium,
    fontVariant: ['tabular-nums'],
  },
  unit: {
    color: colors.textMuted,
    fontSize: typography.sizes.sm,
  },
});
