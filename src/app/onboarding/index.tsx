import { useEffect, useRef, useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { router } from 'expo-router';
import { Button } from '../../components/Button';
import { Card } from '../../components/Card';
import { Screen } from '../../components/Screen';
import { StepBiometrics } from '../../components/onboarding/StepBiometrics';
import { StepSchedule } from '../../components/onboarding/StepSchedule';
import { StepConstraints } from '../../components/onboarding/StepConstraints';
import { StepContact } from '../../components/onboarding/StepContact';
import { StepAccount } from '../../components/onboarding/StepAccount';
import {
  buildBillingProfileInput,
  buildOnboardingPayload,
  useOnboardingStore,
} from '../../store/useOnboardingStore';
import type { OnboardingStep } from '../../store/useOnboardingStore';
import { getDatabase } from '../../db/client';
import {
  getClientBillingProfile,
  getLocalAuthSession,
  getUserProfile,
  saveClientBillingProfile,
  saveOnboardingPayload,
  USER_PROFILE_ID,
} from '../../db/repository';
import { registerAccount, validateNewAccount } from '../../services/authService';
import { validateClientBillingProfile } from '../../services/billing';
import { describeBillingErrors } from '../../services/billingMessages';
import { generateProgramFromProfile } from '../../services/routineGenerator';
import hu from '../../i18n/hu';
import { colors, radius, spacing, typography } from '../../theme/tokens';

const STEP_TITLES: Record<OnboardingStep, string> = {
  1: hu.onboarding.steps.step1,
  2: hu.onboarding.steps.step2,
  3: hu.onboarding.steps.step3,
  4: hu.onboarding.steps.step4,
  5: hu.onboarding.steps.step5,
};

const STEP_COUNT = 5;

export default function OnboardingScreen() {
  const step = useOnboardingStore((state) => state.step);
  const nextStep = useOnboardingStore((state) => state.nextStep);
  const previousStep = useOnboardingStore((state) => state.previousStep);
  const hydrateFromProfile = useOnboardingStore((state) => state.hydrateFromProfile);
  const hydrateBillingFromProfile = useOnboardingStore((state) => state.hydrateBillingFromProfile);

  const [saving, setSaving] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);
  const [authenticatedUsername, setAuthenticatedUsername] = useState<string | null>(null);
  const hydrated = useRef<boolean>(false);

  // Prefill from the saved profile so "Onboarding újraindítása" edits the
  // existing plan (and billing record) instead of starting from scratch.
  // Also detect an existing login so step 5 does not ask for credentials again.
  useEffect(() => {
    if (hydrated.current) {
      return;
    }
    let cancelled = false;

    getDatabase()
      .then(async (db) => {
        const [profile, billing, session] = await Promise.all([
          getUserProfile(db),
          getClientBillingProfile(db),
          getLocalAuthSession(db),
        ]);
        return { profile, billing, session };
      })
      .then(({ profile, billing, session }) => {
        if (cancelled) {
          return;
        }
        if (session !== null) {
          setAuthenticatedUsername(session.username);
        }
        if (profile !== null) {
          hydrateFromProfile(profile);
        }
        if (billing !== null) {
          hydrateBillingFromProfile(billing);
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
  }, [hydrateFromProfile, hydrateBillingFromProfile]);

  const finish = async (): Promise<void> => {
    setSaving(true);
    setError(null);
    try {
      const db = await getDatabase();
      const draft = useOnboardingStore.getState();
      const session = await getLocalAuthSession(db);
      // A pre-existing (pre-auth) profile being re-onboarded should be secured
      // in place rather than forked into a second account.
      const existingProfile = session === null ? await getUserProfile(db) : null;

      // Required contact/billing fields must validate before anything persists.
      const provisionalUserId = session?.userId ?? USER_PROFILE_ID;
      let billingInput = buildBillingProfileInput(draft, provisionalUserId);
      const validation = validateClientBillingProfile(billingInput);
      if (!validation.valid) {
        setError(describeBillingErrors(validation));
        setSaving(false);
        return;
      }

      let payload = buildOnboardingPayload(draft, provisionalUserId);

      if (session === null) {
        // New user: create the account first so the profile is stored under the
        // server's user id, then persist the same data locally.
        const accountError = validateNewAccount(
          draft.username,
          draft.password,
          draft.confirmPassword,
        );
        if (accountError !== null) {
          setError(accountError);
          setSaving(false);
          return;
        }
        const state = await registerAccount(db, {
          username: draft.username,
          password: draft.password,
          ...(existingProfile !== null ? { userId: existingProfile.userId } : {}),
          profile: payload,
          billingProfile: billingInput,
        });
        payload = buildOnboardingPayload(draft, state.userId);
        billingInput = buildBillingProfileInput(draft, state.userId);
      }

      await saveOnboardingPayload(db, payload);
      await saveClientBillingProfile(db, billingInput);
      // Build the tailored program immediately so the tabs show the real plan.
      await generateProgramFromProfile(db);
      useOnboardingStore.getState().reset();
      router.replace('/(tabs)');
    } catch (cause: unknown) {
      setError(cause instanceof Error ? cause.message : String(cause));
      setSaving(false);
    }
  };

  const isLastStep = step === STEP_COUNT;

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
        accessibilityValue={{ min: 1, max: STEP_COUNT, now: step }}
      >
        {[1, 2, 3, 4, 5].map((index) => (
          <View
            key={index}
            style={[styles.progressSegment, index <= step ? styles.progressSegmentActive : null]}
          />
        ))}
      </View>
      <Text style={styles.progressLabel}>
        {step} / {STEP_COUNT} {hu.onboarding.steps.progressLabel}
      </Text>

      {step === 1 ? (
        <>
          <Card title={hu.account.haveAccount}>
            <Button
              label={hu.account.haveAccount}
              variant="secondary"
              onPress={() => router.push('/login')}
              disabled={saving}
            />
          </Card>
          <StepBiometrics />
        </>
      ) : null}
      {step === 2 ? <StepSchedule /> : null}
      {step === 3 ? <StepConstraints /> : null}
      {step === 4 ? <StepContact /> : null}
      {step === 5 ? <StepAccount authenticatedUsername={authenticatedUsername} /> : null}
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