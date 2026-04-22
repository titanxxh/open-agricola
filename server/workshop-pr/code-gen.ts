/**
 * Pure code-generation module for workshop → PR integration.
 *
 * Given a workshop card row + upstream file contents, produce the 4-5 files
 * that should be committed to a fork branch:
 *   1. shared/cards/community/{card_id}.ts              — main card file
 *   2. shared/cards/community/__tests__/{card_id}.test.ts — smoke test
 *   3. shared/cards/register-all.ts                     — patched (import + entry)
 *   4. docs/community_cards.md                          — patched (new row)
 *   5. public/card-art/community/{card_id}.{ext}        — (optional) binary art
 *
 * No I/O here. All inputs are passed in, outputs are plain objects.
 */
import ts from 'typescript'

// ---------------------------------------------------------------------------
// C-12: AST helper scan
// ---------------------------------------------------------------------------

const KNOWN_HELPERS = new Set([
  'gainLeaf',
  'payLeaf',
  'spaceHasPlayer',
  'positionKey',
  'getMajorCardEffect',
  'getCardStack',
  'readCardExtraData',
])

/**
 * Walk the user-supplied effect_code AST and return the subset of injected
 * helpers that are actually referenced. Used to emit a minimal import list
 * in the generated card file.
 */
export function scanUsedHelpers(source: string): Set<string> {
  const used = new Set<string>()
  const sf = ts.createSourceFile(
    'x.ts',
    source,
    ts.ScriptTarget.ES2022,
    true,
    ts.ScriptKind.TS,
  )
  function visit(node: ts.Node): void {
    if (ts.isIdentifier(node) && KNOWN_HELPERS.has(node.text)) {
      used.add(node.text)
    }
    ts.forEachChild(node, visit)
  }
  ts.forEachChild(sf, visit)
  return used
}

// ---------------------------------------------------------------------------
// C-13: Main card file generator
// ---------------------------------------------------------------------------

const HELPER_IMPORTS: Record<string, string> = {
  gainLeaf: `import { gainLeaf } from '../helpers/pay-gain-node'`,
  payLeaf: `import { payLeaf } from '../helpers/pay-gain-node'`,
  spaceHasPlayer: `import { spaceHasPlayer } from '../../game/space'`,
  positionKey: `import { positionKey } from '../../game/farm'`,
  getMajorCardEffect: `import { getMajorCardEffect } from '../major'`,
  getCardStack: `import { getCardStack } from '../helpers/card-state'`,
  readCardExtraData: `import { readCardExtraData } from '../helpers/card-state'`,
}

export type WorkshopCardForGen = {
  id: string
  card_id: string
  card_type: string
  author_name?: string
  description?: string
  effect_code: string
}

export function generateMainCardFile(
  wcard: WorkshopCardForGen,
  ctx: { githubLogin: string; iso: string },
): string {
  const classImport =
    wcard.card_type === 'occupation'
      ? `import { Occupation } from '../types'`
      : `import { MinorImprovement } from '../types'`
  const used = scanUsedHelpers(wcard.effect_code)
  const helperImports = Array.from(used)
    .map((h) => HELPER_IMPORTS[h])
    .filter((x): x is string => !!x)
    .sort()
    .join('\n')

  return `// Generated from Open Agricola workshop. Do not hand-edit.
// Workshop card: ${wcard.card_id}
// Author: ${wcard.author_name ?? 'unknown'} (github: @${ctx.githubLogin})
// Submitted: ${ctx.iso}

${classImport}
import type { CardImpl } from '../registry'
${helperImports ? helperImports + '\n' : ''}
// --- BEGIN WORKSHOP CODE (validated in sandbox) ---
${wcard.effect_code}
// --- END WORKSHOP CODE ---

export const ${wcard.card_id} = CARD_DEF
export const ${wcard.card_id}_impl = CARD_IMPL satisfies CardImpl
`
}

// ---------------------------------------------------------------------------
// C-14: Smoke test generator
// ---------------------------------------------------------------------------

export function generateSmokeTest(args: { card_id: string }): string {
  const id = args.card_id
  return `import { describe, it, expect } from 'vitest'
import { ${id}, ${id}_impl } from '../${id}'

describe('${id} — community card smoke test', () => {
  it('exports a valid definition', () => {
    expect(${id}).toBeDefined()
    expect(${id}.id).toBe('${id}')
    expect(${id}.name).toBeTruthy()
    expect(${id}.deck).toBe('community')
  })

  it('exports a CardImpl', () => {
    expect(${id}_impl).toBeDefined()
    const hasBehavior =
      !!${id}_impl.effect ||
      (${id}_impl.listeners?.length ?? 0) > 0 ||
      (${id}_impl.modifiers?.length ?? 0) > 0 ||
      (${id}.vp ?? 0) > 0
    expect(hasBehavior).toBe(true)
  })
})
`
}

// ---------------------------------------------------------------------------
// C-15: register-all.ts patcher
// ---------------------------------------------------------------------------

/**
 * Insert a new CUSTOM_* import and ALL_CARD_IMPLS entry into register-all.ts,
 * keeping CUSTOM_* entries sorted alphabetically among themselves. Idempotent:
 * returns the input unchanged if the card is already registered.
 */
export function patchRegisterAll(
  source: string,
  args: { card_id: string },
): string {
  const id = args.card_id
  const newImport = `import { ${id}_impl } from './community/${id}'`
  const newEntry = `  '${id}': ${id}_impl,`

  if (source.includes(newImport)) return source

  // === Insert import ===
  const customImportRe = /^(import \{ (CUSTOM_\w+)_impl[^\n]*)\n/gm
  const customImports: Array<{
    full: string
    id: string
    start: number
    end: number
  }> = []
  let m: RegExpExecArray | null
  while ((m = customImportRe.exec(source)) !== null) {
    customImports.push({
      full: m[0]!,
      id: m[2]!,
      start: m.index,
      end: m.index + m[0]!.length,
    })
  }

  let withImport: string
  if (customImports.length === 0) {
    const anchor = '\nexport const ALL_CARD_IMPLS'
    const idx = source.indexOf(anchor)
    if (idx === -1) {
      throw new Error(
        'register-all.ts structure not recognized (missing ALL_CARD_IMPLS)',
      )
    }
    withImport = source.slice(0, idx) + '\n' + newImport + source.slice(idx)
  } else {
    let insertedBefore: { start: number } | null = null
    for (const ci of customImports) {
      if (ci.id.localeCompare(id) > 0) {
        insertedBefore = { start: ci.start }
        break
      }
    }
    if (insertedBefore) {
      withImport =
        source.slice(0, insertedBefore.start) +
        newImport +
        '\n' +
        source.slice(insertedBefore.start)
    } else {
      const last = customImports[customImports.length - 1]!
      withImport =
        source.slice(0, last.end) + newImport + '\n' + source.slice(last.end)
    }
  }

  // === Insert entry ===
  const customEntryRe = /^  '(CUSTOM_\w+)': [^\n]*,\n/gm
  const customEntries: Array<{
    full: string
    id: string
    start: number
    end: number
  }> = []
  let em: RegExpExecArray | null
  while ((em = customEntryRe.exec(withImport)) !== null) {
    customEntries.push({
      full: em[0]!,
      id: em[1]!,
      start: em.index,
      end: em.index + em[0]!.length,
    })
  }

  let final: string
  if (customEntries.length === 0) {
    const anchor = '\n}\n\nexport type AllCardImpls'
    const idx = withImport.indexOf(anchor)
    if (idx === -1) {
      throw new Error(
        'register-all.ts structure not recognized (missing closing brace)',
      )
    }
    final =
      withImport.slice(0, idx) + '\n' + newEntry + withImport.slice(idx)
  } else {
    let insertedBefore: { start: number } | null = null
    for (const ce of customEntries) {
      if (ce.id.localeCompare(id) > 0) {
        insertedBefore = { start: ce.start }
        break
      }
    }
    if (insertedBefore) {
      final =
        withImport.slice(0, insertedBefore.start) +
        newEntry +
        '\n' +
        withImport.slice(insertedBefore.start)
    } else {
      const last = customEntries[customEntries.length - 1]!
      final =
        withImport.slice(0, last.end) +
        newEntry +
        '\n' +
        withImport.slice(last.end)
    }
  }

  return final
}

// ---------------------------------------------------------------------------
// C-16: community_cards.md patcher
// ---------------------------------------------------------------------------

export function patchCommunityCardsMarkdown(
  source: string,
  args: {
    card_id: string
    card_name: string
    card_type: string
    github_login: string
    pr_number: number
  },
): string {
  const row = `| ${args.card_id} | ${args.card_name} | ${args.card_type} | @${args.github_login} | #${args.pr_number} |`
  if (source.includes(`| ${args.card_id} |`)) return source
  const endMarker = '<!-- community-card-entries:end -->'
  const idx = source.indexOf(endMarker)
  if (idx === -1) throw new Error('community_cards.md markers not found')
  return source.slice(0, idx) + row + '\n' + source.slice(idx)
}

// ---------------------------------------------------------------------------
// C-17: generatePrFiles main entry
// ---------------------------------------------------------------------------

export type PrFile = {
  path: string
  content: string
  encoding: 'utf-8' | 'base64'
}

export type GenArgs = {
  wcard: WorkshopCardForGen & { card_json?: string; art_url?: string | null }
  github_login: string
  upstream_register_all: string
  upstream_community_md: string
  pr_number: number
  art_data?: { ext: string; buffer: Buffer } | null
}

export async function generatePrFiles(args: GenArgs): Promise<PrFile[]> {
  const {
    wcard,
    github_login,
    upstream_register_all,
    upstream_community_md,
    pr_number,
    art_data,
  } = args
  const iso = new Date().toISOString()

  const mainContent = generateMainCardFile(wcard, {
    githubLogin: github_login,
    iso,
  })
  const testContent = generateSmokeTest({ card_id: wcard.card_id })
  const newRegisterAll = patchRegisterAll(upstream_register_all, {
    card_id: wcard.card_id,
  })

  let cardName = wcard.card_id
  try {
    if (wcard.card_json) {
      const parsed = JSON.parse(wcard.card_json) as { name?: string }
      if (parsed.name) cardName = parsed.name
    }
  } catch {
    /* keep fallback */
  }

  const newCommunityMd = patchCommunityCardsMarkdown(upstream_community_md, {
    card_id: wcard.card_id,
    card_name: cardName,
    card_type: wcard.card_type,
    github_login,
    pr_number,
  })

  const files: PrFile[] = [
    {
      path: `shared/cards/community/${wcard.card_id}.ts`,
      content: mainContent,
      encoding: 'utf-8',
    },
    {
      path: `shared/cards/community/__tests__/${wcard.card_id}.test.ts`,
      content: testContent,
      encoding: 'utf-8',
    },
    {
      path: 'shared/cards/register-all.ts',
      content: newRegisterAll,
      encoding: 'utf-8',
    },
    {
      path: 'docs/community_cards.md',
      content: newCommunityMd,
      encoding: 'utf-8',
    },
  ]

  if (art_data) {
    files.push({
      path: `public/card-art/community/${wcard.card_id}.${art_data.ext}`,
      content: art_data.buffer.toString('base64'),
      encoding: 'base64',
    })
  }

  return files
}
