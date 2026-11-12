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

/** Training implement the exercise is performed with. */
export type Equipment =
  | 'barbell'
  | 'dumbbell'
  | 'machine'
  | 'cable'
  | 'bodyweight'
  | 'kettlebell'
  | 'specialty_bar'
  | 'cardio';

/** Canonical movement pattern — the axis filter + substitution logic reason about. */
export type MovementPattern =
  | 'squat'
  | 'hinge'
  | 'lunge'
  | 'horizontal_push'
  | 'vertical_push'
  | 'horizontal_pull'
  | 'vertical_pull'
  | 'arm_isolation'
  | 'core'
  | 'calf'
  | 'cardio'
  | 'other';

export type LoadScore = 1 | 2 | 3 | 4 | 5;

export interface ExerciseCatalogItem {
  id: string; // e.g., "romanian_deadlift", "belt_squat", "front_squat"
  nameHu: string;
  nameEn: string;
  category: ExerciseCategory;
  equipment: Equipment;
  movementPattern: MovementPattern;
  primaryMuscles: string[];
  axialLoadScore: LoadScore;
  kneeStressScore: LoadScore;
  defaultSubstituteIds: string[];
  /** True for exercises the user created on the fly (editable/deletable). */
  isCustom: boolean;
}

/** Everything the picker's inline "custom exercise" form collects. */
export interface CustomExerciseInput {
  /** Hungarian display name (required — the primary locale). */
  nameHu: string;
  /** English display name; falls back to the Hungarian name when omitted. */
  nameEn?: string;
  equipment: Equipment;
  movementPattern?: MovementPattern;
  primaryMuscles?: string[];
  category?: ExerciseCategory;
  axialLoadScore?: LoadScore;
  kneeStressScore?: LoadScore;
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

/** Where a template came from: first-party seed, user-built, or coach-assigned. */
export type TemplateSource = 'seed' | 'custom' | 'coach';

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
  /** Origin of the template — drives the Sablonok grouping (coach vs own/basic). */
  source: TemplateSource;
  /** Coach's free-text note; rendered as a badge on coach-assigned plans. */
  coachNote?: string;
  /** ISO-8601 timestamp of when a coach assigned the plan (source === 'coach'). */
  assignedAt?: string;
  createdAt: string;
  exercises: WorkoutTemplateExercise[];
}

/** A template block hydrated with its catalog entry (join of the two tables). */
export interface WorkoutTemplateExercise extends TemplateExerciseBlock {
  exercise: ExerciseCatalogItem;
}

// --- Phase 4: custom templates, session batches, coach sync contracts --------
// These mirror the examples documented in /docs/SAMPLE_PAYLOADS.json.

/** A block supplied when the user builds a custom template by hand. */
export interface CustomTemplateBlockInput {
  exerciseId: string;
  /** Defaults to 3 when omitted. */
  targetSets?: number;
  /** Free-form rep prescription, e.g. "6-8". Defaults to "8-10". */
  targetReps?: string;
  /** Defaults to 90. */
  restSeconds?: number;
  notes?: string;
}

/** Everything the template editor collects before persisting a new template. */
export interface CustomTemplateInput {
  title: string;
  sessionType: SessionType;
  goal?: TrainingGoal;
  blocks: CustomTemplateBlockInput[];
}

/**
 * Session-only sync batch: the offline queue's outgoing leg when flushing
 * locally dirty workouts. Superseded by `ClientSyncPushPayload` for the full
 * coach backend, but kept for the on-device preview and dry-run export.
 */
export interface SyncBatchPayload {
  batchId: string;
  generatedAt: string; // ISO-8601
  deviceId: string;
  sessions: WorkoutSessionLog[];
}

/**
 * Coach sync (Phase 7A). The Human-Coach platform replaces the old automated
 * routine-generation request with two clean contracts:
 *
 * - `ClientSyncPullPayload` — the client asks the coach backend for its
 *   assignments (coach plans + available slots). Serialized verbatim; `profile`
 *   is the pure `OnboardingPayload` (drop the UserProfile bookkeeping) and the
 *   billing profile travels so the coach can invoice the client.
 * - `ClientSyncPushPayload` — the client pushes its locally-changed state
 *   (dirty sessions and bookings) up to the coach dashboard.
 */

/** Client -> coach backend request body ("what has my coach assigned me?"). */
export interface ClientSyncPullPayload {
  syncId: string;
  generatedAt: string; // ISO-8601
  locale: OnboardingPayload['locale'];
  profile: OnboardingPayload;
  /** Contact & billing details the coach needs to issue invoices. */
  billingProfile: ClientBillingProfile | null;
  /** The exercise vocabulary coach-assigned plans may reference. */
  catalog: ExerciseCatalogItem[];
}

/**
 * Client -> coach backend request body ("here is my local state").
 *
 * `POST /api/sync/push` (Phase 7B). Carries the client's whole changed state in
 * one request: the onboarding profile and billing record (so the coach dashboard
 * mirrors the client and can invoice them), plus every locally dirty workout
 * session and coaching booking.
 */
export interface ClientSyncPushPayload {
  batchId: string;
  generatedAt: string; // ISO-8601
  deviceId: string;
  /** The client's onboarding profile (drives the admin dashboard's client mirror). */
  profile: OnboardingPayload;
  /** Contact & billing details the coach needs to issue invoices (null until saved). */
  billingProfile: ClientBillingProfile | null;
  sessions: WorkoutSessionLog[];
  bookings: CoachingBooking[];
}

/**
 * Coach backend -> client pull response (Phase 7B). The answer to
 * `GET /api/sync/pull?userId=...`: everything the coach has assigned to — or
 * changed for — this client since the last sync.
 *
 * Applied on device by `applyClientSyncPullPayload` (src/db/repository.ts),
 * which atomically reconciles the local SQLite graph with this response.
 */
export interface CoachSyncPullResponse {
  syncId: string;
  generatedAt: string; // ISO-8601
  userId: string;
  /** The client's coach-assigned plans (source === 'coach'), hydrated with catalog entries. */
  templates: WorkoutTemplate[];
  /** The client's bookings carrying the coach's latest status, notes and meeting link. */
  bookings: CoachingBooking[];
  /** Currently open (unbooked, upcoming) 1-on-1 coaching slots. */
  slots: CoachingSlot[];
  /**
   * Phase 7D — full account state. Only the authenticated `/api/sync/pull`
   * returns these; they let a fresh browser/PWA/phone hydrate its local SQLite
   * database (profile, onboarding constraints, billing and workout history)
   * without redoing onboarding. Optional so older servers stay compatible.
   */
  profile?: OnboardingPayload | null;
  billingProfile?: ClientBillingProfile | null;
  sessions?: WorkoutSessionLog[];
}

/**
 * Phase 7D — auth response for `POST /api/auth/register` and
 * `POST /api/auth/login`: the bearer token plus the account's full sync state.
 */
export interface AuthSessionResponse {
  token: string;
  userId: string;
  username: string;
  profile: OnboardingPayload | null;
  billingProfile: ClientBillingProfile | null;
  sessions: WorkoutSessionLog[];
  templates: WorkoutTemplate[];
  bookings: CoachingBooking[];
  slots: CoachingSlot[];
}

// --- Phase 5: progressive overload memory, 1RM analytics, PR detection ------

/** One completed set from an earlier session — the "Előző edzés" hint row. */
export interface PreviousPerformanceSet {
  setNumber: number;
  setType: SetType;
  actualWeightKg: number;
  actualReps: number;
  rpe?: number;
  completedAt: string; // ISO-8601
}

/** Best estimated 1RM for one set, with the set that produced it. */
export interface EstimatedOneRepMax {
  weightKg: number;
  reps: number;
  oneRepMaxKg: number;
  rpe?: number;
}

/** What the logger shows for an exercise: last session's sets + all-time best. */
export interface LastPerformance {
  exerciseId: string;
  /** Most recent completed session that logged this exercise. */
  sessionId: string;
  sessionTitle: string;
  completedAt: string; // ISO-8601
  /** That session's logged sets, in set order. */
  sets: PreviousPerformanceSet[];
  /** Heaviest non-warmup set of that session. */
  topSet?: EstimatedOneRepMax;
  /** All-time best estimated 1RM across every completed session. */
  bestOneRepMaxKg: number;
  /** The set behind `bestOneRepMaxKg` (absent when the exercise has no history). */
  bestSet?: EstimatedOneRepMax & { sessionId: string; completedAt: string };
}

/** One session of an exercise's progression, for the chart/table view. */
export interface ExerciseProgressionPoint {
  sessionId: string;
  /** ISO-8601 completion timestamp — the x axis. */
  date: string;
  topWeightKg: number;
  topReps: number;
  estimatedOneRepMaxKg: number;
  /** Working-set tonnage (warmups excluded). */
  volumeKg: number;
  setCount: number;
}

/** One logged run, for the running summary card. */
export interface RunningProgressionPoint {
  sessionId: string;
  date: string; // ISO-8601
  distanceKm: number;
  durationSeconds: number;
  avgPaceSecondsPerKm: number;
  rpe?: number;
}

/** Why `computeNextTargetHint` suggested what it suggested (i18n key). */
export type OverloadHintReason =
  | 'top_of_range_easy'
  | 'top_of_range_hard'
  | 'add_rep'
  | 'hold_weight';

/** Suggested next-session target for one exercise. */
export interface OverloadTargetHint {
  reason: OverloadHintReason;
  weightKg: number;
  reps: number;
  /** Change versus the reference set (0 when unchanged). */
  deltaKg: number;
  deltaReps: number;
}

/** A run of one nominal distance, e.g. the best logged 5K. */
export interface BestEffortPace {
  /** Nominal bucket the run was matched against (5 or 7 km). */
  targetDistanceKm: number;
  distanceKm: number;
  paceSecondsPerKm: number;
  sessionId: string;
  date: string; // ISO-8601
}

export type RunningTrend = 'improving' | 'steady' | 'declining' | 'none';

/** Headline numbers for the Előzmények running card. */
export interface RunningProgressionSummary {
  sessionCount: number;
  totalDistanceKm: number;
  /** Mean pace over every logged run; 0 when nothing is logged. */
  averagePaceSecondsPerKm: number;
  best5k?: BestEffortPace;
  best7k?: BestEffortPace;
  trend: RunningTrend;
}

// --- Phase 7A: Human Coach platform (Schema v5) -----------------------------
//
// Client contact & Hungarian billing/invoicing, coach-assigned plans, and the
// 1-on-1 coaching booking system (online call & in-person training).

/** Contact & Hungarian billing/invoicing record for one client. */
export interface ClientBillingProfile {
  /** Owner (the local profile id). */
  userId: string;
  // --- Contact -------------------------------------------------------------
  fullName: string;
  email: string;
  phone: string;
  // --- Billing (Számlázás) -------------------------------------------------
  /** Invoice name: a private individual's name or a company name. */
  billingName: string;
  /** Defaults to 'Magyarország'. */
  billingCountry: string;
  /** Irányítószám. */
  billingZip: string;
  /** Település. */
  billingCity: string;
  /** Utca, házszám. */
  billingAddress: string;
  /** Adószám — optional; only for companies / sole proprietors (EV). */
  taxNumber?: string;
  updatedAt: string; // ISO-8601
}

/** What the Contact & Billing form collects (bookkeeping columns added on save). */
export type ClientBillingProfileInput = Omit<ClientBillingProfile, 'updatedAt'>;

export const DEFAULT_BILLING_COUNTRY = 'Magyarország';

/** How a coaching session happens. */
export type CoachingModality = 'online_call' | 'irl_gym';

export type CoachingBookingStatus = 'pending' | 'confirmed' | 'completed' | 'cancelled';

/** A bookable time slot synced from the coach. */
export interface CoachingSlot {
  id: string;
  startsAt: string; // ISO-8601
  endsAt: string; // ISO-8601
  modality: CoachingModality;
  /** Video-call link (online) or gym address (IRL). */
  locationOrLink: string;
  isBooked: boolean;
}

/** A client's booking of a coaching slot. */
export interface CoachingBooking {
  id: string;
  slotId: string;
  userId: string;
  modality: CoachingModality;
  startsAt: string; // ISO-8601
  endsAt: string; // ISO-8601
  locationOrLink: string;
  /** Note the client attaches when booking ("Megjegyzés az edzőnek"). */
  clientNotes?: string;
  /** Note the coach attaches after the session. */
  coachNotes?: string;
  status: CoachingBookingStatus;
  syncStatus: SyncStatus;
  createdAt: string; // ISO-8601
}


