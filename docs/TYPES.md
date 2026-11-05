# Core TypeScript Interfaces (`src/types/workout.ts`)

Schema v4. All unions and literal types below are mirrored 1:1 by `src/types/workout.ts`;
the SQLite row shapes (snake_case) live in `src/db/schema.ts`.

## Enums & unions

```typescript
export type TrainingGoal = 'strength' | 'hypertrophy' | 'powerbuilding' | 'hybrid_strength_running';
export type EquipmentTier = 'full_gym' | 'barbell_rack' | 'dumbbell_only' | 'bodyweight';
export type JointArea = 'knees' | 'lower_back' | 'shoulders' | 'wrists' | 'elbows' | 'hips';
export type JointConstraintSeverity = 'mild_discomfort' | 'avoid_heavy_axial_load' | 'strict_exclude';
export type SetType = 'warmup' | 'working' | 'top_set' | 'backoff' | 'drop_set' | 'failure';
export type SessionType = 'strength' | 'running' | 'hybrid';
export type SyncStatus = 'local_dirty' | 'synced';
export type ExerciseCategory = 'compound_lower' | 'compound_upper' | 'isolation' | 'machine' | 'cardio_run';
export type LoadScore = 1 | 2 | 3 | 4 | 5;

/** Training implement — added in schema v4. */
export type Equipment =
  | 'barbell' | 'dumbbell' | 'machine' | 'cable'
  | 'bodyweight' | 'kettlebell' | 'specialty_bar' | 'cardio';

/** Canonical movement pattern — the picker filter + substitution logic reason about it. */
export type MovementPattern =
  | 'squat' | 'hinge' | 'lunge' | 'horizontal_push' | 'vertical_push'
  | 'horizontal_pull' | 'vertical_pull' | 'arm_isolation' | 'core'
  | 'calf' | 'cardio' | 'other';
```

## Onboarding & profile

```typescript
export interface JointConstraint {
  area: JointArea;
  severity: JointConstraintSeverity;
  notes?: string;
}

export interface OnboardingPayload {
  userId: string;
  locale: 'hu' | 'en';
  biometrics: { age: number; weightKg: number; heightCm: number };
  trainingProfile: {
    primaryGoal: TrainingGoal;
    experienceMonths: number;
    strengthDaysPerWeek: number;
    runningDaysPerWeek: number;
    targetRunDistanceKm?: number; // e.g. 5 or 7 km target
    sessionDurationMinutes: number;
    equipment: EquipmentTier;
  };
  constraints: {
    jointLimitations: JointConstraint[];
    excludedExerciseIds: string[];
    preferredSubstitutions: Record<string, string>; // { "hack_squat": "belt_squat" }
  };
}

/** OnboardingPayload plus the persistence bookkeeping columns. */
export interface UserProfile extends OnboardingPayload {
  onboardingCompletedAt: string; // ISO-8601
  updatedAt: string;             // ISO-8601
}
```

## Exercise catalog

```typescript
export interface ExerciseCatalogItem {
  id: string;                    // e.g. "romanian_deadlift", "belt_squat"
  nameHu: string;
  nameEn: string;
  category: ExerciseCategory;
  equipment: Equipment;
  movementPattern: MovementPattern;
  primaryMuscles: string[];
  axialLoadScore: LoadScore;
  kneeStressScore: LoadScore;
  defaultSubstituteIds: string[];
  isCustom: boolean;             // true for on-the-fly user exercises (id prefix "cust_")
}
```

## Logged sessions

```typescript
export interface SetLog {
  id: string;
  setNumber: number;
  setType: SetType;
  targetWeightKg?: number;
  actualWeightKg: number;
  targetReps: string;            // e.g. "6-8"
  actualReps: number;
  rpe?: number;                  // 5.0 - 10.0 in 0.5 steps
  completedAt: string;           // ISO-8601
}

export interface WorkoutExerciseBlock {
  id: string;
  orderIndex: number;
  exerciseId: string;
  substitutedFromExerciseId?: string;
  restSeconds: number;
  notes?: string;
  targetSets?: number;
  targetReps?: string;
  sets: SetLog[];
}

/** A session block hydrated with its (effective) catalog entry — what the logger renders. */
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

export interface WorkoutSessionLog {
  id: string;
  programDayId?: string;
  sessionType: SessionType;
  title: string;
  startedAt: string;
  completedAt?: string;
  exerciseBlocks: SessionExerciseBlock[];
  runningMetrics?: RunningMetrics;
  syncStatus: SyncStatus;
}
```

## Templates & sync (Phase 4)

```typescript
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

export interface WorkoutTemplateExercise extends TemplateExerciseBlock {
  exercise: ExerciseCatalogItem;
}

export interface WorkoutTemplate {
  id: string;
  title: string;
  sessionType: SessionType;
  goal?: TrainingGoal;
  createdAt: string;
  exercises: WorkoutTemplateExercise[];
}

export interface SyncBatchPayload {
  batchId: string;
  generatedAt: string;   // ISO-8601
  deviceId: string;
  sessions: WorkoutSessionLog[];
}
```

## Progressive overload & analytics (Phase 5)

```typescript
export interface PreviousPerformanceSet {
  setNumber: number;
  setType: SetType;
  actualWeightKg: number;
  actualReps: number;
  rpe?: number;
  completedAt: string;   // ISO-8601
}

export interface EstimatedOneRepMax {
  weightKg: number;
  reps: number;
  oneRepMaxKg: number;
  rpe?: number;
}

export interface LastPerformance {
  exerciseId: string;
  sessionId: string;
  sessionTitle: string;
  completedAt: string;
  sets: PreviousPerformanceSet[];
  topSet?: EstimatedOneRepMax;
  bestOneRepMaxKg: number;
  bestSet?: EstimatedOneRepMax & { sessionId: string; completedAt: string };
}

export interface ExerciseProgressionPoint {
  sessionId: string;
  date: string;          // ISO-8601
  topWeightKg: number;
  topReps: number;
  estimatedOneRepMaxKg: number;
  volumeKg: number;      // working-set tonnage (warmups excluded)
  setCount: number;
}

export type OverloadHintReason =
  | 'top_of_range_easy' | 'top_of_range_hard' | 'add_rep' | 'hold_weight';

export interface OverloadTargetHint {
  reason: OverloadHintReason;
  weightKg: number;
  reps: number;
  deltaKg: number;
  deltaReps: number;
}
```

## Plate calculator & backup (Phase 6)

```typescript
// src/services/plateCalculator.ts
export interface PlateStack { plateKg: number; countPerSide: number }

export interface PlateCalculation {
  barWeightKg: number;
  targetWeightKg: number;
  achievableWeightKg: number;
  shortfallKg: number;
  exact: boolean;
  platesPerSide: PlateStack[]; // one side, heaviest first
}
export function calculatePlatesPerSide(
  targetWeightKg: number,
  barWeightKg = 20,
  availablePlates = [25, 20, 15, 10, 5, 2.5, 1.25],
): PlateCalculation;

// src/services/backupService.ts — a full-DB JSON snapshot covering the profile,
// custom exercises/templates, and every session/block/set/running row.
export interface DatabaseSnapshot {
  format: 'workoutapp.backup';
  backupVersion: number;
  schemaVersion: number;
  exportedAt: string;
  data: DatabaseSnapshotData;
}
export function exportFullDatabaseSnapshot(db: SQLiteDatabase): Promise<string>;
export function importFullDatabaseSnapshot(db: SQLiteDatabase, jsonString: string): Promise<ImportSummary>;
```
