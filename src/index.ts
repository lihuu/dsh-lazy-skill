/**
 * dsh-lazy-skill — a two-level lazy skill capability.
 *
 * A bundle "box" holds a root `SKILL.md` beside sibling sub-directories, each
 * with its own `SKILL.md`. This plugin:
 *  1. exposes only each box's root skill in the model-facing catalog
 *     (`provider.list()`), so sub-skill names never reach the model up front;
 *  2. registers a `skill_browse` tool that reveals a box's sub-skill names on
 *     demand (metadata only — never their bodies);
 *  3. lazy-loads a sub-skill body only when named via the existing `skill`
 *     tool (`provider.get()`).
 *
 * The default `@deepseek-ai/dsh-tool-skill` loader stays untouched; this is a
 * pure addition beside it.
 *
 * @module dsh-lazy-skill
 */

import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import type { Context } from '@deepseek-ai/cordis'
import z from '@deepseek-ai/schemastery'
import type Schema from '@deepseek-ai/schemastery'
import type {
  SkillCandidate,
  SkillProvider,
  SkillProviderControl,
} from '@deepseek-ai/dsh-skill'
import { defineTool } from '@deepseek-ai/dsh-tools'
import { discoverBoxes, type Box } from './box.ts'

/** Name of this plugin, used as the loader row name. */
export const name = 'dsh-lazy-skill'

/** Core services required before discovery can run. */
export const inject = ['skills', 'tools']

/** Named entry for the sub-skill's parent box inside its locator. */
type BoxSlot =
  | { kind: 'root' }
  | { kind: 'sub'; sub: string }

/** Opaque locator stored on a SkillCandidate and returned to provider.get(). */
interface BoxLocator {
  readonly box: string
  readonly slot: BoxSlot
}

/** Plugin configuration. */
export interface Config {
  /** Absolute path of the boxes root or undefined to resolve beside this package. */
  boxesDir?: string
}

export const Config: Schema<Config> = z.object({
  boxesDir: z.string(),
})

/** Absolute path of this package's `boxes` directory (default when config omits one). */
function defaultBoxesDir(): string {
  return join(fileURLToPath(new URL('..', import.meta.url)), 'boxes')
}

/** Rank for root-skill candidates registered by this provider. */
const LAZY_SKILL_RANK = 700

/** Resolve the absolute boxes root. */
function boxesDir(config: Config): string {
  return config.boxesDir ?? defaultBoxesDir()
}

/** Build the SKILL.md path for a box slot. */
function skillPath(box: Box, slot: BoxSlot): string {
  switch (slot.kind) {
    case 'root':
      return join(box.path, 'SKILL.md')
    case 'sub':
      return join(box.path, slot.sub, 'SKILL.md')
  }
}

/** Build the SKILL.md path for a known sub-skill directory within a box. */
function subSkillPath(box: Box, sub: string): string {
  return join(box.path, sub, 'SKILL.md')
}

/** Build the SKILL.md path for a box's root skill. */
function rootSkillPath(box: Box): string {
  return join(box.path, 'SKILL.md')
}

/**
 * Register the provider and the skill_browse tool.
 * @param ctx - plugin context.
 * @param config - plugin configuration.
 */
export function apply(ctx: Context, config: Config = {}): void {
  const root = boxesDir(config)
  ctx.logger?.info?.('dsh-lazy-skill: boxes root %s', root)

  const provider: SkillProvider = {
    name,
    async list() {
      const boxes = await discoverBoxes(root)
      const out: SkillCandidate[] = []
      for (const box of boxes) {
        const rootSkill = box.root
        // Root skill: visible to the model catalog, so the box is discoverable.
        out.push({
          name: rootSkill.name,
          description: rootSkill.description,
          ...(rootSkill.whenToUse !== undefined ? { whenToUse: rootSkill.whenToUse } : {}),
          invocation: { modelInvocable: true, userInvocable: true },
          source: 'custom',
          provider: name,
          rank: LAZY_SKILL_RANK,
          locator: { box: box.dir, slot: { kind: 'root' } } satisfies BoxLocator,
          resourceBase: { kind: 'directory', path: box.path },
          path: rootSkillPath(box),
        })
        // Sub-skills: registered so `skill:<name>` and `/name` can load them,
        // but hidden from the model catalog (modelInvocable: false) so they do
        // not pollute the default model context. They appear in the UI slash
        // menu and via skill_browse.
        for (const sub of box.subs) {
          out.push({
            name: sub.name,
            description: sub.description,
            ...(sub.whenToUse !== undefined ? { whenToUse: sub.whenToUse } : {}),
            invocation: { modelInvocable: false, userInvocable: true },
            source: 'custom',
            provider: name,
            rank: LAZY_SKILL_RANK,
            locator: { box: box.dir, slot: { kind: 'sub', sub: sub.name } } satisfies BoxLocator,
            resourceBase: { kind: 'directory', path: box.path },
            path: subSkillPath(box, sub.name),
          })
        }
      }
      return out
    },
    async get(candidate) {
      const locator = candidate.locator as BoxLocator | undefined
      if (locator === undefined) return undefined
      const boxes = await discoverBoxes(root)
      const box = boxes.find(b => b.dir === locator.box)
      if (box === undefined) return undefined

      const slot: BoxSlot = locator.slot
      let skill
      if (slot.kind === 'root') {
        skill = box.root
      } else if (slot.kind === 'sub') {
        skill = box.subs.find(sub => sub.name === slot.sub)
      }
      if (skill === undefined) return undefined

      const path = slot.kind === 'sub'
        ? subSkillPath(box, slot.sub)
        : rootSkillPath(box)

      // Scheme 1: a root skill may declare `loadSubskills` in its frontmatter.
      // When present, the box loads ONLY the named sub-skill bodies and IGNORES
      // the root body entirely — no model decision, no need to fetch more.
      // When absent, fall back to the plain body (model decides from its text).
      let content = skill.content
      let expandedSubs: string[] | undefined
      if (slot.kind === 'root') {
        const declared = skill.metadata?.loadSubskills
        if (Array.isArray(declared)) {
          const subs: string[] = []
          for (const subName of declared) {
            if (typeof subName !== 'string') continue
            const sub = box.subs.find(item => item.name === subName)
            if (sub === undefined) continue
            subs.push(sub.content)
          }
          // Rule A: with loadSubskills configured, return ONLY the sub-skills,
          // ignoring the root body text.
          content = subs.join('\n\n---\n\n')
          expandedSubs = subs
        }
      }

      return {
        name: skill.name,
        description: skill.description,
        ...(skill.whenToUse !== undefined ? { whenToUse: skill.whenToUse } : {}),
        invocation: candidate.invocation,
        source: candidate.source,
        provider: name,
        resourceBase: { kind: 'directory', path: box.path },
        path,
        content,
        ...(slot.kind === 'root'
          ? { metadata: { ...(skill.metadata ?? {}), ...(expandedSubs !== undefined ? { _expanded: true } : {}) } }
          : { metadata: skill.metadata ?? {} }),
      }
    },
  }

  ctx.skills.registerProvider((_control: SkillProviderControl) => provider)

  const browseTool = defineTool({
    name: 'skill_browse',
    description:
      'List the sub-skill names available inside one or more skill boxes. ' +
      'Use this to discover sub-skills before calling the `skill` tool for their bodies. ' +
      'Omit `boxes` to list every box.',
    parameters: {
      boxes: {
        type: 'array',
        items: { type: 'string' },
        description: 'Optional box names to browse; omit to list all boxes.',
      },
    },
    output: {
      schema: {
        type: 'array',
        items: {
          type: 'object',
          additionalProperties: false,
          properties: {
            box: { type: 'string', required: true },
            subs: {
              type: 'array',
              items: {
                type: 'object',
                additionalProperties: false,
                properties: {
                  name: { type: 'string', required: true },
                  description: { type: 'string', required: true },
                },
              },
            },
          },
        },
      },
      render: (_args: Record<string, unknown>, value: unknown) => [
        { type: 'text', text: JSON.stringify(value) },
      ],
    },
    async execute(args: { boxes?: string[] }) {
      const boxes = await discoverBoxes(root)
      const wanted = args.boxes && args.boxes.length > 0 ? new Set(args.boxes) : undefined
      return boxes
        .filter(box => wanted === undefined || wanted.has(box.dir))
        .map(box => ({
          box: box.dir,
          subs: box.subs.map(sub => ({ name: sub.name, description: sub.description })),
        }))
    },
    presentCall(args: { boxes?: string[] }) {
      const what = args.boxes && args.boxes.length > 0 ? args.boxes.join(', ') : 'all boxes'
      return { card: 'generic', title: `Browse skills (${what})`, kind: 'read', rawInput: String(args.boxes ?? []) }
    },
  })
  ctx.tools.register(browseTool)

  // Scheme 2: explicit loader tool. Lets the model load one or more skills by
  // exact name (root or sub-skill) on demand — the fallback when a box's root
  // does not declare `loadSubskills`, or when a caller wants a single sub-skill.
  const loadTool = defineTool({
    name: 'skill_load',
    description:
      'Load the full body of one or more skills by exact name (root or sub-skill of a box). ' +
      'Call with the exact skill names. Loading a root skill that declares loadSubskills also brings its sub-skills.',
    parameters: {
      skills: {
        type: 'array',
        items: { type: 'string' },
        description: 'Exact skill names to load.',
      },
    },
    output: {
      schema: {
        type: 'array',
        items: {
          type: 'object',
          additionalProperties: false,
          properties: {
            name: { type: 'string', required: true },
            content: { type: 'string', required: true },
          },
        },
      },
      render: (_args: Record<string, unknown>, value: unknown) => [
        { type: 'text', text: (value as Array<{ name: string; content: string }> ?? [])
            .map(v => '<skill_content name="' + v.name + '">\n' + v.content + '\n</skill_content>')
            .join('\n\n') },
      ],
    },
    async execute(args: { skills?: string[] }) {
      if (!args.skills || args.skills.length === 0) return []
      const boxes = await discoverBoxes(root)
      const out: Array<{ name: string; content: string }> = []
      for (const skillName of args.skills) {
        let resolved: { name: string; locator: BoxLocator } | undefined
        for (const box of boxes) {
          if (box.root.name === skillName) {
            resolved = { name: skillName, locator: { box: box.dir, slot: { kind: 'root' } } }
            break
          }
          const sub = box.subs.find(item => item.name === skillName)
          if (sub !== undefined) {
            resolved = { name: skillName, locator: { box: box.dir, slot: { kind: 'sub', sub: skillName } } }
            break
          }
        }
        if (resolved === undefined) continue
        const candidate: SkillCandidate = {
          name: resolved.name,
          description: '',
          invocation: { modelInvocable: true, userInvocable: true },
          source: 'custom',
          provider: name,
          rank: LAZY_SKILL_RANK,
          locator: resolved.locator,
          resourceBase: { kind: 'directory', path: '' },
          path: '',
        }
        const def = await provider.get(candidate, {})
        if (def !== undefined) out.push({ name: def.name, content: def.content })
      }
      return out
    },
    presentCall(args: { skills?: string[] }) {
      const names = args.skills && args.skills.length > 0 ? args.skills.join(', ') : 'none'
      return { card: 'generic', title: `Load skills (${names})`, kind: 'read', rawInput: String(args.skills ?? []) }
    },
  })
  ctx.tools.register(loadTool)
}
