import { describe, it, expect } from 'vitest'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { buildCardsManifest, writeCardsManifest } from '../build-cards-manifest'

const fixturesRoot = path.resolve(__dirname, 'fixtures/cards')
const extendedFixturesRoot = path.resolve(__dirname, 'fixtures/manifest-fixtures')

describe('buildCardsManifest', () => {
  it('extracts meta from a single Occupation card', () => {
    const manifest = buildCardsManifest(fixturesRoot)
    expect(manifest['A999_TestCard']).toBeDefined()
    expect(manifest['A999_TestCard'].meta).toEqual({
      id: 'A999_TestCard',
      name: 'Test Card',
      deck: 'A',
      number: 999,
      type: 'occupation',
      category: 'FOOD_PROVIDER',
      desc: ['A test card for unit tests.'],
      cost: {},
      players: '1+',
    })
    expect(manifest['A999_TestCard'].reaches).toEqual([])
    expect(manifest['A999_TestCard'].module).toMatch(/A\/A999_TestCard$/)
  })

  it('extracts meta from a MajorImprovement card', () => {
    const manifest = buildCardsManifest(fixturesRoot)
    expect(manifest['MA_Test']).toBeDefined()
    expect(manifest['MA_Test'].meta.deck).toBe('major')
    expect(manifest['MA_Test'].meta.cost).toEqual({ wood: 2, clay: 1 })
  })

  it('defaults reaches to empty array for all cards', () => {
    const manifest = buildCardsManifest(fixturesRoot)
    for (const id of Object.keys(manifest)) {
      expect(manifest[id].reaches).toEqual([])
    }
  })

  it('extracts dev stub cards from shared/cards/__stubs__', () => {
    const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'cards-manifest-stub-test-'))
    const cardsRoot = path.join(tmp, 'shared', 'cards')
    const stubDir = path.join(tmp, 'shared', 'cards', '__stubs__')
    fs.mkdirSync(path.join(cardsRoot, 'A'), { recursive: true })
    fs.mkdirSync(stubDir, { recursive: true })
    fs.writeFileSync(
      path.join(stubDir, 'STUB_TestCard.ts'),
      `import { MinorImprovement } from '../../cards/types'\nexport const STUB_TestCard = new MinorImprovement({ id: 'STUB_TestCard', name: 'STUB Test Card', deck: 'STUB', number: 1, desc: ['A test stub.'], cost: {} })\n`,
      'utf8',
    )

    const manifest = buildCardsManifest(cardsRoot)

    expect(manifest['STUB_TestCard']?.meta).toMatchObject({
      id: 'STUB_TestCard',
      name: 'STUB Test Card',
      deck: 'STUB',
      number: 1,
      type: 'minor',
      desc: ['A test stub.'],
      cost: {},
    })
    expect(manifest['STUB_TestCard']?.module).toMatch(/shared\/cards\/__stubs__\/STUB_TestCard$/)

    fs.rmSync(tmp, { recursive: true, force: true })
  })
})

describe('buildCardsManifest — extended patterns', () => {
  it('extracts PlayerActionCard meta and resolves CARD_ID const references', () => {
    const manifest = buildCardsManifest(extendedFixturesRoot)
    expect(manifest['E999_FakeActionCard']).toBeDefined()
    const meta = manifest['E999_FakeActionCard'].meta
    expect(meta.id).toBe('E999_FakeActionCard')
    expect(meta.name).toBe('Fake Action Card')
    expect(meta.deck).toBe('E')
    expect(meta.number).toBe(999)
    expect(meta.cost).toEqual({ wood: 1 })
    expect(meta.desc).toEqual(['A fake PlayerActionCard used only in unit-test fixtures.'])
    expect(manifest['E999_FakeActionCard'].module).toMatch(/E\/E999_FakeActionCard$/)
  })

  it('extracts base MajorCardData literal', () => {
    const manifest = buildCardsManifest(extendedFixturesRoot)
    expect(manifest['Major_FakeOven1']).toBeDefined()
    const meta = manifest['Major_FakeOven1'].meta
    expect(meta.id).toBe('Major_FakeOven1')
    expect(meta.deck).toBe('major')
    expect(meta.number).toBe(1)
    expect(meta.cost).toEqual({ clay: 2 })
    expect(meta.vp).toBe(1)
    expect(meta.desc).toEqual([
      '[Baking action:]',
      '<GRAIN> <ARROW> 2<FOOD>',
    ])
  })

  it('resolves spread-based MajorCardData variant and overrides', () => {
    const manifest = buildCardsManifest(extendedFixturesRoot)
    expect(manifest['Major_FakeOven2']).toBeDefined()
    const meta = manifest['Major_FakeOven2'].meta
    expect(meta.id).toBe('Major_FakeOven2')
    expect(meta.deck).toBe('major')
    expect(meta.number).toBe(2)
    // Overrides applied:
    expect(meta.cost).toEqual({ clay: 3 })
    expect(meta.vp).toBe(2)
    // Inherited via spread:
    expect(meta.desc).toEqual([
      '[Baking action:]',
      '<GRAIN> <ARROW> 2<FOOD>',
    ])
  })
})

describe('buildCardsManifest — Card Source projection', () => {
  it('extracts Card Source meta from shared/cards without executing runtime impl', () => {
    const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'cards-manifest-source-test-'))
    const cardsDisplayRoot = path.join(tmp, 'shared', 'cards')
    const sourceDeckDir = path.join(tmp, 'shared', 'cards', 'A')
    fs.mkdirSync(path.join(cardsDisplayRoot, 'A'), { recursive: true })
    fs.mkdirSync(sourceDeckDir, { recursive: true })
    fs.writeFileSync(
      path.join(sourceDeckDir, 'A001_SourceMinor.ts'),
      `import { defineMinorCard } from '../card-source'\n` +
      `const CARD_ID = 'A001_SourceMinor'\n` +
      `const CARD_DESC = ['A source minor.']\n` +
      `const CARD_COST = { wood: 1, clay: 2 }\n` +
      `function explode() { throw new Error('runtime impl executed') }\n` +
      `export const A001_SourceMinor = defineMinorCard({\n` +
      `  meta: {\n` +
      `    id: CARD_ID,\n` +
      `    name: 'Source Minor',\n` +
      `    deck: 'A',\n` +
      `    number: 1,\n` +
      `    desc: CARD_DESC,\n` +
      `    cost: CARD_COST,\n` +
      `  },\n` +
      `  impl: { modifiers: [explode()], listeners: [explode()], effect: explode(), prerequisiteCheck: explode() },\n` +
      `})\n`,
      'utf8',
    )

    const manifest = buildCardsManifest(cardsDisplayRoot)

    expect(manifest['A001_SourceMinor']).toBeDefined()
    expect(manifest['A001_SourceMinor'].meta).toEqual({
      id: 'A001_SourceMinor',
      name: 'Source Minor',
      deck: 'A',
      number: 1,
      type: 'minor',
      desc: ['A source minor.'],
      cost: { wood: 1, clay: 2 },
    })
    expect(manifest['A001_SourceMinor'].module).toMatch(/shared\/cards\/A\/A001_SourceMinor$/)
    expect(manifest['A001_SourceMinor'].meta).not.toHaveProperty('modifiers')

    fs.rmSync(tmp, { recursive: true, force: true })
  })

  it('rejects Card Source meta that is not statically JSON-like', () => {
    const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'cards-manifest-source-reject-test-'))
    const cardsDisplayRoot = path.join(tmp, 'shared', 'cards')
    const sourceDeckDir = path.join(tmp, 'shared', 'cards', 'B')
    fs.mkdirSync(path.join(cardsDisplayRoot, 'B'), { recursive: true })
    fs.mkdirSync(sourceDeckDir, { recursive: true })
    fs.writeFileSync(
      path.join(sourceDeckDir, 'B001_DynamicSource.ts'),
      `import { defineOccupationCard } from '../card-source'\n` +
      `const CARD_ID = 'B001_DynamicSource'\n` +
      `const makeName = () => 'Dynamic Source'\n` +
      `export const B001_DynamicSource = defineOccupationCard({\n` +
      `  meta: { id: CARD_ID, name: makeName(), deck: 'B', number: 1, desc: [], players: '1+' },\n` +
      `})\n`,
      'utf8',
    )

    expect(() => buildCardsManifest(cardsDisplayRoot)).toThrow(/B001_DynamicSource\.ts.*meta\.name/)

    fs.rmSync(tmp, { recursive: true, force: true })
  })
})

describe('writeCardsManifest', () => {
  it('writes public/cards-manifest.json when the repo root is missing it', () => {
    const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'cards-manifest-test-'))
    const cardsRoot = path.join(tmp, 'shared', 'cards')
    const deckDir = path.join(cardsRoot, 'A')
    fs.mkdirSync(deckDir, { recursive: true })
    fs.writeFileSync(
      path.join(deckDir, 'A999_TestCard.ts'),
      `import { Occupation } from '../../../agricola-card'\nexport const A999_TestCard = new Occupation({ id: 'A999_TestCard', name: 'Test Card', deck: 'A', number: 999, desc: ['A test card for unit tests.'], cost: {}, players: '1+' })\n`,
      'utf8',
    )

    const outputPath = path.join(tmp, 'public', 'cards-manifest.json')
    expect(fs.existsSync(outputPath)).toBe(false)

    const writtenPath = writeCardsManifest(tmp)

    expect(writtenPath).toBe(outputPath)
    expect(fs.existsSync(outputPath)).toBe(true)
    const parsed = JSON.parse(fs.readFileSync(outputPath, 'utf8')) as Record<string, { meta: { id: string } }>
    expect(parsed['A999_TestCard']?.meta.id).toBe('A999_TestCard')

    fs.rmSync(tmp, { recursive: true, force: true })
  })
})
