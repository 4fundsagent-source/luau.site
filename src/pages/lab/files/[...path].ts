import type { APIRoute, GetStaticPaths } from 'astro';
import { loadLab, readLabFile } from '~/lib/lab';

/** Raw downloads for every corpus script and committed Lab output. */
export const getStaticPaths: GetStaticPaths = () => {
  const { samples } = loadLab();
  const paths: string[] = [];
  for (const s of samples) {
    paths.push(`corpus/${s.id}/source.luau`, `corpus/${s.id}/expected.txt`);
    for (const r of s.runs) {
      paths.push(`runs/${s.id}/${r.id}/obfuscated.luau`);
      for (const d of r.deob) paths.push(`runs/${s.id}/${r.id}/deob/${d.id}/output.luau`);
    }
  }
  return paths.map((path) => ({ params: { path } }));
};

export const GET: APIRoute = ({ params }) =>
  new Response(readLabFile(...params.path!.split('/')), {
    headers: { 'Content-Type': 'text/plain; charset=utf-8' },
  });
