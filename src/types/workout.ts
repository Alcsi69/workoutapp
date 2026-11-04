// Core domain types for WorkoutApp.
// Transcribed from /docs/TYPES.md. Zero `any` — all unions and literal types preserved.

export type TrainingGoal =
  | 'strength'
  | 'hypertrophy'
  | 'powerbuilding'
  | 'hybrid_strength_running';

export type EquipmentTier =
  | 'full_gym'
  | 'barbell_rack'
  | 'dumbbell_only'
  | 'bodyweight';

export type JointArea =
  | 'knees'
  | 'lower_back'
  | 'shoulders'
  | 'wrists'
  | 'elbows'
  | 'hips';

export type SetType =
  | 'warmup'
  | 'working'
  | 'top_set'
  | 'backoff'
  | 'drop_set'
  | 'failure';

export type JointConstraintSeverity =
  | 'mild_discomfort'
  | 'avoid_heavy_axial_load'
  | 'strict_exclude';

export interface JointConstraint {
  area: JointArea;
  severity: JointConstraintSeverity;
  notes?: string;
}

export interface OnboardingPayload {
  userId: string;
  locale: 'hu' | 'en';
  biometrics: {
    age: number;
    weightKg: number;
    heightCm: number;
  };
  trainingProfile: {
    primaryGoal: TrainingGoal;
    experienceMonths: number;
    strengthDaysPerWeek: number;
    runningDaysPerWeek: number;
    targetRunDistanceKm?: number; // e.g., 5 or 7 km target
    sessionDurationMinutes: number;
    equipment: EquipmentTier;
  };
  constraints: {
    jointLimitations: JointConstraint[];
    excludedExerciseIds: string[];
    preferredSubstitutions: Record<string, string>; // e.g., { "hack_squat": "belt_squat" }
  };
}

/**
 * Persisted onboarding result. Structurally identical to OnboardingPayload plus
 * the bookkeeping columns the profile row carries, so `getUserProfile` and
 * `saveOnboardingPayload` stay symmetric.
 */
export interface UserProfile extends OnboardingPayload {
  onboardingCompletedAt: string; // ISO-8601
  updatedAt: string; // ISO-8601
}

export type ExerciseCategory =
  | 'compound_lower'
  | 'compound_upper'
  | 'isolation'
  | 'machine'
  | 'cardio_run';

export type LoadScore = 1 | 2 | 3 | 4 | 5;

export interface ExerciseCatalogItem {
  id: string; // e.g., "romanian_deadlift", "belt_squat", "front_squat"
  nameHu: string;
  nameEn: string;
  category: ExerciseCategory;
  primaryMuscles: string[];
  axialLoadScore: LoadScore;
  kneeStressScore: LoadScore;
  defaultSubstituteIds: string[];
}

export interface SetLog {
  id: string;
  setNumber: number;
  setType: SetType;
  targetWeightKg?: number;
  actualWeightKg: number;
  targetReps: string; // e.g., "6-8"
  actualReps: number;
  rpe?: number; // 5.0 - 10.0 in 0.5 increments
  completedAt: string; // ISO-8601
}

export interface WorkoutExerciseBlock {
  id: string;
  orderIndex: number;
  exerciseId: string;
  substitutedFromExerciseId?: string;
  restSeconds: number;
  notes?: string;
  /** Prescription copied from the template (absent for ad-hoc blocks). */
  targetSets?: number;
  targetReps?: string;
  sets: SetLog[];
}

/**
 * A logged session block hydrated with its catalog entry — the shape the
 * workout logger renders. `exercise` is the *effective* exercise (the
 * substitute when the block was swapped mid-workout).
 */
export interface SessionExerciseBlock extends WorkoutExerciseBlock {
  sessionId: string;
  exercise: ExerciseCatalogItem;
}

export interface RunningMetrics {
  distanceKm: number;
  durationSeconds: number;
  avgPaceSecondsPerKm: number;
  perceivedEffortRpe?: number;
}

export type SessionType = 'strength' | 'running' | 'hybrid';
export type SyncStatus = 'local_dirty' | 'synced';

export interface WorkoutSessionLog {
  id: string;
  programDayId?: string;
  sessionType: SessionType;
  title: string; // e.g., "Lower Body B (RDL Focus)" or "5K Tempo Run"
  startedAt: string;
  completedAt?: string;
  exerciseBlocks: SessionExerciseBlock[];
  runningMetrics?: RunningMetrics;
  syncStatus: SyncStatus;
}

// --- Program templates (seeded, read-mostly) -------------------------------

export interface TemplateExerciseBlock {
  id: string;
  templateId: string;
  orderIndex: number;
  exerciseId: string;
  substitutedFromExerciseId?: string;
  restSeconds: number;
  notes?: string;
  targetSets?: number;
  targetReps?: string;
}

export interface WorkoutTemplate {
  id: string;
  title: string;
  sessionType: SessionType;
  goal?: TrainingGoal;
  createdAt: string;
  exercises: WorkoutTemplateExercise[];
}

/** A template block hydrated with its catalog entry (join of the two tables). */
export interface WorkoutTemplateExercise extends TemplateExerciseBlock {
  exercise: ExerciseCatalogItem;
}
