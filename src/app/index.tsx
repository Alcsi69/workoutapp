import { useEffect, useState } from 'react';
import { ActivityIndicator, StyleSheet, Text, View } from 'react-native';
import { getExerciseCount } from '../db/client';
import hu from '../i18n/hu';
import { colors, radius, spacing, typography } from '../theme/tokens';

export default function Index() {
  const [count, setCount] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    getExerciseCount()
      .then((value) => {
        if (!cancelled) {
          setCount(value);
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

  const isLoading = count === null && error === null;

  return (
    <View style={styles.container}>
      <Text style={styles.appName}>{hu.app.name}</Text>
      <Text style={styles.subtitle}>{hu.db.runtimeReady}</Text>

      <View style={styles.card}>
        <Text style={styles.cardLabel}>{hu.db.exerciseCountLabel}</Text>
        {isLoading ? (
          <ActivityIndicator color={colors.accent} />
        ) : error !== null ? (
          <Text style={styles.cardError}>{error}</Text>
        ) : (
          <Text style={styles.cardValue}>{count}</Text>
        )}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.background,
    padding: spacing.xl,
  },
  appName: {
    color: colors.textPrimary,
    fontSize: typography.sizes.display,
    fontWeight: typography.weights.bold,
  },
  subtitle: {
    color: colors.textSecondary,
    fontSize: typography.sizes.md,
    marginTop: spacing.sm,
    textAlign: 'center',
  },
  card: {
    marginTop: spacing.xxl,
    minWidth: 220,
    alignItems: 'center',
    backgroundColor: colors.surface,
    borderColor: colors.border,
    borderWidth: 1,
    borderRadius: radius.lg,
    paddingVertical: spacing.lg,
    paddingHorizontal: spacing.xl,
  },
  cardLabel: {
    color: colors.textSecondary,
    fontSize: typography.sizes.sm,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  cardValue: {
    marginTop: spacing.sm,
    color: colors.accent,
    fontSize: typography.sizes.display,
    fontWeight: typography.weights.bold,
  },
  cardError: {
    marginTop: spacing.sm,
    color: colors.danger,
    fontSize: typography.sizes.sm,
    textAlign: 'center',
  },
});
