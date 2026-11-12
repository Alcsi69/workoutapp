import { StyleSheet, Text, View } from 'react-native';
import { Card } from '../Card';
import { TextField } from '../TextField';
import { useOnboardingStore } from '../../store/useOnboardingStore';
import hu from '../../i18n/hu';
import { colors, spacing, typography } from '../../theme/tokens';

interface StepAccountProps {
  /** When set, the device is already logged in and no new credentials are needed. */
  authenticatedUsername: string | null;
}

/**
 * Onboarding step 5 — account creation. Keeps the credentials in the onboarding
 * store so the final save can register them together with the profile. When the
 * device is already logged in (re-onboarding), it just confirms the account.
 */
export function StepAccount({ authenticatedUsername }: StepAccountProps) {
  const username = useOnboardingStore((state) => state.username);
  const password = useOnboardingStore((state) => state.password);
  const confirmPassword = useOnboardingStore((state) => state.confirmPassword);
  const updateAccount = useOnboardingStore((state) => state.updateAccount);

  if (authenticatedUsername !== null) {
    return (
      <Card title={hu.account.alreadyLoggedIn}>
        <Text style={styles.username}>@{authenticatedUsername}</Text>
        <Text style={styles.hint}>{hu.account.alreadyLoggedInHint}</Text>
      </Card>
    );
  }

  return (
    <View style={styles.container}>
      <Text style={styles.subtitle}>{hu.account.accountStepSubtitle}</Text>
      <Card title={hu.account.accountStepTitle}>
        <TextField
          label={hu.account.username}
          value={username}
          onChange={(value) => updateAccount({ username: value })}
          placeholder="anna.kovacs"
          autoCapitalize="none"
          autoCorrect={false}
          hint={hu.account.usernameHint}
        />
        <TextField
          label={hu.account.password}
          value={password}
          onChange={(value) => updateAccount({ password: value })}
          secureTextEntry
          autoCapitalize="none"
          autoCorrect={false}
          hint={hu.account.passwordHint}
        />
        <TextField
          label={hu.account.confirmPassword}
          value={confirmPassword}
          onChange={(value) => updateAccount({ confirmPassword: value })}
          secureTextEntry
          autoCapitalize="none"
          autoCorrect={false}
        />
      </Card>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    gap: spacing.md,
  },
  subtitle: {
    color: colors.textSecondary,
    fontSize: typography.sizes.sm,
    lineHeight: typography.sizes.sm * typography.lineHeights.relaxed,
  },
  username: {
    color: colors.textPrimary,
    fontSize: typography.sizes.lg,
    fontWeight: typography.weights.semibold,
  },
  hint: {
    color: colors.textMuted,
    fontSize: typography.sizes.sm,
    lineHeight: typography.sizes.sm * typography.lineHeights.relaxed,
  },
});