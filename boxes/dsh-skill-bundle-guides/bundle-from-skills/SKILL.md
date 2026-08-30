---
name: bundle-from-skills
description: "Pack a user-supplied set of skills into a new dsh-skill-bundle bundle box."
---

When the user gives you a set of skills and asks you to pack them into a bundle:

1. Decide the bundle name (kebab-case) and where to place it (default the
   installed package's `boxes/` directory, else an absolute `boxesDir` from the
   patch config).
2. If there is no obvious single "root" skill, synthesize a short root
   `SKILL.md` whose frontmatter declares `loadSubskills` listing every packed
   sub-skill (so the whole bundle loads on demand), or `loadSubskills: true`
   for every sub-skill, or omit it if the user wants model-decided loading.
3. Put each provided skill into its own sibling `<name>/SKILL.md` sub-directory.
   Ensure every file has `name` + `description` frontmatter.
4. Preserve each skill's body; only normalize frontmatter (quote any
   comma/colon-heavy values).
5. Sanity-check: every listed `loadSubskills` entry matches an existing
   sub-skill name — the plugin rejects unknown or duplicate names.
6. Report the resulting tree and how many sub-skills were packed.