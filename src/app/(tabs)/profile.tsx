import { useCallback, useState } from 'react';
import {
  ActivityIndicator,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { router, useFocusEffect } from 'expo-router';
import * as Clipboard from 'expo-clipboard';
import { Button } from '../../components/Button';
import { Card } from '../../components/Card';
import { Pill } from '../../components/Badge';
import { Screen } from '../../components/Screen';
import { SyncCard } from '../../components/SyncCard';
import { BillingCard } from '../../components/profile/BillingCard';
import { getDatabase } from '../../db/client';
import {
  getClientBillingProfile,
  getExerciseCatalog,
  getUserProfile,
} from '../../db/repository';
import {
  exportFullDatabaseSnapshot,
  importFullDatabaseSnapshot,
} from '../../services/backupService';
import { confirm, notify } from '../../services/dialogs';
import { formatDateHu } from '../../services/format';
import hu from '../../i18n/hu';
import { colors, radius, spacing, typography } from '../../theme/tokens';
import type { ClientBillingProfile, JointConstraintSeverity, UserProfile } from '../../types/workout';

interface ProfileData {
  profile: UserProfile | null;
  billing: ClientBillingProfile | null;
  exerciseNames: Record<string, string>;
}

function severityTone(severity: JointConstraintSeverity): 'danger' | 'warning' | 'neutral' {
  switch (severity) {
    case 'strict_exclude':
      return 'danger';
    case 'avoid_heavy_axial_load':
      return 'warning';
    case 'mild_discomfort':
      return 'neutral';
  }
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <View style={styles.stat}>
      <Text style={styles.statValue}>{value}</Text>
      <Text style={styles.statLabel}>{label}</Text>
    </View>
  );
}

/**
 * Biztonsági mentés card: copies the whole local database to the clipboard as
 * JSON and restores one pasted back, so workouts logged in Expo Go can be moved
 * to a standalone build. Self-contained — it talks to the database directly and
 * asks the parent to reload the profile after a restore.
 */
function BackupSection({ onRestored }: { onRestored: () => void }) {
  const [importText, setImportText] = useState('');
  const [busy, setBusy] = useState(false);

  const copyBackup = async (): Promise<void> => {
    setBusy(true);
    try {
      const db = await getDatabase();
      const json = await exportFullDatabaseSnapshot(db);
      await Clipboard.setStringAsync(json);
      notify(hu.backup.title, hu.backup.copied);
    } catch (cause: unknown) {
      notify(hu.backup.title, cause instanceof Error ? cause.message : String(cause));
    } finally {
      setBusy(false);
    }
  };

  const restoreBackup = (): void => {
    if (importText.trim().length === 0) {
      return;
    }
    confirm({
      title: hu.backup.loadTitle,
      message: hu.backup.loadConfirm,
      confirmLabel: hu.backup.load,
      cancelLabel: hu.common.cancel,
      destructive: true,
      onConfirm: () => {
        void (async () => {
          setBusy(true);
          try {
            const db = await getDatabase();
            const summary = await importFullDatabaseSnapshot(db, importText);
            setImportText('');
            onRestored();
            notify(
              hu.backup.imported,
              `${summary.sessionLogs} ${hu.screens.history.exercisesLabel}, ` +
                `${summary.customExercises} ${hu.picker.customBadge}`,
            );
          } catch (cause: unknown) {
            notify(
              hu.backup.importError,
              cause instanceof Error ? cause.message : String(cause),
            );
          } finally {
            setBusy(false);
          }
        })();
      },
    });
  };

  return (
    <Card title={hu.backup.title}>
      <Text style={styles.backupCaption}>{hu.backup.caption}</Text>
      <Button
        label={hu.backup.copy}
        onPress={() => {
          void copyBackup();
        }}
        loading={busy}
      />
      <Text style={styles.backupHint}>{hu.backup.loadHint}</Text>
      <TextInput
        value={importText}
        onChangeText={setImportText}
        placeholder={hu.backup.loadPlaceholder}
        placeholderTextColor={colors.textMuted}
        selectionColor={colors.accent}
        multiline
        autoCorrect={false}
        autoCapitalize="none"
        style={styles.backupInput}
      />
      <Button
        label={hu.backup.load}
        variant="danger"
        onPress={restoreBackup}
        disabled={importText.trim().length === 0}
      />
    </Card>
  );
}

export default function ProfileScreen() {
  const [data, setData] = useState<ProfileData | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async (): Promise<void> => {
    try {
      const db = await getDatabase();
      const [profile, billing, catalog] = await Promise.all([
        getUserProfile(db),
        getClientBillingProfile(db),
        getExerciseCatalog(db),
      ]);
      const exerciseNames: Record<string, string> = {};
      for (const item of catalog) {
        exerciseNames[item.id] = item.nameHu;
      }
      setData({ profile, billing, exerciseNames });
      setError(null);
    } catch (cause: unknown) {
      setError(cause instanceof Error ? cause.message : String(cause));
    }
  }, []);

  useFocusEffect(
    useCallback(() => {
      void load();
    }, [load]),
  );

  if (data === null) {
    return (
      <Screen title={hu.screens.profile.title}>
        {error !== null ? (
          <Text style={styles.error}>{error}</Text>
        ) : (
          <ActivityIndicator color={colors.accent} style={styles.loader} />
        )}
      </Screen>
    );
  }

  const { profile, billing, exerciseNames } = data;

  if (profile === null) {
    return (
      <Screen title={hu.screens.profile.title}>
        <Card title={hu.screens.profile.missing} caption={hu.screens.profile.missingHint}>
          <Button
            label={hu.screens.profile.startOnboarding}
            onPress={() => router.replace('/onboarding')}
          />
        </Card>
        <BackupSection
          onRestored={() => {
            void load();
          }}
        />
      </Screen>
    );
  }

  const { biometrics, trainingProfile, constraints } = profile;
  const substitutionEntries = Object.entries(constraints.preferredSubstitutions);

  return (
    <Screen title={hu.screens.profile.title}>
      <Card title={hu.screens.profile.biometrics}>
        <View style={styles.statRow}>
          <Stat
            label={hu.screens.profile.ageUnit}
            value={String(biometrics.age)}
          />
          <Stat label={hu.common.kg} value={String(biometrics.weightKg)} />
          <Stat label="cm" value={String(biometrics.heightCm)} />
        </View>
      </Card>

      <Card>
        <View style={styles.kvRow}>
          <Text style={styles.kvLabel}>{hu.screens.profile.goal}</Text>
          <Text style={styles.kvValue}>{hu.onboarding.goals[trainingProfile.primaryGoal]}</Text>
        </View>
        <View style={styles.kvRow}>
          <Text style={styles.kvLabel}>{hu.screens.profile.experience}</Text>
          <Text style={styles.kvValue}>
            {trainingProfile.experienceMonths} {hu.onboarding.constraints.monthsUnit}
          </Text>
        </View>
        <View style={styles.kvRow}>
          <Text style={styles.kvLabel}>{hu.screens.profile.equipment}</Text>
          <Text style={styles.kvValue}>{hu.onboarding.equipment[trainingProfile.equipment]}</Text>
        </View>
      </Card>

      <Card title={hu.screens.profile.weeklySplit}>
        <View style={styles.statRow}>
          <Stat
            label={hu.screens.profile.strengthSuffix}
            value={`${trainingProfile.strengthDaysPerWeek}×`}
          />
          <Stat
            label={hu.screens.profile.runningSuffix}
            value={`${trainingProfile.runningDaysPerWeek}×`}
          />
          <Stat
            label={hu.screens.profile.targetDistance}
            value={
              trainingProfile.targetRunDistanceKm !== undefined
                ? `${trainingProfile.targetRunDistanceKm} ${hu.common.km}`
                : hu.onboarding.constraints.targetDistanceNone
            }
          />
        </View>
      </Card>

      <Card title={hu.screens.profile.constraints}>
        {constraints.jointLimitations.length === 0 ? (
          <Text style={styles.muted}>{hu.screens.profile.noConstraints}</Text>
        ) : (
          <View style={styles.wrap}>
            {constraints.jointLimitations.map((limitation) => (
              <Pill
                key={limitation.area}
                label={`${hu.onboarding.constraints.areas[limitation.area]} · ${
                  hu.onboarding.constraints.severity[limitation.severity]
                }`}
                tone={severityTone(limitation.severity)}
              />
            ))}
          </View>
        )}
      </Card>

      <Card title={hu.screens.profile.substitutions}>
        {substitutionEntries.length === 0 ? (
          <Text style={styles.muted}>{hu.screens.profile.noSubstitutions}</Text>
        ) : (
          substitutionEntries.map(([from, to]) => (
            <Text key={from} style={styles.substitution}>
              {exerciseNames[from] ?? from} → {exerciseNames[to] ?? to}
            </Text>
          ))
        )}
      </Card>

      <BillingCard
        profile={billing}
        onSaved={() => {
          void load();
        }}
      />

      <SyncCard />

      <BackupSection
        onRestored={() => {
          void load();
        }}
      />

      <Text style={styles.updated}>
        {hu.screens.profile.updatedAt}: {formatDateHu(profile.updatedAt)}
      </Text>

      <Button
        label={hu.screens.profile.restart}
        variant="secondary"
        onPress={() => router.push('/onboarding')}
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
  statRow: {
    flexDirection: 'row',
    gap: spacing.md,
  },
  stat: {
    flex: 1,
    backgroundColor: colors.surfaceElevated,
    borderRadius: spacing.sm,
    paddingVertical: spacing.md,
    paddingHorizontal: spacing.sm,
    alignItems: 'center',
    gap: 2,
  },
  statValue: {
    color: colors.textPrimary,
    fontSize: typography.sizes.lg,
    fontWeight: typography.weights.semibold,
    fontVariant: ['tabular-nums'],
  },
  statLabel: {
    color: colors.textMuted,
    fontSize: typography.sizes.xs,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  kvRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    gap: spacing.md,
    paddingVertical: spacing.xs,
  },
  kvLabel: {
    color: colors.textSecondary,
    fontSize: typography.sizes.sm,
  },
  kvValue: {
    flexShrink: 1,
    color: colors.textPrimary,
    fontSize: typography.sizes.sm,
    fontWeight: typography.weights.medium,
    textAlign: 'right',
  },
  wrap: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.xs,
  },
  muted: {
    color: colors.textMuted,
    fontSize: typography.sizes.sm,
  },
  substitution: {
    color: colors.textPrimary,
    fontSize: typography.sizes.sm,
  },
  backupCaption: {
    color: colors.textMuted,
    fontSize: typography.sizes.xs,
    lineHeight: typography.sizes.xs * typography.lineHeights.relaxed,
  },
  backupHint: {
    color: colors.textSecondary,
    fontSize: typography.sizes.xs,
    fontWeight: typography.weights.medium,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  backupInput: {
    minHeight: 96,
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
  updated: {
    color: colors.textMuted,
    fontSize: typography.sizes.xs,
    textAlign: 'center',
  },
});
