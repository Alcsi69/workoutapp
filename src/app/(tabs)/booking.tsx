import { useCallback, useState } from 'react';
import { ActivityIndicator, StyleSheet, Text, View } from 'react-native';
import { useFocusEffect } from 'expo-router';
import { Button } from '../../components/Button';
import { Card } from '../../components/Card';
import { Chip, Pill } from '../../components/Badge';
import { Screen } from '../../components/Screen';
import { BookingModal } from '../../components/booking/BookingModal';
import { getDatabase } from '../../db/client';
import {
  cancelCoachingBooking,
  createCoachingBooking,
  getCoachingBookings,
  getOpenCoachingSlots,
} from '../../db/repository';
import { useSyncRefresh } from '../../hooks/useSyncRefresh';
import { confirm, notify } from '../../services/dialogs';
import { formatDateTimeHu } from '../../services/format';
import hu from '../../i18n/hu';
import { colors, spacing, typography } from '../../theme/tokens';
import type {
  CoachingBooking,
  CoachingBookingStatus,
  CoachingModality,
  CoachingSlot,
} from '../../types/workout';

/** Slot/bookings filter: all modalities, or one of them. */
type BookingFilter = 'all' | CoachingModality;

const FILTERS: readonly BookingFilter[] = ['all', 'online_call', 'irl_gym'];

function filterLabel(filter: BookingFilter): string {
  switch (filter) {
    case 'all':
      return hu.screens.booking.filterAll;
    case 'online_call':
      return hu.screens.booking.filterOnline;
    case 'irl_gym':
      return hu.screens.booking.filterIrl;
  }
}

function statusTone(status: CoachingBookingStatus): 'warning' | 'success' | 'accent' | 'danger' {
  switch (status) {
    case 'pending':
      return 'warning';
    case 'confirmed':
      return 'success';
    case 'completed':
      return 'accent';
    case 'cancelled':
      return 'danger';
  }
}

/** A booking is "upcoming" while it is open and has not ended yet. */
function isUpcoming(booking: CoachingBooking, now: Date): boolean {
  if (booking.status === 'cancelled' || booking.status === 'completed') {
    return false;
  }
  return new Date(booking.endsAt).getTime() >= now.getTime();
}

function SlotCard({ slot, onBook }: { slot: CoachingSlot; onBook: (slot: CoachingSlot) => void }) {
  return (
    <Card>
      <View style={styles.headerRow}>
        <Text style={styles.title}>{hu.modalities[slot.modality]}</Text>
        <Pill label={hu.modalities[slot.modality]} tone="accent" />
      </View>
      <Text style={styles.when}>{formatDateTimeHu(slot.startsAt)}</Text>
      <Text style={styles.muted} numberOfLines={2}>
        {slot.locationOrLink}
      </Text>
      <Button label={hu.screens.booking.book} onPress={() => onBook(slot)} />
    </Card>
  );
}

function BookingRow({
  booking,
  upcoming,
  busy,
  onCancel,
}: {
  booking: CoachingBooking;
  upcoming: boolean;
  busy: boolean;
  onCancel: (booking: CoachingBooking) => void;
}) {
  return (
    <Card>
      <View style={styles.headerRow}>
        <Text style={styles.title}>{hu.modalities[booking.modality]}</Text>
        <Pill label={hu.bookingStatuses[booking.status]} tone={statusTone(booking.status)} />
      </View>
      <Text style={styles.when}>{formatDateTimeHu(booking.startsAt)}</Text>
      <Text style={styles.muted} numberOfLines={2}>
        {booking.locationOrLink}
      </Text>
      {booking.clientNotes !== undefined ? (
        <Text style={styles.notes}>
          {hu.screens.booking.yourNotes}: {booking.clientNotes}
        </Text>
      ) : null}
      {booking.coachNotes !== undefined ? (
        <Text style={styles.notes}>
          {hu.screens.booking.coachNotes}: {booking.coachNotes}
        </Text>
      ) : null}
      {upcoming ? (
        <Button
          label={hu.screens.booking.cancelBooking}
          variant="danger"
          loading={busy}
          onPress={() => onCancel(booking)}
        />
      ) : null}
    </Card>
  );
}

export default function BookingScreen() {
  const [slots, setSlots] = useState<CoachingSlot[] | null>(null);
  const [bookings, setBookings] = useState<CoachingBooking[]>([]);
  const [filter, setFilter] = useState<BookingFilter>('all');
  const [selectedSlot, setSelectedSlot] = useState<CoachingSlot | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async (): Promise<void> => {
    const db = await getDatabase();
    const [nextSlots, nextBookings] = await Promise.all([
      getOpenCoachingSlots(db),
      getCoachingBookings(db),
    ]);
    setSlots(nextSlots);
    setBookings(nextBookings);
  }, []);

  const { refreshing, refresh } = useSyncRefresh(load);

  useFocusEffect(
    useCallback(() => {
      let cancelled = false;
      getDatabase()
        .then(async (db) => {
          const [nextSlots, nextBookings] = await Promise.all([
            getOpenCoachingSlots(db),
            getCoachingBookings(db),
          ]);
          if (!cancelled) {
            setSlots(nextSlots);
            setBookings(nextBookings);
            setError(null);
          }
        })
        .catch((cause: unknown) => {
          if (!cancelled) {
            setError(cause instanceof Error ? cause.message : String(cause));
          }
        });
      return () => {
        cancelled = true;
      };
    }, []),
  );

  const confirmBooking = async (clientNotes: string): Promise<void> => {
    if (selectedSlot === null) {
      return;
    }
    setBusy(true);
    setError(null);
    try {
      const db = await getDatabase();
      await createCoachingBooking(db, selectedSlot.id, clientNotes);
      setSelectedSlot(null);
      await load();
      notify(hu.screens.booking.bookTitle, hu.screens.booking.booked);
    } catch (cause: unknown) {
      setError(cause instanceof Error ? cause.message : String(cause));
    } finally {
      setBusy(false);
    }
  };

  const cancelBooking = (booking: CoachingBooking): void => {
    confirm({
      title: hu.screens.booking.cancelBooking,
      message: hu.screens.booking.cancelConfirm,
      confirmLabel: hu.screens.booking.cancelBooking,
      cancelLabel: hu.common.cancel,
      destructive: true,
      onConfirm: () => {
        void (async () => {
          setBusy(true);
          try {
            const db = await getDatabase();
            await cancelCoachingBooking(db, booking.id);
            await load();
            notify(hu.screens.booking.bookTitle, hu.screens.booking.cancelled);
          } catch (cause: unknown) {
            setError(cause instanceof Error ? cause.message : String(cause));
          } finally {
            setBusy(false);
          }
        })();
      },
    });
  };

  if (slots === null) {
    return (
      <Screen title={hu.tabs.booking} subtitle={hu.screens.booking.subtitle}>
        {error !== null ? (
          <Text style={styles.error}>{error}</Text>
        ) : (
          <ActivityIndicator color={colors.accent} style={styles.loader} />
        )}
      </Screen>
    );
  }

  const now = new Date();
  const visibleSlots = slots.filter((slot) => filter === 'all' || slot.modality === filter);
  const upcoming = bookings.filter((booking) => isUpcoming(booking, now));
  const past = bookings.filter((booking) => !isUpcoming(booking, now));

  return (
    <Screen
      title={hu.tabs.booking}
      subtitle={hu.screens.booking.subtitle}
      onRefresh={refresh}
      refreshing={refreshing}
    >
      <View style={styles.filterRow}>
        {FILTERS.map((option) => (
          <Chip
            key={option}
            label={filterLabel(option)}
            selected={filter === option}
            onPress={() => setFilter(option)}
          />
        ))}
      </View>

      {error !== null ? <Text style={styles.error}>{error}</Text> : null}

      <Text style={styles.groupTitle}>{hu.screens.booking.openSlots}</Text>
      {visibleSlots.length === 0 ? (
        <Card>
          <Text style={styles.muted}>{hu.screens.booking.noOpenSlots}</Text>
        </Card>
      ) : (
        visibleSlots.map((slot) => <SlotCard key={slot.id} slot={slot} onBook={setSelectedSlot} />)
      )}

      <Text style={styles.groupTitle}>{hu.screens.booking.myBookings}</Text>
      {bookings.length === 0 ? (
        <Card>
          <Text style={styles.muted}>{hu.screens.booking.noBookings}</Text>
        </Card>
      ) : (
        <>
          {upcoming.length > 0 ? (
            <Text style={styles.subGroupTitle}>{hu.screens.booking.upcoming}</Text>
          ) : null}
          {upcoming.map((booking) => (
            <BookingRow
              key={booking.id}
              booking={booking}
              upcoming
              busy={busy}
              onCancel={cancelBooking}
            />
          ))}
          {past.length > 0 ? (
            <Text style={styles.subGroupTitle}>{hu.screens.booking.past}</Text>
          ) : null}
          {past.map((booking) => (
            <BookingRow
              key={booking.id}
              booking={booking}
              upcoming={false}
              busy={busy}
              onCancel={cancelBooking}
            />
          ))}
        </>
      )}

      <BookingModal
        visible={selectedSlot !== null}
        slot={selectedSlot}
        busy={busy}
        onClose={() => setSelectedSlot(null)}
        onConfirm={(notes) => {
          void confirmBooking(notes);
        }}
      />
    </Screen>
  );
}

const styles = StyleSheet.create({
  loader: {
    marginTop: spacing.xl,
  },
  error: {
    color: colors.danger,
    fontSize: typography.sizes.sm,
  },
  filterRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.xs,
  },
  groupTitle: {
    marginTop: spacing.sm,
    color: colors.textSecondary,
    fontSize: typography.sizes.xs,
    fontWeight: typography.weights.semibold,
    textTransform: 'uppercase',
    letterSpacing: 0.8,
  },
  subGroupTitle: {
    marginTop: spacing.xs,
    color: colors.textMuted,
    fontSize: typography.sizes.xs,
    fontWeight: typography.weights.medium,
    textTransform: 'uppercase',
    letterSpacing: 0.6,
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
  when: {
    color: colors.accent,
    fontSize: typography.sizes.sm,
    fontWeight: typography.weights.medium,
    fontVariant: ['tabular-nums'],
  },
  muted: {
    color: colors.textMuted,
    fontSize: typography.sizes.sm,
  },
  notes: {
    color: colors.textSecondary,
    fontSize: typography.sizes.xs,
    fontStyle: 'italic',
  },
});
