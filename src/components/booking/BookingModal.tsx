import { useState } from 'react';
import { Modal, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { Button } from '../Button';
import { Pill } from '../Badge';
import { formatDateTimeHu } from '../../services/format';
import hu from '../../i18n/hu';
import { colors, radius, spacing, typography } from '../../theme/tokens';
import type { CoachingSlot } from '../../types/workout';

interface BookingModalProps {
  visible: boolean;
  slot: CoachingSlot | null;
  busy: boolean;
  onClose: () => void;
  onConfirm: (clientNotes: string) => void;
}

/** Bottom-sheet that collects the client's note and confirms a slot booking. */
export function BookingModal({ visible, slot, busy, onClose, onConfirm }: BookingModalProps) {
  const [notes, setNotes] = useState('');

  if (slot === null) {
    return null;
  }

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <Pressable style={styles.backdrop} onPress={onClose}>
        <Pressable style={styles.sheet} onPress={() => undefined}>
          <Text style={styles.title}>{hu.screens.booking.bookTitle}</Text>

          <ScrollView
            style={styles.body}
            contentContainerStyle={styles.bodyContent}
            keyboardShouldPersistTaps="handled"
            showsVerticalScrollIndicator={false}
          >
            <View style={styles.pillRow}>
              <Pill label={hu.modalities[slot.modality]} tone="accent" />
            </View>
            <View style={styles.row}>
              <Text style={styles.rowLabel}>{hu.screens.booking.startLabel}</Text>
              <Text style={styles.rowValue}>{formatDateTimeHu(slot.startsAt)}</Text>
            </View>
            <View style={styles.row}>
              <Text style={styles.rowLabel}>{hu.screens.booking.durationLabel}</Text>
              <Text style={styles.rowValue}>
                {Math.max(
                  1,
                  Math.round(
                    (new Date(slot.endsAt).getTime() - new Date(slot.startsAt).getTime()) / 60_000,
                  ),
                )}{' '}
                {hu.screens.booking.minutesUnit}
              </Text>
            </View>
            <View style={styles.row}>
              <Text style={styles.rowLabel}>{hu.screens.booking.location}</Text>
              <Text style={styles.rowValue} numberOfLines={2}>
                {slot.locationOrLink}
              </Text>
            </View>

            <Text style={styles.fieldLabel}>{hu.screens.booking.clientNotesLabel}</Text>
            <TextInput
              value={notes}
              onChangeText={setNotes}
              placeholder={hu.screens.booking.clientNotesPlaceholder}
              placeholderTextColor={colors.textMuted}
              selectionColor={colors.accent}
              multiline
              style={styles.input}
            />
          </ScrollView>

          <Button
            label={hu.screens.booking.confirmBooking}
            loading={busy}
            onPress={() => onConfirm(notes)}
          />
          <Button label={hu.common.cancel} variant="secondary" onPress={onClose} disabled={busy} />
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
  title: {
    color: colors.textPrimary,
    fontSize: typography.sizes.lg,
    fontWeight: typography.weights.semibold,
  },
  body: {
    flexGrow: 0,
  },
  bodyContent: {
    gap: spacing.sm,
    paddingBottom: spacing.sm,
  },
  pillRow: {
    flexDirection: 'row',
    gap: spacing.xs,
  },
  row: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    gap: spacing.md,
  },
  rowLabel: {
    color: colors.textMuted,
    fontSize: typography.sizes.xs,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  rowValue: {
    flexShrink: 1,
    color: colors.textPrimary,
    fontSize: typography.sizes.sm,
    textAlign: 'right',
  },
  fieldLabel: {
    marginTop: spacing.sm,
    color: colors.textSecondary,
    fontSize: typography.sizes.xs,
    fontWeight: typography.weights.medium,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  input: {
    minHeight: 72,
    color: colors.textPrimary,
    fontSize: typography.sizes.sm,
    backgroundColor: colors.surfaceInput,
    borderColor: colors.border,
    borderWidth: 1,
    borderRadius: radius.md,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    textAlignVertical: 'top',
  },
});
