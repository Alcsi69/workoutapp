// Comprehensive exercise catalog, modeled on StrengthLevel's exercise set.
//
// This is the vocabulary every program is built from. Each entry records the
// joint-load ratings (`axialLoadScore`, `kneeStressScore`, 1-5, higher = more
// stress), the implement (`equipment`) and canonical `movementPattern` the
// picker filters on, and the joint-friendliest stand-ins
// (`defaultSubstituteIds`) tried first when a constraint forces a swap.
//
// `isCustom` is false for every shipped row; user-created exercises are inserted
// through repository.createCustomExercise with the flag set.

import type { ExerciseCatalogItem } from '../types/workout';

export const EXERCISE_CATALOG: readonly ExerciseCatalogItem[] = [
  // ========================================================================
  // Squat & quad variants (21)
  // ========================================================================
  {
    id: 'front_squat', nameHu: 'Elölguggolás', nameEn: 'Front Squat',
    category: 'compound_lower', equipment: 'barbell', movementPattern: 'squat',
    primaryMuscles: ['quadriceps', 'glutes', 'core'],
    axialLoadScore: 3, kneeStressScore: 3, defaultSubstituteIds: ['belt_squat'], isCustom: false,
  },
  {
    id: 'back_squat_high_bar', nameHu: 'Magas rúdállású guggolás', nameEn: 'High-Bar Back Squat',
    category: 'compound_lower', equipment: 'barbell', movementPattern: 'squat',
    primaryMuscles: ['quadriceps', 'glutes', 'core'],
    axialLoadScore: 4, kneeStressScore: 3, defaultSubstituteIds: ['front_squat'], isCustom: false,
  },
  {
    id: 'back_squat_low_bar', nameHu: 'Alacsony rúdállású guggolás', nameEn: 'Low-Bar Back Squat',
    category: 'compound_lower', equipment: 'barbell', movementPattern: 'squat',
    primaryMuscles: ['glutes', 'hamstrings', 'quadriceps', 'lower_back'],
    axialLoadScore: 5, kneeStressScore: 3, defaultSubstituteIds: ['front_squat'], isCustom: false,
  },
  {
    id: 'zercher_squat', nameHu: 'Zercher guggolás', nameEn: 'Zercher Squat',
    category: 'compound_lower', equipment: 'barbell', movementPattern: 'squat',
    primaryMuscles: ['quadriceps', 'glutes', 'core'],
    axialLoadScore: 4, kneeStressScore: 3, defaultSubstituteIds: ['belt_squat'], isCustom: false,
  },
  {
    id: 'box_squat', nameHu: 'Dobozguggolás', nameEn: 'Box Squat',
    category: 'compound_lower', equipment: 'barbell', movementPattern: 'squat',
    primaryMuscles: ['quadriceps', 'glutes'],
    axialLoadScore: 4, kneeStressScore: 3, defaultSubstituteIds: ['belt_squat'], isCustom: false,
  },
  {
    id: 'pause_squat', nameHu: 'Szüneteltetett guggolás', nameEn: 'Pause Squat',
    category: 'compound_lower', equipment: 'barbell', movementPattern: 'squat',
    primaryMuscles: ['quadriceps', 'glutes'],
    axialLoadScore: 4, kneeStressScore: 3, defaultSubstituteIds: ['front_squat'], isCustom: false,
  },
  {
    id: 'pin_squat', nameHu: 'Pin guggolás', nameEn: 'Pin Squat',
    category: 'compound_lower', equipment: 'barbell', movementPattern: 'squat',
    primaryMuscles: ['quadriceps', 'glutes'],
    axialLoadScore: 4, kneeStressScore: 3, defaultSubstituteIds: ['front_squat'], isCustom: false,
  },
  {
    id: 'safety_bar_squat', nameHu: 'Biztonsági rúd guggolás', nameEn: 'Safety Bar Squat',
    category: 'compound_lower', equipment: 'specialty_bar', movementPattern: 'squat',
    primaryMuscles: ['quadriceps', 'glutes', 'upper_back'],
    axialLoadScore: 3, kneeStressScore: 3, defaultSubstituteIds: ['belt_squat'], isCustom: false,
  },
  {
    id: 'belt_squat', nameHu: 'Öves guggolás', nameEn: 'Belt Squat',
    category: 'compound_lower', equipment: 'machine', movementPattern: 'squat',
    primaryMuscles: ['quadriceps', 'glutes'],
    axialLoadScore: 1, kneeStressScore: 2, defaultSubstituteIds: [], isCustom: false,
  },
  {
    id: 'hack_squat', nameHu: 'Hack guggolás', nameEn: 'Hack Squat',
    category: 'machine', equipment: 'machine', movementPattern: 'squat',
    primaryMuscles: ['quadriceps', 'glutes'],
    axialLoadScore: 2, kneeStressScore: 5, defaultSubstituteIds: ['belt_squat'], isCustom: false,
  },
  {
    id: 'pendulum_squat', nameHu: 'Inga guggolás', nameEn: 'Pendulum Squat',
    category: 'machine', equipment: 'machine', movementPattern: 'squat',
    primaryMuscles: ['quadriceps', 'glutes'],
    axialLoadScore: 1, kneeStressScore: 4, defaultSubstituteIds: ['belt_squat'], isCustom: false,
  },
  {
    id: 'smith_machine_squat', nameHu: 'Smith gép guggolás', nameEn: 'Smith Machine Squat',
    category: 'machine', equipment: 'machine', movementPattern: 'squat',
    primaryMuscles: ['quadriceps', 'glutes'],
    axialLoadScore: 2, kneeStressScore: 3, defaultSubstituteIds: ['belt_squat'], isCustom: false,
  },
  {
    id: 'leg_press', nameHu: 'Lábnyomás', nameEn: 'Leg Press',
    category: 'machine', equipment: 'machine', movementPattern: 'squat',
    primaryMuscles: ['quadriceps', 'glutes'],
    axialLoadScore: 1, kneeStressScore: 3, defaultSubstituteIds: ['belt_squat'], isCustom: false,
  },
  {
    id: 'leg_press_horizontal', nameHu: 'Horizontális lábnyomás', nameEn: 'Horizontal Leg Press',
    category: 'machine', equipment: 'machine', movementPattern: 'squat',
    primaryMuscles: ['quadriceps', 'glutes'],
    axialLoadScore: 1, kneeStressScore: 3, defaultSubstituteIds: ['belt_squat'], isCustom: false,
  },
  {
    id: 'bulgarian_split_squat', nameHu: 'Bolgár guggolás', nameEn: 'Bulgarian Split Squat',
    category: 'compound_lower', equipment: 'dumbbell', movementPattern: 'lunge',
    primaryMuscles: ['quadriceps', 'glutes'],
    axialLoadScore: 2, kneeStressScore: 4, defaultSubstituteIds: ['leg_press'], isCustom: false,
  },
  {
    id: 'walking_lunge', nameHu: 'Sétáló kitörés', nameEn: 'Walking Lunge',
    category: 'compound_lower', equipment: 'dumbbell', movementPattern: 'lunge',
    primaryMuscles: ['quadriceps', 'glutes'],
    axialLoadScore: 2, kneeStressScore: 4, defaultSubstituteIds: ['leg_press'], isCustom: false,
  },
  {
    id: 'reverse_lunge', nameHu: 'Hátralépő kitörés', nameEn: 'Reverse Lunge',
    category: 'compound_lower', equipment: 'dumbbell', movementPattern: 'lunge',
    primaryMuscles: ['quadriceps', 'glutes'],
    axialLoadScore: 2, kneeStressScore: 3, defaultSubstituteIds: ['leg_press'], isCustom: false,
  },
  {
    id: 'goblet_squat', nameHu: 'Serleg guggolás', nameEn: 'Goblet Squat',
    category: 'compound_lower', equipment: 'dumbbell', movementPattern: 'squat',
    primaryMuscles: ['quadriceps', 'glutes'],
    axialLoadScore: 2, kneeStressScore: 2, defaultSubstituteIds: ['belt_squat'], isCustom: false,
  },
  {
    id: 'sissy_squat', nameHu: 'Sissy guggolás', nameEn: 'Sissy Squat',
    category: 'isolation', equipment: 'bodyweight', movementPattern: 'squat',
    primaryMuscles: ['quadriceps'],
    axialLoadScore: 1, kneeStressScore: 5, defaultSubstituteIds: ['leg_extension'], isCustom: false,
  },
  {
    id: 'step_up', nameHu: 'Fellépés zsámolyra', nameEn: 'Step-up',
    category: 'compound_lower', equipment: 'dumbbell', movementPattern: 'lunge',
    primaryMuscles: ['quadriceps', 'glutes'],
    axialLoadScore: 2, kneeStressScore: 3, defaultSubstituteIds: ['leg_press'], isCustom: false,
  },
  {
    id: 'leg_extension', nameHu: 'Combfeszítő gép', nameEn: 'Leg Extension',
    category: 'isolation', equipment: 'machine', movementPattern: 'squat',
    primaryMuscles: ['quadriceps'],
    axialLoadScore: 1, kneeStressScore: 4, defaultSubstituteIds: [], isCustom: false,
  },
  {
    id: 'leg_extension_unilateral', nameHu: 'Egy lábas combfeszítő', nameEn: 'Unilateral Leg Extension',
    category: 'isolation', equipment: 'machine', movementPattern: 'squat',
    primaryMuscles: ['quadriceps'],
    axialLoadScore: 1, kneeStressScore: 4, defaultSubstituteIds: ['leg_extension'], isCustom: false,
  },

  // ========================================================================
  // Hinge, hamstring, glute & adductor (24)
  // ========================================================================
  {
    id: 'romanian_deadlift', nameHu: 'Román felhúzás', nameEn: 'Romanian Deadlift',
    category: 'compound_lower', equipment: 'barbell', movementPattern: 'hinge',
    primaryMuscles: ['hamstrings', 'glutes', 'lower_back'],
    axialLoadScore: 4, kneeStressScore: 2, defaultSubstituteIds: [], isCustom: false,
  },
  {
    id: 'conventional_deadlift', nameHu: 'Hagyományos felhúzás', nameEn: 'Conventional Deadlift',
    category: 'compound_lower', equipment: 'barbell', movementPattern: 'hinge',
    primaryMuscles: ['hamstrings', 'glutes', 'lower_back', 'back'],
    axialLoadScore: 5, kneeStressScore: 2, defaultSubstituteIds: ['trap_bar_deadlift'], isCustom: false,
  },
  {
    id: 'sumo_deadlift', nameHu: 'Szumó felhúzás', nameEn: 'Sumo Deadlift',
    category: 'compound_lower', equipment: 'barbell', movementPattern: 'hinge',
    primaryMuscles: ['glutes', 'adductors', 'quadriceps', 'lower_back'],
    axialLoadScore: 5, kneeStressScore: 3, defaultSubstituteIds: ['trap_bar_deadlift'], isCustom: false,
  },
  {
    id: 'dumbbell_rdl', nameHu: 'Kézisúlyzós román felhúzás', nameEn: 'Dumbbell Romanian Deadlift',
    category: 'compound_lower', equipment: 'dumbbell', movementPattern: 'hinge',
    primaryMuscles: ['hamstrings', 'glutes'],
    axialLoadScore: 3, kneeStressScore: 1, defaultSubstituteIds: ['romanian_deadlift'], isCustom: false,
  },
  {
    id: 'stiff_leg_deadlift', nameHu: 'Nyújtott lábú felhúzás', nameEn: 'Stiff-Leg Deadlift',
    category: 'compound_lower', equipment: 'barbell', movementPattern: 'hinge',
    primaryMuscles: ['hamstrings', 'glutes', 'lower_back'],
    axialLoadScore: 4, kneeStressScore: 1, defaultSubstituteIds: ['romanian_deadlift'], isCustom: false,
  },
  {
    id: 'deficit_deadlift', nameHu: 'Deficit felhúzás', nameEn: 'Deficit Deadlift',
    category: 'compound_lower', equipment: 'barbell', movementPattern: 'hinge',
    primaryMuscles: ['hamstrings', 'glutes', 'lower_back'],
    axialLoadScore: 5, kneeStressScore: 2, defaultSubstituteIds: ['romanian_deadlift'], isCustom: false,
  },
  {
    id: 'rack_pull', nameHu: 'Rack húzás', nameEn: 'Rack Pull',
    category: 'compound_lower', equipment: 'barbell', movementPattern: 'hinge',
    primaryMuscles: ['back', 'glutes', 'lower_back'],
    axialLoadScore: 4, kneeStressScore: 1, defaultSubstituteIds: ['romanian_deadlift'], isCustom: false,
  },
  {
    id: 'trap_bar_deadlift', nameHu: 'Trap bar felhúzás', nameEn: 'Trap Bar Deadlift',
    category: 'compound_lower', equipment: 'specialty_bar', movementPattern: 'hinge',
    primaryMuscles: ['quadriceps', 'glutes', 'hamstrings'],
    axialLoadScore: 3, kneeStressScore: 3, defaultSubstituteIds: ['romanian_deadlift'], isCustom: false,
  },
  {
    id: 'good_morning', nameHu: 'Jó reggelt gyakorlat', nameEn: 'Good Morning',
    category: 'compound_lower', equipment: 'barbell', movementPattern: 'hinge',
    primaryMuscles: ['hamstrings', 'glutes', 'lower_back'],
    axialLoadScore: 4, kneeStressScore: 2, defaultSubstituteIds: ['romanian_deadlift'], isCustom: false,
  },
  {
    id: 'good_morning_seated', nameHu: 'Ülő jó reggelt gyakorlat', nameEn: 'Seated Good Morning',
    category: 'compound_lower', equipment: 'barbell', movementPattern: 'hinge',
    primaryMuscles: ['hamstrings', 'glutes', 'lower_back'],
    axialLoadScore: 3, kneeStressScore: 2, defaultSubstituteIds: ['romanian_deadlift'], isCustom: false,
  },
  {
    id: 'hip_thrust', nameHu: 'Csípőemelés', nameEn: 'Barbell Hip Thrust',
    category: 'machine', equipment: 'barbell', movementPattern: 'hinge',
    primaryMuscles: ['glutes', 'hamstrings'],
    axialLoadScore: 1, kneeStressScore: 1, defaultSubstituteIds: [], isCustom: false,
  },
  {
    id: 'machine_hip_thrust', nameHu: 'Gépi csípőemelés', nameEn: 'Machine Hip Thrust',
    category: 'machine', equipment: 'machine', movementPattern: 'hinge',
    primaryMuscles: ['glutes', 'hamstrings'],
    axialLoadScore: 1, kneeStressScore: 1, defaultSubstituteIds: ['hip_thrust'], isCustom: false,
  },
  {
    id: 'glute_bridge', nameHu: 'Csípőhíd', nameEn: 'Glute Bridge',
    category: 'compound_lower', equipment: 'barbell', movementPattern: 'hinge',
    primaryMuscles: ['glutes', 'hamstrings'],
    axialLoadScore: 1, kneeStressScore: 1, defaultSubstituteIds: ['hip_thrust'], isCustom: false,
  },
  {
    id: 'cable_pull_through', nameHu: 'Kábeles csípőtolás', nameEn: 'Cable Pull-Through',
    category: 'isolation', equipment: 'cable', movementPattern: 'hinge',
    primaryMuscles: ['glutes', 'hamstrings'],
    axialLoadScore: 2, kneeStressScore: 1, defaultSubstituteIds: ['hip_thrust'], isCustom: false,
  },
  {
    id: 'seated_leg_curl', nameHu: 'Ülő combhajlító gép', nameEn: 'Seated Leg Curl',
    category: 'isolation', equipment: 'machine', movementPattern: 'hinge',
    primaryMuscles: ['hamstrings'],
    axialLoadScore: 1, kneeStressScore: 1, defaultSubstituteIds: [], isCustom: false,
  },
  {
    id: 'lying_leg_curl', nameHu: 'Fekvő combhajlító gép', nameEn: 'Lying Leg Curl',
    category: 'isolation', equipment: 'machine', movementPattern: 'hinge',
    primaryMuscles: ['hamstrings'],
    axialLoadScore: 1, kneeStressScore: 1, defaultSubstituteIds: ['seated_leg_curl'], isCustom: false,
  },
  {
    id: 'standing_single_leg_curl', nameHu: 'Álló egy lábas combhajlító', nameEn: 'Standing Single-Leg Curl',
    category: 'isolation', equipment: 'machine', movementPattern: 'hinge',
    primaryMuscles: ['hamstrings'],
    axialLoadScore: 1, kneeStressScore: 1, defaultSubstituteIds: ['lying_leg_curl'], isCustom: false,
  },
  {
    id: 'nordic_hamstring_curl', nameHu: 'Nordic combhajlító', nameEn: 'Nordic Hamstring Curl',
    category: 'isolation', equipment: 'bodyweight', movementPattern: 'hinge',
    primaryMuscles: ['hamstrings'],
    axialLoadScore: 1, kneeStressScore: 4, defaultSubstituteIds: ['lying_leg_curl'], isCustom: false,
  },
  {
    id: 'glute_ham_raise', nameHu: 'Glute-ham emelés', nameEn: 'Glute-Ham Raise',
    category: 'isolation', equipment: 'bodyweight', movementPattern: 'hinge',
    primaryMuscles: ['hamstrings', 'glutes'],
    axialLoadScore: 1, kneeStressScore: 4, defaultSubstituteIds: ['lying_leg_curl'], isCustom: false,
  },
  {
    id: 'hyperextension_45', nameHu: '45 fokos törzsemelés', nameEn: '45° Hyperextension',
    category: 'isolation', equipment: 'machine', movementPattern: 'hinge',
    primaryMuscles: ['lower_back', 'glutes', 'hamstrings'],
    axialLoadScore: 2, kneeStressScore: 1, defaultSubstituteIds: [], isCustom: false,
  },
  {
    id: 'reverse_hyper', nameHu: 'Fordított hiper', nameEn: 'Reverse Hyperextension',
    category: 'isolation', equipment: 'machine', movementPattern: 'hinge',
    primaryMuscles: ['glutes', 'hamstrings', 'lower_back'],
    axialLoadScore: 2, kneeStressScore: 1, defaultSubstituteIds: [], isCustom: false,
  },
  {
    id: 'adductor_machine', nameHu: 'Combközelítő gép', nameEn: 'Adductor Machine',
    category: 'machine', equipment: 'machine', movementPattern: 'hinge',
    primaryMuscles: ['adductors'],
    axialLoadScore: 1, kneeStressScore: 1, defaultSubstituteIds: [], isCustom: false,
  },
  {
    id: 'abductor_machine', nameHu: 'Combterpesztő gép', nameEn: 'Abductor Machine',
    category: 'machine', equipment: 'machine', movementPattern: 'hinge',
    primaryMuscles: ['abductors', 'glutes'],
    axialLoadScore: 1, kneeStressScore: 1, defaultSubstituteIds: [], isCustom: false,
  },
  {
    id: 'copenhagen_plank', nameHu: 'Koppenhágai deszka', nameEn: 'Copenhagen Plank',
    category: 'isolation', equipment: 'bodyweight', movementPattern: 'core',
    primaryMuscles: ['adductors', 'core'],
    axialLoadScore: 1, kneeStressScore: 1, defaultSubstituteIds: [], isCustom: false,
  },

  // ========================================================================
  // Chest / horizontal push (22)
  // ========================================================================
  {
    id: 'bench_press', nameHu: 'Fekvenyomás', nameEn: 'Barbell Bench Press',
    category: 'compound_upper', equipment: 'barbell', movementPattern: 'horizontal_push',
    primaryMuscles: ['chest', 'triceps', 'front_delts'],
    axialLoadScore: 2, kneeStressScore: 1, defaultSubstituteIds: [], isCustom: false,
  },
  {
    id: 'pause_bench_press', nameHu: 'Szüneteltetett fekvenyomás', nameEn: 'Pause Bench Press',
    category: 'compound_upper', equipment: 'barbell', movementPattern: 'horizontal_push',
    primaryMuscles: ['chest', 'triceps', 'front_delts'],
    axialLoadScore: 2, kneeStressScore: 1, defaultSubstituteIds: ['bench_press'], isCustom: false,
  },
  {
    id: 'close_grip_bench_press', nameHu: 'Szűk fogású fekvenyomás', nameEn: 'Close-Grip Bench Press',
    category: 'compound_upper', equipment: 'barbell', movementPattern: 'horizontal_push',
    primaryMuscles: ['triceps', 'chest', 'front_delts'],
    axialLoadScore: 2, kneeStressScore: 1, defaultSubstituteIds: ['bench_press'], isCustom: false,
  },
  {
    id: 'incline_barbell_bench_press', nameHu: 'Ferde rúd fekvenyomás', nameEn: 'Incline Barbell Bench Press',
    category: 'compound_upper', equipment: 'barbell', movementPattern: 'horizontal_push',
    primaryMuscles: ['chest', 'front_delts', 'triceps'],
    axialLoadScore: 2, kneeStressScore: 1, defaultSubstituteIds: ['incline_dumbbell_press'], isCustom: false,
  },
  {
    id: 'decline_bench_press', nameHu: 'Negatív pad fekvenyomás', nameEn: 'Decline Bench Press',
    category: 'compound_upper', equipment: 'barbell', movementPattern: 'horizontal_push',
    primaryMuscles: ['chest', 'triceps'],
    axialLoadScore: 1, kneeStressScore: 1, defaultSubstituteIds: ['dips'], isCustom: false,
  },
  {
    id: 'floor_press', nameHu: 'Padlónyomás', nameEn: 'Floor Press',
    category: 'compound_upper', equipment: 'barbell', movementPattern: 'horizontal_push',
    primaryMuscles: ['chest', 'triceps'],
    axialLoadScore: 1, kneeStressScore: 1, defaultSubstituteIds: ['bench_press'], isCustom: false,
  },
  {
    id: 'spoto_press', nameHu: 'Spoto nyomás', nameEn: 'Spoto Press',
    category: 'compound_upper', equipment: 'barbell', movementPattern: 'horizontal_push',
    primaryMuscles: ['chest', 'triceps'],
    axialLoadScore: 2, kneeStressScore: 1, defaultSubstituteIds: ['bench_press'], isCustom: false,
  },
  {
    id: 'dumbbell_bench_press', nameHu: 'Kézisúlyzós fekvenyomás', nameEn: 'Dumbbell Bench Press',
    category: 'compound_upper', equipment: 'dumbbell', movementPattern: 'horizontal_push',
    primaryMuscles: ['chest', 'triceps', 'front_delts'],
    axialLoadScore: 1, kneeStressScore: 1, defaultSubstituteIds: ['bench_press'], isCustom: false,
  },
  {
    id: 'incline_dumbbell_press', nameHu: 'Ferde kézisúlyos nyomás', nameEn: 'Incline Dumbbell Press',
    category: 'compound_upper', equipment: 'dumbbell', movementPattern: 'horizontal_push',
    primaryMuscles: ['chest', 'front_delts', 'triceps'],
    axialLoadScore: 1, kneeStressScore: 1, defaultSubstituteIds: [], isCustom: false,
  },
  {
    id: 'decline_dumbbell_press', nameHu: 'Negatív kézisúlyos nyomás', nameEn: 'Decline Dumbbell Press',
    category: 'compound_upper', equipment: 'dumbbell', movementPattern: 'horizontal_push',
    primaryMuscles: ['chest', 'triceps'],
    axialLoadScore: 1, kneeStressScore: 1, defaultSubstituteIds: ['dumbbell_bench_press'], isCustom: false,
  },
  {
    id: 'chest_press_machine', nameHu: 'Gépi mellnyomás', nameEn: 'Chest Press Machine',
    category: 'machine', equipment: 'machine', movementPattern: 'horizontal_push',
    primaryMuscles: ['chest', 'triceps'],
    axialLoadScore: 1, kneeStressScore: 1, defaultSubstituteIds: [], isCustom: false,
  },
  {
    id: 'incline_chest_press_machine', nameHu: 'Ferde gépi mellnyomás', nameEn: 'Incline Chest Press Machine',
    category: 'machine', equipment: 'machine', movementPattern: 'horizontal_push',
    primaryMuscles: ['chest', 'front_delts'],
    axialLoadScore: 1, kneeStressScore: 1, defaultSubstituteIds: ['chest_press_machine'], isCustom: false,
  },
  {
    id: 'dips', nameHu: 'Tolódzkodás', nameEn: 'Weighted Dips',
    category: 'compound_upper', equipment: 'bodyweight', movementPattern: 'horizontal_push',
    primaryMuscles: ['chest', 'triceps', 'front_delts'],
    axialLoadScore: 1, kneeStressScore: 1, defaultSubstituteIds: [], isCustom: false,
  },
  {
    id: 'chest_dips', nameHu: 'Mell tolódzkodás', nameEn: 'Chest Dips',
    category: 'compound_upper', equipment: 'bodyweight', movementPattern: 'horizontal_push',
    primaryMuscles: ['chest', 'triceps', 'front_delts'],
    axialLoadScore: 1, kneeStressScore: 1, defaultSubstituteIds: ['dips'], isCustom: false,
  },
  {
    id: 'push_ups', nameHu: 'Fekvőtámasz', nameEn: 'Push-ups',
    category: 'compound_upper', equipment: 'bodyweight', movementPattern: 'horizontal_push',
    primaryMuscles: ['chest', 'triceps', 'front_delts'],
    axialLoadScore: 1, kneeStressScore: 1, defaultSubstituteIds: [], isCustom: false,
  },
  {
    id: 'pec_deck', nameHu: 'Pectó gép', nameEn: 'Pec Deck / Machine Fly',
    category: 'machine', equipment: 'machine', movementPattern: 'horizontal_push',
    primaryMuscles: ['chest'],
    axialLoadScore: 1, kneeStressScore: 1, defaultSubstituteIds: ['cable_fly'], isCustom: false,
  },
  {
    id: 'cable_fly', nameHu: 'Kábeles melltárítás', nameEn: 'Cable Fly',
    category: 'isolation', equipment: 'cable', movementPattern: 'horizontal_push',
    primaryMuscles: ['chest'],
    axialLoadScore: 1, kneeStressScore: 1, defaultSubstituteIds: [], isCustom: false,
  },
  {
    id: 'cable_fly_high_low', nameHu: 'Kábeles melltárítás fentről', nameEn: 'High-to-Low Cable Fly',
    category: 'isolation', equipment: 'cable', movementPattern: 'horizontal_push',
    primaryMuscles: ['chest'],
    axialLoadScore: 1, kneeStressScore: 1, defaultSubstituteIds: ['cable_fly'], isCustom: false,
  },
  {
    id: 'cable_fly_mid', nameHu: 'Kábeles melltárítás középen', nameEn: 'Mid Cable Fly',
    category: 'isolation', equipment: 'cable', movementPattern: 'horizontal_push',
    primaryMuscles: ['chest'],
    axialLoadScore: 1, kneeStressScore: 1, defaultSubstituteIds: ['cable_fly'], isCustom: false,
  },
  {
    id: 'cable_fly_low_high', nameHu: 'Kábeles melltárítás lentről', nameEn: 'Low-to-High Cable Fly',
    category: 'isolation', equipment: 'cable', movementPattern: 'horizontal_push',
    primaryMuscles: ['chest'],
    axialLoadScore: 1, kneeStressScore: 1, defaultSubstituteIds: ['cable_fly'], isCustom: false,
  },
  {
    id: 'dumbbell_fly', nameHu: 'Kézisúlyzós melltárítás', nameEn: 'Dumbbell Fly',
    category: 'isolation', equipment: 'dumbbell', movementPattern: 'horizontal_push',
    primaryMuscles: ['chest'],
    axialLoadScore: 1, kneeStressScore: 1, defaultSubstituteIds: ['cable_fly'], isCustom: false,
  },
  {
    id: 'landmine_press', nameHu: 'Landmine nyomás', nameEn: 'Landmine Press',
    category: 'compound_upper', equipment: 'barbell', movementPattern: 'vertical_push',
    primaryMuscles: ['front_delts', 'chest', 'triceps'],
    axialLoadScore: 2, kneeStressScore: 1, defaultSubstituteIds: [], isCustom: false,
  },

  // ========================================================================
  // Back / horizontal & vertical pull (26)
  // ========================================================================
  {
    id: 'weighted_pullup', nameHu: 'Húzódzkodás', nameEn: 'Weighted Pull-up',
    category: 'compound_upper', equipment: 'bodyweight', movementPattern: 'vertical_pull',
    primaryMuscles: ['lats', 'biceps'],
    axialLoadScore: 1, kneeStressScore: 1, defaultSubstituteIds: ['lat_pulldown'], isCustom: false,
  },
  {
    id: 'bodyweight_pullup', nameHu: 'Saját testsúlyos húzódzkodás', nameEn: 'Bodyweight Pull-up',
    category: 'compound_upper', equipment: 'bodyweight', movementPattern: 'vertical_pull',
    primaryMuscles: ['lats', 'biceps'],
    axialLoadScore: 1, kneeStressScore: 1, defaultSubstituteIds: ['lat_pulldown'], isCustom: false,
  },
  {
    id: 'chin_up', nameHu: 'Csukott tenyerű húzódzkodás', nameEn: 'Chin-up',
    category: 'compound_upper', equipment: 'bodyweight', movementPattern: 'vertical_pull',
    primaryMuscles: ['lats', 'biceps'],
    axialLoadScore: 1, kneeStressScore: 1, defaultSubstituteIds: ['lat_pulldown'], isCustom: false,
  },
  {
    id: 'neutral_grip_pullup', nameHu: 'Semleges fogású húzódzkodás', nameEn: 'Neutral-Grip Pull-up',
    category: 'compound_upper', equipment: 'bodyweight', movementPattern: 'vertical_pull',
    primaryMuscles: ['lats', 'biceps'],
    axialLoadScore: 1, kneeStressScore: 1, defaultSubstituteIds: ['lat_pulldown'], isCustom: false,
  },
  {
    id: 'lat_pulldown', nameHu: 'Lehúzás', nameEn: 'Lat Pulldown',
    category: 'compound_upper', equipment: 'cable', movementPattern: 'vertical_pull',
    primaryMuscles: ['lats', 'biceps'],
    axialLoadScore: 1, kneeStressScore: 1, defaultSubstituteIds: [], isCustom: false,
  },
  {
    id: 'wide_grip_lat_pulldown', nameHu: 'Széles fogású lehúzás', nameEn: 'Wide-Grip Lat Pulldown',
    category: 'compound_upper', equipment: 'cable', movementPattern: 'vertical_pull',
    primaryMuscles: ['lats', 'biceps'],
    axialLoadScore: 1, kneeStressScore: 1, defaultSubstituteIds: ['lat_pulldown'], isCustom: false,
  },
  {
    id: 'close_grip_lat_pulldown', nameHu: 'Szűk fogású lehúzás', nameEn: 'Close-Grip Lat Pulldown',
    category: 'compound_upper', equipment: 'cable', movementPattern: 'vertical_pull',
    primaryMuscles: ['lats', 'biceps'],
    axialLoadScore: 1, kneeStressScore: 1, defaultSubstituteIds: ['lat_pulldown'], isCustom: false,
  },
  {
    id: 'single_arm_pulldown', nameHu: 'Egy karos kábeles lehúzás', nameEn: 'Single-Arm Cable Pulldown',
    category: 'isolation', equipment: 'cable', movementPattern: 'vertical_pull',
    primaryMuscles: ['lats'],
    axialLoadScore: 1, kneeStressScore: 1, defaultSubstituteIds: ['lat_pulldown'], isCustom: false,
  },
  {
    id: 'straight_arm_pulldown', nameHu: 'Nyújtott karos lehúzás', nameEn: 'Straight-Arm Cable Pulldown',
    category: 'isolation', equipment: 'cable', movementPattern: 'vertical_pull',
    primaryMuscles: ['lats'],
    axialLoadScore: 1, kneeStressScore: 1, defaultSubstituteIds: [], isCustom: false,
  },
  {
    id: 'dumbbell_pullover', nameHu: 'Kézisúlyzós pullover', nameEn: 'Dumbbell Pullover',
    category: 'isolation', equipment: 'dumbbell', movementPattern: 'vertical_pull',
    primaryMuscles: ['lats', 'chest'],
    axialLoadScore: 1, kneeStressScore: 1, defaultSubstituteIds: [], isCustom: false,
  },
  {
    id: 'barbell_row', nameHu: 'Döntött törzsű evezés', nameEn: 'Barbell Bent-Over Row',
    category: 'compound_upper', equipment: 'barbell', movementPattern: 'horizontal_pull',
    primaryMuscles: ['back', 'biceps', 'lower_back'],
    axialLoadScore: 3, kneeStressScore: 1, defaultSubstituteIds: ['chest_supported_row'], isCustom: false,
  },
  {
    id: 'pendlay_row', nameHu: 'Pendlay evezés', nameEn: 'Pendlay Row',
    category: 'compound_upper', equipment: 'barbell', movementPattern: 'horizontal_pull',
    primaryMuscles: ['back', 'biceps', 'lower_back'],
    axialLoadScore: 4, kneeStressScore: 1, defaultSubstituteIds: ['chest_supported_row'], isCustom: false,
  },
  {
    id: 'yates_row', nameHu: 'Yates evezés', nameEn: 'Yates Row',
    category: 'compound_upper', equipment: 'barbell', movementPattern: 'horizontal_pull',
    primaryMuscles: ['back', 'biceps'],
    axialLoadScore: 2, kneeStressScore: 1, defaultSubstituteIds: ['chest_supported_row'], isCustom: false,
  },
  {
    id: 't_bar_row', nameHu: 'T-rúd evezés', nameEn: 'T-Bar Row',
    category: 'compound_upper', equipment: 'barbell', movementPattern: 'horizontal_pull',
    primaryMuscles: ['back', 'biceps'],
    axialLoadScore: 2, kneeStressScore: 1, defaultSubstituteIds: ['chest_supported_row'], isCustom: false,
  },
  {
    id: 'chest_supported_dumbbell_row', nameHu: 'Támaszos kézisúlyzós evezés', nameEn: 'Chest-Supported Dumbbell Row',
    category: 'isolation', equipment: 'dumbbell', movementPattern: 'horizontal_pull',
    primaryMuscles: ['back', 'biceps'],
    axialLoadScore: 1, kneeStressScore: 1, defaultSubstituteIds: ['chest_supported_row'], isCustom: false,
  },
  {
    id: 'chest_supported_row', nameHu: 'Támaszos gépi evezés', nameEn: 'Chest-Supported Machine Row',
    category: 'machine', equipment: 'machine', movementPattern: 'horizontal_pull',
    primaryMuscles: ['back', 'biceps'],
    axialLoadScore: 1, kneeStressScore: 1, defaultSubstituteIds: [], isCustom: false,
  },
  {
    id: 'meadows_row', nameHu: 'Meadows evezés', nameEn: 'Meadows Row',
    category: 'compound_upper', equipment: 'barbell', movementPattern: 'horizontal_pull',
    primaryMuscles: ['back', 'biceps'],
    axialLoadScore: 2, kneeStressScore: 1, defaultSubstituteIds: ['one_arm_dumbbell_row'], isCustom: false,
  },
  {
    id: 'one_arm_dumbbell_row', nameHu: 'Egy karos kézisúlyzós evezés', nameEn: 'One-Arm Dumbbell Row',
    category: 'compound_upper', equipment: 'dumbbell', movementPattern: 'horizontal_pull',
    primaryMuscles: ['back', 'biceps'],
    axialLoadScore: 2, kneeStressScore: 1, defaultSubstituteIds: ['chest_supported_row'], isCustom: false,
  },
  {
    id: 'seated_cable_row', nameHu: 'Ülő kábeles evezés', nameEn: 'Seated Cable Row',
    category: 'compound_upper', equipment: 'cable', movementPattern: 'horizontal_pull',
    primaryMuscles: ['back', 'biceps'],
    axialLoadScore: 1, kneeStressScore: 1, defaultSubstituteIds: [], isCustom: false,
  },
  {
    id: 'seated_cable_row_v_grip', nameHu: 'Ülő kábeles evezés V-fogással', nameEn: 'V-Grip Seated Cable Row',
    category: 'compound_upper', equipment: 'cable', movementPattern: 'horizontal_pull',
    primaryMuscles: ['back', 'biceps'],
    axialLoadScore: 1, kneeStressScore: 1, defaultSubstituteIds: ['seated_cable_row'], isCustom: false,
  },
  {
    id: 'seal_row', nameHu: 'Fekvő evezés', nameEn: 'Seal Row',
    category: 'compound_upper', equipment: 'barbell', movementPattern: 'horizontal_pull',
    primaryMuscles: ['back', 'biceps'],
    axialLoadScore: 1, kneeStressScore: 1, defaultSubstituteIds: ['chest_supported_row'], isCustom: false,
  },
  {
    id: 'inverted_row', nameHu: 'Fordított evezés', nameEn: 'Inverted Row',
    category: 'compound_upper', equipment: 'bodyweight', movementPattern: 'horizontal_pull',
    primaryMuscles: ['back', 'biceps'],
    axialLoadScore: 1, kneeStressScore: 1, defaultSubstituteIds: ['chest_supported_row'], isCustom: false,
  },
  {
    id: 'barbell_shrug', nameHu: 'Rúd vállvonogatás', nameEn: 'Barbell Shrug',
    category: 'isolation', equipment: 'barbell', movementPattern: 'horizontal_pull',
    primaryMuscles: ['upper_back', 'trapezius'],
    axialLoadScore: 2, kneeStressScore: 1, defaultSubstituteIds: [], isCustom: false,
  },
  {
    id: 'dumbbell_shrug', nameHu: 'Kézisúlyzós vállvonogatás', nameEn: 'Dumbbell Shrug',
    category: 'isolation', equipment: 'dumbbell', movementPattern: 'horizontal_pull',
    primaryMuscles: ['upper_back', 'trapezius'],
    axialLoadScore: 1, kneeStressScore: 1, defaultSubstituteIds: [], isCustom: false,
  },
  {
    id: 'rack_shrug', nameHu: 'Rack vállvonogatás', nameEn: 'Rack Shrug',
    category: 'isolation', equipment: 'barbell', movementPattern: 'horizontal_pull',
    primaryMuscles: ['upper_back', 'trapezius'],
    axialLoadScore: 3, kneeStressScore: 1, defaultSubstituteIds: ['dumbbell_shrug'], isCustom: false,
  },

  // ========================================================================
  // Shoulders / vertical push & delts (16)
  // ========================================================================
  {
    id: 'overhead_press', nameHu: 'Mellről nyomás', nameEn: 'Overhead Press',
    category: 'compound_upper', equipment: 'barbell', movementPattern: 'vertical_push',
    primaryMuscles: ['shoulders', 'triceps'],
    axialLoadScore: 3, kneeStressScore: 1, defaultSubstituteIds: [], isCustom: false,
  },
  {
    id: 'push_press', nameHu: 'Lökés', nameEn: 'Push Press',
    category: 'compound_upper', equipment: 'barbell', movementPattern: 'vertical_push',
    primaryMuscles: ['shoulders', 'triceps'],
    axialLoadScore: 3, kneeStressScore: 2, defaultSubstituteIds: ['overhead_press'], isCustom: false,
  },
  {
    id: 'seated_barbell_shoulder_press', nameHu: 'Ülő rúd vállnyomás', nameEn: 'Seated Barbell Shoulder Press',
    category: 'compound_upper', equipment: 'barbell', movementPattern: 'vertical_push',
    primaryMuscles: ['shoulders', 'triceps'],
    axialLoadScore: 2, kneeStressScore: 1, defaultSubstituteIds: ['overhead_press'], isCustom: false,
  },
  {
    id: 'seated_dumbbell_shoulder_press', nameHu: 'Ülő kézisúlyzós vállnyomás', nameEn: 'Seated Dumbbell Shoulder Press',
    category: 'compound_upper', equipment: 'dumbbell', movementPattern: 'vertical_push',
    primaryMuscles: ['shoulders', 'triceps'],
    axialLoadScore: 1, kneeStressScore: 1, defaultSubstituteIds: [], isCustom: false,
  },
  {
    id: 'arnold_press', nameHu: 'Arnold nyomás', nameEn: 'Arnold Press',
    category: 'compound_upper', equipment: 'dumbbell', movementPattern: 'vertical_push',
    primaryMuscles: ['shoulders', 'triceps'],
    axialLoadScore: 1, kneeStressScore: 1, defaultSubstituteIds: ['seated_dumbbell_shoulder_press'], isCustom: false,
  },
  {
    id: 'machine_shoulder_press', nameHu: 'Gépi vállnyomás', nameEn: 'Machine Shoulder Press',
    category: 'machine', equipment: 'machine', movementPattern: 'vertical_push',
    primaryMuscles: ['shoulders', 'triceps'],
    axialLoadScore: 1, kneeStressScore: 1, defaultSubstituteIds: [], isCustom: false,
  },
  {
    id: 'behind_neck_press', nameHu: 'Tarkó mögötti nyomás', nameEn: 'Behind-the-Neck Press',
    category: 'compound_upper', equipment: 'barbell', movementPattern: 'vertical_push',
    primaryMuscles: ['shoulders', 'triceps'],
    axialLoadScore: 3, kneeStressScore: 1, defaultSubstituteIds: ['overhead_press'], isCustom: false,
  },
  {
    id: 'viking_press', nameHu: 'Viking nyomás', nameEn: 'Viking Press',
    category: 'machine', equipment: 'machine', movementPattern: 'vertical_push',
    primaryMuscles: ['shoulders', 'chest', 'triceps'],
    axialLoadScore: 2, kneeStressScore: 1, defaultSubstituteIds: ['machine_shoulder_press'], isCustom: false,
  },
  {
    id: 'lateral_raise', nameHu: 'Oldalemelés', nameEn: 'Dumbbell Lateral Raise',
    category: 'isolation', equipment: 'dumbbell', movementPattern: 'vertical_push',
    primaryMuscles: ['shoulders'],
    axialLoadScore: 1, kneeStressScore: 1, defaultSubstituteIds: [], isCustom: false,
  },
  {
    id: 'cable_lateral_raise', nameHu: 'Kábeles oldalemelés', nameEn: 'Cable Lateral Raise',
    category: 'isolation', equipment: 'cable', movementPattern: 'vertical_push',
    primaryMuscles: ['shoulders'],
    axialLoadScore: 1, kneeStressScore: 1, defaultSubstituteIds: ['lateral_raise'], isCustom: false,
  },
  {
    id: 'machine_lateral_raise', nameHu: 'Gépi oldalemelés', nameEn: 'Machine Lateral Raise',
    category: 'machine', equipment: 'machine', movementPattern: 'vertical_push',
    primaryMuscles: ['shoulders'],
    axialLoadScore: 1, kneeStressScore: 1, defaultSubstituteIds: ['lateral_raise'], isCustom: false,
  },
  {
    id: 'lu_raise', nameHu: 'Lu emelés', nameEn: 'Lu Raise',
    category: 'isolation', equipment: 'dumbbell', movementPattern: 'vertical_push',
    primaryMuscles: ['shoulders'],
    axialLoadScore: 1, kneeStressScore: 1, defaultSubstituteIds: ['lateral_raise'], isCustom: false,
  },
  {
    id: 'rear_delt_fly_dumbbell', nameHu: 'Kézisúlyzós hátsó váll', nameEn: 'Dumbbell Rear Delt Fly',
    category: 'isolation', equipment: 'dumbbell', movementPattern: 'horizontal_pull',
    primaryMuscles: ['rear_delts'],
    axialLoadScore: 1, kneeStressScore: 1, defaultSubstituteIds: ['face_pull'], isCustom: false,
  },
  {
    id: 'rear_delt_fly_cable', nameHu: 'Kábeles hátsó váll', nameEn: 'Cable Rear Delt Fly',
    category: 'isolation', equipment: 'cable', movementPattern: 'horizontal_pull',
    primaryMuscles: ['rear_delts'],
    axialLoadScore: 1, kneeStressScore: 1, defaultSubstituteIds: ['face_pull'], isCustom: false,
  },
  {
    id: 'reverse_pec_deck', nameHu: 'Fordított pectó gép', nameEn: 'Reverse Pec Deck',
    category: 'machine', equipment: 'machine', movementPattern: 'horizontal_pull',
    primaryMuscles: ['rear_delts'],
    axialLoadScore: 1, kneeStressScore: 1, defaultSubstituteIds: ['face_pull'], isCustom: false,
  },
  {
    id: 'face_pull', nameHu: 'Arcmellé húzás', nameEn: 'Face Pull',
    category: 'isolation', equipment: 'cable', movementPattern: 'horizontal_pull',
    primaryMuscles: ['rear_delts', 'upper_back'],
    axialLoadScore: 1, kneeStressScore: 1, defaultSubstituteIds: [], isCustom: false,
  },
  {
    id: 'upright_row_barbell', nameHu: 'Rúd evezés állig', nameEn: 'Barbell Upright Row',
    category: 'isolation', equipment: 'barbell', movementPattern: 'vertical_pull',
    primaryMuscles: ['shoulders', 'trapezius'],
    axialLoadScore: 2, kneeStressScore: 1, defaultSubstituteIds: ['face_pull'], isCustom: false,
  },
  {
    id: 'upright_row_cable', nameHu: 'Kábeles evezés állig', nameEn: 'Cable Upright Row',
    category: 'isolation', equipment: 'cable', movementPattern: 'vertical_pull',
    primaryMuscles: ['shoulders', 'trapezius'],
    axialLoadScore: 1, kneeStressScore: 1, defaultSubstituteIds: ['face_pull'], isCustom: false,
  },

  // ========================================================================
  // Biceps, triceps & forearms (26)
  // ========================================================================
  {
    id: 'barbell_curl', nameHu: 'Rúddal végzett bicepsz', nameEn: 'Barbell Curl',
    category: 'isolation', equipment: 'barbell', movementPattern: 'arm_isolation',
    primaryMuscles: ['biceps'],
    axialLoadScore: 1, kneeStressScore: 1, defaultSubstituteIds: ['incline_dumbbell_curl'], isCustom: false,
  },
  {
    id: 'ez_bar_curl', nameHu: 'EZ-rúd bicepsz', nameEn: 'EZ-Bar Curl',
    category: 'isolation', equipment: 'barbell', movementPattern: 'arm_isolation',
    primaryMuscles: ['biceps'],
    axialLoadScore: 1, kneeStressScore: 1, defaultSubstituteIds: ['barbell_curl'], isCustom: false,
  },
  {
    id: 'dumbbell_bicep_curl', nameHu: 'Kézisúlyzós bicepsz', nameEn: 'Dumbbell Bicep Curl',
    category: 'isolation', equipment: 'dumbbell', movementPattern: 'arm_isolation',
    primaryMuscles: ['biceps'],
    axialLoadScore: 1, kneeStressScore: 1, defaultSubstituteIds: ['barbell_curl'], isCustom: false,
  },
  {
    id: 'alternating_db_curl', nameHu: 'Váltott karos kézisúlyzós bicepsz', nameEn: 'Alternating Dumbbell Curl',
    category: 'isolation', equipment: 'dumbbell', movementPattern: 'arm_isolation',
    primaryMuscles: ['biceps'],
    axialLoadScore: 1, kneeStressScore: 1, defaultSubstituteIds: ['incline_dumbbell_curl'], isCustom: false,
  },
  {
    id: 'incline_dumbbell_curl', nameHu: 'Ferde padon kézisúlyos bicepsz', nameEn: 'Incline Dumbbell Curl',
    category: 'isolation', equipment: 'dumbbell', movementPattern: 'arm_isolation',
    primaryMuscles: ['biceps'],
    axialLoadScore: 1, kneeStressScore: 1, defaultSubstituteIds: [], isCustom: false,
  },
  {
    id: 'preacher_curl_ez', nameHu: 'EZ-rúd scott bicepsz', nameEn: 'EZ-Bar Preacher Curl',
    category: 'isolation', equipment: 'barbell', movementPattern: 'arm_isolation',
    primaryMuscles: ['biceps'],
    axialLoadScore: 1, kneeStressScore: 1, defaultSubstituteIds: ['incline_dumbbell_curl'], isCustom: false,
  },
  {
    id: 'preacher_curl_db', nameHu: 'Kézisúlyzós scott bicepsz', nameEn: 'Dumbbell Preacher Curl',
    category: 'isolation', equipment: 'dumbbell', movementPattern: 'arm_isolation',
    primaryMuscles: ['biceps'],
    axialLoadScore: 1, kneeStressScore: 1, defaultSubstituteIds: ['preacher_curl_ez'], isCustom: false,
  },
  {
    id: 'preacher_curl_machine', nameHu: 'Gépi scott bicepsz', nameEn: 'Machine Preacher Curl',
    category: 'machine', equipment: 'machine', movementPattern: 'arm_isolation',
    primaryMuscles: ['biceps'],
    axialLoadScore: 1, kneeStressScore: 1, defaultSubstituteIds: ['preacher_curl_ez'], isCustom: false,
  },
  {
    id: 'hammer_curl_db', nameHu: 'Kalapács bicepsz', nameEn: 'Dumbbell Hammer Curl',
    category: 'isolation', equipment: 'dumbbell', movementPattern: 'arm_isolation',
    primaryMuscles: ['biceps', 'forearms'],
    axialLoadScore: 1, kneeStressScore: 1, defaultSubstituteIds: [], isCustom: false,
  },
  {
    id: 'hammer_curl_rope', nameHu: 'Köteles kalapács', nameEn: 'Rope Hammer Curl',
    category: 'isolation', equipment: 'cable', movementPattern: 'arm_isolation',
    primaryMuscles: ['biceps', 'forearms'],
    axialLoadScore: 1, kneeStressScore: 1, defaultSubstituteIds: ['hammer_curl_db'], isCustom: false,
  },
  {
    id: 'spider_curl', nameHu: 'Pók bicepsz', nameEn: 'Spider Curl',
    category: 'isolation', equipment: 'dumbbell', movementPattern: 'arm_isolation',
    primaryMuscles: ['biceps'],
    axialLoadScore: 1, kneeStressScore: 1, defaultSubstituteIds: ['incline_dumbbell_curl'], isCustom: false,
  },
  {
    id: 'concentration_curl', nameHu: 'Koncentrációs bicepsz', nameEn: 'Concentration Curl',
    category: 'isolation', equipment: 'dumbbell', movementPattern: 'arm_isolation',
    primaryMuscles: ['biceps'],
    axialLoadScore: 1, kneeStressScore: 1, defaultSubstituteIds: ['incline_dumbbell_curl'], isCustom: false,
  },
  {
    id: 'bayesian_cable_curl', nameHu: 'Bayesian kábeles bicepsz', nameEn: 'Bayesian Cable Curl',
    category: 'isolation', equipment: 'cable', movementPattern: 'arm_isolation',
    primaryMuscles: ['biceps'],
    axialLoadScore: 1, kneeStressScore: 1, defaultSubstituteIds: ['incline_dumbbell_curl'], isCustom: false,
  },
  {
    id: 'reverse_curl', nameHu: 'Fordított bicepsz', nameEn: 'Reverse Curl',
    category: 'isolation', equipment: 'barbell', movementPattern: 'arm_isolation',
    primaryMuscles: ['forearms', 'biceps'],
    axialLoadScore: 1, kneeStressScore: 1, defaultSubstituteIds: [], isCustom: false,
  },
  {
    id: 'wrist_curl', nameHu: 'Csuklóhajlítás', nameEn: 'Wrist Curl',
    category: 'isolation', equipment: 'dumbbell', movementPattern: 'arm_isolation',
    primaryMuscles: ['forearms'],
    axialLoadScore: 1, kneeStressScore: 1, defaultSubstituteIds: [], isCustom: false,
  },
  {
    id: 'reverse_wrist_curl', nameHu: 'Fordított csuklóhajlítás', nameEn: 'Reverse Wrist Curl',
    category: 'isolation', equipment: 'dumbbell', movementPattern: 'arm_isolation',
    primaryMuscles: ['forearms'],
    axialLoadScore: 1, kneeStressScore: 1, defaultSubstituteIds: ['wrist_curl'], isCustom: false,
  },
  {
    id: 'triceps_pushdown', nameHu: 'Kábeles tricepsz letolás', nameEn: 'Triceps Rope Pushdown',
    category: 'isolation', equipment: 'cable', movementPattern: 'arm_isolation',
    primaryMuscles: ['triceps'],
    axialLoadScore: 1, kneeStressScore: 1, defaultSubstituteIds: [], isCustom: false,
  },
  {
    id: 'straight_bar_pushdown', nameHu: 'Egyenes rúd tricepsz letolás', nameEn: 'Straight-Bar Pushdown',
    category: 'isolation', equipment: 'cable', movementPattern: 'arm_isolation',
    primaryMuscles: ['triceps'],
    axialLoadScore: 1, kneeStressScore: 1, defaultSubstituteIds: ['triceps_pushdown'], isCustom: false,
  },
  {
    id: 'overhead_triceps_extension', nameHu: 'Fej fölötti tricepsznyújtás', nameEn: 'Overhead Cable Triceps Extension',
    category: 'isolation', equipment: 'cable', movementPattern: 'arm_isolation',
    primaryMuscles: ['triceps'],
    axialLoadScore: 1, kneeStressScore: 1, defaultSubstituteIds: [], isCustom: false,
  },
  {
    id: 'skullcrusher_ez', nameHu: 'EZ-rúd francia nyomás', nameEn: 'EZ-Bar Skullcrusher',
    category: 'isolation', equipment: 'barbell', movementPattern: 'arm_isolation',
    primaryMuscles: ['triceps'],
    axialLoadScore: 1, kneeStressScore: 1, defaultSubstituteIds: ['overhead_triceps_extension'], isCustom: false,
  },
  {
    id: 'skullcrusher_db', nameHu: 'Kézisúlyzós francia nyomás', nameEn: 'Dumbbell Skullcrusher',
    category: 'isolation', equipment: 'dumbbell', movementPattern: 'arm_isolation',
    primaryMuscles: ['triceps'],
    axialLoadScore: 1, kneeStressScore: 1, defaultSubstituteIds: ['overhead_triceps_extension'], isCustom: false,
  },
  {
    id: 'jm_press', nameHu: 'JM nyomás', nameEn: 'JM Press',
    category: 'compound_upper', equipment: 'barbell', movementPattern: 'horizontal_push',
    primaryMuscles: ['triceps', 'chest'],
    axialLoadScore: 2, kneeStressScore: 1, defaultSubstituteIds: ['close_grip_bench_press'], isCustom: false,
  },
  {
    id: 'dumbbell_overhead_extension', nameHu: 'Kézisúlyzós fej fölötti nyújtás', nameEn: 'Dumbbell Overhead Extension',
    category: 'isolation', equipment: 'dumbbell', movementPattern: 'arm_isolation',
    primaryMuscles: ['triceps'],
    axialLoadScore: 1, kneeStressScore: 1, defaultSubstituteIds: ['overhead_triceps_extension'], isCustom: false,
  },
  {
    id: 'dip_machine', nameHu: 'Tolódzkodó gép', nameEn: 'Dip Machine',
    category: 'machine', equipment: 'machine', movementPattern: 'horizontal_push',
    primaryMuscles: ['triceps', 'chest'],
    axialLoadScore: 1, kneeStressScore: 1, defaultSubstituteIds: [], isCustom: false,
  },
  {
    id: 'diamond_pushup', nameHu: 'Gyémánt fekvőtámasz', nameEn: 'Diamond Push-up',
    category: 'isolation', equipment: 'bodyweight', movementPattern: 'horizontal_push',
    primaryMuscles: ['triceps', 'chest'],
    axialLoadScore: 1, kneeStressScore: 1, defaultSubstituteIds: ['dip_machine'], isCustom: false,
  },
  {
    id: 'cable_kickback', nameHu: 'Kábeles tricepsz rúgás', nameEn: 'Single-Arm Cable Kickback',
    category: 'isolation', equipment: 'cable', movementPattern: 'arm_isolation',
    primaryMuscles: ['triceps'],
    axialLoadScore: 1, kneeStressScore: 1, defaultSubstituteIds: ['triceps_pushdown'], isCustom: false,
  },

  // ========================================================================
  // Calves, core & running/cardio (20)
  // ========================================================================
  {
    id: 'standing_calf_raise', nameHu: 'Álló vádligép', nameEn: 'Standing Calf Raise',
    category: 'isolation', equipment: 'machine', movementPattern: 'calf',
    primaryMuscles: ['calves'],
    axialLoadScore: 1, kneeStressScore: 1, defaultSubstituteIds: [], isCustom: false,
  },
  {
    id: 'seated_calf_raise', nameHu: 'Ülő vádligép', nameEn: 'Seated Calf Raise',
    category: 'isolation', equipment: 'machine', movementPattern: 'calf',
    primaryMuscles: ['calves'],
    axialLoadScore: 1, kneeStressScore: 1, defaultSubstituteIds: [], isCustom: false,
  },
  {
    id: 'donkey_calf_raise', nameHu: 'Csacsi vádli', nameEn: 'Donkey Calf Raise',
    category: 'isolation', equipment: 'machine', movementPattern: 'calf',
    primaryMuscles: ['calves'],
    axialLoadScore: 1, kneeStressScore: 1, defaultSubstituteIds: ['standing_calf_raise'], isCustom: false,
  },
  {
    id: 'leg_press_calf_press', nameHu: 'Lábnyomó vádli', nameEn: 'Leg Press Calf Press',
    category: 'machine', equipment: 'machine', movementPattern: 'calf',
    primaryMuscles: ['calves'],
    axialLoadScore: 1, kneeStressScore: 1, defaultSubstituteIds: ['seated_calf_raise'], isCustom: false,
  },
  {
    id: 'tibialis_raise', nameHu: 'Elülső sípcsonti emelés', nameEn: 'Tibialis Raise',
    category: 'isolation', equipment: 'bodyweight', movementPattern: 'calf',
    primaryMuscles: ['tibialis'],
    axialLoadScore: 1, kneeStressScore: 1, defaultSubstituteIds: [], isCustom: false,
  },
  {
    id: 'hanging_leg_raise', nameHu: 'Lógó lábemelés', nameEn: 'Hanging Leg Raise',
    category: 'isolation', equipment: 'bodyweight', movementPattern: 'core',
    primaryMuscles: ['core'],
    axialLoadScore: 1, kneeStressScore: 1, defaultSubstituteIds: [], isCustom: false,
  },
  {
    id: 'cable_crunch', nameHu: 'Kábeles hasprés', nameEn: 'Cable Crunch',
    category: 'isolation', equipment: 'cable', movementPattern: 'core',
    primaryMuscles: ['core'],
    axialLoadScore: 1, kneeStressScore: 1, defaultSubstituteIds: [], isCustom: false,
  },
  {
    id: 'ab_wheel_rollout', nameHu: 'Hasgörgő', nameEn: 'Ab Wheel Rollout',
    category: 'isolation', equipment: 'bodyweight', movementPattern: 'core',
    primaryMuscles: ['core'],
    axialLoadScore: 1, kneeStressScore: 1, defaultSubstituteIds: [], isCustom: false,
  },
  {
    id: 'plank', nameHu: 'Deszka', nameEn: 'Plank',
    category: 'isolation', equipment: 'bodyweight', movementPattern: 'core',
    primaryMuscles: ['core'],
    axialLoadScore: 1, kneeStressScore: 1, defaultSubstituteIds: [], isCustom: false,
  },
  {
    id: 'russian_twist', nameHu: 'Orosz csavarás', nameEn: 'Russian Twist',
    category: 'isolation', equipment: 'bodyweight', movementPattern: 'core',
    primaryMuscles: ['core'],
    axialLoadScore: 1, kneeStressScore: 1, defaultSubstituteIds: ['plank'], isCustom: false,
  },
  {
    id: 'pallof_press', nameHu: 'Pallof nyomás', nameEn: 'Pallof Press',
    category: 'isolation', equipment: 'cable', movementPattern: 'core',
    primaryMuscles: ['core'],
    axialLoadScore: 1, kneeStressScore: 1, defaultSubstituteIds: [], isCustom: false,
  },
  {
    id: 'run_easy_5k', nameHu: 'Könnyű alapozó futás', nameEn: 'Easy 5K Run',
    category: 'cardio_run', equipment: 'cardio', movementPattern: 'cardio',
    primaryMuscles: ['cardiovascular', 'legs'],
    axialLoadScore: 1, kneeStressScore: 3, defaultSubstituteIds: [], isCustom: false,
  },
  {
    id: 'run_tempo_5k', nameHu: 'Tempó futás', nameEn: 'Tempo 5K Run',
    category: 'cardio_run', equipment: 'cardio', movementPattern: 'cardio',
    primaryMuscles: ['cardiovascular', 'legs'],
    axialLoadScore: 1, kneeStressScore: 3, defaultSubstituteIds: [], isCustom: false,
  },
  {
    id: 'run_long_7k', nameHu: 'Hosszabb futás', nameEn: 'Long 7K Run',
    category: 'cardio_run', equipment: 'cardio', movementPattern: 'cardio',
    primaryMuscles: ['cardiovascular', 'legs'],
    axialLoadScore: 1, kneeStressScore: 3, defaultSubstituteIds: [], isCustom: false,
  },
  {
    id: 'run_5k', nameHu: '5 km futás', nameEn: '5K Run',
    category: 'cardio_run', equipment: 'cardio', movementPattern: 'cardio',
    primaryMuscles: ['cardiovascular', 'legs'],
    axialLoadScore: 1, kneeStressScore: 3, defaultSubstituteIds: [], isCustom: false,
  },
  {
    id: 'run_7k', nameHu: '7 km futás', nameEn: '7K Run',
    category: 'cardio_run', equipment: 'cardio', movementPattern: 'cardio',
    primaryMuscles: ['cardiovascular', 'legs'],
    axialLoadScore: 1, kneeStressScore: 3, defaultSubstituteIds: [], isCustom: false,
  },
  {
    id: 'run_intervals', nameHu: 'Intervallum futás', nameEn: 'Interval / Track Session',
    category: 'cardio_run', equipment: 'cardio', movementPattern: 'cardio',
    primaryMuscles: ['cardiovascular', 'legs'],
    axialLoadScore: 1, kneeStressScore: 3, defaultSubstituteIds: [], isCustom: false,
  },
  {
    id: 'run_zone2', nameHu: 'Zóna 2 kardió', nameEn: 'Zone 2 Cardio',
    category: 'cardio_run', equipment: 'cardio', movementPattern: 'cardio',
    primaryMuscles: ['cardiovascular'],
    axialLoadScore: 1, kneeStressScore: 3, defaultSubstituteIds: [], isCustom: false,
  },
  {
    id: 'incline_walk', nameHu: 'Emelkedős gyaloglás', nameEn: 'Incline Walk',
    category: 'cardio_run', equipment: 'cardio', movementPattern: 'cardio',
    primaryMuscles: ['cardiovascular', 'legs'],
    axialLoadScore: 1, kneeStressScore: 2, defaultSubstituteIds: [], isCustom: false,
  },
  {
    id: 'rowing_erg', nameHu: 'Evezőgép', nameEn: 'Rowing Ergometer',
    category: 'cardio_run', equipment: 'cardio', movementPattern: 'cardio',
    primaryMuscles: ['cardiovascular', 'back'],
    axialLoadScore: 1, kneeStressScore: 2, defaultSubstituteIds: [], isCustom: false,
  },
];
