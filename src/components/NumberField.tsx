import { useState } from 'react';
import { StyleSheet, Text, TextInput, View } from 'react-native';
import { colors, radius, spacing, typography } from '../theme/tokens';

interface NumberFieldProps {
  label: string;
  value: number;
  onChange: (value: number) => void;
  unit?: string;
  allowDecimal?: boolean;
  placeholder?: string;
}

/**
 * Numeric input that keeps a text draft locally so the user can clear the field
 * while typing. Only valid values are pushed to the store; on blur an empty or
 * invalid draft falls back to the last valid value.
 */
export function NumberField({
  label,
  value,
  onChange,
  unit,
  allowDecimal = false,
  placeholder,
}: NumberFieldProps) {
  const [text, setText] = useState<string>(String(value));
  // Derive the draft from the incoming value during render (React's documented
  // "adjust state when a prop changes" pattern) instead of an effect, which
  // would schedule a second render pass after every parent update.
  const [syncedValue, setSyncedValue] = useState<number>(value);
  if (value !== syncedValue) {
    setSyncedValue(value);
    setText(String(value));
  }

  const pattern = allowDecimal ? /^\d*[.,]?\d*$/ : /^\d*$/;

  const handleChange = (next: string): void => {
    if (!pattern.test(next)) {
      return;
    }
    setText(next);
    const normalized = next.replace(',', '.');
    const parsed = Number.parseFloat(normalized);
    if (Number.isFinite(parsed) && parsed > 0) {
      onChange(parsed);
    }
  };

  const handleBlur = (): void => {
    const normalized = text.replace(',', '.');
    const parsed = Number.parseFloat(normalized);
    if (!Number.isFinite(parsed) || parsed <= 0) {
      setText(String(value));
    }
  };

  return (
    <View style={styles.field}>
      <Text style={styles.label}>{label}</Text>
      <View style={styles.inputRow}>
        <TextInput
          value={text}
          onChangeText={handleChange}
          onBlur={handleBlur}
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
  inputRow: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.surfaceInput,
    borderColor: colors.border,
    borderWidth: 1,
    borderRadius: radius.md,
    paddingHorizontal: spacing.md,
  },
  input: {
    flex: 1,
    minHeight: 44,
    color: colors.textPrimary,
    fontSize: typography.sizes.md,
    fontWeight: typography.weights.medium,
  },
  unit: {
    color: colors.textMuted,
    fontSize: typography.sizes.sm,
  },
});