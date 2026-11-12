// Re-export of the shared mobile domain types.
//
// WorkoutApp's `src/types/workout.ts` is pure TypeScript (no React Native
// imports), so the standalone server compiles it directly and stays the single
// source of truth for the wire contracts — no type duplication. The server's
// tsconfig pulls the file in via its `include` list.
export type {
  OnboardingPayload,
  ClientBillingProfile,
  WorkoutSessionLog,
  SessionExerciseBlock,
  SetLog,
  WorkoutTemplate,
  WorkoutTemplateExercise,
  TemplateExerciseBlock,
  ExerciseCatalogItem,
  CoachingSlot,
  CoachingBooking,
  CoachingBookingStatus,
  CoachingModality,
  TrainingGoal,
  SessionType,
  SyncStatus,
  ClientSyncPushPayload,
  CoachSyncPullResponse,
  AuthSessionResponse,
} from '../../src/types/workout';
