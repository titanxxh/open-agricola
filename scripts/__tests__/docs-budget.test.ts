import { readFileSync, readdirSync, statSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { REFERENCE_LIMITS, allowedReferencePath } from '../../client/services/llm/generation/references'

const INDEXES = ['docs/ARCHITECTURE.md', 'docs/ARCHITECTURE_zh.md']
const MODULE_DIR = 'docs/architecture'
const INDEX_BUDGET_BYTES = 16 * 1024
const MODULE_BUDGET_BYTES = 32 * 1024
const CARD_ID = /(?<![A-Za-z0-9])(?:[A-EM]\d{2,3}|PS\d{2})(?![A-Za-z0-9])/g
const modules = readdirSync(MODULE_DIR).filter(name => name.endsWith('.md')).map(name => `${MODULE_DIR}/${name}`)

describe('documentation budgets', () => {
  it('keeps every document the Workshop generator can read under its reference limit', () => {
    const readable = ['docs', MODULE_DIR].flatMap(dir => readdirSync(dir).map(name => `${dir}/${name}`)).filter(allowedReferencePath)
    expect(readable).toContain('docs/ARCHITECTURE.md')
    expect(readable).toContain(`${MODULE_DIR}/hooks.md`)
    for (const path of readable) expect(statSync(path).size, path).toBeLessThanOrEqual(REFERENCE_LIMITS.fileBytes)
  })

  it('keeps the architecture index and each module document within its budget', () => {
    for (const path of INDEXES) expect(statSync(path).size, path).toBeLessThanOrEqual(INDEX_BUDGET_BYTES)
    expect(modules.length).toBeGreaterThan(0)
    for (const path of modules) expect(statSync(path).size, path).toBeLessThanOrEqual(MODULE_BUDGET_BYTES)
  })

  it('names no card in the architecture documents', () => {
    for (const path of [...INDEXES, ...modules]) expect(readFileSync(path, 'utf8').match(CARD_ID) ?? [], path).toEqual([])
  })
})
