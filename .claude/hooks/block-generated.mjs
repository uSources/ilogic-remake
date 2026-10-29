// Hook de Claude Code (PreToolUse en Edit/Write/MultiEdit): no deja editar a mano lo que genera
// npm run assets (se perderia en la siguiente compilacion de graficos).
import { readFileSync } from 'node:fs';
import { relative } from 'node:path';

const input = JSON.parse(readFileSync(0, 'utf8') || '{}');
const file = input.tool_input?.file_path;
if (!file) process.exit(0);
const root = process.env.CLAUDE_PROJECT_DIR || input.cwd || process.cwd();
const rel = relative(root, file).replace(/\\/g, '/');
const GENERATED = [
  /^public\/assets\/atlas\//,
  /^public\/assets\/img\/(anim|blob)\//,
  /^src\/assetList\.ts$/,
  /^src\/atlasPages\.ts$/,
  /^src\/ui\/(wangSets|blobSets|sheets)\.ts$/,
];
if (GENERATED.some((re) => re.test(rel))) {
  process.stdout.write(
    JSON.stringify({
      hookSpecificOutput: {
        hookEventName: 'PreToolUse',
        permissionDecision: 'deny',
        permissionDecisionReason: `${rel} lo genera npm run assets: cambia el script de tools/art/ (o el dibujo de partida) y ejecuta npm run assets. Ver README, "Graficos".`,
      },
    }),
  );
}
