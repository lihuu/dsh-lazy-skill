---
name: create-bundle
description: "How to create a new dsh-skill-bundle bundle box from scratch."
---

To create a new bundle box under a boxes root (the installed package's `boxes/`,
or an absolute `boxesDir` from the patch config):

1. Create a directory named after the box: `boxes/<box>/`.
2. Write `boxes/<box>/SKILL.md` with frontmatter `name` (kebab-case) and
   `description`. To auto-load children when the root is invoked, add either
   `loadSubskills: true` (every sub-skill, in directory order) or a list such
   as `loadSubskills: [a, b]` (exactly those, in that order); omit it to have
   the model read the root body instead.
3. For each sub-skill, create a sibling sub-directory with its own `SKILL.md`
   (needs `name` + `description`). The directory name is the child's physical
   identity; it may differ from the frontmatter `name`.
4. Nothing is a runtime registration — the plugin scans the boxes root, so
   changes are picked up on reload/restart. `boxesDir` in the patch config
   decides which directory is scanned.

Frontmatter values with a comma next to a colon (e.g. `a, b, c`) must be quoted.
Always quote `description` unless it is a short bare word.