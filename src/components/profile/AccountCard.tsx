import { useState } from 'react';
import { StyleSheet, Text } from 'react-native';
import { Button } from '../Button';
import { Card } from '../Card';
import { TextField } from '../TextField';
import { getDatabase } from '../../db/client';
import { upgradeAccount, validateNewAccount } from '../../services/authService';
import hu from '../../i18n/hu';
import { colors, typography } from '../../theme/tokens';

interface AccountCardProps {
  /** Display username of the logged-in account, or null when the device is not secured. */
  username: string | null;
  /** Called after the profile is secured so the parent reloads its data. */
  onSecured: () => void;
}

/**
 * Profil card for the account state:
 * - logged in → shows the username so users know which account owns the device;
 * - not logged in → the upgrade form that attaches a username + password to the
 *   existing local profile without losing any data.
 */
export function AccountCard({ username, onSecured }: AccountCardProps) {
  const [newUsername, setNewUsername] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [secured, setSecured] = useState(false);

  if (username !== null) {
    return (
      <Card title={hu.screens.profile.account}>
        <Text style={styles.label}>{hu.account.loggedInAs}</Text>
        <Text style={styles.username}>@{username}</Text>
      </Card>
    );
  }

  const submit = async (): Promise<void> => {
    const validation = validateNewAccount(newUsername, password, confirmPassword);
    if (validation !== null) {
      setError(validation);
      return;
    }
    setBusy(true);
    setError(null);
    try {
      const db = await getDatabase();
      await upgradeAccount(db, newUsername, password);
      setSecured(true);
      setPassword('');
      setConfirmPassword('');
      onSecured();
    } catch (cause: unknown) {
      setError(cause instanceof Error ? cause.message : String(cause));
    } finally {
      setBusy(false);
    }
  };

  return (
    <Card title={hu.account.secureTitle}>
      {secured ? <Text style={styles.success}>{hu.account.secured}</Text> : null}
      <Text style={styles.hint}>{hu.account.secureHint}</Text>
      <TextField
        label={hu.account.username}
        value={newUsername}
        onChange={setNewUsername}
        placeholder="anna.kovacs"
        autoCapitalize="none"
        autoCorrect={false}
        hint={hu.account.usernameHint}
      />
      <TextField
        label={hu.account.password}
        value={password}
        onChange={setPassword}
        secureTextEntry
        autoCapitalize="none"
        autoCorrect={false}
        hint={hu.account.passwordHint}
      />
      <TextField
        label={hu.account.confirmPassword}
        value={confirmPassword}
        onChange={setConfirmPassword}
        secureTextEntry
        autoCapitalize="none"
        autoCorrect={false}
      />
      {error !== null ? <Text style={styles.error}>{error}</Text> : null}
      <Button
        label={hu.account.secureCta}
        onPress={() => {
          void submit();
        }}
        loading={busy}
      />
    </Card>
  );
}

const styles = StyleSheet.create({
  label: {
    color: colors.textMuted,
    fontSize: typography.sizes.xs,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  username: {
    color: colors.textPrimary,
    fontSize: typography.sizes.lg,
    fontWeight: typography.weights.semibold,
  },
  hint: {
    color: colors.textSecondary,
    fontSize: typography.sizes.sm,
    lineHeight: typography.sizes.sm * typography.lineHeights.relaxed,
  },
  success: {
    color: colors.success,
    fontSize: typography.sizes.sm,
  },
  error: {
    color: colors.danger,
    fontSize: typography.sizes.sm,
  },
});