import { useRef, useState } from 'react';
import { Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import type { KeyboardTypeOptions, TextInputInstance } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
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
  /** Masks the input (passwords). Defaults to false. */
  secureTextEntry?: boolean;
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
  secureTextEntry = false,
}: TextFieldProps) {
  const [focused, setFocused] = useState(false);
  // Only meaningful when the field is a password. Toggling visibility must not
  // dismiss the keyboard, so the input is refocused after every tap.
  const [showPassword, setShowPassword] = useState(false);
  const inputRef = useRef<TextInputInstance>(null);
  const isPassword = secureTextEntry;
  const togglePasswordVisibility = (): void => {
    setShowPassword((visible) => !visible);
    inputRef.current?.focus();
  };
  return (
    <View style={styles.field}>
      <Text style={styles.label}>{label}</Text>
      <View style={styles.inputWrap}>
        <TextInput
          ref={inputRef}
          value={value}
          onChangeText={onChange}
          placeholder={placeholder}
          placeholderTextColor={colors.textMuted}
          keyboardType={keyboardType}
          autoCapitalize={autoCapitalize}
          autoCorrect={autoCorrect}
          secureTextEntry={isPassword && !showPassword}
          selectionColor={colors.accent}
          onFocus={() => setFocused(true)}
          onBlur={() => setFocused(false)}
          style={[
            styles.input,
            isPassword ? styles.inputPassword : null,
            focused ? styles.inputFocused : null,
            error !== null && error !== undefined ? styles.inputError : null,
          ]}
        />
        {isPassword ? (
          <Pressable
            onPress={togglePasswordVisibility}
            hitSlop={8}
            accessibilityRole="button"
            accessibilityLabel={showPassword ? 'Jelszó elrejtése' : 'Jelszó megjelenítése'}
            style={styles.passwordToggle}
          >
            <Ionicons
              name={showPassword ? 'eye-off-outline' : 'eye-outline'}
              size={20}
              color={focused ? colors.accent : colors.textMuted}
            />
          </Pressable>
        ) : null}
      </View>
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
  inputWrap: {
    position: 'relative',
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
  // Leaves room for the eye button so long passwords never sit underneath it.
  inputPassword: {
    paddingRight: spacing.xxl + spacing.sm,
  },
  passwordToggle: {
    position: 'absolute',
    top: 0,
    right: 0,
    bottom: 0,
    width: 44,
    alignItems: 'center',
    justifyContent: 'center',
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
