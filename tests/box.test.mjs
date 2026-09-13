import test from 'node:test'
import assert from 'node:assert/strict'
import { mkdtempSync, rmSync, writeFileSync, mkdirSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { parseSkillFile, discoverBoxes } from '../lib/box.js'

function makeFixture(files) {
  const root = mkdtempSync(join(tmpdir(), 'skill-bundle-box-'))
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

function cleanup(fixture) {
  rmSync(fixture, { recursive: true, force: true })
}

test('parseSkillFile reads frontmatter fields and the trimmed body', () => {
  const parsed = parseSkillFile(skill('name: physical-root\ndescription: The root body.'))
  assert.ok(parsed)
  assert.equal(parsed.name, 'physical-root')
  assert.equal(parsed.description, 'The root body.')
  assert.equal(parsed.content, 'BODY')
})

test('parseSkillFile accepts CRLF frontmatter fences', () => {
  const raw = '---\r\nname: crlf-skill\r\ndescription: CRLF is fine.\r\n---\r\n\r\nBody text\r\n'
  const parsed = parseSkillFile(raw)
  assert.ok(parsed)
  assert.equal(parsed.name, 'crlf-skill')
  assert.equal(parsed.content, 'Body text')
})

test('parseSkillFile rejects invalid YAML', () => {
  const parsed = parseSkillFile('---\nname: [unclosed\n---\n\nBody')
  assert.equal(parsed, undefined)
})

test('parseSkillFile rejects missing required name or description', () => {
  assert.equal(parseSkillFile('---\nname: only-name\n---\n\nBody'), undefined)
  assert.equal(parseSkillFile('---\ndescription: only-desc\n---\n\nBody'), undefined)
})

test('parseSkillFile rejects a name outside the registry grammar', () => {
  // The skill registry validates every candidate name and throws outside the
  // provider-list try/catch, so this must never reach it.
  assert.equal(parseSkillFile(skill('name: Not_Kebab\ndescription: Bad name.')), undefined)
  assert.equal(parseSkillFile(skill('name: -leading\ndescription: Bad name.')), undefined)
  assert.ok(parseSkillFile(skill('name: kebab-case-2\ndescription: Fine.')))
})

test('discovery reports each skipped entry instead of dropping it silently', async () => {
  const fixture = makeFixture({
    'good-box/SKILL.md': skill('name: good-box\ndescription: Fine.'),
    'good-box/bad-sub/SKILL.md': skill('name: Bad_Sub\ndescription: Bad name.'),
    'bad-box/SKILL.md': skill('name: Bad_Box\ndescription: Bad name.'),
  })
  try {
    const warnings = []
    const boxes = await discoverBoxes(fixture, message => warnings.push(message))
    assert.deepEqual(boxes.map(box => box.dir), ['good-box'])
    assert.equal(boxes[0].subs.length, 0)
    assert.equal(warnings.length, 2)
    assert.match(warnings[0], /bad-box/)
    assert.match(warnings[1], /good-box\/bad-sub/)
  } finally {
    cleanup(fixture)
  }
})

test('discovery keeps frontmatter name separate from the physical directory', async () => {
  const fixture = makeFixture({
    'box-a/SKILL.md': skill('name: friendly-root\ndescription: Root desc.'),
    'box-a/physical-dir/SKILL.md': skill('name: friendly-name\ndescription: Sub desc.'),
  })
  try {
    const boxes = await discoverBoxes(fixture)
    assert.equal(boxes.length, 1)
    const subs = boxes[0].subs
    assert.equal(subs.length, 1)
    assert.equal(subs[0].name, 'friendly-name')
    assert.equal(subs[0].dir, 'physical-dir')
    assert.equal(subs[0].path, join(fixture, 'box-a', 'physical-dir'))
  } finally {
    cleanup(fixture)
  }
})

test('discovery order is deterministic', async () => {
  const fixture = makeFixture({
    'z-box/SKILL.md': skill('name: z-root\ndescription: Z root.'),
    'z-box/sub-z/SKILL.md': skill('name: sub-z\ndescription: Sub z.'),
    'z-box/sub-a/SKILL.md': skill('name: sub-a\ndescription: Sub a.'),
    'a-box/SKILL.md': skill('name: a-root\ndescription: A root.'),
    'a-box/sub-z/SKILL.md': skill('name: sub-z\ndescription: Sub z.'),
    'a-box/sub-a/SKILL.md': skill('name: sub-a\ndescription: Sub a.'),
  })
  try {
    const boxes = await discoverBoxes(fixture)
    assert.deepEqual(boxes.map(box => box.dir), ['a-box', 'z-box'])
    assert.deepEqual(boxes[0].subs.map(sub => sub.dir), ['sub-a', 'sub-z'])
    assert.deepEqual(boxes[1].subs.map(sub => sub.dir), ['sub-a', 'sub-z'])
  } finally {
    cleanup(fixture)
  }
})

test('discovery skips entries without a valid root SKILL.md', async () => {
  const fixture = makeFixture({
    'no-root-dir/SKILL.md': 'no frontmatter here',
    'plain-file.txt': skill('name: ignored\ndescription: Not a directory.'),
    'valid/SKILL.md': skill('name: valid-root\ndescription: The valid one.'),
  })
  try {
    const boxes = await discoverBoxes(fixture)
    assert.deepEqual(boxes.map(box => box.dir), ['valid'])
  } finally {
    cleanup(fixture)
  }
})

test('discovery returns an empty array for an absent boxes root', async () => {
  const boxes = await discoverBoxes(join(tmpdir(), 'definitely-not-present-' + Date.now()))
  assert.deepEqual(boxes, [])
})