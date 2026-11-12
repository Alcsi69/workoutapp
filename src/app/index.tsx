import { useEffect, useState } from 'react';
import { ActivityIndicator, StyleSheet, Text, View } from 'react-native';
import { Redirect } from 'expo-router';
import { getDatabase } from '../db/client';
import { getLocalAuthSession, getUserProfile } from '../db/repository';
import hu from '../i18n/hu';
import { colors, spacing, typography } from '../theme/tokens';

type Destination = '/(tabs)' | '/onboarding';

/**
 * Entry gate: runs after the root layout has initialized the database.
 *
 * The app only enters the tabs for a device that is BOTH logged in and has a
 * profile. A fresh browser/device with no auth token always lands on the welcome
 * screen (onboarding step 1), where the user can log in or register — local or
 * remotely-pulled data can never auto-complete onboarding.
 */
export default function Index() {
  const [destination, setDestination] = useState<Destination | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;

    getDatabase()
      .then(async (db) => {
        const session = await getLocalAuthSession(db);
        if (session === null) {
          return { session, profile: null };
        }
        const profile = await getUserProfile(db);
        return { session, profile };
      })
      .then(({ session, profile }) => {
        if (!cancelled) {
          setDestination(session !== null && profile !== null ? '/(tabs)' : '/onboarding');
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
  }, []);

  if (error !== null) {
    return (
      <View style={styles.container}>
        <Text style={styles.errorTitle}>{hu.common.error}</Text>
        <Text style={styles.errorDetail}>{error}</Text>
      </View>
    );
  }

  if (destination === null) {
    return (
      <View style={styles.container}>
        <ActivityIndicator color={colors.accent} size="large" />
        <Text style={styles.loading}>{hu.common.loading}</Text>
      </View>
    );
  }

  return <Redirect href={destination} />;
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.background,
    padding: spacing.xl,
  },
  loading: {
    marginTop: spacing.lg,
    color: colors.textSecondary,
    fontSize: typography.sizes.md,
  },
  errorTitle: {
    color: colors.danger,
    fontSize: typography.sizes.lg,
    fontWeight: typography.weights.semibold,
  },
  errorDetail: {
    marginTop: spacing.sm,
    color: colors.textMuted,
    fontSize: typography.sizes.sm,
    textAlign: 'center',
  },
});