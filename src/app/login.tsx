import { useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { router } from 'expo-router';
import { Button } from '../components/Button';
import { Card } from '../components/Card';
import { Screen } from '../components/Screen';
import { TextField } from '../components/TextField';
import { getDatabase } from '../db/client';
import { loginWithCredentials, validateLogin } from '../services/authService';
import hu from '../i18n/hu';
import { colors, spacing, typography } from '../theme/tokens';

/**
 * Login screen for returning users — reachable from the first onboarding step,
 * after logout, or directly (e.g. an iOS user who just added the PWA to the
 * Home Screen). A successful login restores the full local database and enters
 * the main app without redoing onboarding.
 */
export default function LoginScreen() {
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const submit = async (): Promise<void> => {
    const validation = validateLogin(username, password);
    if (validation !== null) {
      setError(validation);
      return;
    }
    setBusy(true);
    setError(null);
    try {
      const db = await getDatabase();
      await loginWithCredentials(db, { username, password });
      router.replace('/(tabs)');
    } catch (cause: unknown) {
      setError(cause instanceof Error ? cause.message : String(cause));
      setBusy(false);
    }
  };

  return (
    <Screen title={hu.account.loginTitle} subtitle={hu.account.loginSubtitle}>
      <Card>
        <TextField
          label={hu.account.username}
          value={username}
          onChange={setUsername}
          placeholder="anna.kovacs"
          autoCapitalize="none"
          autoCorrect={false}
        />
        <TextField
          label={hu.account.password}
          value={password}
          onChange={setPassword}
          secureTextEntry
          autoCapitalize="none"
          autoCorrect={false}
        />
        {error !== null ? <Text style={styles.error}>{error}</Text> : null}
        <Button
          label={hu.account.loginCta}
          onPress={() => {
            void submit();
          }}
          loading={busy}
        />
      </Card>

      <View style={styles.footer}>
        <Text style={styles.footerText}>{hu.account.noAccount}</Text>
        <Button
          label={hu.account.noAccount}
          variant="ghost"
          onPress={() => router.replace('/onboarding')}
          disabled={busy}
        />
      </View>
    </Screen>
  );
}

const styles = StyleSheet.create({
  error: {
    color: colors.danger,
    fontSize: typography.sizes.sm,
  },
  footer: {
    alignItems: 'center',
    gap: spacing.xs,
    paddingTop: spacing.sm,
  },
  footerText: {
    color: colors.textMuted,
    fontSize: typography.sizes.sm,
  },
});