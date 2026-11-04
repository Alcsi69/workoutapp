import { useCallback, useEffect, useState } from 'react';
import { ActivityIndicator, Alert, StyleSheet, Text, View } from 'react-native';
import { router, useLocalSearchParams } from 'expo-router';
import { Button } from '../../components/Button';
import { Screen } from '../../components/Screen';
import { RestTimerBar } from '../../components/logger/RestTimerBar';
import { ExerciseBlockCard } from '../../components/logger/ExerciseBlockCard';
import type { SetDraft } from '../../components/logger/ExerciseBlockCard';
import { RunningLoggerCard } from '../../components/logger/RunningLoggerCard';
import { SubstitutionModal } from '../../components/logger/SubstitutionModal';
import { getDatabase } from '../../db/client';
import {
  completeSession,
  deleteSetLog,
  discardSession,
  getSessionDetail,
  getSubstitutionCandidates,
  substituteExerciseInBlock,
  upsertRunningMetrics,
  upsertSetLog,
} from '../../db/repository';
import type { RunningMetricsInput, SetLogInput } from '../../db/repository';
import {
  computeRestRemainingMs,
  restIsActive,
  useActiveWorkoutStore,
} from '../../store/useActiveWorkoutStore';
import hu from '../../i18n/hu';
import { colors, spacing, typography } from '../../theme/tokens';
import type {
  ExerciseCatalogItem,
  SessionExerciseBlock,
  WorkoutSessionLog,
} from '../../types/workout';

interface SubstitutionState {
  block: SessionExerciseBlock;
  candidates: ExerciseCatalogItem[];
}

function toSetLogInput(block: SessionExerciseBlock, draft: SetDraft): SetLogInput {
  const input: SetLogInput = {
    setNumber: draft.setNumber,
    setType: draft.setType,
    actualWeightKg: Number.parseFloat(draft.weight.replace(',', '.')) || 0,
    actualReps: Number.parseInt(draft.reps, 10) || 0,
  };
  if (draft.setLogId !== null) {
    input.id = draft.setLogId;
  }
  if (draft.rpe !== null) {
    input.rpe = draft.rpe;
  }
  if (block.targetReps !== undefined) {
    input.targetReps = block.targetReps;
  }
  return input;
}

/**
 * Active workout logger: strength/hybrid blocks with per-set logging and the
 * mid-workout substitute picker, or a running card for running/hybrid sessions.
 * Sets persist immediately; finishing or discarding pops back to the tabs.
 */
export default function WorkoutLoggerScreen() {
  const params = useLocalSearchParams<{ id: string }>();
  const sessionId = params.id;

  const [detail, setDetail] = useState<WorkoutSessionLog | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [substitution, setSubstitution] = useState<SubstitutionState | null>(null);
  const [nowMs, setNowMs] = useState<number>(() => Date.now());

  const restEndTimeMs = useActiveWorkoutStore((state) => state.restEndTimeMs);
  const startRest = useActiveWorkoutStore((state) => state.startRest);
  const adjustRest = useActiveWorkoutStore((state) => state.adjustRest);
  const skipRest = useActiveWorkoutStore((state) => state.skipRest);
  const setSession = useActiveWorkoutStore((state) => state.setSession);
  const resetStore = useActiveWorkoutStore((state) => state.reset);

  const reload = useCallback(async (): Promise<void> => {
    const db = await getDatabase();
    const next = await getSessionDetail(db, sessionId);
    setDetail(next);
    if (next === null) {
      setError(hu.common.error);
    }
  }, [sessionId]);

  // Load once, and register the session with the store for the rest timer.
  useEffect(() => {
    let cancelled = false;
    setSession(sessionId);
    getDatabase()
      .then((db) => getSessionDetail(db, sessionId))
      .then((next) => {
        if (!cancelled) {
          setDetail(next);
          setError(next === null ? hu.common.error : null);
        }
      })
      .catch((cause: unknown) => {
        if (!cancelled) {
          setError(cause instanceof Error ? cause.message : String(cause));
        }
      });
    return () => {
      cancelled = true;
      resetStore();
    };
  }, [sessionId, setSession, resetStore]);

  // Rest countdown derives from the absolute end timestamp on every tick.
  useEffect(() => {
    const timer = setInterval(() => setNowMs(Date.now()), 1000);
    return () => clearInterval(timer);
  }, []);

  useEffect(() => {
    if (restEndTimeMs !== null && !restIsActive(restEndTimeMs, nowMs)) {
      skipRest();
    }
  }, [restEndTimeMs, nowMs, skipRest]);

  const handlePersistSet = useCallback(
    async (block: SessionExerciseBlock, draft: SetDraft): Promise<string> => {
      const db = await getDatabase();
      const setLog = await upsertSetLog(db, block.id, toSetLogInput(block, draft));
      // A fresh set (not an edit) starts the block's rest timer.
      if (draft.setLogId === null && block.restSeconds > 0) {
        startRest(block.id, block.restSeconds);
      }
      return setLog.id;
    },
    [startRest],
  );

  const handleDeleteSet = useCallback(async (draft: SetDraft): Promise<void> => {
    if (draft.setLogId === null) {
      return;
    }
    const db = await getDatabase();
    await deleteSetLog(db, draft.setLogId);
  }, []);

  const handleSubstitute = useCallback(async (block: SessionExerciseBlock): Promise<void> => {
    const db = await getDatabase();
    const candidates = await getSubstitutionCandidates(db, block.id);
    setSubstitution({ block, candidates });
  }, []);

  const handlePickSubstitute = useCallback(
    async (exerciseId: string): Promise<void> => {
      const target = substitution;
      setSubstitution(null);
      if (target === null) {
        return;
      }
      const db = await getDatabase();
      await substituteExerciseInBlock(db, target.block.id, exerciseId);
      await reload();
    },
    [substitution, reload],
  );

  const handleSaveRunning = useCallback(
    async (input: RunningMetricsInput): Promise<void> => {
      if (detail === null) {
        return;
      }
      const db = await getDatabase();
      await upsertRunningMetrics(db, detail.id, input);
    },
    [detail],
  );

  const handleFinish = useCallback((): void => {
    if (detail === null) {
      return;
    }
    Alert.alert(hu.logger.finishWorkout, hu.logger.finishConfirm, [
      { text: hu.common.cancel, style: 'cancel' },
      {
        text: hu.logger.finishWorkout,
        onPress: () => {
          void (async () => {
            const db = await getDatabase();
            await completeSession(db, detail.id);
            resetStore();
            router.replace('/(tabs)/history');
          })();
        },
      },
    ]);
  }, [detail, resetStore]);

  const handleDiscard = useCallback((): void => {
    if (detail === null) {
      return;
    }
    Alert.alert(hu.logger.discard, hu.logger.discardConfirmBody, [
      { text: hu.common.cancel, style: 'cancel' },
      {
        text: hu.logger.discard,
        style: 'destructive',
        onPress: () => {
          void (async () => {
            const db = await getDatabase();
            await discardSession(db, detail.id);
            resetStore();
            router.replace('/(tabs)');
          })();
        },
      },
    ]);
  }, [detail, resetStore]);

  if (detail === null) {
    return (
      <Screen title={hu.logger.title} subtitle={undefined}>
        {error !== null ? (
          <Text style={styles.error}>{error}</Text>
        ) : (
          <ActivityIndicator color={colors.accent} style={styles.loader} />
        )}
      </Screen>
    );
  }

  const remainingMs = computeRestRemainingMs(restEndTimeMs, nowMs);
  const showRest = restIsActive(restEndTimeMs, nowMs);
  const isStrength = detail.sessionType === 'strength' || detail.sessionType === 'hybrid';
  const isRunning = detail.sessionType === 'running' || detail.sessionType === 'hybrid';
  const recommendedIds =
    substitution !== null ? substitution.block.exercise.defaultSubstituteIds : [];

  return (
    <Screen
      title={detail.title}
      subtitle={hu.sessionTypes[detail.sessionType]}
      footer={
        <View style={styles.footer}>
          <Button label={hu.logger.finishWorkout} onPress={handleFinish} />
          <Button label={hu.logger.discard} variant="secondary" onPress={handleDiscard} />
        </View>
      }
    >
      {showRest ? (
        <RestTimerBar
          remainingMs={remainingMs}
          onAdjust={(delta) => adjustRest(delta)}
          onSkip={skipRest}
        />
      ) : null}

      {isRunning ? (
        <RunningLoggerCard metrics={detail.runningMetrics} onSave={handleSaveRunning} />
      ) : null}

      {isStrength
        ? detail.exerciseBlocks.map((block) => (
            <ExerciseBlockCard
              key={block.id}
              block={block}
              onPersistSet={handlePersistSet}
              onDeleteSet={handleDeleteSet}
              onSubstitute={handleSubstitute}
            />
          ))
        : null}

      <SubstitutionModal
        visible={substitution !== null}
        currentExercise={substitution !== null ? substitution.block.exercise : null}
        candidates={substitution !== null ? substitution.candidates : []}
        recommendedIds={recommendedIds}
        onPick={(exerciseId) => {
          void handlePickSubstitute(exerciseId);
        }}
        onClose={() => setSubstitution(null)}
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
  footer: {
    gap: spacing.sm,
  },
});
