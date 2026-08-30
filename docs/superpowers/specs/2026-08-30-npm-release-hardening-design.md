# dsh-skill-bundle npm Release Hardening Design

## Problem

`dsh-skill-bundle` already demonstrates the desired bundle-box workflow, but the
repository is not yet a self-contained DeepSeek Harness bundle suitable for an
npm install:

- the package does not declare `dsh.bundle`, so `dsh plugin add` installs it as
  a plain dependency without activating a patch layer;
- the published file allowlist omits `boxes/`, although the runtime default
  resolves boxes beside the built package;
- runtime imports and host-provided imports are not classified according to
  the Harness package boundary;
- the emitted declaration entry is not exposed through `types`/conditional
  exports;
- the current README describes instruction bodies as though they were loaded
  merely because skills are installed, whereas the verified Harness behavior
  places model-invocable skill summaries in `<available_skills>` and loads a
  body only through an invocation;
- bundle expansion loses each child's identity and resource directory, and
  invalid `loadSubskills` references are silently ignored;
- there is no automated behavior test, package-content test, or isolated
  installed-package smoke test.

## Release Goal

Ship a prebuilt npm package that can be installed with
`dsh plugin --profile <name> add @lihuu/dsh-skill-bundle`, activates itself as a Harness
bundle, preserves the lazy catalog benefit, loads selected child instructions
with their ordinary skill identities/resource hints, and has repeatable source,
archive, and real-Harness verification.

## Behavioral Contract for the First npm Release

1. Each box contributes one model-invocable root candidate.
2. Child candidates remain hidden from the model catalog and remain directly
   user-invocable through Harness slash invocation.
3. A root with no `loadSubskills` returns its own body unchanged.
4. `loadSubskills: true` expands every immediate child in deterministic order.
5. `loadSubskills: [name, ...]` expands exactly those children in the declared
   order and ignores the root body, preserving the existing array behavior.
6. Every expanded child is rendered with the Harness canonical
   `<skill_content>` representation and its own child-directory resource base.
7. Invalid `loadSubskills` types, duplicate names, or missing referenced child
   names fail with actionable errors instead of producing partial content.
8. `skill_browse` reveals summaries only. `skill_load` loads full content only
   after an exact, unambiguous name match.

This release does **not** add session state or mutate the model-visible
`<available_skills>` catalog after activation. That is a distinct feature with
resume, scope, disposal, and prefix-cache consequences and requires its own
design.

## Packaging Design

Use `tsc` directly. Do not bundle or minify JavaScript. Bare imports of Harness
packages must remain external so the plugin uses the host's shared Cordis and
service identities.

Classify dependencies as follows for the currently installed Harness API
(the local checkout is `0.1.2-alpha.1`, but npm has only published up to
`0.1.1-rc.2` and the peer ranges below target the npm registry, which is what
installers resolve against):

- peer plus development dependency:
  `@deepseek-ai/cordis@^4.0.1`,
  `@deepseek-ai/dsh-skill@^0.1.1-rc.2`, and
  `@deepseek-ai/dsh-tools@^0.1.1-rc.2`;
- package-owned runtime dependency:
  `@deepseek-ai/schemastery@^3.18.1` and `yaml@^2.4.2` (both exist on npm; version ranges target the npm registry, not the local checkout);
- development-only dependency: TypeScript and Node type declarations.

The npm archive contains emitted JavaScript/declarations, `boxes/`, the bundle
patch, README, LICENSE, and package metadata. It does not contain `src/`, local
debug boxes, caches, logs, or generated tarballs.

Keep a `prepare` script that delegates to `npm run build`: it builds before npm
packing and also preserves direct Git-install support. Registry consumers
receive prebuilt `lib/` and do not build during installation.

## Harness Activation Design

Add `cordis.patch.yml` with one inserted row whose module name is
`dsh-skill-bundle`, and declare it through:

```json
{
  "dsh": {
    "bundle": {
      "patch": "./cordis.patch.yml"
    }
  }
}
```

With no row config, the packaged `boxes/` directory is the default. Users who
want external boxes override the complete row in their later profile or home
patch and set an absolute `boxesDir`.

## Verification Boundary

Three layers are required and must not be conflated:

1. Unit tests prove parsing, discovery, visibility, expansion, resource bases,
   and tool behavior against controlled inputs.
2. Archive checks prove the exact npm tarball contains every runtime artifact
   and excludes source/noise.
3. An isolated install into a fresh `DSH_HOME` proves `dsh plugin add` activates
   the bundle and the installed package resolves under the real Harness. An
   authenticated headless invocation is the final proof that the installed root
   skill is actually invoked; a fake context or direct ESM import is not a
   substitute for that result.

## Deferred Work

- Session-scoped activation that changes future `<available_skills>` entries.
- Persistence or replay of activation across `/new`, resume, or process restart.
- Filesystem watchers or discovery caches; correctness and package readiness
  come first because the current box count does not justify lifecycle state.
- Automatic npm publishing, provenance/signing, and release workflows. This
  design stops at a release-ready package and verification gate.

