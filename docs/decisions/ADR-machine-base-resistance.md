# Architecture Decision Record (ADR): Machine Base Resistance & User Calibration

**Status:** Accepted / Implemented (Block 15)  
**Scope:** Domain layer (`@light-weight/domain`), API (`apps/api`), Web Client (`apps/web`), Database (`drizzle`)  
**Version:** 1.0.0  
**Context:** Block 15 — Machine Base Resistance & User Calibration  

---

## 1. Context & Problem Statement

Plate-loaded machines (e.g. Smith machines, 45° leg presses, hack squats, seated calf raises) possess an inherent starting/base resistance before any weight plates are added. This starting tare arises from the physical carriage, rail angle, counterweights, and guide mechanisms.

Prior to Block 15, the repository suffered from two major architectural deficiencies:
1. **The Smith Machine Assumption:** Smith exercises assumed a hardcoded starting tare of 20 lb / 22 lb (~9.07 kg) and automatically injected it into calculations. In reality, commercial Smith machines vary widely: from counterbalanced counterweight models (~0–2 kg) to 7-degree angled commercial systems (15–20 lb / ~7–9 kg) and heavy non-counterbalanced residential carriages (25–35 lb / ~11–16 kg).
2. **The Inherent Machine Resistance Blind Spot:** Carriage machines (such as 45° leg presses and hack squats) either treated starting resistance as zero or had no structured way to account for carriage tare weight, forcing users to either ignore carriage load or manually calculate plate sums.

Furthermore, different physical instances of the same canonical exercise exist across gyms (e.g. Gym A has a Cybex 45° Leg Press with a 48 kg carriage; Gym B has a Matrix Leg Press with a 38 kg carriage).

---

## 2. Decision & Core Principles

### 2.1 Separation of Concerns
The system explicitly distinguishes five independent concepts:

$$\text{Movement Semantics} \neq \text{Physical Machine Instance} \neq \text{Starting Base Resistance} \neq \text{Added Plates} \neq \text{Logged Total Load}$$

1. **Movement Semantics (`Exercise`):** The biomechanical movement definition (e.g. `smith-bench-press`, `leg-press-45`).
2. **Physical Machine Instance (`MachineProfile`):** The specific physical hardware installed in a gym (e.g. "Smith Cybex Central", "Prensa 45° Matrix").
3. **Starting Base Resistance ($W_{\text{base}}$):** The tare load of the machine before plates are added, qualified by an epistemic status (`BaseResistanceStatus`).
4. **Added Plates ($W_{\text{plates}}$):** The external plates added by the athlete onto the weight horns.
5. **Logged Total Load ($W_{\text{total}}$):** The stored external load:
   $$W_{\text{total}} = W_{\text{base}} + W_{\text{plates}}$$
   where $W_{\text{base}}$ is added once (not per side).

### 2.2 Epistemic Status Semantics (`BaseResistanceStatus`)
Uncertainty and provenance are preserved via an explicit 5-state enum:
- `none`: The machine has explicitly zero or fully counterbalanced starting resistance ($W_{\text{base}} = 0$).
- `unknown`: The starting resistance has not been calibrated or confirmed. **Critical: `unknown` never collapses into `0 kg` or `none`**. $W_{\text{base}}$ is `null`/`undefined`.
- `suggested`: Catalog-level guidance derived from manufacturer documentation or industry standards (e.g. standard Smith 20 lb rail). Requires user calibration to confirm.
- `verified`: Manufacturer-certified or load-cell verified value for a specific machine. **Zero built-in catalog items are marked `verified`** without empirical proof.
- `user_defined`: Custom tare calibrated directly by the user for their specific machine instance.

### 2.3 Historical Immutability & Session Snapshots
To guarantee historical integrity and prevent retrospective corruption:
- Completed workout sets are **strictly immutable**. Modifying a machine profile in settings or during an active session **never** retroactively alters already-completed sets in current or past sessions.
- At set completion time, each set snapshots:
  - `machineProfileId`: ID of the machine profile (or `undefined`).
  - `machineProfileLabel`: Human-readable label at completion time.
  - `machineBaseResistanceKg`: Exact numeric base weight in kg (or `undefined` if unknown).
  - `machineBaseResistanceStatus`: Epistemic status at completion time.
- Modifying a machine profile during an active session updates session state for **prospective sets only** (subsequent incomplete sets).

### 2.4 Analytics Continuity
- `LoggedSet.weightKg` always records total external load ($W_{\text{total}}$).
- When starting resistance is `unknown`, `weightKg` records the sum of added plates alone, and the set preserves `machineBaseResistanceStatus: 'unknown'`.
- All downstream analytics (Estimated 1RM, volume calculations, personal records, and strength standards) consume `weightKg` as total external load without breaking backward compatibility or requiring historical data rewrites.

---

## 3. Implementation Details

### 3.1 Domain Package (`@light-weight/domain`)
- **`machineProfile.ts`**: Pure domain model, schema validation (`validateMachineProfile`), and canonical resolver (`resolveMachineBaseResistance`).
- **`types.ts`**:
  - `ExerciseLoadingProfile`: Extended with `hasMachineBase?: boolean` and `suggestions?: readonly { weightKg: number; label?: string }[]`.
  - `LoggedSet`: Extended with snapshot fields `machineProfileId`, `machineProfileLabel`, `machineBaseResistanceKg`, `machineBaseResistanceStatus`.
- **`exerciseAudit.ts`**: Refactored `MachineResistanceClass` from `known_current` to `suggested` to reflect honest epistemic status.
- **`setSemantics.ts`**: Updated `normalizeLoggedSet` to validate and sanitize machine profile snapshot attributes.

### 3.2 Database & API Sync (`apps/api`)
- **Migration `0004_machine_base_resistance_v1.sql`**: Added 4 nullable columns to `logged_sets`:
  - `machine_profile_id text`
  - `machine_profile_label text`
  - `machine_base_resistance_kg numeric(6, 2)`
  - `machine_base_resistance_status text`
- **Database Constraints**:
  - `CHECK (machine_base_resistance_kg IS NULL OR machine_base_resistance_kg >= 0)`
  - `CHECK (machine_base_resistance_status IS NULL OR machine_base_resistance_status IN ('none', 'unknown', 'suggested', 'verified', 'user_defined'))`
  - `CHECK (machine_base_resistance_kg IS NULL OR machine_base_resistance_status IS NOT NULL)`
  - `CHECK (NOT (machine_base_resistance_status = 'unknown' AND machine_base_resistance_kg IS NOT NULL))`
- **Sync Validation (`sync-mappers.ts`)**: Rejects invalid payloads with HTTP 422 if base kg is negative, status is invalid, or `unknown` is accompanied by a numeric weight.
- **Hydration**: Safely preserves nulls for legacy records created prior to Block 15.

### 3.3 Web Client (`apps/web`)
- **Local Store (`machine-profiles.ts`)**: Local-first CRUD store persisted under `STORAGE_KEYS.MACHINE_PROFILES` with last-used tracking under `STORAGE_KEYS.LAST_USED_MACHINE_PROFILES`. Both keys are registered in `PRIVATE_STORAGE_KEYS` to guarantee user-scope isolation across account switches.
- **Session Management (`useWorkoutSession.ts`)**:
  - First use on plate-loaded/Smith machines defaults to `machineBaseResistanceStatus: 'unknown'`, without auto-injecting 20 lb.
  - Automatically restores last-used profile for the exercise if one has been calibrated previously.
  - Implements `updateMachineProfile(exerciseId, profile)` updating session state and incomplete sets while leaving completed sets immutable.
- **UI Components**:
  - `MachineProfileModal.tsx`: Calibration bottom sheet with options for "Sin configurar (Desconocida)", "Sin resistencia (0 kg)", catalog suggestions, and user-defined custom machine profiles.
  - `WeightEntry.tsx` (`PlatePickerSheet`): Displays canonical equation ($\text{Base} + \text{Plates} = \text{Total}$). When unknown, shows warning *"Resistencia inicial sin configurar"* with quick-action button *"Calibrar máquina"*, without blocking workout logging.
  - `WorkoutSessionComponents.tsx` (`ExerciseSessionCard`): Renders a compact starting resistance chip in the exercise header for plate-loaded movements, allowing instantaneous calibration at any time.

---

## 4. Consequences & Verification

### 4.1 Positive Consequences
1. **Epistemic Honesty:** The app never pretends an uncalibrated Smith machine or leg press is 20 lb or 0 kg.
2. **Gym Mobility:** Athletes who train across multiple gyms can maintain distinct machine profiles for the same exercise (e.g. "Smith Cybex" vs "Smith Matrix") and switch between them seamlessly.
3. **Data Integrity:** Historical sets remain immutable; changing a machine profile never corrupts historical PRs or previous session logs.
4. **Full Backward Compatibility:** Legacy sets without machine metadata hydrate cleanly with `null` fields; 1RM and volume analytics remain continuous.

### 4.2 Automated Verification
- Domain tests: 230 passing tests (`pnpm --filter @light-weight/domain test`).
- API tests: 43 passing tests (`pnpm --filter @light-weight/api test`).
- Web tests: 197 passing tests (`pnpm --filter @light-weight/web test`), including 6 comprehensive machine profile scenarios.
- Exercise audit: Clean execution with 0 critical errors, 48 suggested base machine movements, and 15 inherent resistance candidates (`pnpm audit:exercises`).
