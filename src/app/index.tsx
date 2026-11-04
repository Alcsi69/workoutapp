import { useEffect, useState } from 'react';
import { ActivityIndicator, StyleSheet, Text, View } from 'react-native';
import { Redirect } from 'expo-router';
import { getDatabase } from '../db/client';
import { getUserProfile } from '../db/repository';
import hu from '../i18n/hu';
import { colors, spacing, typography } from '../theme/tokens';

type Destination = '/(tabs)' | '/onboarding';

/**
 * Entry gate: runs after the root layout has initialized the database, then
 * routes to onboarding the first time and to the tabs once a profile exists.
 */
export default function Index() {
  const [destination, setDestination] = useState<Destination | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;

    getDatabase()
      .then((db) => getUserProfile(db))
      .then((profile) => {
        if (!cancelled) {
          setDestination(profile === null ? '/onboarding' : '/(tabs)');
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