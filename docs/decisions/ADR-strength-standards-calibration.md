# Architecture Decision Record (ADR): Strength Standards Calibration

**Status:** Open Technical Debt / Pending Future Specification  
**Scope:** Domain layer (`@light-weight/domain`), Analytics (`apps/web`)  
**Version:** 1.0.0  
**Context:** Block 14C — Semantic Integrity & Maps Audit  

---

## 1. Context & Problem Statement

The repository defines `STRENGTH_STANDARDS` as broad, coarse-grained ratio tables indexed by:

$$\text{Gender} \times \text{MuscleGroup} \rightarrow [\text{Novato}, \dots, \text{Dios}]$$

In Block 14C, the Strength engine was hardened so that exercises attribute Strength observations strictly according to their canonical prime contribution (`resolveExerciseStrengthTarget`), preventing secondary, co-prime, or conflicting legacy categories from polluting unrelated muscle groups.

However, the scientific validity and comparability of specific exercises against these standards remains unresolved.

---

## 2. Open Technical Debt & Architectural Boundaries

### 2.1 Broad MuscleGroup Anchors
- The current `STRENGTH_STANDARDS` represent broad `MuscleGroup` anchors (`chest`, `back`, `shoulders`, `quadriceps`, `hamstrings`, `glutes`, `biceps`, `triceps`, etc.).
- They evaluate overall relative motor strength as a ratio of 1RM to bodyweight ($\text{ratio} = \frac{\text{e1RM}}{\text{BW}}$).

### 2.2 Unproven Repository Provenance
- Repository provenance does not establish which specific benchmark exercise originally generated each numerical ratio anchor in `STRENGTH_STANDARDS`.
- Although conventional fitness conventions often assume anchors correspond to classic compound lifts (e.g. bench press for chest, squat for quadriceps), there is no authoritative specification or documentation in the repository verifying this historical provenance.

### 2.3 Unresolved Exercise-Family Comparability
- Exercise-family comparability within the same muscle group is **unresolved**.
- For example:
  - Does an incline bench press, decline bench press, or dumbbell bench press equate to the same strength ratio standard as a flat barbell bench press?
  - Does a 45° leg press equate to the back squat standard, despite sled angle mechanical advantage ($F \times \cos(45^\circ) \approx 0.707$ load requirements)?
  - Does a high flared row or dumbbell lateral raise equate to the overhead press standard?
  - Does a Romanian deadlift or leg curl evaluate against a hamstrings standard, when the primary deadlift anchor may have been calibrated for glutes/posterior chain?
- In the current architecture, exercises whose canonical prime maps to a `MuscleGroup` attribute their 1RM observation to that group. However, **comparability across variations has not been scientifically validated**.

### 2.4 Zero Approved Conversion Coefficients
- No exercise-specific conversion factors, mechanical advantage adjustments, or normalization multipliers are approved or defined in the codebase.
- We deliberately refuse to invent arbitrary conversion coefficients (e.g. claiming incline bench is $0.85 \times$ flat bench, or leg press is $0.5 \times$ squat) without empirical evidence or an explicit user-approved specification.

### 2.5 Scope of Block 14C
- **Block 14C does NOT solve the calibration or cross-exercise conversion problem.**
- Block 14C strictly enforces **Target Attribution Integrity**:
  1. Sealed public prime API: `resolveExerciseStrengthTarget` accepts `Exercise` only.
  2. Pure canonical prime attribution: only `role === 'prime'` contributes to Strength.
  3. Co-prime and secondary contributions are barred from Strength attribution.
  4. Unsupported anatomical targets (e.g. adductors, tibialis anterior, serratus, rotator cuff) return `null` and remain unrated.
  5. Legacy uncurated exercises fall back conservatively to their supported `primaryMuscle` for backward compatibility, as attribution only.

Future calibration work must formally establish the benchmark movement for each standard or define validated multi-exercise conversion models before cross-movement parity can be claimed.
