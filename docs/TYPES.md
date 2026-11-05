# Core TypeScript Interfaces (`src/types/workout.ts`)

Schema v6. All unions and literal types below are mirrored 1:1 by `src/types/workout.ts`;
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

/** Where a template came from — added in schema v5. */
export type TemplateSource = 'seed' | 'custom' | 'coach';

/** 1-on-1 coaching modality / status — added in schema v5. */
export type CoachingModality = 'online_call' | 'irl_gym';
export type CoachingBookingStatus = 'pending' | 'confirmed' | 'completed' | 'cancelled';

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
  source: TemplateSource;   // 'seed' | 'custom' | 'coach' (v5)
  coachNote?: string;       // coach's note shown as a badge (v5)
  assignedAt?: string;      // ISO-8601 assignment timestamp (v5)
  createdAt: string;
  exercises: WorkoutTemplateExercise[];
}

/** Session-only sync batch (kept for the on-device preview / dry-run export). */
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

## Human Coach platform (Phase 7A / schema v5)

```typescript
// --- Client contact & Hungarian billing/invoicing --------------------------
export interface ClientBillingProfile {
  userId: string;
  fullName: string;
  email: string;
  phone: string;
  billingName: string;       // magánszemély vagy cégnév
  billingCountry: string;    // defaults to 'Magyarország'
  billingZip: string;        // irányítószám
  billingCity: string;       // település
  billingAddress: string;    // utca, házszám
  taxNumber?: string;        // adószám (opcionális)
  updatedAt: string;         // ISO-8601
}
export type ClientBillingProfileInput = Omit<ClientBillingProfile, 'updatedAt'>;
export const DEFAULT_BILLING_COUNTRY = 'Magyarország';

// src/services/billing.ts — pure validation + form helpers.
export type BillingFieldKey =
  | 'fullName' | 'email' | 'phone' | 'billingName'
  | 'billingCountry' | 'billingZip' | 'billingCity' | 'billingAddress';
export const REQUIRED_BILLING_FIELDS: readonly BillingFieldKey[];
export interface BillingValidationResult {
  valid: boolean;
  missingFields: BillingFieldKey[];
  invalidEmail: boolean;
}
export function validateClientBillingProfile(input: ClientBillingProfileInput): BillingValidationResult;
export function isValidEmail(email: string): boolean;
export function createEmptyBillingInput(userId: string): ClientBillingProfileInput;
export function resolveBillingName(fullName: string, sameAsFullName: boolean, billingName: string): string;

// --- 1-on-1 coaching bookings ----------------------------------------------
export interface CoachingSlot {
  id: string;
  startsAt: string;          // ISO-8601
  endsAt: string;            // ISO-8601
  modality: CoachingModality;
  locationOrLink: string;    // video link (online) or gym address (IRL)
  isBooked: boolean;
}

export interface CoachingBooking {
  id: string;
  slotId: string;
  userId: string;
  modality: CoachingModality;
  startsAt: string;          // ISO-8601
  endsAt: string;            // ISO-8601
  locationOrLink: string;
  clientNotes?: string;      // "Megjegyzés az edzőnek"
  coachNotes?: string;
  status: CoachingBookingStatus;
  syncStatus: SyncStatus;
  createdAt: string;         // ISO-8601
}

// --- Coach sync contracts (replace the old AI request payload) -------------
/** Client -> coach backend ("what has my coach assigned me?"). */
export interface ClientSyncPullPayload {
  syncId: string;
  generatedAt: string;
  locale: OnboardingPayload['locale'];
  profile: OnboardingPayload;
  billingProfile: ClientBillingProfile | null;
  catalog: ExerciseCatalogItem[];
}

/** Client -> coach backend ("here is my locally-changed state"). Phase 7B. */
export interface ClientSyncPushPayload {
  batchId: string;
  generatedAt: string;
  deviceId: string;
  profile: OnboardingPayload;             // added in Phase 7B
  billingProfile: ClientBillingProfile | null;  // added in Phase 7B
  sessions: WorkoutSessionLog[];
  bookings: CoachingBooking[];
}

/**
 * Coach backend -> client pull response (Phase 7B). Applied on device by
 * `applyClientSyncPullPayload`. Replaces the client's `source = 'coach'`
 * templates, refreshes open slots and reconciles booking statuses.
 */
export interface CoachSyncPullResponse {
  syncId: string;
  generatedAt: string;
  userId: string;
  templates: WorkoutTemplate[];
  bookings: CoachingBooking[];
  slots: CoachingSlot[];
}
```

Repository helpers (`src/db/repository.ts`): `getClientBillingProfile` / `saveClientBillingProfile`,
`assignCoachTemplate` / `getCoachAssignedTemplates`, `seedCoachingSlots` / `getOpenCoachingSlots`,
`createCoachingBooking` / `getCoachingBookings` / `cancelCoachingBooking`,
`getDirtyCoachingBookings` / `markCoachingBookingsSynced` for the offline queue, and — added in
Phase 7B — `applyClientSyncPullPayload`, plus device-local settings `getSyncServerUrl` /
`setSyncServerUrl` (schema v6 `app_settings` table).
