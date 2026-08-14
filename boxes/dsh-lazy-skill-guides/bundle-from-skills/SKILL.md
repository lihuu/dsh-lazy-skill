---
name: bundle-from-skills
description: "Pack a user-supplied set of skills into a new dsh-lazy-skill bundle box."
---

When the user gives you a set of skills and asks you to pack them into a bundle:

1. Decide the bundle name (kebab-case) and where to place it (default
   `boxes/` if working from the plugin repo, else `$DSH_HOME/plugins/dsh-lazy-skill/boxes/`).
2. If there is no obvious single "root" skill, synthesize a short root
   `SKILL.md` whose frontmatter lists every sub-skill in `loadSubskills`
   (so the whole bundle is loaded on demand) or leave `loadSubskills` omitted
   if the user wants model-decided loading.
3. Put each provided skill into its own sibling `<name>/SKILL.md` sub-directory.
   Ensure every file has `name` + `description` frontmatter.
4. Preserve each skill's body; only normalize frontmatter (quote any
   comma/colon-heavy values).
5. Sanity-check: every `loadSubskills` entry matches an existing sub-skill name.
6. Report the resulting tree and how many sub-skills were packed.
