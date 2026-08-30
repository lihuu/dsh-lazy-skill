import test from 'node:test'
import assert from 'node:assert/strict'
import { mkdtempSync, rmSync, writeFileSync, mkdirSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { apply } from '../lib/index.js'

function makeFixture(files) {
  const root = mkdtempSync(join(tmpdir(), 'skill-bundle-plugin-'))
  for (const [rel, content] of Object.entries(files)) {
    const abs = join(root, rel)
    mkdirSync(join(abs, '..'), { recursive: true })
    writeFileSync(abs, content)
  }
  return root
}

function skill(frontmatter, body = 'BODY') {
  return `---\n${frontmatter}\n---\n\n${body}\n`
}

function capturePlugin(config = {}) {
  let provider
  const tools = new Map()
  const ctx = {
    logger: { info() {} },
    skills: { registerProvider(factory) { provider = factory({}) } },
    tools: { register(tool) { tools.set(tool.name, tool) } },
  }
  apply(ctx, config)
  return {
    ctx,
    tools,
    list: () => provider.list({}),
    get: (candidate) => provider.get(candidate, {}),
  }
}

function fixtureSet(extra = {}) {
  return {
    'box-a/SKILL.md': skill(
      'name: root-a\ndescription: Root A body.',
      'ROOT BODY SENTINEL',
    ),
    'box-a/child-a/SKILL.md': skill('name: child-a\ndescription: Child A.', 'CHILD-A CONTENT'),
    'box-a/child-b/SKILL.md': skill('name: child-b\ndescription: Child B.', 'CHILD-B CONTENT'),
    'box-z/SKILL.md': skill('name: root-z\ndescription: Root Z body.', 'ROOT Z BODY'),
    ...extra,
  }
}

function cleanup(fixture) {
  rmSync(fixture, { recursive: true, force: true })
}

test('catalog hides children from the model and exposes their physical identity', async () => {
  const fixture = makeFixture(fixtureSet())
  try {
    const plugin = capturePlugin({ boxesDir: fixture })
    const candidates = await plugin.list()

    const rootA = candidates.find(c => c.name === 'root-a')
    assert.ok(rootA)
    assert.equal(rootA.invocation.modelInvocable, true)
    assert.equal(rootA.invocation.userInvocable, true)
    assert.equal(rootA.resourceBase.path, join(fixture, 'box-a'))

    const childA = candidates.find(c => c.name === 'child-a')
    assert.ok(childA)
    assert.equal(childA.invocation.modelInvocable, false)
    assert.equal(childA.invocation.userInvocable, true)
    // The child's own directory, never the box root.
    assert.equal(childA.path, join(fixture, 'box-a', 'child-a'))
    assert.equal(childA.resourceBase.path, join(fixture, 'box-a', 'child-a'))
  } finally {
    cleanup(fixture)
  }
})

test('loadSubskills true expands every child in deterministic order', async () => {
  const fixture = makeFixture(fixtureSet())
  try {
    const plugin = capturePlugin({ boxesDir: fixture })
    const rootA = (await plugin.list()).find(c => c.name === 'root-a')
    // Flip the fixture metadata into the true-form before loading.
    writeFileSync(
      join(fixture, 'box-a', 'SKILL.md'),
      skill('name: root-a\ndescription: Root A body.\nloadSubskills: true', 'ROOT BODY SENTINEL'),
    )
    const def = await plugin.get(rootA)
    assert.ok(def)
    assert.match(def.content, /<skill_content name="child-a">/)
    assert.match(def.content, /<skill_content name="child-b">/)
    assert.ok(def.content.indexOf('child-a') < def.content.indexOf('child-b'), 'declared order kept')
  } finally {
    cleanup(fixture)
  }
})

test('loadSubskills array preserves declared order and omits the root body', async () => {
  const fixture = makeFixture(fixtureSet())
  try {
    const plugin = capturePlugin({ boxesDir: fixture })
    const rootA = (await plugin.list()).find(c => c.name === 'root-a')
    writeFileSync(
      join(fixture, 'box-a', 'SKILL.md'),
      skill('name: root-a\ndescription: Root A body.\nloadSubskills:\n  - child-b\n  - child-a', 'ROOT BODY SENTINEL'),
    )
    const def = await plugin.get(rootA)
    assert.ok(def)
    assert.ok(def.content.indexOf('child-b') < def.content.indexOf('child-a'), 'declared order kept')
    assert.doesNotMatch(def.content, /ROOT BODY SENTINEL/)
  } finally {
    cleanup(fixture)
  }
})

test('each expanded child carries its own resource hint and content', async () => {
  const fixture = makeFixture(fixtureSet())
  try {
    const plugin = capturePlugin({ boxesDir: fixture })
    const rootA = (await plugin.list()).find(c => c.name === 'root-a')
    writeFileSync(
      join(fixture, 'box-a', 'SKILL.md'),
      skill('name: root-a\ndescription: Root A body.\nloadSubskills: true', 'ROOT BODY SENTINEL'),
    )
    const def = await plugin.get(rootA)
    assert.ok(def)
    assert.match(def.content, new RegExp(`Base directory for this skill: ${join(fixture, 'box-a', 'child-a')}`))
    assert.match(def.content, new RegExp(`Base directory for this skill: ${join(fixture, 'box-a', 'child-b')}`))
    assert.match(def.content, /CHILD-A CONTENT/)
    assert.match(def.content, /CHILD-B CONTENT/)
  } finally {
    cleanup(fixture)
  }
})

test('a root without loadSubskills returns its own body unchanged', async () => {
  const fixture = makeFixture(fixtureSet())
  try {
    const plugin = capturePlugin({ boxesDir: fixture })
    const rootA = (await plugin.list()).find(c => c.name === 'root-a')
    const def = await plugin.get(rootA)
    assert.ok(def)
    assert.equal(def.content, 'ROOT BODY SENTINEL')
  } finally {
    cleanup(fixture)
  }
})

test('invalid loadSubskills types fail with an actionable error', async () => {
  const fixture = makeFixture(fixtureSet())
  try {
    const plugin = capturePlugin({ boxesDir: fixture })
    const rootA = (await plugin.list()).find(c => c.name === 'root-a')
    writeFileSync(
      join(fixture, 'box-a', 'SKILL.md'),
      skill('name: root-a\ndescription: Root A body.\nloadSubskills: 42', 'ROOT BODY SENTINEL'),
    )
    await assert.rejects(
      () => plugin.get(rootA),
      /box-a.*loadSubskills/s,
    )
  } finally {
    cleanup(fixture)
  }
})

test('a missing referenced child fails with an actionable error', async () => {
  const fixture = makeFixture(fixtureSet())
  try {
    const plugin = capturePlugin({ boxesDir: fixture })
    const rootA = (await plugin.list()).find(c => c.name === 'root-a')
    writeFileSync(
      join(fixture, 'box-a', 'SKILL.md'),
      skill('name: root-a\ndescription: Root A body.\nloadSubskills:\n  - ghost-child', 'ROOT BODY SENTINEL'),
    )
    await assert.rejects(
      () => plugin.get(rootA),
      /ghost-child/,
    )
  } finally {
    cleanup(fixture)
  }
})

test('duplicate child names in one declared list fail instead of repeating bodies', async () => {
  const fixture = makeFixture(fixtureSet())
  try {
    const plugin = capturePlugin({ boxesDir: fixture })
    const rootA = (await plugin.list()).find(c => c.name === 'root-a')
    writeFileSync(
      join(fixture, 'box-a', 'SKILL.md'),
      skill('name: root-a\ndescription: Root A body.\nloadSubskills:\n  - child-a\n  - child-a', 'ROOT BODY SENTINEL'),
    )
    await assert.rejects(
      () => plugin.get(rootA),
      /child-a/,
    )
  } finally {
    cleanup(fixture)
  }
})

test('skill_browse and skill_load tools are registered', async () => {
  const fixture = makeFixture(fixtureSet())
  try {
    const plugin = capturePlugin({ boxesDir: fixture })
    assert.ok(plugin.tools.has('skill_browse'))
    assert.ok(plugin.tools.has('skill_load'))
  } finally {
    cleanup(fixture)
  }
})