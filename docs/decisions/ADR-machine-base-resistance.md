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
- **`types.ts`**:
  - Exported consolidated `MachineSnapshot` interface representing immutable set-level provenance (`machineProfileId`, `machineProfileLabel`, `machineBaseResistanceKg`, `machineBaseResistanceStatus`).
  - Exported `MachineBaseSelection` interface (`profile?`, `status`, `weightKg`) unifying modal emissions and state updates.
  - `ExerciseLoadingProfile`: Configured with `hasMachineBase?: boolean` and `suggestions?: readonly { weightKg: number; label?: string }[]`. Smith machines provide suggestions without hardcoding a fixed tare into `plateBase`.
- **`machineProfile.ts`**: Pure domain model, schema validation (`validateMachineProfile`), and canonical resolver (`resolveMachineBaseResistance`). Verified provenance requires genuine source evidence: standard URL parsing (`http:`/`https:` with non-empty hostname) or complete structured provenance (`manufacturer` + `model` + `sourceLabel`). Exported `normalizeMachineBaseSelection` to enforce canonical combinations and safely degrade invalid profile-less selections.
- **`setSemantics.ts`**: Updated `normalizeLoggedSet` to enforce the total load invariant ($W_{\text{total}} \ge W_{\text{base}}$). Contradictory historical sets gracefully degrade to `unknown`/absent base resistance rather than modifying the user's logged `weightKg`. Canonicalizes `machineBaseResistanceKg = 0` whenever `status === 'none'`.
- **`exerciseAudit.ts`**: Audit accepts `inferred.machineResistanceClass === 'suggested'`, maintaining zero critical flags and exact flag count consistency.

### 3.2 Database & API Sync (`apps/api`)
- **Migration `0004_machine_base_resistance_v1.sql`**: Added baseline nullable columns to `logged_sets` (`machine_profile_id`, `machine_profile_label`, `machine_base_resistance_kg`, `machine_base_resistance_status`).
- **Migration `0005_machine_base_resistance_integrity.sql`**: Added strict post-commit integrity check constraints with pre-migration data sanitization:
  - Sanitizes existing historical contradictory rows ($W_{\text{total}} < W_{\text{base}}$) to status `unknown` and `NULL` base kg before adding check constraints.
  - Canonicalizes legacy `none` rows to `machine_base_resistance_kg = 0`.
  - `logged_sets_machine_base_total_load_check`: `CHECK (machine_base_resistance_kg IS NULL OR weight_kg >= machine_base_resistance_kg)` guaranteeing total load is never less than base resistance.
  - `logged_sets_machine_base_none_check`: `CHECK (machine_base_resistance_status != 'none' OR machine_base_resistance_kg = 0)` ensuring epistemic certainty of zero tare.
- **Sync Validation (`sync-mappers.ts`)**:
  - Validates total load invariant and rejects invalid sync payloads with HTTP 422 `INVALID_MACHINE_TOTAL_LOAD` if $W_{\text{total}} < W_{\text{base}}$.
  - Validates negative weights, invalid statuses, and forbidden non-null weight with status `unknown`.
- **Hydration Degradation**: Historical or corrupted sync payloads that violate the total load invariant degrade safely to status `unknown` and null base weight without altering `weightKg`.

### 3.3 Web Client (`apps/web`)
- **Selection Contract (`MachineBaseSelection`)**: `MachineProfileModal` emits a unified contract distinguishing quick none (`none`, 0 kg), quick unknown (`unknown`, null), catalog suggestions, and user-defined profiles, normalized via `normalizeMachineBaseSelection`.
- **Last-Used Profile Lifecycle**:
  - Selecting a saved profile persists the ID in `STORAGE_KEYS.LAST_USED_MACHINE_PROFILES`.
  - Selecting "Sin resistencia inicial" or "Sin configurar" explicitly clears last-used (`null`), preventing cross-session pollution.
  - Deleting the active profile clears last-used.
- **Strict Set Snapshot Isolation**: Once a set has any machine snapshot (`machineProfileId` or `machineBaseResistanceStatus`), it evaluates exclusively from its own snapshot and **never** falls back to session-level machine metadata. Modifying the session machine profile never mutates existing `session.sets` nor does it invalidate previously snapshotted sets with unknown base.
- **No Pre-Snapshotting**: Initial sets created by `createDefaultExerciseSession` and sets added via `addSetToSessions` start with all machine snapshot fields `undefined`.
- **Honest Serialization**: `serializeWorkoutSets` serializes set-level snapshot fields directly without falling back to session-level defaults (`set.xxx ?? session.xxx`).
- **Default Weight & Explicit Assertion for Unknown**:
  - Default weight is initialized to `0` when machine base is unknown.
  - Set completion is blocked until the athlete explicitly asserts a weight or calibrates the machine base.
- **Total Load Invariant UI Guards**:
  - `SetRow` and `toggleSetInSessions` block completing a set if `weightKg < machineBaseResistanceKg`.
  - `WeightEntry` (`PlatePickerSheet`) prevents emitting a total load lower than base resistance.

---

## 4. Consequences & Verification

### 4.1 Positive Consequences
1. **Epistemic Honesty:** The app never pretends an uncalibrated Smith machine or leg press is 20 lb or 0 kg.
2. **Total Load Invariant Guaranteed:** Enforced end-to-end (DB constraint with prior data sanitization, API HTTP 422, hydration degradation, and UI completion/picker guards) so that total load can never be less than starting tare.
3. **True Historical Isolation:** Existing sets are never mutated by subsequent session profile changes; snapshotted sets evaluate strictly from their own snapshot.
4. **Gym Mobility:** Athletes who train across multiple gyms can maintain distinct machine profiles for the same exercise and switch between them cleanly.
5. **Full Backward Compatibility:** Legacy sets without machine metadata hydrate cleanly with `null` fields; 1RM and volume analytics remain continuous.

### 4.2 Automated Verification
- Domain tests: 232 passing tests (`pnpm --filter @light-weight/domain test`).
- API tests: 48 passing tests (`pnpm --filter @light-weight/api test`).
- Web tests: 213 passing tests (`pnpm --filter @light-weight/web test`), including 22 comprehensive post-commit integrity hardening scenarios.
- Exercise audit: Clean execution with 0 critical errors, 48 suggested base machine movements, and 15 inherent resistance candidates (`pnpm audit:exercises`).
- Component invariants: `apps/web/src/components/ui/Disclosure.tsx` preserved with 0 diff.
