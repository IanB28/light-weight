CREATE TABLE IF NOT EXISTS "historical_personal_records" (
	"id" uuid PRIMARY KEY NOT NULL,
	"user_id" uuid NOT NULL,
	"exercise_id" varchar(100) NOT NULL,
	"performed_date" date NOT NULL,
	"recorded_at" timestamp with time zone NOT NULL,
	"bodyweight_kg" numeric(5, 2) NOT NULL,
	"weight_kg" numeric(6, 2) NOT NULL,
	"reps" integer NOT NULL,
	"rir" integer,
	"rpe" numeric(3, 1),
	"set_type" varchar(16) DEFAULT 'working' NOT NULL,
	"machine_profile_id" varchar(100),
	"machine_profile_label" varchar(100),
	"machine_base_resistance_kg" numeric(6, 2),
	"machine_base_resistance_status" varchar(20),
	"machine_base_source_label" varchar(255),
	"machine_base_source_url" text,
	"machine_manufacturer" varchar(255),
	"machine_model" varchar(255),
	"source" varchar(32) DEFAULT 'historical_manual' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "historical_personal_records_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE cascade ON UPDATE no action,
	CONSTRAINT "historical_personal_records_exercise_id_exercises_id_fk" FOREIGN KEY ("exercise_id") REFERENCES "exercises"("id") ON DELETE cascade ON UPDATE no action,
	CONSTRAINT "hpr_bodyweight_positive_check" CHECK ("bodyweight_kg" > 0),
	CONSTRAINT "hpr_reps_positive_check" CHECK ("reps" > 0),
	CONSTRAINT "hpr_weight_non_negative_check" CHECK ("weight_kg" >= 0),
	CONSTRAINT "hpr_source_check" CHECK ("source" IN ('historical_manual'))
);

CREATE INDEX IF NOT EXISTS "hpr_user_id_idx" ON "historical_personal_records" ("user_id");
CREATE INDEX IF NOT EXISTS "hpr_exercise_id_idx" ON "historical_personal_records" ("exercise_id");
CREATE INDEX IF NOT EXISTS "hpr_user_exercise_idx" ON "historical_personal_records" ("user_id", "exercise_id");
