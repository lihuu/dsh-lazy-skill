# dsh-lazy-skill

A plugin for [DeepSeek Harness](https://github.com/deepseek-ai/deepseek-harness)
that groups related skills into **bundle boxes**. Each box has one **root**
skill and any number of **sub-skills**; a box loads either by frontmatter
metadata (`loadSubskills`) or by letting the model decide from the body text.

It ships as a self-activating Harness **bundle**: installing the npm package
adds a patch layer that inserts the plugin row, so no manual patching or
symlinking is needed.

---

## Why it exists

Harness already lets a model load skills on demand, which works well for a few
unrelated skills. A **family of related skills** — a toolchain, a phased
workflow, a project with several sub-tasks — has a real cost under the naive
approach:

> Every installed skill contributes a model-invocable name and description to
> the `<available_skills>` catalog on each relevant prompt. A group installed
> as flat siblings therefore expands that catalog (and the prompt budget it
> consumes) even when the current task never touches the group. A loaded skill
> body only enters context after a tool or slash invocation, but the summaries
> of every sibling are always present — wasting tokens, bloating the context
> window, breaking KV-cache reuse, and slowing every turn.

Two symptoms follow:

1. **Context pollution** — unrelated groups still consume prompt budget through
   their catalog summaries.
2. **Unnecessary questions** — with many sibling summaries in-context, the model
   drifts into asking which piece to use instead of just working.

`dsh-lazy-skill` makes loading **explicit and on-demand**:

- A group (a **bundle box**) is exposed as one small root skill.
- Its sub-skills are **not** catalogued up front. They load only when the box
  is pulled in via `loadSubskills` — and then only the ones listed.
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
  | `loadSubskills: true` | every sub-skill body, in directory order (root body ignored) |
  | `loadSubskills: [a, b]` | sub-skill `a` + `b` bodies only, in that order (root body ignored) |
  | no `loadSubskills` | root body as-is; model decides from its text |

- Each expanded sub-skill keeps its own identity and resource directory: the
  body is rendered as a `skill_content` block whose resource base is the
  child's own directory, so relative paths inside it resolve correctly.
- Invalid `loadSubskills` values fail loudly (wrong type, unknown child name,
  or a duplicate name) instead of silently producing partial content.
- **Model-facing tools**: `skill_browse` (list a box's sub-skill names —
  summaries only), `skill_load` (load one or more skills by exact name), plus
  the standard `skill` tool for root invocation.
- **No framework changes** — a plain Cordis plugin.

---

## Requirements

- A working DeepSeek Harness installation (`dsh`), e.g. `dsh --profile web`.

---

## Install

The package is a Harness **bundle**: it declares `dsh.bundle` and ships a
prebuilt `lib/` plus the default `boxes/`, so no build toolchain is needed on
the installing machine.

```sh
dsh plugin --profile web add dsh-lazy-skill
dsh --profile web --dump-config
```

The second command must show a `dsh-lazy-skill` layer. A running profile must
be restarted after bundle membership changes.

### Using your own boxes

By default the plugin resolves boxes beside its installed package (`boxes/`).
To point it at your own directory, add a later patch row (profile or home
level) that replaces the inserted row with the same `id`/`name` and an
absolute `boxesDir`:

```yaml
- insert:
    - id: dsh-lazy-skill
      name: dsh-lazy-skill
      config:
        boxesDir: /absolute/path/to/your/boxes
```

Harness patch rows replace complete config values instead of deep-merging them,
so re-state every field you need.

### Building from source (developers)

```sh
npm install        # installs typescript + dev dependencies
npm run build      # tsc compiles src/ -> lib/
npm test           # build + node --test tests/*.test.mjs
```

`lib/` and `node_modules/` are git-ignored; they are rebuilt, not committed.

---

## Activation semantics

- Each box contributes **one** model-invocable root candidate.
- Child candidates stay hidden from the model catalog (`modelInvocable:
  false`) and remain directly user-invocable through Harness slash invocation.
- A root with no `loadSubskills` returns its own body unchanged.
- `loadSubskills: true` expands every immediate child in deterministic
  (directory-name) order.
- `loadSubskills: [name, ...]` expands exactly those children in the declared
  order and ignores the root body.
- Children do **not** become new model-visible catalog rows after activation;
  `skill_load` is the model tool for exact hidden-child loading.

---

## Creating a skill bundle

A box is just a directory. For example the shipped `dsh-lazy-skill-guides` box:

```
boxes/
  dsh-lazy-skill-guides/
    SKILL.md              # root skill
    install-plugin/SKILL.md
    create-bundle/SKILL.md
    bundle-from-skills/SKILL.md
    fix-frontmatter/SKILL.md
```

Every `SKILL.md` needs `name` + `description` in its frontmatter:

```markdown
---
name: dsh-lazy-skill-guides
description: "Guides for using this plugin."
loadSubskills:          # optional: auto-load these sub-skills
  - install-plugin
  - create-bundle
  - bundle-from-skills
  - fix-frontmatter
---

Body text (ignored when loadSubskills is present).
```

Sub-skills are ordinary skills too:

```markdown
---
name: install-plugin
description: "How to install dsh-lazy-skill."
---

How to install the plugin...
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

## License

[MIT](./LICENSE)