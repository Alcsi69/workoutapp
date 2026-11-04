import type { ReactNode } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { colors, radius, spacing, typography } from '../theme/tokens';

interface CardProps {
  children: ReactNode;
  title?: string;
  caption?: string;
  /** Left accent border used for attention cards (constraints, active session). */
  tone?: 'default' | 'accent' | 'warning' | 'danger';
}

const TONE_BORDER = {
  default: colors.border,
  accent: colors.accent,
  warning: colors.warning,
  danger: colors.danger,
} as const;

export function Card({ children, title, caption, tone = 'default' }: CardProps) {
  return (
    <View style={[styles.card, tone !== 'default' ? { borderLeftColor: TONE_BORDER[tone], borderLeftWidth: 3 } : null]}>
      {title !== undefined ? <Text style={styles.title}>{title}</Text> : null}
      {caption !== undefined ? <Text style={styles.caption}>{caption}</Text> : null}
      <View style={styles.body}>{children}</View>
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: colors.surface,
    borderColor: colors.border,
    borderWidth: 1,
    borderRadius: radius.lg,
    padding: spacing.lg,
  },
  title: {
    color: colors.textPrimary,
    fontSize: typography.sizes.lg,
    fontWeight: typography.weights.semibold,
  },
  caption: {
    marginTop: spacing.xs,
    color: colors.textMuted,
    fontSize: typography.sizes.xs,
    textTransform: 'uppercase',
    letterSpacing: 0.6,
  },
  body: {
    marginTop: spacing.sm,
    gap: spacing.sm,
  },
});