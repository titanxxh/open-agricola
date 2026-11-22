import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs'
import { posix } from 'node:path'
import { describe, expect, it } from 'vitest'
import { REFERENCE_LIMITS, allowedReferencePath } from '../../client/services/llm/generation/references'
import { catalogCardDefinitions } from '../../shared/cards/catalog.generated'
import { classicCardDefinitions } from '../../shared/cards/classic-catalog.generated'
import { majorCardDefinitionsList } from '../../shared/cards/major/generated'
import { PARENT_CARD_IDS } from '../../shared/parents/ids'

const INDEXES = ['docs/ARCHITECTURE.md', 'docs/ARCHITECTURE_zh.md']
const MODULE_DIR = 'docs/architecture'
const INDEX_BUDGET_BYTES = 16 * 1024
const MODULE_BUDGET_BYTES = 32 * 1024
const cardIds = [...catalogCardDefinitions, ...majorCardDefinitionsList].map(card => card.id).concat(PARENT_CARD_IDS)
const cardIdAlternatives = cardIds.map(id => id.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).join('|')
const CARD_ID = new RegExp(`(?<![A-Za-z0-9])(?:${cardIdAlternatives}|[A-EM]\\d{2,3}|P[RS]\\d{2})(?![A-Za-z0-9])`, 'g')
const modules = readdirSync(MODULE_DIR).filter(name => name.endsWith('.md')).map(name => `${MODULE_DIR}/${name}`)

describe('documentation budgets', () => {
  it.each(['A123', 'A123_FrameBuilder', 'Major_Fireplace1', 'PR01', 'PS01', 'CUSTOM_FixtureHarvester'])('recognizes card ID %s in prose and source paths', (id) => {
    expect(`See ${id} and shared/cards/${id}.ts`.match(CARD_ID)).toEqual([id, id])
  })

  it('allows generic documentation paths and card-family names', () => {
    expect('docs/CUSTOM_CARD_SANDBOX.md, Major_*, Card Source, PR and PS families'.match(CARD_ID)).toBeNull()
  })

  it('keeps every document the Workshop generator can read under its reference limit', () => {
    const readable = ['docs', MODULE_DIR, 'docs/adr'].flatMap(dir => readdirSync(dir).map(name => `${dir}/${name}`)).filter(allowedReferencePath)
    expect(readable).toContain('docs/ARCHITECTURE.md')
    expect(readable).toContain('docs/adr/0033-card-listener-timing-follows-project-semantics.md')
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

const AUTHORING = 'docs/CARD_AUTHORING.md'
const AUTHORING_ZH = 'docs/CARD_AUTHORING_zh.md'
const REVIEW_RULES = 'shared/cards/AGENTS.md'
const authoring = readFileSync(AUTHORING, 'utf8')
const contractStart = authoring.indexOf('## Card contract')
const contract = authoring.slice(contractStart, authoring.indexOf('\n## ', contractStart + 1))
const rules = contract.split('\n').filter(line => line.startsWith('- **'))
const ruleNames = rules.map(line => line.match(/^- \*\*(.+?)\.\*\*/)?.[1] ?? '')
const links = [...contract.matchAll(/\]\(([^)#]+)(?:#([^)]+))?\)/g)].map(match => ({ path: posix.join('docs', match[1]!), anchor: match[2] }))
const sourcePaths = [...contract.matchAll(/`((?:shared|scripts|server|client)\/[\w./-]+\.ts)`/g)].map(match => match[1]!)
const headingSlugs = (path: string) => readFileSync(path, 'utf8').split('\n').filter(line => /^#{1,6} /.test(line))
  .map(line => line.replace(/^#+ /, '').toLowerCase().replace(/[^\p{L}\p{N} _-]/gu, '').replace(/ /g, '-'))
const knownCardIds = new Set([...cardIds, ...classicCardDefinitions.map(card => card.id)])
// A card ID followed by `-` is a test file name such as `A42_ForestLakeHut-session.test.ts`.
const namedCards = (text: string) => text.match(/\b(?:[A-Z]{1,4}\d{2,3}|CUSTOM)_[A-Z][A-Za-z]+\b(?!-)/g) ?? []
const headings = (text: string) => text.split('\n').filter(line => /^#{2,6} /.test(line)).map(line => line.match(/^#+/)![0])

describe('Card contract', () => {
  it('sits before the numbered sections, where the first Workshop read reaches it', () => {
    expect(contractStart).toBeGreaterThan(0)
    expect(contractStart).toBeLessThan(authoring.indexOf('## 1. '))
    expect(authoring.slice(0, contractStart + contract.length).split('\n').length).toBeLessThanOrEqual(REFERENCE_LIMITS.readLines)
  })

  it('names each rule once and gives every rule a source the agent can open', () => {
    expect(rules.length).toBeGreaterThan(0)
    expect(ruleNames.every(Boolean)).toBe(true)
    expect(new Set(ruleNames).size).toBe(ruleNames.length)
    for (const rule of rules) expect(/\]\([^)]+\)|`(?:shared|scripts)\/[\w./-]+\.ts`/.test(rule), rule.slice(0, 40)).toBe(true)
  })

  it('links only documents the Workshop generator can read, at headings that exist', () => {
    expect(links.length).toBeGreaterThan(0)
    for (const { path, anchor } of links) {
      expect(existsSync(path), path).toBe(true)
      expect(allowedReferencePath(path), path).toBe(true)
      if (anchor) expect(headingSlugs(path), `${path}#${anchor}`).toContain(anchor)
    }
  })

  it('names only source files and cards that exist', () => {
    for (const path of sourcePaths) expect(existsSync(path), path).toBe(true)
    const named = namedCards(authoring)
    expect(named.length).toBeGreaterThan(0)
    for (const id of named) expect(knownCardIds.has(id), id).toBe(true)
  })

  it('is what the card review rules point at, by rule names that exist', () => {
    const review = readFileSync(REVIEW_RULES, 'utf8')
    expect(review).toContain('## Code Review Rules')
    expect(review).toContain('Card contract')
    expect(review).toContain(AUTHORING)
    const cited = [...review.matchAll(/\b([A-Z][a-z]+(?: [a-z]+)?) rule\b/g)].map(match => match[1]!)
    expect(cited.length).toBeGreaterThan(0)
    for (const name of cited) expect(ruleNames, name).toContain(name)
  })

  it('has a Chinese mirror with the same sections, rules, cards and working links', () => {
    const mirror = readFileSync(AUTHORING_ZH, 'utf8')
    expect(headings(mirror)).toEqual(headings(authoring))
    const mirrorRules = mirror.split('\n').filter(line => line.startsWith('- **')).map(line => line.match(/^- \*\*([A-Za-z ]+?)[（.]/)?.[1])
    expect(mirrorRules.slice(0, ruleNames.length)).toEqual(ruleNames)
    expect(namedCards(mirror).sort()).toEqual(namedCards(authoring).sort())
    const mirrorLinks = [...mirror.matchAll(/\]\(([^)#]+)(?:#([^)]+))?\)/g)].map(match => ({ path: posix.join('docs', match[1]!), anchor: match[2] }))
    expect(mirrorLinks.length).toBeGreaterThanOrEqual(links.length)
    for (const { path, anchor } of mirrorLinks) {
      expect(existsSync(path), path).toBe(true)
      if (anchor) expect(headingSlugs(path), `${path}#${anchor}`).toContain(anchor)
    }
  })
})
