/**
 * Bundle-box discovery and parsing for the lazy-skill plugin.
 *
 * A "box" (bundle) is a directory whose root holds a `SKILL.md` (the root
 * skill) beside any number of sibling sub-directories, each containing its own
 * `SKILL.md` (a sub-skill). The root skill enters the model-facing catalog;
 * sub-skills are hidden from the catalog and only become visible when a
 * consumer calls `skill_browse` on their box.
 *
 * @module dsh-lazy-skill/box
 */

import { readdir, readFile } from 'node:fs/promises'
import { join } from 'node:path'
import { parse as parseYaml } from 'yaml'

/** One parsed SKILL.md file: frontmatter fields plus the markdown body. */
export interface ParsedSkill {
  /** kebab-case skill name. */
  readonly name: string
  /** Routing description. */
  readonly description: string
  readonly whenToUse?: string
  /** The markdown body after frontmatter removal, trimmed. */
  readonly content: string
  /** Full parsed frontmatter (provider-specific custom fields, e.g. loadSubskills). */
  readonly metadata: Readonly<Record<string, unknown>>
}

/** A box (bundle) discovered under the boxes root. */
export interface Box {
  /** Directory name = stable id used as box locator. */
  readonly dir: string
  /** Absolute path of this box's directory. */
  readonly path: string
  /** Root skill parsed from `<box>/SKILL.md`. */
  readonly root: ParsedSkill
  /** Sub-skills parsed from `<box>/<sub>/SKILL.md`. */
  readonly subs: readonly ParsedSkill[]
}

const FRONTMATTER_RE = /^---\r?\n([\s\S]*?)\r?\n---\r?\n?/

/** Parse the head frontmatter (YAML between `---` fences) out of a markdown file. */
export function parseSkillFile(raw: string): ParsedSkill | undefined {
  const match = FRONTMATTER_RE.exec(raw)
  if (!match) return undefined
  let data: Record<string, unknown>
  try {
    data = (parseYaml(match[1]) ?? {}) as Record<string, unknown>
  } catch {
    return undefined
  }
  const name = typeof data.name === 'string' ? data.name : undefined
  const description = typeof data.description === 'string' ? data.description : undefined
  if (!name || !description) return undefined
  const whenToUse = typeof data.whenToUse === 'string' ? data.whenToUse : undefined
  return {
    name,
    description,
    ...(whenToUse !== undefined ? { whenToUse } : {}),
    content: raw.slice(match[0].length).trim(),
    metadata: data,
  }
}

/** Whether the directory holds a `SKILL.md`. */
async function hasSkill(path: string): Promise<boolean> {
  try {
    const st = await readFile(join(path, 'SKILL.md'), 'utf8')
    return parseSkillFile(st) !== undefined
  } catch {
    return false
  }
}

/**
 * Discover boxes under `boxesDir`.
 * @param boxesDir - absolute root directory holding box (bundle) directories.
 * @returns each box with its root skill and sub-skills; an absent/empty root yields [].
 */
export async function discoverBoxes(boxesDir: string): Promise<Box[]> {
  let entries
  try {
    entries = await readdir(boxesDir, { withFileTypes: true })
  } catch {
    return []
  }
  const boxes: Box[] = []
  for (const entry of entries) {
    if (!entry.isDirectory()) continue
    const boxPath = join(boxesDir, entry.name)
    const rootRaw = await readFile(join(boxPath, 'SKILL.md'), 'utf8').catch(() => undefined)
    if (rootRaw === undefined) continue
    const root = parseSkillFile(rootRaw)
    if (root === undefined) continue

    // Same-level sub-skills: each immediate sub-directory with its own SKILL.md
    const subs: ParsedSkill[] = []
    for (const subEntry of await readdir(boxPath, { withFileTypes: true }).catch(() => [])) {
      if (!subEntry.isDirectory()) continue
      if (!(await hasSkill(join(boxPath, subEntry.name)))) continue
      const subRaw = await readFile(join(boxPath, subEntry.name, 'SKILL.md'), 'utf8').catch(() => undefined)
      if (subRaw === undefined) continue
      const parsed = parseSkillFile(subRaw)
      if (parsed !== undefined) subs.push(parsed)
    }
    boxes.push({ dir: entry.name, path: boxPath, root, subs })
  }
  return boxes
}
