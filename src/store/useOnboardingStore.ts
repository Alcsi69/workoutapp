// Zustand store holding the draft onboarding survey.
// Local-only: nothing is persisted until the final step calls
// saveOnboardingPayload(db, payload). Screens read slices with selectors.

import { create } from 'zustand';
import type {
  ClientBillingProfile,
  ClientBillingProfileInput,
  EquipmentTier,
  JointArea,
  JointConstraint,
  JointConstraintSeverity,
  OnboardingPayload,
  TrainingGoal,
  UserProfile,
} from '../types/workout';
import { DEFAULT_BILLING_COUNTRY } from '../types/workout';
import { resolveBillingName } from '../services/billing';

export type OnboardingStep = 1 | 2 | 3 | 4 | 5;

export const ONBOARDING_STEPS: readonly OnboardingStep[] = [1, 2, 3, 4, 5];

/** Substitutions implied by a joint constraint (no manual input required). */
const AUTO_SUBSTITUTIONS_BY_AREA: Partial<Record<JointArea, Record<string, string>>> = {
  // Knee stress avoidance drops the hack squat for the belt squat: same quads,
  // far lower knee stress and no axial loading.
  knees: { hack_squat: 'belt_squat' },
};

export const KNEE_AUTO_SUBSTITUTION = {
  fromExerciseId: 'hack_squat',
  toExerciseId: 'belt_squat',
  minSeverity: 'avoid_heavy_axial_load',
} as const;

function severityRank(severity: JointConstraintSeverity): number {
  switch (severity) {
    case 'mild_discomfort':
      return 0;
    case 'avoid_heavy_axial_load':
      return 1;
    case 'strict_exclude':
      return 2;
  }
}

/**
 * Derives the automatic substitutions from the selected constraints.
 * Fixed rule: knee avoidance >= 'avoid_heavy_axial_load' maps hack_squat ->
 * belt_squat, so the Sablonok/Edzés screens never offer a high knee-stress lift.
 */
export function deriveAutoSubstitutions(
  limitations: readonly JointConstraint[],
): Record<string, string> {
  const derived: Record<string, string> = {};
  for (const limitation of limitations) {
    const mapping = AUTO_SUBSTITUTIONS_BY_AREA[limitation.area];
    if (mapping === undefined) {
      continue;
    }
    if (severityRank(limitation.severity) < severityRank(KNEE_AUTO_SUBSTITUTION.minSeverity)) {
      continue;
    }
    for (const [from, to] of Object.entries(mapping)) {
      derived[from] = to;
    }
  }
  return derived;
}

/** Auto substitutions first, explicit user choices win on conflict. */
export function mergeSubstitutions(
  limitations: readonly JointConstraint[],
  manual: Readonly<Record<string, string>>,
): Record<string, string> {
  return { ...deriveAutoSubstitutions(limitations), ...manual };
}

export interface OnboardingDraft {
  step: OnboardingStep;
  // Step 1 — Testalkat & Célok
  age: number;
  weightKg: number;
  heightCm: number;
  primaryGoal: TrainingGoal;
  experienceMonths: number;
  // Step 2 — Heti beosztás
  strengthDaysPerWeek: number;
  runningDaysPerWeek: number;
  targetRunDistanceKm: number | null;
  sessionDurationMinutes: number;
  equipment: EquipmentTier;
  // Step 3 — Ízületi korlátok & cserék
  jointLimitations: JointConstraint[];
  manualSubstitutions: Record<string, string>;
  excludedExerciseIds: string[];
  // Step 4 — Kapcsolat & Számlázási adatok
  fullName: string;
  email: string;
  phone: string;
  /** "Számlázási név megegyezik a teljes névvel". */
  billingSameAsFullName: boolean;
  billingName: string;
  billingCountry: string;
  billingZip: string;
  billingCity: string;
  billingAddress: string;
  taxNumber: string;
  // Step 5 — Fiók létrehozása (Phase 7D)
  username: string;
  password: string;
  confirmPassword: string;
}

interface OnboardingActions {
  setStep: (step: OnboardingStep) => void;
  nextStep: () => void;
  previousStep: () => void;
  updateBiometrics: (patch: Partial<Pick<OnboardingDraft, 'age' | 'weightKg' | 'heightCm'>>) => void;
  setPrimaryGoal: (goal: TrainingGoal) => void;
  setExperienceMonths: (months: number) => void;
  updateSchedule: (
    patch: Partial<
      Pick<
        OnboardingDraft,
        | 'strengthDaysPerWeek'
        | 'runningDaysPerWeek'
        | 'targetRunDistanceKm'
        | 'sessionDurationMinutes'
      >
    >,
  ) => void;
  setEquipment: (equipment: EquipmentTier) => void;
  /** Adds or updates a constraint for the area; constraints are unique per area. */
  upsertJointConstraint: (area: JointArea, severity: JointConstraintSeverity) => void;
  removeJointConstraint: (area: JointArea) => void;
  setSubstitution: (fromExerciseId: string, toExerciseId: string) => void;
  clearSubstitution: (fromExerciseId: string) => void;
  /** Step 4 — contact fields. */
  updateContact: (patch: Partial<Pick<OnboardingDraft, 'fullName' | 'email' | 'phone'>>) => void;
  /** Step 4 — billing fields. */
  updateBilling: (
    patch: Partial<
      Pick<
        OnboardingDraft,
        | 'billingSameAsFullName'
        | 'billingName'
        | 'billingCountry'
        | 'billingZip'
        | 'billingCity'
        | 'billingAddress'
        | 'taxNumber'
      >
    >,
  ) => void;
  /** Step 5 — account credentials. */
  updateAccount: (
    patch: Partial<Pick<OnboardingDraft, 'username' | 'password' | 'confirmPassword'>>,
  ) => void;
  /** Loads an existing profile into the draft so re-onboarding is prefilled. */
  hydrateFromProfile: (profile: UserProfile) => void;
  /** Prefills the billing step from a saved billing profile. */
  hydrateBillingFromProfile: (profile: ClientBillingProfile) => void;
  reset: () => void;
}

export type OnboardingStore = OnboardingDraft & OnboardingActions;

const INITIAL_DRAFT: OnboardingDraft = {
  step: 1,
  age: 30,
  weightKg: 80,
  heightCm: 180,
  primaryGoal: 'powerbuilding',
  experienceMonths: 12,
  strengthDaysPerWeek: 4,
  runningDaysPerWeek: 3,
  targetRunDistanceKm: 5,
  sessionDurationMinutes: 75,
  equipment: 'full_gym',
  jointLimitations: [],
  manualSubstitutions: {},
  excludedExerciseIds: [],
  fullName: '',
  email: '',
  phone: '',
  billingSameAsFullName: true,
  billingName: '',
  billingCountry: DEFAULT_BILLING_COUNTRY,
  billingZip: '',
  billingCity: '',
  billingAddress: '',
  taxNumber: '',
  username: '',
  password: '',
  confirmPassword: '',
};

export const useOnboardingStore = create<OnboardingStore>((set) => ({
  ...INITIAL_DRAFT,

  setStep: (step) => {
    set({ step });
  },
  nextStep: () => {
    set((state) => ({ step: Math.min(5, state.step + 1) as OnboardingStep }));
  },
  previousStep: () => {
    set((state) => ({ step: Math.max(1, state.step - 1) as OnboardingStep }));
  },

  updateBiometrics: (patch) => {
    set(patch);
  },
  setPrimaryGoal: (primaryGoal) => {
    set({ primaryGoal });
  },
  setExperienceMonths: (experienceMonths) => {
    set({ experienceMonths });
  },

  updateSchedule: (patch) => {
    set(patch);
  },
  setEquipment: (equipment) => {
    set({ equipment });
  },

  upsertJointConstraint: (area, severity) => {
    set((state) => {
      const index = state.jointLimitations.findIndex((item) => item.area === area);
      if (index === -1) {
        // New selection: append, so the list keeps the order areas were picked.
        return { jointLimitations: [...state.jointLimitations, { area, severity }] };
      }
      // Existing selection: replace IN PLACE. Appending here would reorder the
      // list every time a severity chip is tapped.
      const next = [...state.jointLimitations];
      next[index] = { area, severity };
      return { jointLimitations: next };
    });
  },
  removeJointConstraint: (area) => {
    set((state) => ({
      jointLimitations: state.jointLimitations.filter((item) => item.area !== area),
    }));
  },

  setSubstitution: (fromExerciseId, toExerciseId) => {
    set((state) => ({
      manualSubstitutions: { ...state.manualSubstitutions, [fromExerciseId]: toExerciseId },
    }));
  },
  clearSubstitution: (fromExerciseId) => {
    set((state) => {
      const next = { ...state.manualSubstitutions };
      delete next[fromExerciseId];
      return { manualSubstitutions: next };
    });
  },

  updateContact: (patch) => {
    set(patch);
  },
  updateBilling: (patch) => {
    set(patch);
  },

  updateAccount: (patch) => {
    set(patch);
  },

  hydrateFromProfile: (profile) => {
    set({
      step: 1,
      age: profile.biometrics.age,
      weightKg: profile.biometrics.weightKg,
      heightCm: profile.biometrics.heightCm,
      primaryGoal: profile.trainingProfile.primaryGoal,
      experienceMonths: profile.trainingProfile.experienceMonths,
      strengthDaysPerWeek: profile.trainingProfile.strengthDaysPerWeek,
      runningDaysPerWeek: profile.trainingProfile.runningDaysPerWeek,
      targetRunDistanceKm: profile.trainingProfile.targetRunDistanceKm ?? null,
      sessionDurationMinutes: profile.trainingProfile.sessionDurationMinutes,
      equipment: profile.trainingProfile.equipment,
      jointLimitations: profile.constraints.jointLimitations,
      manualSubstitutions: profile.constraints.preferredSubstitutions,
      excludedExerciseIds: profile.constraints.excludedExerciseIds,
    });
  },

  hydrateBillingFromProfile: (profile) => {
    set({
      fullName: profile.fullName,
      email: profile.email,
      phone: profile.phone,
      // The toggle defaults on; keep it unless the stored billing name differs.
      billingSameAsFullName: profile.billingName === profile.fullName,
      billingName: profile.billingName,
      billingCountry: profile.billingCountry,
      billingZip: profile.billingZip,
      billingCity: profile.billingCity,
      billingAddress: profile.billingAddress,
      taxNumber: profile.taxNumber ?? '',
    });
  },

  reset: () => {
    set({ ...INITIAL_DRAFT });
  },
}));

/** Selector: effective substitutions (auto rules + manual overrides). */
export function selectPreferredSubstitutions(state: OnboardingDraft): Record<string, string> {
  return mergeSubstitutions(state.jointLimitations, state.manualSubstitutions);
}

/** Converts the draft into the exact payload the DB layer persists. */
export function buildOnboardingPayload(
  draft: OnboardingDraft,
  userId: string,
  locale: OnboardingPayload['locale'] = 'hu',
): OnboardingPayload {
  const payload: OnboardingPayload = {
    userId,
    locale,
    biometrics: {
      age: draft.age,
      weightKg: draft.weightKg,
      heightCm: draft.heightCm,
    },
    trainingProfile: {
      primaryGoal: draft.primaryGoal,
      experienceMonths: draft.experienceMonths,
      strengthDaysPerWeek: draft.strengthDaysPerWeek,
      runningDaysPerWeek: draft.runningDaysPerWeek,
      sessionDurationMinutes: draft.sessionDurationMinutes,
      equipment: draft.equipment,
    },
    constraints: {
      jointLimitations: draft.jointLimitations,
      excludedExerciseIds: draft.excludedExerciseIds,
      preferredSubstitutions: selectPreferredSubstitutions(draft),
    },
  };

  if (draft.targetRunDistanceKm !== null) {
    payload.trainingProfile.targetRunDistanceKm = draft.targetRunDistanceKm;
  }

  return payload;
}

/**
 * Converts the contact & billing draft into the exact record the DB layer
 * persists. The billing name follows the "same as full name" toggle and the
 * country falls back to the default; `taxNumber` is omitted when blank.
 */
export function buildBillingProfileInput(
  draft: OnboardingDraft,
  userId: string,
): ClientBillingProfileInput {
  const input: ClientBillingProfileInput = {
    userId,
    fullName: draft.fullName.trim(),
    email: draft.email.trim(),
    phone: draft.phone.trim(),
    billingName: resolveBillingName(
      draft.fullName.trim(),
      draft.billingSameAsFullName,
      draft.billingName.trim(),
    ),
    billingCountry: draft.billingCountry.trim() || DEFAULT_BILLING_COUNTRY,
    billingZip: draft.billingZip.trim(),
    billingCity: draft.billingCity.trim(),
    billingAddress: draft.billingAddress.trim(),
  };
  const taxNumber = draft.taxNumber.trim();
  if (taxNumber.length > 0) {
    input.taxNumber = taxNumber;
  }
  return input;
}