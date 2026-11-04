import { useMemo } from 'react';
import { Modal, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import hu from '../i18n/hu';
import { colors, radius, spacing, typography } from '../theme/tokens';

interface JsonPreviewModalProps {
  visible: boolean;
  /** Header text; defaults to the sync preview title. */
  title?: string;
  /** Any JSON-serializable value; pretty-printed with 2-space indentation. */
  value: unknown;
  onClose: () => void;
}

function safeStringify(value: unknown): string {
  if (value === null || value === undefined) {
    return hu.sync.empty;
  }
  try {
    return JSON.stringify(value, null, 2);
  } catch {
    return hu.sync.empty;
  }
}

/** Bottom-sheet modal that pretty-prints an outgoing JSON payload for inspection. */
export function JsonPreviewModal({ visible, title, value, onClose }: JsonPreviewModalProps) {
  const text = useMemo(() => safeStringify(value), [value]);

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <Pressable style={styles.backdrop} onPress={onClose}>
        <Pressable style={styles.sheet} onPress={() => undefined}>
          <View style={styles.headerRow}>
            <Text style={styles.title}>{title ?? hu.sync.previewTitle}</Text>
            <Pressable accessibilityRole="button" onPress={onClose} style={styles.closeButton}>
              <Text style={styles.closeLabel}>{hu.sync.close}</Text>
            </Pressable>
          </View>

          <ScrollView
            style={styles.body}
            contentContainerStyle={styles.bodyContent}
            showsVerticalScrollIndicator={false}
          >
            <Text selectable style={styles.code}>
              {text}
            </Text>
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
    maxHeight: '85%',
    minHeight: '55%',
    backgroundColor: colors.surface,
    borderTopLeftRadius: radius.xl,
    borderTopRightRadius: radius.xl,
    borderTopWidth: 1,
    borderColor: colors.border,
    paddingTop: spacing.lg,
    paddingHorizontal: spacing.lg,
    paddingBottom: spacing.xl,
    gap: spacing.sm,
  },
  headerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: spacing.sm,
  },
  title: {
    flex: 1,
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
  body: {
    flex: 1,
    backgroundColor: colors.surfaceInput,
    borderColor: colors.border,
    borderWidth: 1,
    borderRadius: radius.md,
  },
  bodyContent: {
    padding: spacing.md,
  },
  code: {
    color: colors.textSecondary,
    fontFamily: 'monospace',
    fontSize: typography.sizes.xs,
    lineHeight: typography.sizes.xs * typography.lineHeights.relaxed,
  },
});
