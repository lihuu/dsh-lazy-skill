# dsh-lazy-skill

A plugin for [DeepSeek Harness](https://github.com/deepseek-ai/deepseek-harness) that
organizes groups of related skills into **bundle boxes**. Each box has one **root**
(main) skill and any number of **sub-skills**; a box is loaded either by frontmatter
metadata (`loadSubskills`) or by letting the model decide from the body text.

It is an **out-of-tree** plugin: it lives entirely in `$DSH_HOME` (your Harness home)
and does not modify the Harness repository.

---

## Features

- **Bundle box** = a directory with a root `SKILL.md` plus sibling sub-skill
  directories, each with its own `SKILL.md`.
- **Two load rules** (decided by the root skill's frontmatter):
  - `loadSubskills: [...]` → the box loads **only** those sub-skill bodies and
    **ignores the root body**. No model decision needed.
  - no `loadSubskills` → returns the root body as-is; the **model decides** what to
    load.
- **Three model-facing tools**: `skill` (default loader), `skill_load` (explicit
  load one or more skills by name), `skill_browse` (list a box's sub-skill names).
- **None of this touches the framework core** — it is a plain Cordis plugin.

---

## Requirements

- A working DeepSeek Harness setup (`dsh`), e.g. `dsh --profile web`.
- Provide `boxesDir` pointing at your bundle boxes (see below).
- Node.js for building the TypeScript source (`npm install && npm run build`).

---

## Install

The plugin is resolved by the Harness Loader through a module name. The two sane
ways to mount it:

### Option A — global (all profiles)

1. Put this repository (or a copy/symlink of it) somewhere under your Harness home,
   e.g. `$DSH_HOME/plugins/dsh-lazy-skill`.
2. Make it resolvable under a module name the Loader can import. The simplest way is
   a symlink in the shared modules dir:

   ```sh
   mkdir -p "$DSH_HOME/profiles/node_modules/@local"
   ln -s "$DSH_HOME/plugins/dsh-lazy-skill" "$DSH_HOME/profiles/node_modules/@local/dsh-lazy-skill"
   ```

3. Add a global patch (`$DSH_HOME/cordis.patch.yml`) that inserts the plugin row:

   ```yaml
   - insert:
       - id: dsh-lazy-skill
         name: '@local/dsh-lazy-skill'
         config:
           boxesDir: "$DSH_HOME/plugins/dsh-lazy-skill/boxes"
   ```

### Option B — per profile

Put the same `insert` block into a specific profile's patch
(`$DSH_HOME/profiles/<name>/cordis.patch.yml`) instead of the home-level file.

> Replace the absolute `boxesDir` with wherever you keep your bundle boxes. For
> `!!js` expressions (e.g. referencing `$DSH_HOME`) the loader supports them; use a
> literal absolute path if in doubt.

---

## Creating a skill bundle

A box is just a directory:

```
$DSH_HOME/plugins/dsh-lazy-skill/boxes/
  example-kit/
    SKILL.md                  # root skill
    hello/SKILL.md            # sub-skill
```

Every `SKILL.md` needs `name` + `description` in its frontmatter:

```markdown
---
name: example-kit
description: "A reference bundle box."
loadSubskills:          # optional: auto-load these sub-skills
  - hello
---

Body text (ignored when loadSubskills is present).
```

Sub-skills are ordinary skills too:

```markdown
---
name: hello
description: "The first sub-skill of example-kit."
---

Sub-skill A body.
```

### Rules recap

| Root frontmatter | On load the box produces |
|---|---|
| has `loadSubskills: [a, b]` | sub-skill `a` + `b` bodies only (root body ignored) |
| no `loadSubskills` | root body as-is; model decides from its text |

---

## YAML gotcha

YAML 1.2 (used by this plugin) rejects a plain scalar that looks like a "compact
mapping". If your `description` or other values contain a comma next to a colon
(e.g. `a: x, b, c`), **wrap the value in double quotes**:

```yaml
description: "a, b, c: needs quoting because of the comma/colon"
```

---

## Building from source

```sh
npm install        # installs typescript + @types/node for the build
npm run build      # tsc compiles src/ -> lib/
```

`lib/` and `node_modules/` are git-ignored; they are rebuilt, not committed.

---

## License

[MIT](./LICENSE)
