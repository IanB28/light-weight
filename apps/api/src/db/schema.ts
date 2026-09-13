import {
  pgTable,
  text,
  varchar,
  timestamp,
  integer,
  boolean,
  numeric,
  jsonb,
  uuid,
  check
} from 'drizzle-orm/pg-core';
import { sql } from 'drizzle-orm';
import type { ExerciseLoadMechanism, ExerciseLoadMode, WorkoutSetType } from '@light-weight/domain';

// 1. Usuarios
export const users = pgTable('users', {
  id: uuid('id').defaultRandom().primaryKey(),
  email: varchar('email', { length: 255 }).notNull().unique(),
  name: varchar('name', { length: 100 }),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
});

// 2. Perfil biométrico del usuario (para fuerza relativa y fatiga)
export const userProfiles = pgTable('user_profiles', {
  userId: uuid('user_id')
    .references(() => users.id, { onDelete: 'cascade' })
    .primaryKey(),
  gender: varchar('gender', { length: 10 }).default('male').notNull(), // 'male' | 'female'
  currentBodyweightKg: numeric('current_bodyweight_kg', { precision: 5, scale: 2 })
    .default('75.00')
    .notNull(),
  unitSystem: varchar('unit_system', { length: 10 }).default('metric').notNull(), // 'metric' | 'imperial'
  updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
});

// 3. Histórico de pesajes del usuario
export const bodyweightLogs = pgTable('bodyweight_logs', {
  id: uuid('id').defaultRandom().primaryKey(),
  userId: uuid('user_id')
    .references(() => users.id, { onDelete: 'cascade' })
    .notNull(),
  weightKg: numeric('weight_kg', { precision: 5, scale: 2 }).notNull(),
  loggedAt: timestamp('logged_at', { withTimezone: true }).defaultNow().notNull(),
});

// 4. Catálogo de ejercicios (estándar del sistema o personalizados por usuario)
export const exercises = pgTable('exercises', {
  id: varchar('id', { length: 100 }).primaryKey(),
  userId: uuid('user_id').references(() => users.id, { onDelete: 'cascade' }), // null = ejercicio del sistema
  name: varchar('name', { length: 255 }).notNull(),
  primaryMuscle: varchar('primary_muscle', { length: 50 }).notNull(),
  secondaryMuscles: jsonb('secondary_muscles').$type<string[]>().default([]).notNull(),
  category: varchar('category', { length: 50 }).notNull(),
  loadMechanism: varchar('load_mechanism', { length: 32 }).$type<ExerciseLoadMechanism>(),
  loadMode: varchar('load_mode', { length: 32 }).$type<ExerciseLoadMode>(),
  supportsKeyboard: boolean('supports_keyboard'),
  supportsPlates: boolean('supports_plates'),
  supportsExternalLoad: boolean('supports_external_load'),
  includeBarWeight: boolean('include_bar_weight'),
  isCustom: boolean('is_custom').default(false).notNull(),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
}, () => [
  check('exercises_load_mechanism_check', sql`load_mechanism IS NULL OR load_mechanism IN ('barbell', 'dumbbell', 'plate_loaded', 'selectorized', 'cable', 'bodyweight', 'other')`),
  check('exercises_load_mode_check', sql`load_mode IS NULL OR load_mode IN ('total', 'per_side', 'per_hand', 'added_weight')`)
]);

// 5. Rutinas guardadas
export const routines = pgTable('routines', {
  id: uuid('id').defaultRandom().primaryKey(),
  userId: uuid('user_id')
    .references(() => users.id, { onDelete: 'cascade' })
    .notNull(),
  name: varchar('name', { length: 255 }).notNull(),
  description: text('description'),
  exerciseIds: jsonb('exercise_ids').$type<string[]>().default([]).notNull(),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
});

// 6. Sesiones de entrenamiento registradas (Soporta IDs generados en cliente para Offline-First)
export const workoutSessions = pgTable('workout_sessions', {
  id: uuid('id').primaryKey(),
  userId: uuid('user_id')
    .references(() => users.id, { onDelete: 'cascade' })
    .notNull(),
  routineId: uuid('routine_id').references(() => routines.id, { onDelete: 'set null' }),
  routineName: varchar('routine_name', { length: 255 }),
  startedAt: timestamp('started_at', { withTimezone: true }).notNull(),
  endedAt: timestamp('ended_at', { withTimezone: true }),
  notes: text('notes'),
  totalVolumeKg: numeric('total_volume_kg', { precision: 10, scale: 2 }).default('0.00'),
  syncedAt: timestamp('synced_at', { withTimezone: true }).defaultNow().notNull(),
});

// 7. Series ejecutadas (Logged Sets)
export const loggedSets = pgTable('logged_sets', {
  id: uuid('id').defaultRandom().primaryKey(),
  sessionId: uuid('session_id')
    .references(() => workoutSessions.id, { onDelete: 'cascade' })
    .notNull(),
  exerciseId: varchar('exercise_id', { length: 100 })
    .references(() => exercises.id, { onDelete: 'cascade' })
    .notNull(),
  setIndex: integer('set_index').notNull(),
  weightKg: numeric('weight_kg', { precision: 6, scale: 2 }).notNull(),
  reps: integer('reps').notNull(),
  rir: integer('rir'),
  rpe: numeric('rpe', { precision: 3, scale: 1 }),
  setType: varchar('set_type', { length: 16 }).$type<WorkoutSetType>().default('working').notNull(),
  isWarmup: boolean('is_warmup').default(false).notNull(),
  completed: boolean('completed').default(true).notNull(),
  estimatedOneRm: numeric('estimated_one_rm', { precision: 6, scale: 2 }),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
}, () => [
  check('logged_sets_set_type_check', sql`set_type IN ('working', 'warmup', 'drop', 'backoff')`),
  check('logged_sets_warmup_consistency_check', sql`is_warmup = (set_type = 'warmup')`)
]);

// 8. Récords personales (PRs) calculados
export const personalRecords = pgTable('personal_records', {
  id: uuid('id').defaultRandom().primaryKey(),
  userId: uuid('user_id')
    .references(() => users.id, { onDelete: 'cascade' })
    .notNull(),
  exerciseId: varchar('exercise_id', { length: 100 })
    .references(() => exercises.id, { onDelete: 'cascade' })
    .notNull(),
  oneRmKg: numeric('one_rm_kg', { precision: 6, scale: 2 }).notNull(),
  bestWeightKg: numeric('best_weight_kg', { precision: 6, scale: 2 }).notNull(),
  bestReps: integer('best_reps').notNull(),
  achievedAt: timestamp('achieved_at', { withTimezone: true }).notNull(),
  sessionId: uuid('session_id').references(() => workoutSessions.id, { onDelete: 'cascade' }),
});
