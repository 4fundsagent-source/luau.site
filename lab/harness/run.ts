/**
 * `pnpm lab:verify` — runs every Lab stage with the official Luau CLI and
 * compares stdout with the sample's expected.txt.
 *
 *   pnpm lab:verify            run everything and write lab/results.json
 *   pnpm lab:verify --check    run everything and fail if pass/fail differs
 *                              from the committed results.json (used in CI)
 *
 * Exits non-zero if an original corpus script no longer matches its expected
 * output, since that means the corpus itself is broken. A failing obfuscated or
 * deobfuscated stage is a result, not an error.
 *
 * Third-party tools never run here. Their outputs are produced locally by a
 * maintainer and committed; this only executes Luau code, with a timeout.
 */
import { spawnSync } from 'node:child_process';
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { LAB_ROOT, loadLab, readResults, type ExecResult, type LabResults } from '../../src/lib/lab';

const TIMEOUT_MS = 15_000;
const check = process.argv.includes('--check');

function findLuau(): string {
  const candidates = [process.env.LUAU_BIN, join(LAB_ROOT, '.bin', 'luau')].filter(Boolean) as string[];
  for (const c of candidates) if (existsSync(c)) return c;
  const which = spawnSync('which', ['luau'], { encoding: 'utf8' });
  if (which.status === 0) return which.stdout.trim();
  console.error(
    'luau CLI not found. Download it from https://github.com/luau-lang/luau/releases and either put it on PATH,\n' +
      'set LUAU_BIN, or unzip it into lab/.bin/.',
  );
  process.exit(2);
}

const luau = findLuau();
const normalize = (s: string) => s.replace(/\r\n/g, '\n').trimEnd();

function exec(file: string, expected: string): ExecResult {
  const started = performance.now();
  const r = spawnSync(luau, [file], { encoding: 'utf8', timeout: TIMEOUT_MS, maxBuffer: 16 * 1024 * 1024 });
  const ms = Math.round(performance.now() - started);
  if (r.error) return { ok: false, ms, error: r.error.message.includes('ETIMEDOUT') ? `timed out after ${TIMEOUT_MS} ms` : r.error.message };
  if (r.status !== 0) return { ok: false, ms, error: normalize(r.stderr || r.stdout).split('\n').slice(-3).join('\n') };
  const got = normalize(r.stdout);
  if (got !== expected) {
    const a = got.split('\n');
    const b = expected.split('\n');
    const line = b.findIndex((l, i) => a[i] !== l);
    const at = line === -1 ? b.length : line;
    return { ok: false, ms, error: `output differs at line ${at + 1}: expected "${b[at] ?? '<end>'}", got "${a[at] ?? '<end>'}"` };
  }
  return { ok: true, ms };
}

const { samples } = loadLab();
const results: LabResults = { generatedAt: new Date().toISOString(), samples: {} };
let corpusBroken = 0;
const symbol = (r: ExecResult) => (r.ok ? '✓' : '✗');

for (const s of samples) {
  const dir = join(LAB_ROOT, 'corpus', s.id);
  const expected = normalize(readFileSync(join(dir, 'expected.txt'), 'utf8'));
  const original = exec(join(dir, 'source.luau'), expected);
  console.log(`${symbol(original)} ${s.id}${original.ok ? '' : `  — ${original.error}`}`);
  if (!original.ok) corpusBroken++;

  const runs: LabResults['samples'][string]['runs'] = {};
  for (const run of s.runs) {
    const runDir = join(LAB_ROOT, 'runs', s.id, run.id);
    const obfuscated = exec(join(runDir, 'obfuscated.luau'), expected);
    console.log(`  ${symbol(obfuscated)} ${run.id}${obfuscated.ok ? '' : `  — ${obfuscated.error}`}`);
    const deob: Record<string, ExecResult> = {};
    for (const d of run.deob) {
      deob[d.id] = exec(join(runDir, 'deob', d.id, 'output.luau'), expected);
      console.log(`    ${symbol(deob[d.id]!)} ${d.id}${deob[d.id]!.ok ? '' : `  — ${deob[d.id]!.error}`}`);
    }
    runs[run.id] = { obfuscated, deob };
  }
  results.samples[s.id] = { original, runs };
}

if (corpusBroken) {
  console.error(`\n✗ ${corpusBroken} corpus script(s) no longer match expected.txt.`);
  process.exit(1);
}

if (check) {
  const committed = readResults();
  const flags = (r: LabResults | undefined) =>
    JSON.stringify(
      Object.fromEntries(
        Object.entries(r?.samples ?? {})
          .sort(([a], [b]) => a.localeCompare(b))
          .map(([id, s]) => [
            id,
            [
              s.original.ok,
              Object.entries(s.runs)
                .sort(([a], [b]) => a.localeCompare(b))
                .map(([rid, run]) => [rid, run.obfuscated.ok, Object.entries(run.deob).sort(([a], [b]) => a.localeCompare(b)).map(([did, d]) => [did, d.ok])]),
            ],
          ]),
      ),
    );
  if (flags(committed) !== flags(results)) {
    console.error('\n✗ lab/results.json is out of date. Run `pnpm lab:verify` and commit the result.');
    process.exit(1);
  }
  console.log('\n✓ lab/results.json matches a fresh run.');
} else {
  writeFileSync(join(LAB_ROOT, 'results.json'), `${JSON.stringify(results, null, 2)}\n`);
  console.log(`\n✓ Wrote lab/results.json (${samples.length} samples).`);
}
