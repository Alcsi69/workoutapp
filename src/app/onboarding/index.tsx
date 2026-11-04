import { useEffect, useRef, useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { router } from 'expo-router';
import { Button } from '../../components/Button';
import { Screen } from '../../components/Screen';
import { StepBiometrics } from '../../components/onboarding/StepBiometrics';
import { StepSchedule } from '../../components/onboarding/StepSchedule';
import { StepConstraints } from '../../components/onboarding/StepConstraints';
import {
  buildOnboardingPayload,
  useOnboardingStore,
} from '../../store/useOnboardingStore';
import type { OnboardingStep } from '../../store/useOnboardingStore';
import { getDatabase } from '../../db/client';
import { getUserProfile, saveOnboardingPayload, USER_PROFILE_ID } from '../../db/repository';
import { generateProgramFromProfile } from '../../services/routineGenerator';
import hu from '../../i18n/hu';
import { colors, radius, spacing, typography } from '../../theme/tokens';

const STEP_TITLES: Record<OnboardingStep, string> = {
  1: hu.onboarding.steps.step1,
  2: hu.onboarding.steps.step2,
  3: hu.onboarding.steps.step3,
};

export default function OnboardingScreen() {
  const step = useOnboardingStore((state) => state.step);
  const nextStep = useOnboardingStore((state) => state.nextStep);
  const previousStep = useOnboardingStore((state) => state.previousStep);
  const hydrateFromProfile = useOnboardingStore((state) => state.hydrateFromProfile);

  const [saving, setSaving] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);
  const hydrated = useRef<boolean>(false);

  // Prefill from the saved profile so "Onboarding újraindítása" edits the
  // existing plan instead of starting from scratch.
  useEffect(() => {
    if (hydrated.current) {
      return;
    }
    let cancelled = false;

    getDatabase()
      .then((db) => getUserProfile(db))
      .then((profile) => {
        if (!cancelled && profile !== null) {
          hydrateFromProfile(profile);
        }
      })
      .catch(() => {
        // Prefill is best-effort; a failed read must not block the survey.
      })
      .finally(() => {
        hydrated.current = true;
      });

    return () => {
      cancelled = true;
    };
  }, [hydrateFromProfile]);

  const finish = async (): Promise<void> => {
    setSaving(true);
    setError(null);
    try {
      const db = await getDatabase();
      const payload = buildOnboardingPayload(useOnboardingStore.getState(), USER_PROFILE_ID);
      await saveOnboardingPayload(db, payload);
      // Build the tailored program immediately so the tabs show the real plan.
      await generateProgramFromProfile(db);
      useOnboardingStore.getState().reset();
      router.replace('/(tabs)');
    } catch (cause: unknown) {
      setError(cause instanceof Error ? cause.message : String(cause));
      setSaving(false);
    }
  };

  const isLastStep = step === 3;

  const footer = (
    <View style={styles.footer}>
      {error !== null ? <Text style={styles.error}>{error}</Text> : null}
      <View style={styles.footerRow}>
        {step > 1 ? (
          <Button
            label={hu.common.back}
            onPress={previousStep}
            variant="secondary"
            style={styles.backButton}
            disabled={saving}
          />
        ) : null}
        <Button
          label={isLastStep ? hu.onboarding.steps.finish : hu.common.next}
          onPress={() => {
            if (isLastStep) {
              void finish();
              return;
            }
            nextStep();
          }}
          loading={saving}
          style={styles.nextButton}
        />
      </View>
    </View>
  );

  return (
    <Screen
      title={STEP_TITLES[step]}
      subtitle={hu.onboarding.welcome.subtitle}
      footer={footer}
    >
      <View
        style={styles.progress}
        accessibilityRole="progressbar"
        accessibilityValue={{ min: 1, max: 3, now: step }}
      >
        {[1, 2, 3].map((index) => (
          <View
            key={index}
            style={[styles.progressSegment, index <= step ? styles.progressSegmentActive : null]}
          />
        ))}
      </View>
      <Text style={styles.progressLabel}>
        {step} / 3 {hu.onboarding.steps.progressLabel}
      </Text>

      {step === 1 ? <StepBiometrics /> : null}
      {step === 2 ? <StepSchedule /> : null}
      {step === 3 ? <StepConstraints /> : null}
    </Screen>
  );
}

const styles = StyleSheet.create({
  progress: {
    flexDirection: 'row',
    gap: spacing.xs,
  },
  progressSegment: {
    flex: 1,
    height: 3,
    borderRadius: radius.pill,
    backgroundColor: colors.border,
  },
  progressSegmentActive: {
    backgroundColor: colors.accent,
  },
  progressLabel: {
    marginTop: spacing.xs,
    marginBottom: spacing.sm,
    color: colors.textMuted,
    fontSize: typography.sizes.xs,
    textTransform: 'uppercase',
    letterSpacing: 0.6,
  },
  footer: {
    gap: spacing.sm,
  },
  footerRow: {
    flexDirection: 'row',
    gap: spacing.sm,
  },
  backButton: {
    flex: 1,
  },
  nextButton: {
    flex: 2,
  },
  error: {
    color: colors.danger,
    fontSize: typography.sizes.sm,
  },
});