---
name: install-plugin
description: 'How to install dsh-lazy-skill into a DeepSeek Harness setup (place under $DSH_HOME, symlink into the shared modules dir, and add a cordis.patch.yml row).'
---

If asked to install dsh-lazy-skill, follow these steps:

1. Resolve the harness home (default `~/.dsh`, or `$DSH_HOME` if set).
2. Put the plugin directory at `$DSH_HOME/plugins/dsh-lazy-skill` (clone, copy,
   or symlink).
3. Symlink it into the shared modules dir so the Loader can import it:

   ```
   mkdir -p "$DSH_HOME/profiles/node_modules/@local"
   ln -s "$DSH_HOME/plugins/dsh-lazy-skill" "$DSH_HOME/profiles/node_modules/@local/dsh-lazy-skill"
   ```

4. Add a patch row. For all profiles, append an `insert` to
   `$DSH_HOME/cordis.patch.yml`:

   ```yaml
   - insert:
       - id: dsh-lazy-skill
         name: '@local/dsh-lazy-skill'
         config:
           boxesDir: "$DSH_HOME/plugins/dsh-lazy-skill/boxes"
   ```

   For one profile only, put the same `insert` in
   `$DSH_HOME/profiles/<name>/cordis.patch.yml` instead.

5. If the plugin is a source checkout (has `src/` but no `lib/`), build it first:

   ```
   cd "$DSH_HOME/plugins/dsh-lazy-skill"
   npm install && npm run build
   ```

6. Restart (or reload) the running `dsh` server so the new plugin row applies.
   Verify: the box root skills appear in the skill slash menu, and `skill_browse`
   lists their sub-skills.
