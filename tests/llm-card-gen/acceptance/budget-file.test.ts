import { mkdtempSync, readFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { expect, it } from 'vitest'
import { BudgetFile } from './budget-file'

it('persists a pre-POST reservation, excludes other writers, and retains it after an interrupted run', () => {
  const directory = mkdtempSync(join(tmpdir(), 'llm-budget-'))
  const path = join(directory, 'budget.json')
  try {
    const first = new BudgetFile(path)
    let id: string
    try {
      id = first.reserve(1024, 16384, 'batch-a/probe', 1)
      expect(JSON.parse(readFileSync(path, 'utf8')).reservations[0]).toMatchObject({ id, status: 'reserved' })
      expect(() => new BudgetFile(path)).toThrow('locked')
    } finally { first.close() }
    const next = new BudgetFile(path)
    try {
      expect(next.ledger.committedNanoUsd()).toBeGreaterThan(0)
      expect(next.ledger.state.reservations[0].id).toBe(id)
      next.settle(id, { inputTokens: null, outputTokens: null, cachedInputTokens: null, reasoningTokens: null }, false)
      expect(JSON.parse(readFileSync(path, 'utf8')).reservations[0].status).toBe('unknown')
    } finally { next.close() }
  } finally { rmSync(directory, { recursive: true }) }
})
