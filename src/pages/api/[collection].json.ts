import type { APIRoute } from 'astro';
import { API_COLLECTIONS, apiCollections } from '~/lib/api';
import { getSiteData } from '~/lib/data';

export function getStaticPaths() {
  return API_COLLECTIONS.map((collection) => ({ params: { collection } }));
}

export const GET: APIRoute = async ({ params }) => {
  const data = await getSiteData();
  const all = apiCollections(data);
  const key = params.collection as (typeof API_COLLECTIONS)[number];
  const body = { generatedAt: data.builtAt.toISOString(), count: all[key].length, data: all[key] };
  return new Response(JSON.stringify(body, null, 2), { headers: { 'Content-Type': 'application/json; charset=utf-8' } });
};
