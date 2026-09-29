import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync, readdirSync } from 'node:fs'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = fileURLToPath(new URL('..', import.meta.url))
const pkg = JSON.parse(readFileSync(join(root, 'package.json'), 'utf8'))

function runtimeImports() {
  const imports = new Set()
  const walk = (dir) => {
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
      const abs = join(dir, entry.name)
      if (entry.isDirectory()) walk(abs)
      else if (entry.name.endsWith('.ts')) {
        const src = readFileSync(abs, 'utf8')
        for (const match of src.matchAll(/from\s+['"]([^'"]+)['"]/g)) {
          const spec = match[1]
          if (!spec.startsWith('.') && !spec.startsWith('node:')) imports.add(spec)
        }
      }
    }
  }
  walk(join(root, 'src'))
  return imports
}

test('package declares the Harness bundle patch', () => {
  assert.equal(pkg.dsh?.bundle?.patch, './cordis.patch.yml')
})

test('package exposes the declaration entry through conditional exports', () => {
  assert.equal(pkg.exports['.'].types, './lib/index.d.ts')
  assert.equal(pkg.exports['.'].default, './lib/index.js')
  assert.equal(pkg.types, './lib/index.d.ts')
})

test('the archive allowlist includes boxes, lib output and the patch', () => {
  assert.ok(pkg.files.includes('boxes'))
  assert.ok(pkg.files.includes('cordis.patch.yml'))
  assert.ok(pkg.files.some(glob => glob.startsWith('lib/')))
  assert.ok(pkg.files.includes('README.md'))
  assert.ok(pkg.files.includes('LICENSE'))
})

test('every bare runtime import is owned by dependencies or peerDependencies', () => {
  const owned = new Set([
    ...Object.keys(pkg.dependencies ?? {}),
    ...Object.keys(pkg.peerDependencies ?? {}),
  ])
  for (const spec of runtimeImports()) {
    assert.ok(owned.has(spec), `bare import ${spec} has no dependency declaration`)
  }
})

test('package-owned runtime dependencies are declared', () => {
  assert.equal(pkg.dependencies.yaml, '^2.4.2')
  assert.equal(pkg.dependencies['@deepseek-ai/schemastery'], '^3.18.1')
})

test('host-provided services are floor-only peers, so a dsh minor bump does not skip the bundle', () => {
  assert.equal(pkg.peerDependencies['@deepseek-ai/cordis'], '^4.0.1')
  assert.equal(pkg.peerDependencies['@deepseek-ai/dsh-skill'], '>=0.1.5-rc.2')
  assert.equal(pkg.peerDependencies['@deepseek-ai/dsh-tools'], '>=0.1.5-rc.2')
})

test('stale host imports were removed from the peer surface', () => {
  assert.equal(pkg.peerDependencies['@deepseek-ai/dsh-tool-skill'], undefined)
  assert.equal(pkg.peerDependencies['@deepseek-ai/dsh-llm'], undefined)
  assert.equal(pkg.peerDependencies['@deepseek-ai/dsh-scope'], undefined)
})