import { build } from 'esbuild';
import { mkdtemp, rm } from 'node:fs/promises';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';

const root = fileURLToPath(new URL('..', import.meta.url));
const scratch = await mkdtemp(resolve(root, 'node_modules/.terminal-tests-'));
try {
  for (const name of ['terminalNavigation', 'terminalLayout']) {
    const outfile = resolve(scratch, `${name}.mjs`);
    await build({ entryPoints: [resolve(root, 'tests', `${name}.tsx`)], outfile, bundle: true, platform: 'node', format: 'esm', external: ['react', 'react-dom'], loader: { '.md': 'text', '.css': 'empty' } });
    const result = spawnSync(process.execPath, [outfile], { cwd: resolve(root, '..'), stdio: 'inherit' });
    if (result.status !== 0) throw new Error(`${name} failed`);
  }
} finally { await rm(scratch, { recursive: true, force: true }); }
