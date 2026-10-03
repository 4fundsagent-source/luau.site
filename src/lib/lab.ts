/**
 * Reads the benchmark corpus and committed runs from `lab/` at build time.
 *
 *   lab/corpus/<sample>/{meta.yaml, source.luau, expected.txt}
 *   lab/runs/<sample>/<obfuscator>@<version>/{meta.yaml, obfuscated.luau}
 *   lab/runs/<sample>/<obfuscator>@<version>/deob/<deobfuscator>@<version>/{meta.yaml, output.luau}
 *   lab/results.json   (written by `pnpm lab:verify`)
 */
import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { parse } from 'yaml';

export const LAB_ROOT = resolve(process.cwd(), 'lab');

export interface ExecResult {
  ok: boolean;
  ms?: number;
  error?: string;
}

export interface LabResults {
  generatedAt: string;
  luauVersion?: string;
  samples: Record<
    string,
    {
      original: ExecResult;
      runs: Record<string, { obfuscated: ExecResult; deob: Record<string, ExecResult> }>;
    }
  >;
}

export interface SampleMeta {
  title: string;
  description: string;
  exercises: string[];
  order: number;
}

export interface DeobRun {
  id: string;
  deobfuscator: string;
  version: string;
  date?: string;
  by?: string;
  settings?: string;
  notes?: string;
  bytes: number;
  lines: number;
  result?: ExecResult;
}

export interface ObfRun {
  id: string;
  obfuscator: string;
  version: string;
  date?: string;
  by?: string;
  settings?: string;
  notes?: string;
  bytes: number;
  lines: number;
  result?: ExecResult;
  deob: DeobRun[];
}

export interface Sample {
  id: string;
  meta: SampleMeta;
  bytes: number;
  lines: number;
  result?: ExecResult;
  runs: ObfRun[];
}

const dirs = (p: string) =>
  existsSync(p) ? readdirSync(p).filter((n) => statSync(join(p, n)).isDirectory()).sort() : [];

const readYaml = <T>(p: string): T => parse(readFileSync(p, 'utf8')) as T;

function sizeOf(path: string) {
  const text = readFileSync(path, 'utf8');
  return { bytes: Buffer.byteLength(text), lines: text.split('\n').length };
}

export function splitRunId(id: string): [string, string] {
  const at = id.lastIndexOf('@');
  if (at <= 0) throw new Error(`Lab run folder "${id}" must be named <slug>@<version>`);
  return [id.slice(0, at), id.slice(at + 1)];
}

export function readResults(root = LAB_ROOT): LabResults | undefined {
  const p = join(root, 'results.json');
  return existsSync(p) ? (JSON.parse(readFileSync(p, 'utf8')) as LabResults) : undefined;
}

export function loadLab(root = LAB_ROOT): { samples: Sample[]; results?: LabResults } {
  const results = readResults(root);
  const samples: Sample[] = dirs(join(root, 'corpus')).map((id) => {
    const dir = join(root, 'corpus', id);
    const meta = readYaml<SampleMeta>(join(dir, 'meta.yaml'));
    const r = results?.samples[id];

    const runs: ObfRun[] = dirs(join(root, 'runs', id)).map((runId) => {
      const runDir = join(root, 'runs', id, runId);
      const [obfuscator, version] = splitRunId(runId);
      const m = readYaml<Partial<ObfRun>>(join(runDir, 'meta.yaml')) ?? {};
      const deob: DeobRun[] = dirs(join(runDir, 'deob')).map((deobId) => {
        const dDir = join(runDir, 'deob', deobId);
        const [deobfuscator, dVersion] = splitRunId(deobId);
        const dm = readYaml<Partial<DeobRun>>(join(dDir, 'meta.yaml')) ?? {};
        return {
          ...dm,
          id: deobId,
          deobfuscator,
          version: dVersion,
          ...sizeOf(join(dDir, 'output.luau')),
          result: r?.runs[runId]?.deob[deobId],
        };
      });
      return {
        ...m,
        id: runId,
        obfuscator,
        version,
        ...sizeOf(join(runDir, 'obfuscated.luau')),
        result: r?.runs[runId]?.obfuscated,
        deob,
      };
    });

    return { id, meta, ...sizeOf(join(dir, 'source.luau')), result: r?.original, runs };
  });

  samples.sort((a, b) => a.meta.order - b.meta.order);
  return { samples, results };
}

export function readLabFile(...parts: string[]): string {
  return readFileSync(join(LAB_ROOT, ...parts), 'utf8');
}

/** Did any deobfuscator recover this run with matching behavior? */
export function recovered(run: ObfRun): boolean {
  return run.deob.some((d) => d.result?.ok);
}
