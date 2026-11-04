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
    steps: {
      step1: 'Testalkat & Célok',
      step2: 'Heti beosztás',
      step3: 'Ízületi korlátok & Gyakorlat cserék',
      progressLabel: 'lépés',
      finish: 'Terv mentése',
      saving: 'Mentés…',
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
      substitutions: {
        title: 'Gyakorlat cserék',
        auto: 'Automatikus',
        autoRuleHint: 'Térdkímélés miatt a Hack guggolás helyett Öves guggolás kerül a tervbe.',
        none: 'Nincs beállított csere.',
      },
      targetDistanceNone: 'Nincs cél',
      daysUnit: 'nap',
      monthsUnit: 'hónap',
      invalidNumber: 'Adj meg egy érvényes értéket.',
    },
  },

  screens: {
    home: {
      tomorrowPreview: 'Holnap',
      recommended: 'Ajánlott edzés',
      restDay: 'Pihenőnap',
      restDayHint: 'Mára nincs beosztott edzés. Pihenj, vagy indíts egy szabadon választott sablont.',
      quickStart: 'Edzés indítása',
      openTemplates: 'Sablonok megnyitása',
      constraintsTitle: 'Aktív ízületi korlátok',
      noConstraints: 'Nincs aktív ízületi megkötés.',
      activeSession: 'Folyamatban lévő edzés',
      activeSessionHint: 'folytatás a naplózóban',
      resume: 'Folytatás',
      startedHint: 'Az edzés elindult. A naplózó felület a következő fázisban nyílik meg.',
      blocksLabel: 'gyakorlat',
    },
    templates: {
      subtitle: 'Alap 4 napos powerbuilding + 3 napos futó split.',
      strengthGroup: 'Erőedzések',
      runningGroup: 'Futóedzések',
      exerciseCount: 'gyakorlat',
      setsShort: 'sorozat',
      restShort: 'pihenő',
      empty: 'Nincsenek sablonok.',
      start: 'Indítás',
    },
    history: {
      subtitle: 'Befejezett edzések, a legújabb elöl.',
      emptyTitle: 'Még nincs befejezett edzés',
      emptyHint: 'Az első befejezett edzésed után itt jelenik meg a napló.',
      emptyCta: 'Edzés indítása',
      exercisesLabel: 'gyakorlat',
      completedLabel: 'Befejezve',
      details: 'Részletek',
      hide: 'Elrejtés',
      volume: 'Összvolumen',
      pace: 'Tempó',
      noSets: 'Nincs naplózott sorozat.',
    },
    profile: {
      title: 'Profil',
      biometrics: 'Testalkat',
      goal: 'Elsődleges cél',
      experience: 'Tapasztalat',
      weeklySplit: 'Heti beosztás',
      targetDistance: 'Cél táv',
      equipment: 'Felszerelés',
      constraints: 'Ízületi korlátok',
      substitutions: 'Gyakorlat cserék',
      noConstraints: 'Nincs aktív megkötés.',
      noSubstitutions: 'Nincs beállított csere.',
      restart: 'Onboarding újraindítása',
      updatedAt: 'Frissítve',
      strengthSuffix: 'erő',
      runningSuffix: 'futás',
      missing: 'Nincs mentett profil.',
      missingHint: 'Töltsd ki az onboardingot az edzéstervedhez.',
      startOnboarding: 'Onboarding indítása',
      ageUnit: 'év',
    },
    load: {
      axialShort: 'Tengely',
      kneeShort: 'Térd',
      low: 'Alacsony',
      high: 'Magas',
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
    restAdd: '+15s',
    restSubtract: '−15s',
    restSkipShort: 'Kihagyás',
    substitution: 'Gyakorlat cseréje',
    substitutionShort: 'Csere',
    substitutionFrom: 'Eredeti gyakorlat',
    substitutionTo: 'Helyettesítő',
    substitutionRecommended: 'Ajánlott csere',
    substitutionCurrent: 'Jelenlegi gyakorlat',
    substitutionEmpty: 'Nincs elérhető csere.',
    rpe: 'RPE',
    rpeLabel: 'RPE (erőkifejtés)',
    rpeNone: '—',
    reps: 'Ismétlés',
    repsShort: 'ism.',
    weight: 'Súly',
    set: 'Sorozat',
    addSet: 'Sorozat hozzáadása',
    completeSet: 'Sorozat teljesítve',
    finishWorkout: 'Edzés befejezése',
    finishConfirm: 'Biztosan befejezed az edzést?',
    discard: 'Elvetés',
    discardConfirm: 'Biztosan elveted az edzést?',
    discardConfirmBody: 'A naplózott sorozatok véglegesen törlődnek.',
    replacedFrom: 'Helyettesítve',
    running: {
      title: 'Futás napló',
      distance: 'Táv (km)',
      duration: 'Idő (perc:mp)',
      pace: 'Tempó (perc/km)',
      minutes: 'perc',
      secondsShort: 'mp',
      effort: 'RPE',
    },
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
