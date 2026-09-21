import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { shouldVerifyProductionSchema } from './vercel-build-policy.mjs';

if (shouldVerifyProductionSchema()) {
  execFileSync(process.execPath, ['scripts/verify-schema-compatibility.mjs'], { stdio: 'inherit' });
}

// Invoke the workspace-resolved compiler through Node rather than a shell
// shim so this behaves the same in Vercel and local Windows shells.
execFileSync(process.execPath, [fileURLToPath(new URL('../node_modules/typescript/bin/tsc', import.meta.url))], { stdio: 'inherit' });
