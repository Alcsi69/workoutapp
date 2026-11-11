import type { ReactNode } from 'react';
import {
  KeyboardAvoidingView,
  Platform,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { colors, layout, spacing, typography } from '../theme/tokens';

interface ScreenProps {
  title: string;
  subtitle?: string;
  children: ReactNode;
  scroll?: boolean;
  /** Rendered below the scroll area, pinned to the bottom (e.g. onboarding CTA). */
  footer?: ReactNode;
  /** Enables pull-to-refresh on the scroll body (main list views). */
  onRefresh?: () => void;
  /** Spinner state for the pull-to-refresh control. */
  refreshing?: boolean;
}

/**
 * Keyboard behavior per platform. iOS pads the view (the keyboard overlays it),
 * Android shrinks the viewport so the focused field scrolls into sight, and the
 * web browser handles this natively — no wrapper behavior needed there.
 */
const KEYBOARD_BEHAVIOR =
  Platform.OS === 'ios' ? 'padding' : Platform.OS === 'android' ? 'height' : undefined;

/**
 * Dark-mode screen scaffold: safe area + title block + optional scroll body.
 *
 * The whole header/body/footer column is wrapped in a KeyboardAvoidingView so a
 * focused input near the bottom of a form (e.g. the Számlázási adatok street /
 * tax fields) is never hidden behind the on-screen keyboard.
 *
 * The column is capped at `layout.contentMaxWidth` and centred, so the same
 * mobile-first layout reads as a comfortable phone-width column on a desktop
 * browser instead of stretching edge to edge.
 *
 * Pass `onRefresh` to attach a pull-to-refresh control to the scroll body.
 */
export function Screen({
  title,
  subtitle,
  children,
  scroll = true,
  footer,
  onRefresh,
  refreshing = false,
}: ScreenProps) {
  const refreshControl =
    onRefresh !== undefined ? (
      <RefreshControl
        refreshing={refreshing}
        onRefresh={onRefresh}
        tintColor={colors.accent}
        colors={[colors.accent]}
        progressBackgroundColor={colors.surface}
      />
    ) : undefined;

  const body = scroll ? (
    <ScrollView
      style={styles.scroll}
      contentContainerStyle={styles.content}
      showsVerticalScrollIndicator={false}
      keyboardShouldPersistTaps="handled"
      keyboardDismissMode="on-drag"
      refreshControl={refreshControl}
    >
      {children}
    </ScrollView>
  ) : (
    <View style={[styles.scroll, styles.content]}>{children}</View>
  );

  return (
    <SafeAreaView style={styles.safe} edges={['top']}>
      <KeyboardAvoidingView style={styles.avoider} behavior={KEYBOARD_BEHAVIOR}>
        <View style={styles.column}>
          <View style={styles.header}>
            <Text style={styles.title}>{title}</Text>
            {subtitle !== undefined ? <Text style={styles.subtitle}>{subtitle}</Text> : null}
          </View>
          {body}
          {footer !== undefined ? <View style={styles.footer}>{footer}</View> : null}
        </View>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: {
    flex: 1,
    backgroundColor: colors.background,
  },
  avoider: {
    flex: 1,
  },
  column: {
    flex: 1,
    width: '100%',
    maxWidth: layout.contentMaxWidth,
    alignSelf: 'center',
  },
  header: {
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.lg,
    paddingBottom: spacing.md,
  },
  title: {
    color: colors.textPrimary,
    fontSize: typography.sizes.xxl,
    fontWeight: typography.weights.bold,
    lineHeight: typography.sizes.xxl * typography.lineHeights.tight,
  },
  subtitle: {
    marginTop: spacing.xs,
    color: colors.textSecondary,
    fontSize: typography.sizes.sm,
    lineHeight: typography.sizes.sm * typography.lineHeights.relaxed,
  },
  scroll: {
    flex: 1,
  },
  content: {
    paddingHorizontal: spacing.lg,
    paddingBottom: spacing.xxl,
    gap: spacing.md,
  },
  footer: {
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.md,
    paddingBottom: spacing.lg,
    borderTopWidth: 1,
    borderTopColor: colors.border,
    backgroundColor: colors.background,
  },
});
