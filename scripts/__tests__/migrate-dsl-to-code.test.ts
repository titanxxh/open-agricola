import { describe, it, expect, afterEach } from 'vitest'
import Database from 'better-sqlite3'
import fs from 'node:fs'
import path from 'node:path'
import os from 'node:os'
import { runMigration } from '../migrate-dsl-to-code.ts'

type Row = {
  id: string
  card_id: string
  card_type: string
  name: string
  description: string
  card_json: string
  effect_dsl: string | null
  effect_code: string | null
}

let tmpDbPath = ''

function setupTmpDb(rows: Row[]): string {
  tmpDbPath = path.join(os.tmpdir(), `migrate-test-${Date.now()}-${Math.floor(Math.random() * 1_000_000)}.db`)
  const db = new Database(tmpDbPath)
  db.exec(`
    CREATE TABLE workshop_cards (
      id TEXT PRIMARY KEY,
      card_id TEXT NOT NULL,
      card_type TEXT NOT NULL,
      name TEXT NOT NULL,
      description TEXT NOT NULL DEFAULT '',
      card_json TEXT NOT NULL,
      effect_dsl TEXT,
      effect_code TEXT,
      compiled_code TEXT,
      code_manifest TEXT
    );
  `)
  const insert = db.prepare(
    `INSERT INTO workshop_cards
      (id, card_id, card_type, name, description, card_json, effect_dsl, effect_code)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
  )
  for (const r of rows) {
    insert.run(r.id, r.card_id, r.card_type, r.name, r.description, r.card_json, r.effect_dsl, r.effect_code)
  }
  db.close()
  return tmpDbPath
}

describe('migrate-dsl-to-code', () => {
  afterEach(() => {
    if (tmpDbPath && fs.existsSync(tmpDbPath)) fs.unlinkSync(tmpDbPath)
    tmpDbPath = ''
  })

  it('reports 0 rows when no effect_dsl present', () => {
    const db = setupTmpDb([])
    const result = runMigration(db, true)
    expect(result.total).toBe(0)
    expect(result.migrated).toBe(0)
    expect(result.skipped).toBe(0)
    expect(result.failed).toEqual([])
  })

  it('skips rows that already have effect_code', () => {
    const db = setupTmpDb([
      {
        id: 'r1',
        card_id: 'X1',
        card_type: 'minor',
        name: 'X1',
        description: '',
        card_json: JSON.stringify({ cost: {}, vp: 0, desc: [] }),
        effect_dsl: JSON.stringify({ onBuy: { flow: [] } }),
        effect_code: 'already-present',
      },
    ])
    const result = runMigration(db, true)
    expect(result.total).toBe(1)
    expect(result.migrated).toBe(0)
    expect(result.skipped).toBe(1)
  })

  it('migrates a DSL-only row and writes effect_code + compiled_code + code_manifest (wet run)', () => {
    const dbPath = setupTmpDb([
      {
        id: 'r2',
        card_id: 'X2',
        card_type: 'minor',
        name: 'Test Card',
        description: 'Gain 1 wood on buy.',
        card_json: JSON.stringify({ cost: {}, vp: 0, desc: ['Gain 1 wood when bought.'] }),
        effect_dsl: JSON.stringify({
          onBuy: { flow: [{ action: 'gain', params: { wood: 1 } }] },
        }),
        effect_code: null,
      },
    ])
    const result = runMigration(dbPath, false)
    expect(result.total).toBe(1)
    expect(result.migrated).toBe(1)
    expect(result.skipped).toBe(0)
    expect(result.failed).toEqual([])

    const db = new Database(dbPath)
    const row = db
      .prepare('SELECT effect_code, compiled_code, code_manifest FROM workshop_cards WHERE id = ?')
      .get('r2') as { effect_code: string; compiled_code: string; code_manifest: string }
    db.close()
    expect(typeof row.effect_code).toBe('string')
    expect(row.effect_code.length).toBeGreaterThan(0)
    expect(row.effect_code).toContain("CARD_ID = 'X2'")
    expect(typeof row.compiled_code).toBe('string')
    expect(row.compiled_code.length).toBeGreaterThan(0)
    // Manifest is a JSON string placeholder; runtime re-extracts it.
    const manifest = JSON.parse(row.code_manifest)
    expect(manifest).toEqual({ effectHooks: [], listeners: [] })
  })

  it('dry-run does not mutate the database', () => {
    const dbPath = setupTmpDb([
      {
        id: 'r3',
        card_id: 'X3',
        card_type: 'minor',
        name: 'Test Card 3',
        description: '',
        card_json: JSON.stringify({ cost: {}, vp: 0, desc: [] }),
        effect_dsl: JSON.stringify({ onBuy: { flow: [{ action: 'gain', params: { clay: 1 } }] } }),
        effect_code: null,
      },
    ])
    const result = runMigration(dbPath, true)
    expect(result.migrated).toBe(1)

    const db = new Database(dbPath)
    const row = db
      .prepare('SELECT effect_code, compiled_code, code_manifest FROM workshop_cards WHERE id = ?')
      .get('r3') as { effect_code: string | null; compiled_code: string | null; code_manifest: string | null }
    db.close()
    expect(row.effect_code).toBeNull()
    expect(row.compiled_code).toBeNull()
    expect(row.code_manifest).toBeNull()
  })
})
