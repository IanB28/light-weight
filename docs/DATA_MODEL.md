# Data Model & Schema

## Relational Schema Overview (PostgreSQL)

```
┌─────────────────────────────────┐
│              users              │
├─────────────────────────────────┤
│ id (UUID, PK)                   │
│ email (VARCHAR, UNIQUE)         │
│ password_hash (TEXT)            │
│ role (VARCHAR: operator | user) │
│ created_at (TIMESTAMPTZ)        │
└───────────────┬─────────────────┘
                │ 1
                │
                ├────────────────────────────────────────┐
                │ N                                      │ N
┌───────────────▼─────────────────┐      ┌───────────────▼─────────────────┐
│            routines             │      │        body_measurements        │
├─────────────────────────────────┤      ├─────────────────────────────────┤
│ id (UUID, PK)                   │      │ id (UUID, PK)                   │
│ user_id (UUID, FK -> users.id)  │      │ user_id (UUID, FK -> users.id)  │
│ name (VARCHAR)                  │      │ weight_kg (NUMERIC)             │
│ description (TEXT)              │      │ measured_at (TIMESTAMPTZ)       │
│ schedule_json (JSONB)           │      │ notes (TEXT)                    │
└───────────────┬─────────────────┘      └─────────────────────────────────┘
                │ 1
                │
                │ N
┌───────────────▼─────────────────┐
│        workout_sessions         │
├─────────────────────────────────┤
│ id (UUID, PK)                   │
│ user_id (UUID, FK -> users.id)  │
│ routine_id (UUID, FK, nullable) │
│ started_at (TIMESTAMPTZ)        │
│ ended_at (TIMESTAMPTZ)          │
│ notes (TEXT)                    │
└───────────────┬─────────────────┘
                │ 1
                │
                │ N
┌───────────────▼─────────────────┐
│          logged_sets            │
├─────────────────────────────────┤
│ id (UUID, PK)                   │
│ session_id (UUID, FK)           │
│ exercise_id (VARCHAR)           │
│ set_index (INT)                 │
│ weight_kg (NUMERIC)             │
│ reps (INT)                      │
│ rpe (NUMERIC, nullable)         │
│ is_warmup (BOOLEAN)             │
│ completed (BOOLEAN)             │
└─────────────────────────────────┘
```

## Global vs. Custom Exercises
- `exercises`: Standard library of common compound and isolation exercises (bench press, squat, deadlift, overhead press, barbell row, etc.).
- Users can also create custom exercises attached to their `user_id`.
