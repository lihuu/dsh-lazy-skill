# dsh-lazy-skill npm Release Hardening Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Turn the current TypeScript checkout into a tested, prebuilt, self-activating DeepSeek Harness npm bundle without adding a JavaScript bundler or changing to stateful catalog activation.

**Architecture:** Keep the existing `SkillProvider` integration and compile it with `tsc`. Harden box discovery and root expansion so each child retains its identity and resource base, then package the emitted files, boxes, and Cordis patch as one Harness bundle. Verify source behavior, exact archive contents, isolated profile installation, and one real installed invocation as separate evidence layers.

**Tech Stack:** Node.js 22/24, TypeScript ESM/NodeNext, Node's built-in test runner, npm archive tooling, Cordis, DeepSeek Harness skill/tool services, Schemastery, YAML.

**Spec:** `docs/superpowers/specs/2026-08-30-npm-release-hardening-design.md`

## Global Constraints

- Preserve the public array form `loadSubskills: [name, ...]` and add `loadSubskills: true` for all immediate children.
- Do not add session state or dynamically mutate `<available_skills>` in this release.
- Do not bundle or minify JavaScript; Harness/Cordis imports remain bare external imports.
- Publish prebuilt `lib/`; npm registry consumers must not need TypeScript or an install-script allowance.
- Keep Git checkout installation supported through `prepare`.
- Do not publish `src/`, local debug boxes, caches, logs, or tarballs.
- Do not publish to npm as part of this plan.
- Preserve unrelated changes if the worktree stops being clean during execution.

---

## File Map

- Modify `src/box.ts`: retain physical directory/path identity, sort discovery,
  and expose enough data for correct child resources.
- Modify `src/index.ts`: validate catalogs and expansion metadata, render
  canonical child blocks, and use child-specific paths/resource bases.
- Create `tests/box.test.mjs`: parsing/discovery regression tests against built
  `lib/box.js`.
- Create `tests/plugin.test.mjs`: provider/tool behavior tests against built
  `lib/index.js`; this is explicitly a plugin unit seam, not a Harness smoke.
- Modify `package.json`: correct dependency ownership, emitted type exports,
  bundle metadata, scripts, engine range, and archive allowlist.
- Create `package-lock.json`: reproducible npm development dependency graph.
- Create `cordis.patch.yml`: default Harness bundle activation row.
- Modify `README.md`: accurate catalog/body model, npm-first installation,
  custom-box override, build lifecycle, and limitations.
- Modify `.gitignore`: exclude generated package archives and test artifacts.
- Create `.github/workflows/ci.yml`: build and unit tests on supported Node
  release lines; no publish job.

### Task 1: Establish deterministic box identity and discovery tests

**Files:**
- Modify: `src/box.ts`
- Create: `tests/box.test.mjs`
- Modify: `package.json`

**Interfaces:**
- Produces: `ParsedSkill.dir: string` and `ParsedSkill.path: string`, where
  `dir` is the physical directory name and `path` is the absolute skill
  directory.
- Preserves: `parseSkillFile(raw: string): ParsedSkill | undefined` for callers
  that parse standalone text by allowing discovery to attach physical identity.
- Produces: `discoverBoxes(boxesDir: string): Promise<Box[]>` with boxes and
  children sorted by directory name.

- [ ] **Step 1: Add the build-before-test script**

  Change the script surface to include:

  ```json
  {
    "scripts": {
      "build": "tsc -p tsconfig.json",
      "test": "npm run build && node --test tests/*.test.mjs",
      "prepare": "npm run build"
    }
  }
  ```

- [ ] **Step 2: Write failing discovery tests**

  In `tests/box.test.mjs`, use `node:test`, `node:assert/strict`,
  `mkdtemp`, and `writeFile` to prove:

  ```js
  test('discovery keeps frontmatter name separate from the physical directory', async () => {
    const boxes = await discoverBoxes(fixtureRoot)
    assert.equal(boxes[0].subs[0].name, 'friendly-name')
    assert.equal(boxes[0].subs[0].dir, 'physical-dir')
    assert.equal(boxes[0].subs[0].path, join(fixtureRoot, 'box-a', 'physical-dir'))
  })

  test('discovery order is deterministic', async () => {
    const boxes = await discoverBoxes(fixtureRoot)
    assert.deepEqual(boxes.map(box => box.dir), ['box-a', 'box-z'])
    assert.deepEqual(boxes[0].subs.map(sub => sub.dir), ['sub-a', 'sub-z'])
  })
  ```

  Also cover valid CRLF frontmatter, invalid YAML, and missing required
  `name`/`description`.

- [ ] **Step 3: Run the focused test and confirm the regression is visible**

  Run:

  ```sh
  npm run build
  node --test --test-name-pattern='physical directory|deterministic' tests/box.test.mjs
  ```

  Expected: failure because `ParsedSkill` has no physical `dir`/`path` and
  discovery preserves filesystem enumeration order.

- [ ] **Step 4: Implement physical identity and sorting**

  Keep frontmatter parsing independent, then attach filesystem identity during
  discovery. Sort directory entries before reading them. The resulting object
  shape must be equivalent to:

  ```ts
  export interface ParsedSkill {
    readonly dir: string
    readonly path: string
    readonly name: string
    readonly description: string
    readonly whenToUse?: string
    readonly content: string
    readonly metadata: Readonly<Record<string, unknown>>
  }
  ```

  If keeping `parseSkillFile()` callable without a path would force fake empty
  strings, split the frontmatter-only shape into `ParsedSkillSource` and add a
  discovery-only `DiscoveredSkill extends ParsedSkillSource` with `dir` and
  `path`. Do not manufacture placeholder paths.

- [ ] **Step 5: Run all current tests**

  Run `npm test`.

  Expected: all discovery and parser tests pass.

- [ ] **Step 6: Commit the independently testable discovery change**

  ```sh
  git add package.json src/box.ts tests/box.test.mjs
  git commit -m "fix: preserve lazy skill directory identity"
  ```

### Task 2: Make bundle expansion faithful and fail loud

**Files:**
- Modify: `src/index.ts`
- Create: `tests/plugin.test.mjs`

**Interfaces:**
- Produces: `resolveExpandedSubskills(box: Box): readonly DiscoveredSkill[] | undefined`.
- Produces: `renderExpandedSubskills(skills: readonly DiscoveredSkill[]): string`.
- Consumes: child `dir` and `path` from Task 1.
- Preserves: root without `loadSubskills` returns its own unmodified body.

- [ ] **Step 1: Write a context capture helper and failing visibility tests**

  The test helper captures the provider and tools registered by `apply()`:

  ```js
  function capturePlugin() {
    let provider
    const tools = new Map()
    const ctx = {
      logger: { info() {} },
      skills: { registerProvider(factory) { provider = factory({}) } },
      tools: { register(tool) { tools.set(tool.name, tool) } },
    }
    return { ctx, tools, provider: () => provider }
  }
  ```

  Add assertions that the root is `modelInvocable: true`, children are
  `modelInvocable: false` and `userInvocable: true`, and a child candidate's
  `path` plus `resourceBase.path` point to its physical child directory.

- [ ] **Step 2: Write failing expansion tests**

  Add cases for:

  ```js
  test('loadSubskills true expands every child in deterministic order', async () => {
    assert.match(definition.content, /<skill_content name="child-a">/)
    assert.match(definition.content, /<skill_content name="child-b">/)
    assert.ok(definition.content.indexOf('child-a') < definition.content.indexOf('child-b'))
  })

  test('loadSubskills array preserves declared order and omits the root body', async () => {
    assert.ok(definition.content.indexOf('child-b') < definition.content.indexOf('child-a'))
    assert.doesNotMatch(definition.content, /ROOT BODY SENTINEL/)
  })

  test('each expanded child carries its own resource hint', async () => {
    assert.match(definition.content, /physical-child-a/)
    assert.match(definition.content, /physical-child-b/)
  })
  ```

  Use the actual `renderSkillContent` output contract from
  `@deepseek-ai/dsh-skill`; do not invent a second wrapper format.

- [ ] **Step 3: Write failing validation tests**

  Assert descriptive rejection for:

  - `loadSubskills` with a type other than `true` or `string[]`;
  - an empty/non-string list entry;
  - a referenced child that does not exist;
  - duplicate root/child names inside this provider's discovered catalog.

  Assert that the error names the box, bad value, and conflicting or missing
  skill name.

- [ ] **Step 4: Run the plugin tests and confirm the current behavior fails**

  Run:

  ```sh
  npm run build
  node --test --test-name-pattern='loadSubskills|resource hint|duplicate' tests/plugin.test.mjs
  ```

  Expected: failures because `true` is unsupported, child bodies are joined by
  anonymous separators, child resource bases point at the box root, and invalid
  references are skipped.

- [ ] **Step 5: Implement one catalog-loading boundary**

  Add a private helper used by provider `list`, provider `get`,
  `skill_browse`, and `skill_load` so every entry point sees the same validated
  snapshot. It must reject duplicate skill names before any first-match search.

  Implement the selection rule:

  ```ts
  function resolveExpandedSubskills(box: Box): readonly DiscoveredSkill[] | undefined {
    const declared = box.root.metadata.loadSubskills
    if (declared === undefined) return undefined
    if (declared === true) return box.subs
    if (!Array.isArray(declared)) throw invalidLoadSubskills(box, declared)
    return declared.map(name => resolveDeclaredSubskill(box, name))
  }
  ```

  Reject duplicates in the declared list; do not silently deduplicate because
  repeated instruction bodies waste context and usually indicate a typo.

- [ ] **Step 6: Render child definitions with the Harness canonical helper**

  Import `renderSkillContent` as a runtime value from
  `@deepseek-ai/dsh-skill` and render each selected child with:

  ```ts
  renderSkillContent({
    name: sub.name,
    provider: name,
    resourceBase: { kind: 'directory', path: sub.path },
    content: sub.content,
  })
  ```

  Return metadata that records the exact expanded names, for example
  `_expandedSubskills: ['child-a', 'child-b']`, rather than storing child bodies
  in metadata.

- [ ] **Step 7: Remove obsolete path reconstruction**

  Delete helpers that join a frontmatter name back onto the filesystem. Use the
  discovered physical `path` for candidates and definitions. Root resource base
  remains the box directory; child resource base is the child directory.

- [ ] **Step 8: Run the complete unit suite**

  Run `npm test`.

  Expected: all parser, discovery, provider, expansion, validation, browse, and
  load tests pass.

- [ ] **Step 9: Commit the expansion contract**

  ```sh
  git add src/index.ts tests/plugin.test.mjs
  git commit -m "fix: preserve subskill identity during bundle expansion"
  ```

### Task 3: Convert the package into a self-activating Harness bundle

**Files:**
- Modify: `package.json`
- Create: `cordis.patch.yml`
- Create: `package-lock.json`
- Modify: `.gitignore`

**Interfaces:**
- Produces: npm entry `dsh-lazy-skill` with ESM default export surface from
  `lib/index.js` and declarations from `lib/index.d.ts`.
- Produces: Harness bundle layer `./cordis.patch.yml`.
- Consumes: the runtime import graph in `src/index.ts` and `src/box.ts`.

- [ ] **Step 1: Add an activation patch**

  Create `cordis.patch.yml`:

  ```yaml
  - insert:
      - id: dsh-lazy-skill
        name: dsh-lazy-skill
  ```

- [ ] **Step 2: Rewrite dependency ownership and public entry metadata**

  Update `package.json` to contain these essential fields:

  ```json
  {
    "type": "module",
    "main": "./lib/index.js",
    "types": "./lib/index.d.ts",
    "exports": {
      ".": {
        "types": "./lib/index.d.ts",
        "default": "./lib/index.js"
      }
    },
    "engines": {
      "node": "^22.19.0 || >=24.0.0"
    },
    "files": [
      "lib/**/*.js",
      "lib/**/*.d.ts",
      "boxes",
      "cordis.patch.yml",
      "README.md",
      "LICENSE"
    ],
    "dsh": {
      "bundle": {
        "patch": "./cordis.patch.yml"
      }
    },
    "peerDependencies": {
      "@deepseek-ai/cordis": "^4.0.1",
      "@deepseek-ai/dsh-skill": "^0.1.1-rc.2",
      "@deepseek-ai/dsh-tools": "^0.1.1-rc.2"
    },
    "dependencies": {
      "@deepseek-ai/schemastery": "^3.18.1",
      "yaml": "^2.4.2"
    },
    "devDependencies": {
      "@deepseek-ai/cordis": "^4.0.1",
      "@deepseek-ai/dsh-skill": "^0.1.1-rc.2",
      "@deepseek-ai/dsh-tools": "^0.1.1-rc.2",
      "@types/node": "^22.20.0",
      "typescript": "^6.0.3"
    }
  }
  ```

  Remove `@deepseek-ai/dsh-tool-skill`, `@deepseek-ai/dsh-llm`, and
  `@deepseek-ai/dsh-scope`: this package neither imports them nor injects their
  services. Add `repository`, `homepage`, and `bugs` URLs derived from the
  existing `origin` repository.

- [ ] **Step 3: Install from the declared manifest and generate the lockfile**

  Run `npm install`.

  Expected: `package-lock.json` is generated, direct dependencies are owned by
  this package, and peer packages are available for compilation through the
  mirrored development dependencies.

- [ ] **Step 4: Build from the clean dependency graph**

  Run:

  ```sh
  npm run build
  node -e "import('./lib/index.js').then(m => { if (m.name !== 'dsh-lazy-skill') process.exit(1) })"
  ```

  Expected: TypeScript emits `lib/index.js`, `lib/box.js`, and their `.d.ts`
  files; the emitted public entry imports successfully.

- [ ] **Step 5: Extend generated-artifact ignores**

  Add `*.tgz`, `coverage/`, and test scratch directories to `.gitignore`. Do
  not ignore `package-lock.json`, `cordis.patch.yml`, or packaged boxes.

- [ ] **Step 6: Commit the package boundary**

  ```sh
  git add package.json package-lock.json cordis.patch.yml .gitignore
  git commit -m "build: package plugin as a Harness bundle"
  ```

### Task 4: Make the documentation match the actual Harness mechanism

**Files:**
- Modify: `README.md`
- Modify: `boxes/dsh-lazy-skill-guides/SKILL.md`
- Modify: `boxes/dsh-lazy-skill-guides/install-plugin/SKILL.md`
- Modify: `boxes/dsh-lazy-skill-guides/create-bundle/SKILL.md`
- Modify: `boxes/dsh-lazy-skill-guides/bundle-from-skills/SKILL.md`
- Modify: `boxes/dsh-lazy-skill-guides/fix-frontmatter/SKILL.md`

**Interfaces:**
- Documents: one root summary in the model catalog, hidden child summaries,
  root-body versus expanded-child behavior, npm installation, and custom
  `boxesDir` override.
- Preserves: local checkout and Git install guidance as secondary development
  paths.

- [ ] **Step 1: Correct the motivation language**

  Replace claims that all installed skill bodies are automatically in context
  with the precise cost: a flat set of model-invocable skill names and
  descriptions expands `<available_skills>` on each relevant prompt, while a
  loaded body enters context only after tool or slash invocation.

- [ ] **Step 2: Document the exact activation semantics**

  State explicitly:

  - root invocation returns one composite skill definition;
  - children do not become new model-visible catalog rows after activation;
  - `loadSubskills: true` selects all children;
  - `loadSubskills: [a, b]` selects only `a` and `b` in that order;
  - the root body is ignored whenever either expansion form is present;
  - children remain directly user-invocable, and `skill_load` is the model tool
    for exact hidden-child loading.

- [ ] **Step 3: Make npm installation the primary path**

  Use:

  ```sh
  dsh plugin --profile web add dsh-lazy-skill
  dsh --profile web --dump-config
  ```

  Explain that the second command must show a `dsh-lazy-skill` layer and that a
  running profile must be restarted after bundle membership changes.

- [ ] **Step 4: Document a custom boxes override**

  Show a later profile patch that replaces the inserted row with the same
  `id`/`name` and an absolute `boxesDir`. Warn that Harness patch rows replace
  complete config values instead of deep-merging them.

- [ ] **Step 5: Update the shipped guide box**

  Ensure its installation/build descriptions agree with the npm bundle, and
  either retain the explicit four-name list as the selective example or change
  it to `loadSubskills: true` as the all-children example. Tests must assert the
  chosen example loads all shipped guides.

- [ ] **Step 6: Verify documentation references and examples**

  Run:

  ```sh
  rg -n "not on npm|profiles/node_modules/@local|whole group's instructions|loadSubskills" README.md boxes
  npm test
  ```

  Expected: no stale “not on npm” or manual-symlink primary instructions; all
  `loadSubskills` examples match the implemented schema; tests remain green.

- [ ] **Step 7: Commit the documented contract**

  ```sh
  git add README.md boxes/dsh-lazy-skill-guides
  git commit -m "docs: describe npm bundle and lazy loading contract"
  ```

### Task 5: Verify the exact npm archive

**Files:**
- Create: `tests/package.test.mjs`
- Modify: `package.json`

**Interfaces:**
- Produces: automated manifest assertions plus a human-readable archive
  inventory at the release gate.

- [ ] **Step 1: Write package-contract tests**

  Add assertions that read `package.json` and verify:

  ```js
  assert.equal(pkg.dsh.bundle.patch, './cordis.patch.yml')
  assert.equal(pkg.exports['.'].types, './lib/index.d.ts')
  assert.equal(pkg.exports['.'].default, './lib/index.js')
  assert.ok(pkg.files.includes('boxes'))
  assert.equal(pkg.dependencies.yaml, '^2.4.2')
  assert.equal(pkg.peerDependencies['@deepseek-ai/dsh-tools'], '^0.1.1-rc.2')
  ```

  Also assert that every bare runtime import found in `src/*.ts` is represented
  by `dependencies` or `peerDependencies`; Node built-ins are exempt.

- [ ] **Step 2: Run all automated tests**

  Run `npm test`.

  Expected: all package and behavior tests pass.

- [ ] **Step 3: Build and inspect an actual tarball**

  Run:

  ```sh
  lazy_pack_dir="$(mktemp -d)"
  npm pack --json --pack-destination "$lazy_pack_dir"
  tar -tf "$lazy_pack_dir/dsh-lazy-skill-0.1.0.tgz"
  ```

  Expected inventory includes `package/lib/index.js`, `package/lib/box.js`,
  both declarations, `package/cordis.patch.yml`, all five shipped
  `boxes/dsh-lazy-skill-guides/**/SKILL.md` files, README, LICENSE, and
  `package.json`.

- [ ] **Step 4: Reject archive noise and source leakage**

  Run:

  ```sh
  tar -tf "$lazy_pack_dir/dsh-lazy-skill-0.1.0.tgz" | rg '(^|/)(src|node_modules|coverage)/|\.DS_Store$|\.log$|\.tgz$' && exit 1 || true
  ```

  Expected: no matching archive entry.

- [ ] **Step 5: Commit the package gate**

  ```sh
  git add tests/package.test.mjs package.json
  git commit -m "test: verify npm package contract"
  ```

### Task 6: Run an isolated real-Harness install smoke

**Files:**
- No repository files are modified by this task.

**Interfaces:**
- Consumes: the tarball from Task 5 and the local Harness checkout at
  `/Users/lihu/git/deepseek-harness`.
- Produces: command evidence for bundle activation, installed entry resolution,
  and an authenticated root-skill invocation.

- [ ] **Step 1: Rebuild the archive in a dedicated smoke root**

  Run:

  ```sh
  lazy_smoke_root="$(mktemp -d /private/tmp/dsh-lazy-skill-smoke.XXXXXX)"
  lazy_pack_dir="$lazy_smoke_root/pack"
  lazy_test_home="$lazy_smoke_root/home"
  mkdir -p "$lazy_pack_dir" "$lazy_test_home"
  npm pack --json --pack-destination "$lazy_pack_dir"
  ```

  Expected: the task owns one uniquely prefixed temporary root and does not
  depend on shell variables left behind by Task 5.

- [ ] **Step 2: Initialize a fresh Harness profile**

  Run:

  ```sh
  DSH_HOME="$lazy_test_home" pnpm --dir /Users/lihu/git/deepseek-harness dsh --profile headless --dump-default-config >/dev/null
  ```

  Expected: the isolated `headless` profile is created without reading the
  user's normal `~/.dsh` state.

- [ ] **Step 3: Install the built tarball through the real plugin command**

  Run:

  ```sh
  DSH_HOME="$lazy_test_home" pnpm --dir /Users/lihu/git/deepseek-harness dsh plugin --profile headless add "$lazy_pack_dir/dsh-lazy-skill-0.1.0.tgz"
  ```

  Expected: the profile dependency and `dsh.profile.bundles` both contain
  `dsh-lazy-skill`; no build-script allowlist is requested because the tarball
  contains prebuilt output.

- [ ] **Step 4: Prove the installed layer is composed**

  Run:

  ```sh
  DSH_HOME="$lazy_test_home" pnpm --dir /Users/lihu/git/deepseek-harness dsh --profile headless --dump-config | rg 'dsh-lazy-skill'
  ```

  Expected: the bundle layer and inserted plugin row are present.

- [ ] **Step 5: Prove imports resolve from the installed package**

  Run:

  ```sh
  node --input-type=module -e "const m = await import('file://$lazy_test_home/profiles/headless/node_modules/dsh-lazy-skill/lib/index.js'); if (m.name !== 'dsh-lazy-skill') process.exit(1)"
  ```

  Expected: the installed entry imports and exports the correct plugin name.
  Record this only as installed-entry resolution, not as proof of Harness
  invocation.

- [ ] **Step 6: Run one authenticated installed invocation**

  With a valid DeepSeek credential available to the isolated process, run:

  ```sh
  DSH_HOME="$lazy_test_home" pnpm --dir /Users/lihu/git/deepseek-harness dsh --profile headless $'/dsh-lazy-skill-guides\nUse the loaded guide bundle and list the child skill names.'
  ```

  Expected: the real headless agent completes successfully after the installed
  root slash invocation; output identifies the shipped child guides. If no
  credential is available, mark this one layer `not run -- authentication
  unavailable`; do not replace it with the unit-test context capture.

- [ ] **Step 7: Remove only the validated temporary smoke root**

  Run:

  ```sh
  case "$lazy_smoke_root" in
    /private/tmp/dsh-lazy-skill-smoke.*) rm -rf -- "$lazy_smoke_root" ;;
    *) echo "refusing unexpected smoke root: $lazy_smoke_root" >&2; exit 1 ;;
  esac
  ```

  Expected: only the uniquely prefixed disposable profile/package root is
  removed.

### Task 7: Add CI and perform the final release-readiness review

**Files:**
- Create: `.github/workflows/ci.yml`
- Modify: `README.md` only if the validated command differs from its documented
  command.

**Interfaces:**
- Produces: source verification on Node 22 and Node 24.
- Does not produce: npm publication, tags, GitHub Releases, or credentials.

- [ ] **Step 1: Add a minimal CI matrix**

  Configure checkout plus `npm ci` and `npm test` for Node `22` and `24`. Add a
  single Node 24 archive job that runs `npm pack --dry-run --json` and retains
  the JSON in logs. Do not add an npm publish job or token permission.

- [ ] **Step 2: Run the same clean-install path locally**

  Run:

  ```sh
  npm ci
  npm test
  npm pack --dry-run --json
  ```

  Expected: clean dependency installation, passing tests, and an archive list
  matching Task 5.

- [ ] **Step 3: Re-freeze repository state**

  Run:

  ```sh
  git status --short --branch
  git diff --check
  git diff --stat origin/main...HEAD
  ```

  Expected: only planned files changed, no whitespace errors, and no untracked
  generated `lib/`, archive, cache, or smoke-profile files.

- [ ] **Step 4: Review the full shipped surface**

  Re-read `package.json`, `cordis.patch.yml`, emitted exports, every archive
  entry, README install commands, and the exact isolated-smoke output. Treat
  unit tests, archive checks, composition checks, and real invocation as four
  separate rows in the release report.

- [ ] **Step 5: Commit CI only after local equivalence is proven**

  ```sh
  git add .github/workflows/ci.yml README.md
  git commit -m "ci: verify supported Node release lines"
  ```

- [ ] **Step 6: Stop before publication**

  Report the final commit hash, worktree status, test output, tarball inventory,
  isolated install result, and whether the authenticated invocation ran. Do not
  run `npm publish`, create a tag, or push unless the user separately requests
  those actions.

## Deferred Follow-up: True Session-Scoped Catalog Activation

Do not implement this in the release-hardening branch. If the desired contract
is “after invoking a root, its children appear as ordinary model-invocable
entries in the next `<available_skills>` catalog,” first write a separate design
covering:

- the activation key (`Agent` scope/session versus cwd/profile);
- how `SkillLookupOptions.scope` reaches provider `list()` and `get()`;
- activation from default `skill`, direct slash, and custom `skill_load` paths;
- catalog update timing on the same versus next model step;
- reset/disposal behavior and `/new`/resume/process-restart semantics;
- whether root expansion still injects every child body or only unlocks catalog
  entries;
- duplicate names and interaction with other providers/ranks;
- the intentional KV-prefix invalidation when the catalog changes.

That feature should have a Harness-level integration test because a provider
unit seam cannot prove session catalog updates.
