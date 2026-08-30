---
name: fix-frontmatter
description: "Fix a SKILL.md whose YAML frontmatter fails to parse (the plugin uses YAML 1.2, which rejects a value containing a comma next to a colon)."
---

If a skill's `SKILL.md` fails to parse (it does not show up in the catalog,
`skill_browse`, or the slash menu), the usual cause is YAML 1.2 rejecting a
plain scalar that looks like a "compact mapping" — a value containing a comma
next to a colon, e.g. `description: a, b, c`.

Fix it by double-quoting the value:

```yaml
# bad (YAML 1.2 may reject)
description: a, b, c: something

# good
description: "a, b, c: something"
```

Always quote `description`/`whenToUse`/`loadSubskills` values that contain
punctuation. After editing, confirm the skill appears again (reload/restart the
server if needed).
