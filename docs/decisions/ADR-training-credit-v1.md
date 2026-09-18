# Architecture Decision Record (ADR): Training Credit Foundation v1

**Status:** Accepted  
**Scope:** Domain layer (`@light-weight/domain`)  
**Version:** 1.0.0  
**Authors:** Light Weight Core Architecture  
**Context:** Exercise Semantics v2 — Block 4  

---

## 1. Context & Problem Statement

In Exercise Semantics v2, Blocks 1 through 3 introduced the canonical muscle taxonomy and biomechanical roles (`prime`, `co_prime`, `secondary`, `resisted_isometric`, `stabilizer`, `minimal`).

However, biomechanical moment/force contribution does not map linearly to training stimulus or hypertrophic volume attribution. Prior systems conflated biomechanical involvement with training set credit, or attempted naive heuristic conversions (e.g. `prime -> 1.0`, `secondary -> 0.5`).

Block 4 defines **Training Credit Foundation v1** as an independent, decoupled domain layer that models qualitative, evidence-grounded attribution for exercise-variation-muscle triplets.

---

## 2. Core Architectural Invariants

### 2.1 Strict Decoupling: MuscleRole != TrainingCreditClassification
Biomechanical roles (`MuscleRole`) and training credit (`TrainingCreditClassification`) belong to orthogonal semantic layers:
- `MuscleRole` answers: *What mechanical function does the muscle perform during the movement?*
- `TrainingCreditClassification` answers: *Does the resistance exposure warrant hypertrophy set credit, and at what structural relationship?*

**Permanent Invariant:** No automatic heuristic mapping exists between `MuscleRole` and `TrainingCreditClassification` (e.g., `prime` is never automatically `direct`; `secondary` is never automatically `indirect`; `resisted_isometric` is never automatically `exposure_only`). All entries in the registry are explicitly evaluated and authored.

### 2.2 Target Integrity Invariant
Every training credit target must be a member of the corresponding canonical `ExerciseSemanticsV2` profile contributions:
$$\text{TrainingCreditTargets} \subseteq \text{ExerciseSemanticsContributionTargets}$$
Training Credit is strictly forbidden from inventing biomechanical contributors. If a candidate target is not present in the canonical semantics profile, it must be omitted from Training Credit and reported.

### 2.3 Strict Absence of Quantitative Multipliers
Training Credit Foundation v1 is strictly qualitative and categorical. It introduces:
- **ZERO** fractional set coefficients (`0.5`, `0.25`, `0.75`).
- **ZERO** effective set or equivalent set formulas.
- **ZERO** volume multipliers or stimulus weightings.
- **ZERO** RIR/RPE effort-credit thresholds (effort remains an attribute of the physical training event, not the exercise profile).

Quantitative volume policy belongs to future layers (Block 7) and must consume qualitative classifications rather than hardcoded numbers in the foundation.

---

## 3. Classification Model

Every credit entry assigns one of five mutually exclusive canonical classifications:

1. **`direct`**: The muscle is one of the primary dynamic force/moment generators required to complete the repetition against resistance for the specified variation.
   - *Note:* Does not mean isolation, highest EMG, or commercial gym category. Multiple muscles can be direct for a single compound lift.
2. **`indirect`**: The muscle provides a meaningful dynamic mechanical contribution to completing the exercise, but does not satisfy the primary force generator criteria.
3. **`exposure_only`**: The muscle experiences meaningful mechanical exposure (e.g., loaded isometric bracing or stabilization) worth preserving semantically, but current evidence does not justify direct or indirect hypertrophy-set credit.
4. **`none`**: The exercise-muscle pair was explicitly evaluated and confirmed to have no meaningful training credit contribution.
5. **`unresolved`**: A meaningful contribution is plausible, but scientific evidence is currently insufficient to responsibly choose between `direct`, `indirect`, or `exposure_only`. Valid terminal state for v1.

---

## 4. Confidence & Status Models

### 4.1 Credit Confidence
Applies **only** to resolved classifications (`direct`, `indirect`, `exposure_only`, `none`). Unresolved entries must not carry confidence.
- **`high`**: Exact exercise $\times$ variation $\times$ muscle evidence strongly converges across longitudinal and biomechanical data.
- **`moderate`**: One strong direct source or multiple converging evidence streams support the classification.
- **`low`**: Classification relies primarily on anatomical mechanics, inferential biomechanics, EMG extrapolation, or limited direct trials.

### 4.2 Status
- **`established`**: Evidence is consolidated and stable.
- **`provisional`**: Subject to refinement as higher-quality longitudinal or normalized EMG data becomes available.
- **`unresolved`**: Plausible contribution requiring further evidence; requires an explicit non-empty `reason` string.

---

## 5. Evidence Provenance & Inheritance

### 5.1 Evidence Basis
Each entry explicitly identifies its justification sources from:
- `pelland`: Meta-analytic / systematic hypertrophy volume literature (Pelland et al.).
- `longitudinal`: Direct longitudinal resistance training hypertrophy studies.
- `muscle_force`: Direct force/moment-arm biomechanical modeling.
- `biomechanics`: Functional anatomy, vector analysis, and movement mechanics.
- `emg`: Surface or fine-wire electromyography.
- `inherited`: Authoritatively derived from a parent variation profile.
- `product_inference`: Product-level domain inference where direct literature is sparse.

### 5.2 Inheritance Constraints
- No automatic inheritance engine is implemented in v1. All inherited classifications must be explicitly authored.
- Any entry with `inherited` in its `evidenceBasis` must carry `status: 'provisional'`.
- Entries relying *solely* on `inherited` evidence cannot carry `confidence: 'high'`.

---

## 6. Absence Semantics

The registry strictly distinguishes three distinct absence states:
1. **Profile absent from registry**: The exercise variation has not yet been audited for training credit.
2. **Target absent from profile**: The target is not currently modeled for training credit in this profile (partial registry design).
3. **Explicit `classification = 'none'`**: The target was evaluated and determined to confer no training credit.

---

## 7. Immobility of History & Recomputability

1. Historical workout records (`workouts`, `workout_sets`) remain immutable physical facts of training execution (weight $\times$ reps at RIR/RPE).
2. Training Credit interpretation is pure metadata. If classifications are revised in future versions, user history is non-destructively reinterpretable without data migrations.
3. No changes are introduced to database schema, migrations, API persistence, or production analytics (`features/stats/*`).
