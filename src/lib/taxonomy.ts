/**
 * Every controlled vocabulary in the dataset lives here, so schemas, filters,
 * labels and the glossary never drift apart.
 */

export const STATUSES = ['holding', 'partial', 'broken'] as const;
/** Status of a single version, derived from deobfuscator coverage. */
export type Status = (typeof STATUSES)[number];

/**
 * Status shown for a whole project. Open-source obfuscators can never "hold":
 * their source is public, so an unbroken open-source project shows as `open`.
 */
export const DISPLAY_STATUSES = ['holding', 'open', 'partial', 'broken'] as const;
export type DisplayStatus = (typeof DISPLAY_STATUSES)[number];

export const STATUS_META: Record<DisplayStatus, { label: string; description: string }> = {
  open: {
    label: 'Open source',
    description:
      'The source is public, so it can never truly hold. It is scored on the strength of its codebase instead.',
  },
  holding: {
    label: 'Holding',
    description: 'No public deobfuscator is tracked for this version.',
  },
  partial: {
    label: 'Partial',
    description: 'Tools recover constants, bytecode or traces, or support is experimental — but not readable source.',
  },
  broken: {
    label: 'Broken',
    description: 'A tool is known to recover readable source for this version.',
  },
};

export const PRICING = ['free', 'freemium', 'paid', 'open-source', 'unknown'] as const;
export type Pricing = (typeof PRICING)[number];
export const PRICING_LABEL: Record<Pricing, string> = {
  free: 'Free',
  freemium: 'Freemium',
  paid: 'Paid',
  'open-source': 'Open source',
  unknown: 'Pricing unknown',
};

/** Rubric for grading an open-source obfuscator's codebase, 0–4 per criterion. */
export const CODEBASE_CRITERIA = ['vm', 'randomization', 'antiTamper', 'luau', 'maintenance'] as const;
export type CodebaseCriterion = (typeof CODEBASE_CRITERIA)[number];
export const CODEBASE_META: Record<CodebaseCriterion, { label: string; description: string }> = {
  vm: { label: 'VM design', description: 'How deep and original the virtual machine is: custom ISA, nesting, handler obfuscation.' },
  randomization: {
    label: 'Per-build randomization',
    description: 'How much every output differs: shuffled opcodes, randomized layouts, polymorphic handlers.',
  },
  antiTamper: { label: 'Anti-tamper', description: 'Integrity checks, environment checks and anti-hooking that survive scrutiny.' },
  luau: { label: 'Luau coverage', description: 'How completely modern Luau syntax and runtime features are supported.' },
  maintenance: { label: 'Maintenance', description: 'Active development and responses to published deobfuscators.' },
};
export const CODEBASE_MAX = CODEBASE_CRITERIA.length * 4;

export const RUNTIMES = ['luau', 'lua51', 'lua52', 'lua53', 'lua54', 'luajit'] as const;
export type Runtime = (typeof RUNTIMES)[number];
export const RUNTIME_LABEL: Record<Runtime, string> = {
  luau: 'Luau',
  lua51: 'Lua 5.1',
  lua52: 'Lua 5.2',
  lua53: 'Lua 5.3',
  lua54: 'Lua 5.4',
  luajit: 'LuaJIT',
};

export const TECHNIQUES = [
  'vm',
  'nested-vm',
  'polymorphic-vm',
  'const-encryption',
  'string-encryption',
  'function-encryption',
  'whitebox-crypto',
  'runtime-delivery',
  'cff',
  'opaque-predicates',
  'junk-code',
  'renaming',
  'anti-tamper',
  'env-checks',
  'compression',
  'watermarking',
  'macros',
] as const;
export type Technique = (typeof TECHNIQUES)[number];

export const TECHNIQUE_META: Record<Technique, { label: string; points: number; description: string }> = {
  vm: {
    label: 'VM virtualization',
    points: 3,
    description: 'Code is compiled to a custom instruction set and executed by an interpreter shipped inside the script.',
  },
  'nested-vm': {
    label: 'Nested VM',
    points: 2,
    description: 'The interpreter itself is virtualized, so an analyst has to peel more than one VM layer.',
  },
  'polymorphic-vm': {
    label: 'Per-build VM',
    points: 2,
    description: 'Every build gets a unique instruction set or opcode encoding, so a lifter written for one build does not transfer.',
  },
  'const-encryption': {
    label: 'Constant encryption',
    points: 1,
    description: 'Numbers and other constants are encrypted and only decoded at runtime.',
  },
  'string-encryption': {
    label: 'String encryption',
    points: 1,
    description: 'String literals are encoded or encrypted and decoded on demand.',
  },
  'function-encryption': {
    label: 'Function encryption',
    points: 1,
    description: 'Selected function bodies stay encrypted until they are called.',
  },
  'whitebox-crypto': {
    label: 'White-box cryptography',
    points: 1,
    description: 'Keys are entangled with the code itself, so they cannot simply be lifted out and reused.',
  },
  'runtime-delivery': {
    label: 'Server-gated delivery',
    points: 2,
    description:
      'The script is obfuscated per execution and sent at runtime, so there is no static file to attack and old responses cannot be replayed.',
  },
  cff: {
    label: 'Control-flow flattening',
    points: 1,
    description: 'Structured control flow is replaced with a dispatcher loop and state variable.',
  },
  'opaque-predicates': {
    label: 'Opaque predicates',
    points: 0.5,
    description: 'Branches whose outcome is fixed but hard to prove statically.',
  },
  'junk-code': {
    label: 'Junk code',
    points: 0.5,
    description: 'Dead or irrelevant code inserted to inflate and confuse analysis.',
  },
  renaming: {
    label: 'Identifier renaming',
    points: 0.5,
    description: 'Local names are replaced with meaningless identifiers.',
  },
  'anti-tamper': {
    label: 'Anti-tamper',
    points: 1,
    description: 'Integrity checks that break or crash the script if it is modified.',
  },
  'env-checks': {
    label: 'Environment checks',
    points: 1,
    description: 'Detects hooks, debuggers, emulators or a non-genuine runtime environment.',
  },
  compression: {
    label: 'Compression',
    points: 0,
    description: 'Payload is compressed. Shrinks output; adds little security on its own.',
  },
  watermarking: {
    label: 'Watermarking',
    points: 0,
    description: 'Embeds identifying marks to trace leaks. Forensics, not protection.',
  },
  macros: {
    label: 'Protection macros',
    points: 0,
    description: 'Source-level macros that let authors mark which parts to virtualize, encrypt or skip.',
  },
};

export const ACCESS = ['open-source', 'free', 'paid', 'private'] as const;
export type Access = (typeof ACCESS)[number];
export const ACCESS_LABEL: Record<Access, string> = {
  'open-source': 'Open source',
  free: 'Free (closed)',
  paid: 'Paid',
  private: 'Private',
};

export const OUTPUT_LEVELS = ['constants', 'bytecode', 'readable', 'near-original'] as const;
export type OutputLevel = (typeof OUTPUT_LEVELS)[number];
export const OUTPUT_META: Record<OutputLevel, { label: string; description: string }> = {
  constants: { label: 'Constants', description: 'Dumps strings and constants; logic stays hidden.' },
  bytecode: { label: 'Bytecode', description: 'Recovers standard bytecode or VM instructions, not source.' },
  readable: { label: 'Readable source', description: 'Produces runnable, human-readable source code.' },
  'near-original': {
    label: 'Near-original source',
    description: 'Readable source with recovered structure and meaningful names.',
  },
};

export const DEOB_TECHNIQUES = [
  'static-devirt',
  'emulation',
  'dynamic-trace',
  'constant-dump',
  'ast-cleanup',
  'ai-assisted',
] as const;
export type DeobTechnique = (typeof DEOB_TECHNIQUES)[number];
export const DEOB_TECHNIQUE_META: Record<DeobTechnique, { label: string; description: string }> = {
  'static-devirt': {
    label: 'Static devirtualization',
    description: 'Lifts VM instructions back to code without running the script.',
  },
  emulation: {
    label: 'Sandboxed emulation',
    description: 'Runs the script in a controlled environment to observe decrypted state.',
  },
  'dynamic-trace': {
    label: 'Execution tracing',
    description: 'Hooks the runtime and records what the script actually does.',
  },
  'constant-dump': {
    label: 'Constant dumping',
    description: 'Extracts decrypted strings and constants from memory or the VM.',
  },
  'ast-cleanup': {
    label: 'AST cleanup',
    description: 'Simplifies expressions, folds constants and removes junk at the syntax-tree level.',
  },
  'ai-assisted': {
    label: 'AI-assisted',
    description: 'Uses language models to lift, rename or restructure recovered code.',
  },
};

/** How hard a break was to achieve (tool complexity, crackme ratings, time to appear). */
export const DIFFICULTY = ['easy', 'moderate', 'hard'] as const;
export type Difficulty = (typeof DIFFICULTY)[number];
export const DIFFICULTY_LABEL: Record<Difficulty, string> = { easy: 'Easy', moderate: 'Moderate', hard: 'Hard' };

/** Does the vendor publish versions and changelogs? */
export const DISCLOSURE = ['public', 'partial', 'none'] as const;
export type Disclosure = (typeof DISCLOSURE)[number];
export const DISCLOSURE_LABEL: Record<Disclosure, string> = {
  public: 'Public changelog',
  partial: 'Partial version info',
  none: 'No version info published',
};

/** Can anyone use the obfuscator today? */
export const AVAILABILITY = ['public', 'request-only', 'closed'] as const;
export type Availability = (typeof AVAILABILITY)[number];
export const AVAILABILITY_LABEL: Record<Availability, string> = {
  public: 'Publicly available',
  'request-only': 'Request-only access',
  closed: 'Closed to new users',
};

export const CHALLENGE_STATUS = ['open', 'solved'] as const;
export type ChallengeStatus = (typeof CHALLENGE_STATUS)[number];

export const SUPPORT = ['full', 'partial', 'experimental'] as const;
export type Support = (typeof SUPPORT)[number];

export const MAINTENANCE = ['active', 'stale', 'archived', 'patched'] as const;
export type Maintenance = (typeof MAINTENANCE)[number];
export const MAINTENANCE_LABEL: Record<Maintenance, string> = {
  active: 'Active',
  stale: 'Stale',
  archived: 'Archived',
  patched: 'Patched',
};

export const AUTH_FEATURES = [
  'key-system',
  'hwid-lock',
  'whitelist',
  'obfuscation',
  'loader',
  'analytics',
  'api',
] as const;
export type AuthFeature = (typeof AUTH_FEATURES)[number];
export const AUTH_FEATURE_LABEL: Record<AuthFeature, string> = {
  'key-system': 'Key system',
  'hwid-lock': 'HWID lock',
  whitelist: 'Whitelist',
  obfuscation: 'Obfuscation',
  loader: 'Remote loader',
  analytics: 'Analytics',
  api: 'Developer API',
};

export const BYPASS = ['none-known', 'partial', 'bypassed'] as const;
export type Bypass = (typeof BYPASS)[number];
export const BYPASS_TO_STATUS: Record<Bypass, Status> = {
  'none-known': 'holding',
  partial: 'partial',
  bypassed: 'broken',
};
export const BYPASS_LABEL: Record<Bypass, string> = {
  'none-known': 'No known bypass',
  partial: 'Partially bypassed',
  bypassed: 'Bypassed',
};

export const EVENT_KINDS = ['release', 'break', 'deobfuscator', 'challenge', 'patch', 'leak', 'shutdown', 'note'] as const;
export type EventKind = (typeof EVENT_KINDS)[number];
export const EVENT_LABEL: Record<EventKind, string> = {
  release: 'Release',
  break: 'Broken',
  deobfuscator: 'New tool',
  challenge: 'Challenge',
  patch: 'Patched',
  leak: 'Leak',
  shutdown: 'Shutdown',
  note: 'Note',
};
