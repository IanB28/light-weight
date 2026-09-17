import {
  pgTable,
  text,
  varchar,
  timestamp,
  integer,
  boolean,
  numeric,
  doublePrecision,
  jsonb,
  uuid,
  check,
  date,
  uniqueIndex,
  index
} from 'drizzle-orm/pg-core';
import { sql } from 'drizzle-orm';
import type { ExerciseLoadMechanism, ExerciseLoadMode, Routine, WorkoutSetType } from '@light-weight/domain';

// 1. Usuarios
export const users = pgTable('users', {
  id: uuid('id').defaultRandom().primaryKey(),
  email: varchar('email', { length: 255 }).notNull().unique(),
  username: varchar('username', { length: 30 }).unique(),
  passwordHash: text('password_hash'),
  displayName: varchar('display_name', { length: 100 }).default('Atleta').notNull(),
  birthDate: date('birth_date'),
  gender: varchar('gender', { length: 16 }),
  avatarUrl: text('avatar_url'),
  // Legacy compatibility during the additive identity migration.
  name: varchar('name', { length: 100 }),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
}, (table) => [
  uniqueIndex('users_email_normalized_uidx').on(sql`lower(${table.email})`),
  uniqueIndex('users_username_normalized_uidx').on(sql`lower(${table.username})`).where(sql`${table.username} IS NOT NULL`),
  check('users_gender_check', sql`${table.gender} IS NULL OR ${table.gender} IN ('male', 'female')`)
]);

export const authSessions = pgTable('auth_sessions', {
  id: uuid('id').defaultRandom().primaryKey(),
  userId: uuid('user_id').references(() => users.id, { onDelete: 'cascade' }).notNull(),
  tokenHash: varchar('token_hash', { length: 64 }).notNull().unique(),
  csrfTokenHash: varchar('csrf_token_hash', { length: 64 }).notNull(),
  expiresAt: timestamp('expires_at', { withTimezone: true }).notNull(),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  lastSeenAt: timestamp('last_seen_at', { withTimezone: true }).defaultNow().notNull(),
}, (table) => [index('auth_sessions_user_id_idx').on(table.userId), index('auth_sessions_expires_at_idx').on(table.expiresAt)]);

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
  bodyweightFactor: doublePrecision('bodyweight_factor'),
  isCustom: boolean('is_custom').default(false).notNull(),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
}, () => [
  check('exercises_load_mechanism_check', sql`load_mechanism IS NULL OR load_mechanism IN ('barbell', 'dumbbell', 'plate_loaded', 'selectorized', 'cable', 'bodyweight', 'other')`),
  check('exercises_load_mode_check', sql`load_mode IS NULL OR load_mode IN ('total', 'per_side', 'per_hand', 'added_weight', 'assisted')`),
  check('exercises_bodyweight_factor_check', sql`bodyweight_factor IS NULL OR (load_mechanism = 'bodyweight' AND bodyweight_factor > 0 AND bodyweight_factor <= 1)`),
  check('exercises_assisted_mode_check', sql`load_mode IS NULL OR load_mode <> 'assisted' OR (load_mechanism = 'bodyweight' AND bodyweight_factor IS NOT NULL)`)
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
  origin: jsonb('origin').$type<Routine['origin']>(),
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

export const friendships = pgTable('friendships', {
  id: uuid('id').defaultRandom().primaryKey(),
  // userAId/userBId are stored in lexical order to make an unordered pair unique.
  userAId: uuid('user_a_id').references(() => users.id, { onDelete: 'cascade' }).notNull(),
  userBId: uuid('user_b_id').references(() => users.id, { onDelete: 'cascade' }).notNull(),
  requesterId: uuid('requester_id').references(() => users.id, { onDelete: 'cascade' }).notNull(),
  status: varchar('status', { length: 16 }).default('pending').notNull(),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
}, (table) => [
  uniqueIndex('friendships_user_pair_uidx').on(table.userAId, table.userBId),
  index('friendships_user_a_idx').on(table.userAId),
  index('friendships_user_b_idx').on(table.userBId),
  check('friendships_distinct_users_check', sql`${table.userAId} <> ${table.userBId}`),
  check('friendships_requester_check', sql`${table.requesterId} IN (${table.userAId}, ${table.userBId})`),
  check('friendships_status_check', sql`${table.status} IN ('pending', 'accepted')`),
]);

export const routineShares = pgTable('routine_shares', {
  id: uuid('id').defaultRandom().primaryKey(),
  sourceRoutineId: uuid('source_routine_id').references(() => routines.id, { onDelete: 'set null' }),
  senderId: uuid('sender_id').references(() => users.id, { onDelete: 'cascade' }).notNull(),
  recipientId: uuid('recipient_id').references(() => users.id, { onDelete: 'cascade' }).notNull(),
  routineName: varchar('routine_name', { length: 255 }).notNull(),
  routineDescription: text('routine_description'),
  exerciseIds: jsonb('exercise_ids').$type<string[]>().default([]).notNull(),
  status: varchar('status', { length: 16 }).default('pending').notNull(),
  importedRoutineId: uuid('imported_routine_id').references(() => routines.id, { onDelete: 'set null' }),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  importedAt: timestamp('imported_at', { withTimezone: true }),
}, (table) => [
  index('routine_shares_recipient_idx').on(table.recipientId),
  index('routine_shares_sender_idx').on(table.senderId),
  check('routine_shares_distinct_users_check', sql`${table.senderId} <> ${table.recipientId}`),
  check('routine_shares_status_check', sql`${table.status} IN ('pending', 'imported', 'dismissed')`),
]);

export const authIdentities = pgTable('auth_identities', {
  id: uuid('id').defaultRandom().primaryKey(),
  userId: uuid('user_id').references(() => users.id, { onDelete: 'cascade' }).notNull(),
  provider: varchar('provider', { length: 32 }).notNull(),
  providerSubject: text('provider_subject').notNull(),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
}, (table) => [
  uniqueIndex('auth_identities_provider_subject_uidx').on(table.provider, table.providerSubject),
  index('auth_identities_user_id_idx').on(table.userId),
  check('auth_identities_provider_check', sql`${table.provider} IN ('google')`)
]);
