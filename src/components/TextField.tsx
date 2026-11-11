import { useState } from 'react';
import { StyleSheet, Text, TextInput, View } from 'react-native';
import type { KeyboardTypeOptions } from 'react-native';
import { colors, radius, spacing, typography } from '../theme/tokens';

interface TextFieldProps {
  label: string;
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  /** Localized error message shown below the field; null/undefined hides it. */
  error?: string | null;
  hint?: string;
  keyboardType?: KeyboardTypeOptions;
  autoCapitalize?: 'none' | 'sentences' | 'words' | 'characters';
  autoCorrect?: boolean;
}

/**
 * Single-line text input with a label plus optional hint and error line — the
 * text counterpart of NumberField, used by the contact/billing forms.
 */
export function TextField({
  label,
  value,
  onChange,
  placeholder,
  error,
  hint,
  keyboardType = 'default',
  autoCapitalize = 'sentences',
  autoCorrect = false,
}: TextFieldProps) {
  const [focused, setFocused] = useState(false);
  return (
    <View style={styles.field}>
      <Text style={styles.label}>{label}</Text>
      <TextInput
        value={value}
        onChangeText={onChange}
        placeholder={placeholder}
        placeholderTextColor={colors.textMuted}
        keyboardType={keyboardType}
        autoCapitalize={autoCapitalize}
        autoCorrect={autoCorrect}
        selectionColor={colors.accent}
        onFocus={() => setFocused(true)}
        onBlur={() => setFocused(false)}
        style={[
          styles.input,
          focused ? styles.inputFocused : null,
          error !== null && error !== undefined ? styles.inputError : null,
        ]}
      />
      {hint !== undefined && (error === null || error === undefined) ? (
        <Text style={styles.hint}>{hint}</Text>
      ) : null}
      {error !== null && error !== undefined ? <Text style={styles.error}>{error}</Text> : null}
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
  input: {
    minHeight: 44,
    color: colors.textPrimary,
    fontSize: typography.sizes.md,
    backgroundColor: colors.surfaceInput,
    borderColor: colors.border,
    borderWidth: 1,
    borderRadius: radius.md,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
  },
  inputError: {
    borderColor: colors.danger,
  },
  inputFocused: {
    borderColor: colors.borderFocus,
  },
  hint: {
    color: colors.textMuted,
    fontSize: typography.sizes.xs,
  },
  error: {
    color: colors.danger,
    fontSize: typography.sizes.xs,
  },
});
