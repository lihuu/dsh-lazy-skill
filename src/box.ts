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

/** A parsed skill whose physical filesystem identity is known. */
export interface DiscoveredSkill extends ParsedSkill {
  /** Physical directory name on disk. */
  readonly dir: string
  /** Absolute path of the skill's directory. */
  readonly path: string
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
  readonly subs: readonly DiscoveredSkill[]
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
async function readSkill(path: string): Promise<ParsedSkill | undefined> {
  try {
    const raw = await readFile(path, 'utf8')
    return parseSkillFile(raw)
  } catch {
    return undefined
  }
}

/**
 * Discover boxes under `boxesDir`.
 * @param boxesDir - absolute root directory holding box (bundle) directories.
 * @returns each box with its root skill and sub-skills, both sorted by directory
 *   name; an absent/empty root yields [].
 */
export async function discoverBoxes(boxesDir: string): Promise<Box[]> {
  let entries
  try {
    entries = await readdir(boxesDir, { withFileTypes: true })
  } catch {
    return []
  }
  const boxes: Box[] = []
  const boxDirs = entries
    .filter(entry => entry.isDirectory())
    .map(entry => entry.name)
    .sort()
  for (const dir of boxDirs) {
    const boxPath = join(boxesDir, dir)
    const root = await readSkill(join(boxPath, 'SKILL.md'))
    if (root === undefined) continue

    // Same-level sub-skills: each immediate sub-directory with its own SKILL.md
    const subs: DiscoveredSkill[] = []
    const subDirs = (await readdir(boxPath, { withFileTypes: true }).catch(() => []))
      .filter(entry => entry.isDirectory())
      .map(entry => entry.name)
      .sort()
    for (const subDir of subDirs) {
      const subPath = join(boxPath, subDir)
      const parsed = await readSkill(join(subPath, 'SKILL.md'))
      if (parsed !== undefined) subs.push({ ...parsed, dir: subDir, path: subPath })
    }
    boxes.push({ dir, path: boxPath, root, subs })
  }
  return boxes
}
