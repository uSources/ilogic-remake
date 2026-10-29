// Hook de Claude Code (PostToolUse en Edit/Write/MultiEdit): formatea el fichero editado con Prettier
// y le pasa ESLint. Si ESLint encuentra errores, salen por stderr con codigo 2: Claude los ve y los arregla.
import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { relative } from 'node:path';

const input = JSON.parse(readFileSync(0, 'utf8') || '{}');
const file = input.tool_input?.file_path;
const root = process.env.CLAUDE_PROJECT_DIR || input.cwd || process.cwd();
if (!file || !/\.(ts|tsx|js|mjs|json|css|yml|yaml)$/.test(file)) process.exit(0);
const rel = relative(root, file);
if (rel.startsWith('..') || rel.startsWith('node_modules')) process.exit(0);
const npx = process.platform === 'win32' ? 'npx.cmd' : 'npx';
const run = (args) =>
  execFileSync(npx, args, { cwd: root, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'], shell: process.platform === 'win32' });

try {
  run(['prettier', '--write', '--ignore-unknown', rel]);
} catch {
  // fichero ignorado o con error de sintaxis: lo dira ESLint o tsc
}
if (/\.(ts|tsx|js|mjs)$/.test(file)) {
  try {
    run(['eslint', '--no-warn-ignored', rel]);
  } catch (e) {
    process.stderr.write(`ESLint en ${rel}:\n${e.stdout || ''}${e.stderr || ''}`);
    process.exit(2);
  }
}
