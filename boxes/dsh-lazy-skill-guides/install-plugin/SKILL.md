---
name: install-plugin
description: 'How to install dsh-lazy-skill into a DeepSeek Harness profile (npm bundle install, or a source checkout for development).'
---

If asked to install dsh-lazy-skill, follow these steps:

1. **Preferred — npm bundle.** The package declares `dsh.bundle` and ships
   prebuilt `lib/` plus the default `boxes/`, so `dsh plugin add` activates it
   as a Harness layer with no build step:

   ```
   dsh plugin --profile <name> add dsh-lazy-skill
   dsh --profile <name> --dump-config
   ```

   The dump must show a `dsh-lazy-skill` layer. Restart the running profile
   after the bundle membership change.

2. **Development — source checkout.** Clone (or copy) the repository, then
   build it before use:

   ```
   cd /path/to/dsh-lazy-skill
   npm install && npm run build
   ```

   Install the checkout as a Harness plugin by adding a patch row that mounts
   it by module name, with an absolute `boxesDir` if the packaged boxes are not
   the ones to use.

3. **Custom boxes.** By default the plugin uses the boxes shipped beside the
   installed package. To use your own, add a later patch row with the same
   `id`/`name` and an absolute `boxesDir`; patch rows replace complete config
   values, so re-state every field you need.

4. Verify: the box root skills appear in the skill slash menu, and
   `skill_browse` lists their sub-skills.