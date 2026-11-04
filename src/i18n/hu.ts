// Hungarian (hu) UI dictionary — primary locale.
// Strings live here, never hardcoded in components.
// Keys that map to domain unions (SetType, JointArea, TrainingGoal, EquipmentTier)
// are cross-checked with `satisfies` so a new union member forces a translation.

import type {
  EquipmentTier,
  JointArea,
  JointConstraintSeverity,
  SetType,
  TrainingGoal,
} from '../types/workout';

export const hu = {
  app: {
    name: 'WorkoutApp',
  },

  tabs: {
    workout: 'Edzés',
    templates: 'Sablonok',
    history: 'Előzmények',
    profile: 'Profil',
  },

  common: {
    loading: 'Betöltés…',
    error: 'Hiba történt',
    retry: 'Újra',
    cancel: 'Mégse',
    save: 'Mentés',
    next: 'Tovább',
    back: 'Vissza',
    skip: 'Kihagyás',
    done: 'Kész',
    secondsShort: 'mp',
    minutesShort: 'perc',
    kg: 'kg',
    km: 'km',
  },

  onboarding: {
    welcome: {
      title: 'Üdv a WorkoutAppban',
      subtitle: 'Strukturált erő- és futóedzés, a térd- és ízületi terhelést figyelembe véve.',
      cta: 'Kezdjük',
    },
    biometrics: {
      title: 'Rólad',
      subtitle: 'Az edzéstervhez és a haladás követéséhez.',
      age: 'Életkor',
      ageUnit: 'év',
      weight: 'Testsúly',
      height: 'Magasság',
    },
    goals: {
      title: 'Elsődleges cél',
      subtitle: 'Mi hajt most a leginkább?',
      strength: 'Erő',
      hypertrophy: 'Testépítés (hipertrófia)',
      powerbuilding: 'Erőemelés / Powerbuilding',
      hybrid_strength_running: 'Hibrid erő + futás',
    },
    experience: {
      title: 'Edzettségi szint',
      monthsLabel: 'Tapasztalat (hónap)',
      beginner: 'Kezdő',
      intermediate: 'Haladó',
      advanced: 'Profi',
    },
    schedule: {
      title: 'Heti beosztás',
      strengthDays: 'Erős napok / hét',
      runningDays: 'Futó napok / hét',
      targetDistance: 'Cél táv',
      sessionDuration: 'Edzés hossza',
      sessionDurationUnit: 'perc',
    },
    equipment: {
      title: 'Elérhető felszerelés',
      full_gym: 'Teljes konditerem',
      barbell_rack: 'Rúd + rack',
      dumbbell_only: 'Csak kézisúlyzó',
      bodyweight: 'Saját testsúly',
    },
    constraints: {
      title: 'Ízületi megkötések',
      subtitle: 'A terheléskorlátozásokat elsődleges szempontként kezeljük.',
      addLimitation: 'Megkötés hozzáadása',
      areas: {
        knees: 'Térd',
        lower_back: 'Alsó hát',
        shoulders: 'Váll',
        wrists: 'Csukló',
        elbows: 'Könyök',
        hips: 'Csípő',
      },
      severity: {
        mild_discomfort: 'Enyhe kellemetlenség',
        avoid_heavy_axial_load: 'Nehéz tengelyirányú terhelés kerülése',
        strict_exclude: 'Szigorúan kizárva',
      },
      notes: 'Megjegyzés',
      notesPlaceholder: 'pl. Térdzsávolító használata, lapos talpú cipő',
    },
  },

  setTypes: {
    warmup: 'Bemelegítő',
    working: 'Munkasorozat',
    top_set: 'Csúcssorozat',
    backoff: 'Backoff',
    drop_set: 'Leengedő sorozat',
    failure: 'Bukásig',
  },

  sessionTypes: {
    strength: 'Erő',
    running: 'Futás',
    hybrid: 'Hibrid',
  },

  logger: {
    title: 'Aktív edzés',
    restTimer: 'Pihenőidő',
    restTimerStart: 'Pihenés indítása',
    restTimerSkip: 'Pihenés kihagyása',
    restTimerRemaining: 'Hátralévő pihenő',
    substitution: 'Gyakorlat cseréje',
    substitutionShort: 'Csere',
    substitutionFrom: 'Eredeti gyakorlat',
    substitutionTo: 'Helyettesítő',
    rpe: 'RPE',
    rpeLabel: 'RPE (erőkifejtés)',
    reps: 'Ismétlés',
    weight: 'Súly',
    set: 'Sorozat',
    addSet: 'Sorozat hozzáadása',
    completeSet: 'Sorozat teljesítve',
    finishWorkout: 'Edzés befejezése',
    finishConfirm: 'Biztosan befejezed az edzést?',
    notepad: 'Megjegyzés',
    notepadPlaceholder: 'pl. jobb térdre fókuszálás',
  },

  status: {
    localDirty: 'Szinkronizálásra vár',
    synced: 'Szinkronizálva',
    completed: 'Teljesítve',
    inProgress: 'Folyamatban',
  },

  loadAlert: {
    highAxial: 'Magas tengelyirányú terhelés',
    highKnee: 'Magas térdterhelés',
    substituted: 'Helyettesítve a megkötés miatt',
  },

  db: {
    exerciseCountLabel: 'Elérhető gyakorlat a katalógusban',
    runtimeReady: 'Az adatbázis és a katalógus betöltve.',
  },
} as const;

// Domain coverage: adding a member to any of these unions must fail typecheck
// until a Hungarian string is supplied.
const _setTypes: Record<SetType, string> = hu.setTypes;
const _jointAreas: Record<JointArea, string> = hu.onboarding.constraints.areas;
const _severities: Record<JointConstraintSeverity, string> = hu.onboarding.constraints.severity;
const _goals: Record<TrainingGoal, string> = hu.onboarding.goals;
const _equipment: Record<EquipmentTier, string> = hu.onboarding.equipment;

export type HuDictionary = typeof hu;

export default hu;
