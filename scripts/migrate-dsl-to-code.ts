#!/usr/bin/env tsx
/**
 * One-shot migration: convert workshop cards with effect_dsl → effect_code +
 * compiled_code + code_manifest.
 *
 * Run once per DB (prod + local). After verifying, it stays in repo as a
 * one-shot maintenance script.
 *
 * The migration is non-destructive: `effect_dsl` stays, we just also populate
 * `effect_code`, `compiled_code`, and `code_manifest`.
 *
 * Note: the AST validator in `shared/custom-code/ast-validator.ts` is intended
 * for *user-submitted* card source. The output of the inlined `generateCardFile()`
 * emits top-level `import` / `export` declarations (which the validator rejects),
 * so we skip validation here — DSL codegen output is trusted. We still run it
 * through `compileCardCode()` to verify TypeScript transpile succeeds.
 *
 * Usage:
 *   pnpm run migrate:dsl-to-code [--db=<path>] [--dry-run]
 */
import Database from 'better-sqlite3'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { compileCardCode } from '../server/custom-code/compiler.ts'
import { requireActiveCardRegistry } from '../shared/cards/active-registry'

const __dirname = path.dirname(fileURLToPath(import.meta.url))

// ─── inlined from server/card-codegen.ts (archived before deletion in PR-2) ───
// Frozen copy of the DSL → .ts codegen used only by this one-shot migration.
// Kept here (instead of importing) so the migration script remains runnable
// after `server/card-codegen.ts` and `shared/cards/custom-dsl-runner.ts` are
// deleted in the PR-2 cleanup commit.

type CardMeta = {
  id: string
  name: string
  cardType: 'minor' | 'occupation'
  desc: string[]
  cost: Record<string, number>
  vp: number
  modifiers?: unknown[]
}

type DslStep = {
  action: string
  params?: Record<string, number | string>
}

type DslCondition =
  | { player_has_resource: Record<string, number> }
  | { round_gte: number }
  | { family_size_gte: number }
  | { player_has_card: string }

type DslEffect = {
  optional?: boolean
  condition?: DslCondition
  flow: DslStep[]
}

type CardDslEffects = Record<string, DslEffect | undefined>

function indent(code: string, level: number): string {
  const pad = '  '.repeat(level)
  return code.split('\n').map((line) => (line ? pad + line : line)).join('\n')
}

function conditionToGuard(cond: DslCondition, playerVar: string): string {
  if ('player_has_resource' in cond) {
    const checks = Object.entries(cond.player_has_resource)
      .map(([res, min]) => `(${playerVar}.resources.${res} ?? 0) < ${min}`)
    return `if (${checks.join(' || ')}) return`
  }
  if ('round_gte' in cond) {
    return `if (state.round < ${cond.round_gte}) return`
  }
  if ('family_size_gte' in cond) {
    return `if (familySize(${playerVar}) < ${cond.family_size_gte}) return`
  }
  if ('player_has_card' in cond) {
    return `if (!${playerVar}.minorPlayed.includes('${cond.player_has_card}') && !${playerVar}.occupationPlayed.includes('${cond.player_has_card}')) return`
  }
  return ''
}

function stepToCode(step: DslStep): string {
  const params: Record<string, number> = {}
  for (const [k, v] of Object.entries(step.params ?? {})) {
    if (typeof v === 'number' && Number.isFinite(v)) {
      params[k] = Math.floor(Math.max(0, v))
    }
  }
  return `{ type: 'leaf', actionId: '${step.action}', params: ${JSON.stringify(params)}, sourceCard: CARD_ID }`
}

function effectToHandlerCode(hook: string, effect: DslEffect, cardType: 'minor' | 'occupation'): string {
  const ownerArray = cardType === 'minor' ? 'minorPlayed' : 'occupationPlayed'
  const lines: string[] = []

  lines.push(`${hook}: (_state, player) => {`)
  lines.push(`  if (!player.${ownerArray}.includes(CARD_ID)) return`)

  if (effect.condition) {
    const guard = conditionToGuard(effect.condition, 'player')
    if (guard) lines.push(`  ${guard}`)
  }

  if (effect.flow.length === 0) {
    lines.push('  return')
  } else if (effect.flow.length === 1) {
    lines.push(`  return ${stepToCode(effect.flow[0]!)}`)
  } else {
    lines.push('  return {')
    lines.push(`    type: 'seq',`)
    lines.push(`    optional: ${effect.optional ?? false},`)
    lines.push('    children: [')
    for (const step of effect.flow) {
      lines.push(`      ${stepToCode(step)},`)
    }
    lines.push('    ],')
    lines.push('  }')
  }

  lines.push('},')
  return lines.join('\n')
}

/**
 * Generate a complete .ts card file from DSL + card metadata.
 * Output follows the same pattern as official cards in shared/cards/A/*.ts.
 */
function generateCardFile(meta: CardMeta, dsl: CardDslEffects | null): string {
  const lines: string[] = []
  const classType = meta.cardType === 'minor' ? 'MinorImprovement' : 'Occupation'

  lines.push(`import { ${classType} } from '../../shared/cards-display/types'`)
  if (dsl && Object.keys(dsl).length > 0) {
    lines.push(`import { requireActiveCardRegistry } from '../../shared/cards/active-registry'`)
    lines.push(`import { familySize } from '../../shared/domain/player'`)
  }
  lines.push('')

  lines.push(`const CARD_ID = '${meta.id}'`)
  lines.push('')

  if (dsl && Object.keys(dsl).length > 0) {
    lines.push(`requireActiveCardRegistry('${meta.id}').setEffect({`)
    lines.push('  id: CARD_ID,')
    for (const [hook, effect] of Object.entries(dsl)) {
      if (!effect || !effect.flow) continue
      lines.push(indent(effectToHandlerCode(hook, effect, meta.cardType), 1))
    }
    lines.push('})')
    lines.push('')
  }

  const costStr = Object.keys(meta.cost).length > 0 ? JSON.stringify(meta.cost) : '{}'
  const descStr = JSON.stringify(meta.desc)

  lines.push(`export const ${meta.id} = new ${classType}({`)
  lines.push(`  id: CARD_ID,`)
  lines.push(`  name: ${JSON.stringify(meta.name)},`)
  lines.push(`  deck: 'CUSTOM',`)
  lines.push(`  number: 0,`)
  lines.push(`  desc: ${descStr},`)
  lines.push(`  cost: ${costStr},`)
  lines.push(`  vp: ${meta.vp},`)
  if (meta.modifiers && meta.modifiers.length > 0) {
    lines.push(`  modifiers: ${JSON.stringify(meta.modifiers, null, 2).split('\n').map((l, i) => (i === 0 ? l : '  ' + l)).join('\n')},`)
  }
  lines.push(`  implemented: true,`)
  lines.push('})')
  lines.push('')

  return lines.join('\n')
}

// ─── end inlined codegen ─────────────────────────────────────────────────────

type WorkshopRow = {
  id: string
  card_id: string
  card_type: string
  name: string
  description: string
  card_json: string
  effect_dsl: string | null
  effect_code: string | null
}

export type MigrationResult = {
  total: number
  migrated: number
  skipped: number
  failed: Array<{ cardId: string; error: string }>
}

function buildCardMeta(row: WorkshopRow): CardMeta {
  const cj = JSON.parse(row.card_json) as Record<string, unknown>
  const cardType: 'minor' | 'occupation' = row.card_type === 'occupation' ? 'occupation' : 'minor'
  const desc = Array.isArray(cj.desc)
    ? (cj.desc as string[])
    : (row.description ? [row.description] : [])
  const cost = (cj.cost as Record<string, number>) ?? {}
  const vp = typeof cj.vp === 'number' ? (cj.vp as number) : 0
  return {
    id: row.card_id,
    name: row.name ?? '',
    cardType,
    desc,
    cost,
    vp,
  }
}

export function runMigration(dbPath: string, dryRun: boolean): MigrationResult {
  const db = new Database(dbPath)
  try {
    const rows = db.prepare(
      `SELECT id, card_id, card_type, name, description, card_json, effect_dsl, effect_code
       FROM workshop_cards
       WHERE effect_dsl IS NOT NULL`,
    ).all() as WorkshopRow[]

    const failed: Array<{ cardId: string; error: string }> = []
    let migrated = 0
    let skipped = 0

    for (const row of rows) {
      if (row.effect_code) {
        skipped += 1
        continue
      }
      try {
        const dsl = JSON.parse(row.effect_dsl!)
        const meta = buildCardMeta(row)
        const code = generateCardFile(meta, dsl)
        // Skip AST validator — codegen output contains imports/exports that the
        // validator (intended for user source) rejects. Trust the codegen and
        // rely on the compile pass to catch any syntax issue.
        const compiled = compileCardCode(code)
        // Manifest is recomputed at runtime by the executor; store an empty
        // placeholder so the row satisfies NOT-NULL-semantically, without
        // requiring the full isolate-vm dependency chain in this script.
        const manifest = JSON.stringify({ effectHooks: [], listeners: [] })
        if (!dryRun) {
          db.prepare(
            `UPDATE workshop_cards
             SET effect_code = ?, compiled_code = ?, code_manifest = ?
             WHERE id = ?`,
          ).run(code, compiled, manifest, row.id)
        }
        migrated += 1
      } catch (err) {
        failed.push({ cardId: row.card_id, error: (err as Error).message })
      }
    }

    return { total: rows.length, migrated, skipped, failed }
  } finally {
    db.close()
  }
}

const invokedFile = process.argv[1] ?? ''
if (invokedFile.endsWith('migrate-dsl-to-code.ts') || invokedFile.endsWith('migrate-dsl-to-code.js')) {
  const args = process.argv.slice(2)
  const dbArg = args.find((a) => a.startsWith('--db='))
  const dbPath = dbArg ? dbArg.slice(5) : path.resolve(__dirname, '..', 'data', 'open-agricola.db')
  const dryRun = args.includes('--dry-run')
  console.log(`[migrate-dsl-to-code] db=${dbPath} dryRun=${dryRun}`)
  const result = runMigration(dbPath, dryRun)
  console.log(JSON.stringify(result, null, 2))
  if (result.failed.length > 0) process.exit(1)
}
