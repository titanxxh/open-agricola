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
 * for *user-submitted* card source. The output of `generateCardFile()` emits
 * top-level `import` / `export` declarations (which the validator rejects), so
 * we skip validation here — DSL codegen output is trusted. We still run it
 * through `compileCardCode()` to verify TypeScript transpile succeeds.
 *
 * Usage:
 *   pnpm run migrate:dsl-to-code [--db=<path>] [--dry-run]
 */
import Database from 'better-sqlite3'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { generateCardFile, type CardMeta } from '../server/card-codegen.ts'
import { compileCardCode } from '../server/card-compiler.ts'

const __dirname = path.dirname(fileURLToPath(import.meta.url))

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
