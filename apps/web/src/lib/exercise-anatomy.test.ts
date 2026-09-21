import test from 'node:test';
import assert from 'node:assert/strict';
import {
  EXERCISE_ID_TO_SEMANTICS_KEY,
  EXERCISE_SEMANTICS_REGISTRY,
  mapDatasetExerciseToDomain,
  resolveExerciseSemantics,
  type RawDatasetExercise
} from '@light-weight/domain';
import {
  mapContributionTargetToBodyPath,
  aggregateContributionsByBodyPath,
  resolveExerciseBodyMapData,
  ROLE_VISUAL_INTENSITY,
  MUSCLE_ROLE_PRECEDENCE,
  ALL_BODY_MUSCLE_PATHS,
  getMuscleTargetDisplayName,
  getBodyPathDisplayName,
  ROLE_DISPLAY_NAMES
} from './exercise-anatomy.js';

async function getRawCatalog(): Promise<RawDatasetExercise[]> {
  try {
    const mod = await import('../../src/lib/exercises-data.js');
    return mod.EXDB;
  } catch {
    const mod = await import('./exercises-data.js');
    return mod.EXDB;
  }
}

test('1. Anatomical Mapping: Eliminates avoidable legacy collapses where distinct SVG paths exist', () => {
  // Serratus anterior -> serratus (NOT core)
  assert.equal(
    mapContributionTargetToBodyPath({ kind: 'anatomical', entity: 'serratus_anterior' }),
    'serratus'
  );

  // Adductors & Adductor magnus -> adductors (NOT quadriceps)
  assert.equal(
    mapContributionTargetToBodyPath({ kind: 'anatomical', entity: 'adductors' }),
    'adductors'
  );
  assert.equal(
    mapContributionTargetToBodyPath({ kind: 'anatomical', entity: 'adductor_magnus' }),
    'adductors'
  );

  // Erector spinae -> lower-back (NOT whole back)
  assert.equal(
    mapContributionTargetToBodyPath({ kind: 'anatomical', entity: 'erector_spinae' }),
    'lower-back'
  );

  // Trapezius -> trapezius (NOT generic back)
  assert.equal(
    mapContributionTargetToBodyPath({ kind: 'anatomical', entity: 'trapezius' }),
    'trapezius'
  );

  // Tibialis anterior -> tibialis (NOT calves)
  assert.equal(
    mapContributionTargetToBodyPath({ kind: 'anatomical', entity: 'tibialis_anterior' }),
    'tibialis'
  );

  // Hip flexors -> hip-flexors (NOT core)
  assert.equal(
    mapContributionTargetToBodyPath({ kind: 'functional', group: 'hip_flexors' }),
    'hip-flexors'
  );
});

test('2. Honest Geometry Limitations: Shared SVG regions compress gracefully without fabricating fake paths', () => {
  // Deltoid heads all map to 'deltoids'
  assert.equal(
    mapContributionTargetToBodyPath({ kind: 'anatomical', entity: 'anterior_deltoid' }),
    'deltoids'
  );
  assert.equal(
    mapContributionTargetToBodyPath({ kind: 'anatomical', entity: 'lateral_deltoid' }),
    'deltoids'
  );
  assert.equal(
    mapContributionTargetToBodyPath({ kind: 'anatomical', entity: 'posterior_deltoid' }),
    'deltoids'
  );

  // Gluteal heads map to 'gluteal'
  assert.equal(
    mapContributionTargetToBodyPath({ kind: 'anatomical', entity: 'gluteus_maximus' }),
    'gluteal'
  );
  assert.equal(
    mapContributionTargetToBodyPath({ kind: 'anatomical', entity: 'gluteus_medius' }),
    'gluteal'
  );

  // Deep/unmapped targets return null without crashing
  assert.equal(
    mapContributionTargetToBodyPath({ kind: 'functional', group: 'rotator_cuff' }),
    null
  );
});

test('3. Hardening I: Multi-muscle aggregation retains ALL contributors on shared regions and resolves strongestRole', () => {
  // Barbell Row: latissimus_dorsi (prime), rhomboids (secondary), teres_major (secondary)
  const contributions = [
    {
      target: { kind: 'anatomical' as const, entity: 'latissimus_dorsi' as const },
      role: 'prime' as const
    },
    {
      target: { kind: 'anatomical' as const, entity: 'rhomboids' as const },
      role: 'secondary' as const
    },
    {
      target: { kind: 'anatomical' as const, entity: 'teres_major' as const },
      role: 'secondary' as const
    }
  ];

  const aggregated = aggregateContributionsByBodyPath(contributions);
  const upperBack = aggregated['upper-back'];

  assert.ok(upperBack, 'Must have upper-back region');
  assert.equal(upperBack?.strongestRole, 'prime', 'Strongest role must be prime');
  assert.equal(upperBack?.visualIntensity, ROLE_VISUAL_INTENSITY.prime);
  assert.equal(upperBack?.contributions.length, 3, 'Must retain all 3 contributions');
});

test('4. Role Precedence: Deterministic hierarchy prime > co_prime > secondary > resisted_isometric > stabilizer > minimal', () => {
  const contributions = [
    {
      target: { kind: 'anatomical' as const, entity: 'posterior_deltoid' as const },
      role: 'minimal' as const
    },
    {
      target: { kind: 'anatomical' as const, entity: 'anterior_deltoid' as const },
      role: 'secondary' as const
    },
    {
      target: { kind: 'anatomical' as const, entity: 'lateral_deltoid' as const },
      role: 'co_prime' as const
    }
  ];

  const aggregated = aggregateContributionsByBodyPath(contributions);
  const deltoids = aggregated.deltoids;

  assert.ok(deltoids);
  assert.equal(deltoids?.strongestRole, 'co_prime');
  assert.equal(deltoids?.visualIntensity, ROLE_VISUAL_INTENSITY.co_prime);
  assert.equal(deltoids?.contributions.length, 3);
});

test('5. Hardening G: Complete Semantic -> SVG Coverage Audit', () => {
  const allUniqueTargets = new Map<string, { kind: string; id: string }>();

  for (const profile of Object.values(EXERCISE_SEMANTICS_REGISTRY)) {
    for (const c of profile.contributions) {
      const key = c.target.kind === 'anatomical'
        ? `anatomical:${c.target.entity}`
        : `functional:${c.target.group}`;
      if (!allUniqueTargets.has(key)) {
        allUniqueTargets.set(key, {
          kind: c.target.kind,
          id: c.target.kind === 'anatomical' ? c.target.entity : c.target.group
        });
      }
    }
  }

  let mappedToSurfaceSvg = 0;
  let intentionallyNonSurface = 0;
  let unexpectedUnmapped = 0;

  for (const [key, item] of allUniqueTargets.entries()) {
    const target = item.kind === 'anatomical'
      ? { kind: 'anatomical' as const, entity: item.id as any }
      : { kind: 'functional' as const, group: item.id as any };

    const bodyPath = mapContributionTargetToBodyPath(target);

    if (bodyPath !== null) {
      assert.ok(
        ALL_BODY_MUSCLE_PATHS.includes(bodyPath),
        `Path ${bodyPath} must be one of the canonical 19 body paths`
      );
      mappedToSurfaceSvg++;
    } else {
      if (key === 'functional:rotator_cuff') {
        intentionallyNonSurface++;
      } else {
        unexpectedUnmapped++;
      }
    }
  }

  assert.equal(allUniqueTargets.size, 23, 'Registry must use exactly 23 unique targets');
  assert.equal(mappedToSurfaceSvg, 22, '22 targets must map to surface SVG geometry');
  assert.equal(intentionallyNonSurface, 1, 'Exactly 1 target (rotator_cuff) is intentionally non-surface');
  assert.equal(unexpectedUnmapped, 0, 'Zero unexpected unmapped targets permitted');
});

test('6. Hardening F: Bundled Production Catalog Mapping Integrity', async () => {
  const EXDB = await getRawCatalog();
  const exdbMap = new Map<string, RawDatasetExercise>();
  for (const raw of EXDB) {
    exdbMap.set(`ex-${raw.id}`, raw);
  }

  const entries = Object.entries(EXERCISE_ID_TO_SEMANTICS_KEY);
  assert.ok(entries.length >= 14, 'Must have 14 mapped catalog exercises');

  for (const [exerciseId, profileKey] of entries) {
    const raw = exdbMap.get(exerciseId);
    assert.ok(raw, `Mapped ID "${exerciseId}" must exist in raw production catalog EXDB`);

    const domainExercise = mapDatasetExerciseToDomain(raw);
    assert.equal(domainExercise.id, exerciseId);

    const resolved = resolveExerciseSemantics(domainExercise);
    assert.equal(
      resolved.source,
      'semantic_v2',
      `Exercise ${exerciseId} (${domainExercise.name}) must resolve to semantic_v2`
    );
    assert.equal(resolved.profileKey, profileKey);

    const mapData = resolveExerciseBodyMapData(domainExercise);
    assert.equal(mapData.source, 'semantic_v2');
    assert.ok(Object.keys(mapData.regions).length > 0, 'Must have at least one active region');
  }
});

test('7. Localized muscle target display names in Spanish and English', () => {
  // Anatomical targets in ES and EN
  assert.equal(
    getMuscleTargetDisplayName({ kind: 'anatomical', entity: 'pectoralis_major' }, 'es'),
    'Pectoral mayor'
  );
  assert.equal(
    getMuscleTargetDisplayName({ kind: 'anatomical', entity: 'pectoralis_major' }, 'en'),
    'Pectoralis Major'
  );
  assert.equal(
    getMuscleTargetDisplayName({ kind: 'anatomical', entity: 'latissimus_dorsi' }, 'es'),
    'Dorsal ancho'
  );
  assert.equal(
    getMuscleTargetDisplayName({ kind: 'anatomical', entity: 'latissimus_dorsi' }, 'en'),
    'Latissimus Dorsi'
  );

  // Functional targets in ES and EN
  assert.equal(
    getMuscleTargetDisplayName({ kind: 'functional', group: 'rotator_cuff' }, 'es'),
    'Manguito rotador'
  );
  assert.equal(
    getMuscleTargetDisplayName({ kind: 'functional', group: 'rotator_cuff' }, 'en'),
    'Rotator Cuff'
  );

  // Legacy fallback targets in ES and EN
  assert.equal(
    getMuscleTargetDisplayName({ kind: 'legacy', group: 'chest' }, 'es'),
    'Pecho'
  );
  assert.equal(
    getMuscleTargetDisplayName({ kind: 'legacy', group: 'chest' }, 'en'),
    'Chest'
  );

  // Body Path display names in ES and EN (no internal slug leakage)
  assert.equal(getBodyPathDisplayName('upper-back', 'es'), 'Espalda alta');
  assert.equal(getBodyPathDisplayName('upper-back', 'en'), 'Upper Back');
  assert.equal(getBodyPathDisplayName('chest', 'es'), 'Pecho');
  assert.equal(getBodyPathDisplayName('chest', 'en'), 'Chest');

  // Role display names in ES and EN (all 6 canonical roles)
  assert.equal(ROLE_DISPLAY_NAMES.prime.es, 'Principal');
  assert.equal(ROLE_DISPLAY_NAMES.prime.en, 'Prime');
  assert.equal(ROLE_DISPLAY_NAMES.co_prime.es, 'Co-principal');
  assert.equal(ROLE_DISPLAY_NAMES.co_prime.en, 'Co-prime');
  assert.equal(ROLE_DISPLAY_NAMES.secondary.es, 'Secundario');
  assert.equal(ROLE_DISPLAY_NAMES.secondary.en, 'Secondary');
  assert.equal(ROLE_DISPLAY_NAMES.resisted_isometric.es, 'Isométrico');
  assert.equal(ROLE_DISPLAY_NAMES.resisted_isometric.en, 'Isometric');
  assert.equal(ROLE_DISPLAY_NAMES.stabilizer.es, 'Estabilizador');
  assert.equal(ROLE_DISPLAY_NAMES.stabilizer.en, 'Stabilizer');
  assert.equal(ROLE_DISPLAY_NAMES.minimal.es, 'Mínimo');
  assert.equal(ROLE_DISPLAY_NAMES.minimal.en, 'Minimal');
});

test('8. Gate 3: End-to-end verification of minimal role with romanian_deadlift', () => {
  // Barbell Romanian Deadlift (ex-0085) curated profile contains minimal role
  const rdlExercise = {
    id: 'ex-0085',
    name: 'Barbell Romanian Deadlift',
    category: 'barbell' as const,
    primaryMuscle: 'hamstrings' as const,
    secondaryMuscles: ['glutes' as const]
  };

  const mapData = resolveExerciseBodyMapData(rdlExercise);
  assert.equal(mapData.source, 'semantic_v2');
  assert.equal(mapData.profileKey, 'romanian_deadlift');

  // Find minimal contribution (quadriceps in RDL)
  const minimalContrib = mapData.allContributions.find((c) => c.role === 'minimal');
  assert.ok(minimalContrib, 'Romanian Deadlift must contain at least one minimal contribution');
  assert.equal(minimalContrib.target.kind, 'anatomical');
  if (minimalContrib.target.kind === 'anatomical') {
    assert.equal(minimalContrib.target.entity, 'quadriceps');
  }

  // Quadriceps region in SVG map
  const quadRegion = mapData.regions.quadriceps;
  assert.ok(quadRegion, 'Quadriceps region must be present in mapData.regions');
  assert.equal(quadRegion.strongestRole, 'minimal', 'Quadriceps strongest role must be minimal');
  assert.equal(
    quadRegion.visualIntensity,
    ROLE_VISUAL_INTENSITY.minimal,
    'Visual intensity must match minimal constant (0.14)'
  );
  assert.ok(
    quadRegion.visualIntensity > 0 && quadRegion.visualIntensity <= 0.2,
    'Minimal intensity must be subtle but non-zero'
  );

  // Verify localized labels for minimal role
  assert.equal(ROLE_DISPLAY_NAMES[minimalContrib.role].es, 'Mínimo');
  assert.equal(ROLE_DISPLAY_NAMES[minimalContrib.role].en, 'Minimal');

  // Verify resisted_isometric also present in RDL (erector_spinae)
  const isometricContrib = mapData.allContributions.find((c) => c.role === 'resisted_isometric');
  assert.ok(isometricContrib, 'Romanian Deadlift must contain resisted_isometric contribution');
  assert.equal(isometricContrib.target.kind, 'anatomical');
  if (isometricContrib.target.kind === 'anatomical') {
    assert.equal(isometricContrib.target.entity, 'erector_spinae');
  }
  const lowerBackRegion = mapData.regions['lower-back'];
  assert.ok(lowerBackRegion, 'Lower back region must be present for erector spinae');
  assert.equal(lowerBackRegion.strongestRole, 'resisted_isometric');
});
