import { createRequire } from 'node:module';
import { writeFile, mkdir } from 'node:fs/promises';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { auditExerciseCatalog } from '../packages/domain/dist/index.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const rootDir = resolve(__dirname, '..');

const require = createRequire(import.meta.url);
const { EXDB } = require(resolve(rootDir, 'apps/web/src/lib/exercises-data.js'));

async function main() {
  console.log(`Auditing catalog of ${EXDB.length} exercises...`);

  const { records, summary } = auditExerciseCatalog(EXDB);

  const auditsDir = resolve(rootDir, 'docs/audits');
  await mkdir(auditsDir, { recursive: true });

  // 1. JSON audit records
  const auditJsonPath = resolve(auditsDir, 'exercise-catalog-audit.json');
  await writeFile(auditJsonPath, JSON.stringify(records, null, 2), 'utf8');
  console.log(`Wrote audit records to ${auditJsonPath}`);

  // 2. CSV audit records
  const csvHeaders = [
    'id',
    'name',
    'rawBodyPart',
    'rawEquipment',
    'rawTarget',
    'rawMuscleMetadata',
    'rawSecondaryMuscles',
    'currentCategory',
    'currentPrimaryMuscle',
    'currentSecondaryMuscles',
    'currentLoadMechanism',
    'currentLoadMode',
    'currentBodyweightFactor',
    'currentPlateBaseKind',
    'inferredMovementFamily',
    'inferredComplexity',
    'inferredMachineResistanceClass',
    'highestSeverity',
    'flags'
  ];

  const escapeCsv = (val) => {
    if (val === undefined || val === null) return '';
    const str = String(val);
    if (str.includes(',') || str.includes('"') || str.includes('\n')) {
      return `"${str.replace(/"/g, '""')}"`;
    }
    return str;
  };

  const csvRows = [csvHeaders.join(',')];
  for (const r of records) {
    const row = [
      escapeCsv(r.id),
      escapeCsv(r.name),
      escapeCsv(r.raw.bodyPart),
      escapeCsv(r.raw.equipment),
      escapeCsv(r.raw.target),
      escapeCsv(r.raw.muscleMetadata),
      escapeCsv(r.raw.secondaryMuscles.join('; ')),
      escapeCsv(r.current.equipmentCategory),
      escapeCsv(r.current.primaryMuscle),
      escapeCsv(r.current.secondaryMuscles.join('; ')),
      escapeCsv(r.current.loadMechanism),
      escapeCsv(r.current.loadMode),
      escapeCsv(r.current.bodyweightFactor ?? ''),
      escapeCsv(r.current.plateBaseKind ?? ''),
      escapeCsv(r.inferred.movementFamily),
      escapeCsv(r.inferred.complexity),
      escapeCsv(r.inferred.machineResistanceClass),
      escapeCsv(r.highestSeverity ?? 'none'),
      escapeCsv(r.flags.join('; '))
    ];
    csvRows.push(row.join(','));
  }

  const auditCsvPath = resolve(auditsDir, 'exercise-catalog-audit.csv');
  await writeFile(auditCsvPath, csvRows.join('\n'), 'utf8');
  console.log(`Wrote audit CSV to ${auditCsvPath}`);

  // 3. Priority reports
  const formatExerciseBrief = (r) => ({
    id: r.id,
    name: r.name,
    rawTarget: r.raw.target,
    rawMuscleMetadata: r.raw.muscleMetadata,
    rawSecondaries: r.raw.secondaryMuscles,
    rawEquipment: r.raw.equipment,
    currentPrimary: r.current.primaryMuscle,
    currentSecondaries: r.current.secondaryMuscles,
    currentMechanism: r.current.loadMechanism,
    movementFamily: r.inferred.movementFamily,
    flags: r.flags
  });

  const priorityFamilies = {
    leg_press: records.filter((r) => r.inferred.movementFamily === 'leg_press').map(formatExerciseBrief),
    hack_squat: records.filter((r) => r.inferred.movementFamily === 'hack_squat').map(formatExerciseBrief),
    squat: records.filter((r) => r.inferred.movementFamily === 'squat').map(formatExerciseBrief),
    deadlift_rdl: records.filter((r) => ['deadlift', 'romanian_deadlift'].includes(r.inferred.movementFamily)).map(formatExerciseBrief),
    lunge_split_squat: records.filter((r) => ['lunge', 'split_squat', 'step_up'].includes(r.inferred.movementFamily)).map(formatExerciseBrief),
    hip_thrust: records.filter((r) => r.inferred.movementFamily === 'hip_thrust').map(formatExerciseBrief)
  };

  const fullSummary = {
    ...summary,
    priorityFamilies
  };

  const summaryJsonPath = resolve(auditsDir, 'exercise-catalog-summary.json');
  await writeFile(summaryJsonPath, JSON.stringify(fullSummary, null, 2), 'utf8');
  console.log(`Wrote audit summary to ${summaryJsonPath}`);

  console.log('\n=== AUDIT SUMMARY STATS ===');
  console.log(`Total exercises: ${summary.totalExercises}`);
  console.log(`Compound candidates: ${summary.byComplexity.compound}`);
  console.log(`Isolation candidates: ${summary.byComplexity.isolation}`);
  console.log(`Unknown complexity: ${summary.byComplexity.unknown}`);
  console.log(`Machine resistance candidates: ${summary.machineResistanceCandidates.length}`);
  console.log(`Known current machine base: ${summary.byMachineResistanceClass.known_current}`);
  console.log(`Plate-loaded candidates: ${summary.plateLoadedCandidates.length}`);
  console.log(`Assisted bodyweight candidates: ${summary.bodyweightAssistedCandidates.length}`);
  console.log(`Total flag instances: ${Object.values(summary.byFlag).reduce((a, b) => a + b, 0)}`);

  console.log('\n=== SEVERITY BREAKDOWN ===');
  for (const [sev, count] of Object.entries(summary.bySeverity)) {
    console.log(`  ${sev}: ${count}`);
  }

  console.log('\n=== TOP FLAGS ===');
  const sortedFlags = Object.entries(summary.byFlag).sort((a, b) => b[1] - a[1]);
  for (const [flag, count] of sortedFlags.slice(0, 20)) {
    console.log(`  ${flag}: ${count}`);
  }
}

main().catch((err) => {
  console.error('Audit failed:', err);
  process.exit(1);
});
