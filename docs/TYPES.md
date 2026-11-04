```markdown
# Core TypeScript Interfaces (`src/types/workout.ts`)

```typescript
export type TrainingGoal = 'strength' | 'hypertrophy' | 'powerbuilding' | 'hybrid_strength_running';
export type EquipmentTier = 'full_gym' | 'barbell_rack' | 'dumbbell_only' | 'bodyweight';
export type JointArea = 'knees' | 'lower_back' | 'shoulders' | 'wrists' | 'elbows' | 'hips';
export type SetType = 'warmup' | 'working' | 'top_set' | 'backoff' | 'drop_set' | 'failure';

export interface JointConstraint {
  area: JointArea;
  severity: 'mild_discomfort' | 'avoid_heavy_axial_load' | 'strict_exclude';
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

export interface ExerciseCatalogItem {
  id: string; // e.g., "romanian_deadlift", "belt_squat", "front_squat"
  nameHu: string;
  nameEn: string;
  category: 'compound_lower' | 'compound_upper' | 'isolation' | 'machine' | 'cardio_run';
  primaryMuscles: string[];
  axialLoadScore: 1 | 2 | 3 | 4 | 5;
  kneeStressScore: 1 | 2 | 3 | 4 | 5;
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
  sets: SetLog[];
}

export interface RunningMetrics {
  distanceKm: number;
  durationSeconds: number;
  avgPaceSecondsPerKm: number;
  perceivedEffortRpe?: number;
}

export interface WorkoutSessionLog {
  id: string;
  programDayId?: string;
  sessionType: 'strength' | 'running' | 'hybrid';
  title: string; // e.g., "Lower Body B (RDL Focus)" or "5K Tempo Run"
  startedAt: string;
  completedAt?: string;
  exerciseBlocks: WorkoutExerciseBlock[];
  runningMetrics?: RunningMetrics;
  syncStatus: 'local_dirty' | 'synced';
}
