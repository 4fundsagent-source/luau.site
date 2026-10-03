/**
 * `pnpm validate` — data checks beyond the content schemas (which `astro sync`
 * enforces first): cross-file references, version names, date sanity, source
 * hygiene, and Lab folder structure. Exits non-zero with a readable report.
 */
import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { parse } from 'yaml';
import { DATE_PATTERN, parseDate, toISODate } from '../src/lib/dates';
import { checkIntegrity } from '../src/lib/integrity';
import { LAB_ROOT, loadLab } from '../src/lib/lab';

const DATA = join(process.cwd(), 'src/data');
const errors: string[] = [];
const warnings: string[] = [];

type Doc = Record<string, any>;

function load(dir: string): { id: string; doc: Doc }[] {
  const full = join(DATA, dir);
  return readdirSync(full)
    .filter((f) => f.endsWith('.yaml'))
    .map((f) => ({ id: f.replace(/\.yaml$/, ''), doc: parse(readFileSync(join(full, f), 'utf8')) as Doc }));
}

const norm = (v: unknown) => (v instanceof Date ? toISODate(v) : (v as string | undefined));
const today = new Date();

function checkDate(where: string, raw: unknown) {
  const v = norm(raw);
  if (v === undefined) return;
  if (!DATE_PATTERN.test(v)) return errors.push(`${where}: invalid date "${v}"`);
  try {
    if (parseDate(v).date > today) errors.push(`${where}: date ${v} is in the future`);
  } catch (e) {
    errors.push(`${where}: ${(e as Error).message}`);
  }
}

function checkSources(where: string, sources: Doc[] | undefined, required: boolean) {
  if (!sources?.length) {
    if (required) errors.push(`${where}: needs at least one source`);
    return;
  }
  for (const s of sources) {
    if (!/^https:\/\//.test(s.url ?? '')) errors.push(`${where}: source URL must be https (${s.url})`);
    checkDate(`${where} source accessed`, s.accessed);
  }
}

const slug = /^[a-z0-9]+(-[a-z0-9]+)*$/;
const obfuscators = load('obfuscators');
const deobfuscators = load('deobfuscators');
const auth = load('auth');

for (const [dir, list] of [['obfuscators', obfuscators], ['deobfuscators', deobfuscators], ['auth', auth]] as const) {
  for (const { id, doc } of list) {
    const where = `${dir}/${id}.yaml`;
    if (!slug.test(id)) errors.push(`${where}: file name must be a lowercase-kebab slug`);
    checkSources(where, doc.sources, true);
    checkDate(`${where} lastVerified`, doc.lastVerified);
    if (!doc.verified) warnings.push(`${where}: not yet verified`);
  }
}

for (const { id, doc } of obfuscators) {
  for (const v of doc.versions ?? []) {
    const where = `obfuscators/${id}.yaml version ${v.version}`;
    checkDate(where, v.released);
    checkSources(where, v.sources, Boolean(v.status));
  }
}
for (const { id, doc } of deobfuscators) {
  checkDate(`deobfuscators/${id}.yaml firstSeen`, doc.firstSeen);
  for (const t of doc.targets ?? []) if (t.since !== 'unknown') checkDate(`deobfuscators/${id}.yaml target since`, t.since);
}

const events = parse(readFileSync(join(DATA, 'events.yaml'), 'utf8')) as Doc[];
const eventIds = new Set<string>();
for (const e of events ?? []) {
  const where = `events.yaml ${e.id}`;
  if (eventIds.has(e.id)) errors.push(`${where}: duplicate id`);
  eventIds.add(e.id);
  checkDate(where, e.date);
  checkSources(where, e.sources, true);
}

let labRuns: { sample: string; obfuscator: string; version: string; deob: { deobfuscator: string }[] }[] = [];
if (existsSync(join(LAB_ROOT, 'corpus'))) {
  try {
    const { samples } = loadLab();
    labRuns = samples.flatMap((s) => s.runs.map((r) => ({ ...r, sample: s.id })));
    for (const s of samples) {
      if (!existsSync(join(LAB_ROOT, 'corpus', s.id, 'expected.txt'))) errors.push(`lab/corpus/${s.id}: missing expected.txt`);
    }
  } catch (e) {
    errors.push(`lab: ${(e as Error).message}`);
  }
}

errors.push(
  ...checkIntegrity({
    obfuscators: obfuscators.map(({ id, doc }) => ({ id, versions: doc.versions ?? [] })),
    deobfuscators: deobfuscators.map(({ id, doc }) => ({ id, targets: doc.targets ?? [] })),
    labRuns,
  }),
);
for (const { id, doc } of auth) {
  if (doc.bundledObfuscator && !obfuscators.some((o) => o.id === doc.bundledObfuscator)) {
    errors.push(`auth/${id}.yaml: unknown bundledObfuscator "${doc.bundledObfuscator}"`);
  }
}

const counts = `${obfuscators.length} obfuscators, ${deobfuscators.length} deobfuscators, ${auth.length} auth services, ${events.length} events, ${labRuns.length} lab runs`;
if (warnings.length) console.log(`⚠ ${warnings.length} warning(s):\n  - ${warnings.join('\n  - ')}\n`);
if (errors.length) {
  console.error(`✗ ${errors.length} error(s):\n  - ${errors.join('\n  - ')}`);
  process.exit(1);
}
console.log(`✓ Data valid — ${counts}.`);
