# dsh-lazy-skill

A plugin for [DeepSeek Harness](https://github.com/deepseek-ai/deepseek-harness)
that groups related skills into **bundle boxes**. Each box has one **root**
skill and any number of **sub-skills**; a box loads either by frontmatter
metadata (`loadSubskills`) or by letting the model decide from the body text.

It is an **out-of-tree** plugin: it lives entirely under `$DSH_HOME` and never
modifies the Harness repository.

---

## Why it exists

Harness already lets a model load skills on demand, which works well for a few
unrelated skills. A **family of related skills** — a toolchain, a phased
workflow, a project with several sub-tasks — has a real cost under the naive
approach:

> Every available skill tends to get pulled into the model context on use, even
> when it is unrelated to the current task. If a session merely *has* such a
> group installed, the whole group's instructions can end up loaded even when
> the task never touches them — wasting tokens, bloating the context window,
> breaking KV-cache reuse, and slowing every turn.

Two symptoms follow:

1. **Context pollution** — unrelated groups still consume prompt budget.
2. **Unnecessary questions** — with everything in-context, the model drifts into
   asking which piece to use instead of just working.

`dsh-lazy-skill` makes loading **explicit and on-demand**:

- A group (a **bundle box**) is exposed as one small root skill.
- Its sub-skills are **not** loaded up front. They load only when the box is
  pulled in via `loadSubskills` — and then only the ones listed.
- Nothing from the group is in context until you ask for it.

You can opt out per box: without `loadSubskills`, the box returns its short root
body and the model follows that text, fine for boxes you actually want
always-present.

### Example — a "deploy" bundle

Three steps per deploy: build, push, rollback. Wrap them in one box:

```
boxes/deploy/
  SKILL.md          # root skill, frontmatter has `loadSubskills`
  build/SKILL.md
  push/SKILL.md
  rollback/SKILL.md
```

With `loadSubskills`, telling the model to **use `deploy`** loads all three
sub-skill bodies at once — it immediately has the build/push/rollback
instructions and can run the whole deploy without asking "which one?".

Without it, `deploy` returns just its short body text and the model reads and
follows that.

---

## Features

- **Bundle box** — a directory with a root `SKILL.md` plus sibling sub-skill
  directories, each with its own `SKILL.md`.
- **Two load rules**, decided by the root skill's frontmatter:

  | Root frontmatter | On load the box produces |
  |---|---|
  | `loadSubskills: [a, b]` | sub-skill `a` + `b` bodies only (root body ignored) |
  | no `loadSubskills` | root body as-is; model decides from its text |

- **Model-facing tools**: `skill` (default loader, follows the rules above),
  `skill_load` (explicitly load one or more skills by name), `skill_browse`
  (list a box's sub-skill names).
- **No framework changes** — a plain Cordis plugin.

---

## Requirements

- A working DeepSeek Harness installation (`dsh`), e.g. `dsh --profile web`.
- `boxesDir` pointing at your bundle boxes.
- Node.js to build the TypeScript source (`npm install && npm run build`).

---

## Install

The Loader resolves the plugin by module name; the plugin itself is not on npm,
so it must be reachable on disk. Two ways to mount it:

### Option A — global (all profiles)

1. Put this repository somewhere under your Harness home:

   ```sh
   mkdir -p "$DSH_HOME/plugins" && cp -r dsh-lazy-skill "$DSH_HOME/plugins/"
   ```

2. Make it resolvable under a module name the Loader can import, via a symlink
   in the shared modules dir:

   ```sh
   mkdir -p "$DSH_HOME/profiles/node_modules/@local"
   ln -s "$DSH_HOME/plugins/dsh-lazy-skill" "$DSH_HOME/profiles/node_modules/@local/dsh-lazy-skill"
   ```

3. Add a global patch (`$DSH_HOME/cordis.patch.yml`) that inserts the row:

   ```yaml
   - insert:
       - id: dsh-lazy-skill
         name: '@local/dsh-lazy-skill'
         config:
           boxesDir: "$DSH_HOME/plugins/dsh-lazy-skill/boxes"
   ```

### Option B — per profile

Put the same `insert` block into a specific profile's patch instead:
`$DSH_HOME/profiles/<name>/cordis.patch.yml`.

> The `boxesDir` in the example uses `$DSH_HOME`. The loader supports `!!js`
> expressions for such environment references; if in doubt, use a literal
> absolute path.

---

## Creating a skill bundle

A box is just a directory. For example the shipped `example-kit`:

```
$DSH_HOME/plugins/dsh-lazy-skill/boxes/
  example-kit/
    SKILL.md          # root skill
    hello/SKILL.md    # sub-skill
```

Every `SKILL.md` needs `name` + `description` in its frontmatter:

```markdown
---
name: example-kit
description: "A reference bundle box."
loadSubskills:      # optional: auto-load these sub-skills
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

Sub-skill body text.
```

---

## YAML gotcha

YAML 1.2 (used by this plugin) rejects a plain scalar that looks like a
"compact mapping". If a value — e.g. `description` — contains a comma next to a
colon (`a: x, b, c`), **wrap it in double quotes**:

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
