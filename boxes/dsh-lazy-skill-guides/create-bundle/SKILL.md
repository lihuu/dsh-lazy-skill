---
name: create-bundle
description: "How to create a new dsh-lazy-skill bundle box from scratch."
---

To create a new bundle box under `$DSH_HOME/plugins/dsh-lazy-skill/boxes/`:

1. Create a directory named after the box:
   `boxes/<box>/`
2. Write `boxes/<box>/SKILL.md` with frontmatter `name` (kebab-case) and
   `description`. Add `loadSubskills` listing every sub-skill if the box should
   auto-load them all on load; omit it to have the model read the body instead.
3. For each sub-skill, create a sibling sub-directory with its own `SKILL.md`
   (needs `name` + `description`).
4. Nothing is a runtime registration — the plugin scans `boxes/`, so changes
   are picked up on reload/restart. `boxesDir` in the patch config decides which
   directory is scanned.

Frontmatter values with a comma next to a colon (e.g. `a, b, c`) must be quoted.
Always quote `description` unless it is a short bare word.
