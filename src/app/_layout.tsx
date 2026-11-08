import { useEffect, useState } from 'react';
import { ActivityIndicator, StyleSheet, Text, View } from 'react-native';
import { Stack } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { AutoSync } from '../components/AutoSync';
import { getDatabase } from '../db/client';
import hu from '../i18n/hu';
import { colors, spacing, typography } from '../theme/tokens';

export default function RootLayout() {
  const [ready, setReady] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    getDatabase()
      .then(() => {
        if (!cancelled) {
          setReady(true);
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
      <View style={styles.gate}>
        <StatusBar style="light" />
        <Text style={styles.errorTitle}>{hu.common.error}</Text>
        <Text style={styles.errorDetail}>{error}</Text>
      </View>
    );
  }

  if (!ready) {
    return (
      <View style={styles.gate}>
        <StatusBar style="light" />
        <ActivityIndicator color={colors.accent} size="large" />
        <Text style={styles.loadingText}>{hu.common.loading}</Text>
      </View>
    );
  }

  return (
    <>
      <StatusBar style="light" />
      <AutoSync />
      <Stack screenOptions={{ headerShown: false, contentStyle: styles.stack }} />
    </>
  );
}

const styles = StyleSheet.create({
  gate: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.background,
    padding: spacing.xl,
  },
  loadingText: {
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
  stack: {
    backgroundColor: colors.background,
  },
});
