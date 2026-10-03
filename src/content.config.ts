import { defineCollection, reference } from 'astro:content';
import { glob, file } from 'astro/loaders';
import { z } from 'astro/zod';
import { DATE_PATTERN, toISODate } from './lib/dates';
import {
  ACCESS,
  CODEBASE_CRITERIA,
  AUTH_FEATURES,
  BYPASS,
  DEOB_TECHNIQUES,
  EVENT_KINDS,
  MAINTENANCE,
  OUTPUT_LEVELS,
  PRICING,
  RUNTIMES,
  STATUSES,
  SUPPORT,
  TECHNIQUES,
} from './lib/taxonomy';

/** YAML parses bare `2026-08-14` into a Date; normalize everything back to a string. */
const date = z.preprocess(
  (v) => (v instanceof Date ? toISODate(v) : v),
  z.string().regex(DATE_PATTERN, 'Use YYYY-MM-DD or YYYY-MM, optionally prefixed with ~ for approximate'),
);

const source = z.object({
  url: z.url(),
  title: z.string().optional(),
  accessed: date,
  archive: z.url().optional(),
});
const sources = z.array(source);

const common = {
  name: z.string().min(1),
  tagline: z.string().max(140),
  description: z.string(),
  website: z.url().optional(),
  discord: z.url().optional(),
  docs: z.url().optional(),
  repo: z.url().optional(),
  /** Has a maintainer checked every claim in this entry against its sources? */
  verified: z.boolean().default(false),
  lastVerified: date,
  sources: sources.min(1, 'Every entry needs at least one source'),
};

const version = z
  .object({
    version: z.string().min(1),
    released: date.optional(),
    notes: z.string().optional(),
    /** Manual override of the derived status. Requires a note and sources. */
    status: z.enum(STATUSES).optional(),
    statusNote: z.string().optional(),
    sources: sources.default([]),
  })
  .refine((v) => !v.status || (v.statusNote && v.sources.length > 0), {
    message: 'A status override needs a statusNote and at least one source',
  });

const grade = z.number().int().min(0).max(4);

/** Maintainer-graded rubric for open-source obfuscators (see methodology). */
const codebase = z.object({
  vm: grade,
  randomization: grade,
  antiTamper: grade,
  luau: grade,
  maintenance: grade,
  notes: z.string(),
  assessedOn: date,
} satisfies Record<(typeof CODEBASE_CRITERIA)[number], typeof grade> & Record<string, unknown>);

const obfuscators = defineCollection({
  loader: glob({ pattern: '*.yaml', base: './src/data/obfuscators' }),
  schema: z
    .object({
      ...common,
      vendor: z.string().optional(),
      since: z.number().int().min(2000).optional(),
      pricing: z.enum(PRICING),
      license: z.string().optional(),
      /** Empty when unknown. */
      targets: z.array(z.enum(RUNTIMES)),
      techniques: z.array(z.enum(TECHNIQUES)),
      discontinued: z.boolean().default(false),
      codebase: codebase.optional(),
      /** Oldest first. The last entry is the current version. */
      versions: z.array(version).min(1),
    })
    .refine((o) => o.pricing !== 'open-source' || o.codebase, {
      message: 'Open-source obfuscators need a codebase rubric (vm, randomization, antiTamper, luau, maintenance)',
      path: ['codebase'],
    }),
});

const deobfuscators = defineCollection({
  loader: glob({ pattern: '*.yaml', base: './src/data/deobfuscators' }),
  schema: z.object({
    ...common,
    author: z.string(),
    access: z.enum(ACCESS),
    license: z.string().optional(),
    techniques: z.array(z.enum(DEOB_TECHNIQUES)).min(1),
    outputLevel: z.enum(OUTPUT_LEVELS),
    firstSeen: date.optional(),
    maintenance: z.enum(MAINTENANCE),
    targets: z
      .array(
        z.object({
          obfuscator: reference('obfuscators'),
          versions: z.array(z.string()).min(1),
          support: z.enum(SUPPORT).default('full'),
          since: z.union([z.literal('unknown'), date]).optional(),
          notes: z.string().optional(),
        }),
      )
      .min(1),
  }),
});

const auth = defineCollection({
  loader: glob({ pattern: '*.yaml', base: './src/data/auth' }),
  schema: z.object({
    ...common,
    pricing: z.enum(PRICING),
    features: z.array(z.enum(AUTH_FEATURES)).min(1),
    bundledObfuscator: reference('obfuscators').optional(),
    /** Whether the key system / whitelist itself has been bypassed. */
    bypass: z.object({
      status: z.enum(BYPASS),
      note: z.string().optional(),
      sources: sources.default([]),
    }),
    /** Whether scripts protected by the service have been deobfuscated. */
    protection: z
      .object({
        status: z.enum(STATUSES),
        note: z.string(),
        sources: sources.min(1),
      })
      .optional(),
  }),
});

/** Hand-written events. Releases and breaks are derived from the data above. */
const events = defineCollection({
  loader: file('./src/data/events.yaml'),
  schema: z.object({
    date,
    kind: z.enum(EVENT_KINDS),
    title: z.string(),
    summary: z.string().optional(),
    obfuscator: reference('obfuscators').optional(),
    deobfuscator: reference('deobfuscators').optional(),
    sources: sources.min(1),
  }),
});

export const collections = { obfuscators, deobfuscators, auth, events };
