# The Lab

Our own benchmark corpus. Each script is written by us and prints a deterministic
trace (`expected.txt`). Obfuscated and deobfuscated versions must print exactly the
same thing under the official [Luau CLI](https://github.com/luau-lang/luau/releases).

```
lab/
├── corpus/<sample>/          source.luau, expected.txt, meta.yaml
├── runs/<sample>/<obfuscator>@<version>/
│   ├── meta.yaml             settings, date, by
│   ├── obfuscated.luau
│   └── deob/<deobfuscator>@<version>/
│       ├── meta.yaml
│       └── output.luau
├── harness/run.ts            executes every stage, writes results.json
└── results.json              committed; CI checks it is current
```

## Adding a run

1. Obfuscate `corpus/<sample>/source.luau` with the obfuscator's **current** version.
2. Save it as `runs/<sample>/<obfuscator-slug>@<version>/obfuscated.luau` with a `meta.yaml`.
   The slug and version must exist in `src/data/obfuscators/<slug>.yaml`.
3. Run each deobfuscator that claims support. Save its output as
   `runs/<sample>/<obfuscator>@<version>/deob/<deobfuscator-slug>@<tool-version>/output.luau`.
4. Get the Luau CLI: put `luau` on your `PATH`, set `LUAU_BIN`, or unzip a release into `lab/.bin/`.
5. Run `pnpm lab:verify`, then commit everything including `results.json`.

## Rules

- Only scripts from `corpus/` are ever obfuscated. Never commit third-party scripts.
- Third-party tools are run **locally** by maintainers and never in CI. CI only executes
  the committed `.luau` files with the Luau CLI, with a timeout.
- Corpus output must be deterministic: no timestamps, no addresses, no `os.clock()`.

## Adding a corpus sample

Create `corpus/<id>/source.luau` and `meta.yaml` (`title`, `description`, `exercises`,
`order`), then generate `expected.txt` with `luau source.luau > expected.txt` and
double-check that it is deterministic.
