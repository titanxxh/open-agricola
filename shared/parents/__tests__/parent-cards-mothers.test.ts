import { existsSync, readFileSync, statSync } from 'node:fs'
import { join } from 'node:path'

import { describe, expect, it } from 'vitest'

import { MOTHER_PARENT_CARD_IDS, getParentCardDefinition, motherParentCards } from '../index'

const PNG_SIGNATURE = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])

const expectedMotherCards = [
  {
    id: 'PR01',
    score: -0.75,
    round: 2,
    gain: { type: 'stable', amount: 1, fromSupply: true, freeBuild: true },
    text: 'Place 1 stable from your supply on round space 2. At the start of that round, you can build the stable at no cost.',
  },
  {
    id: 'PR02',
    score: -0.25,
    round: 12,
    gain: { type: 'field', amount: 1 },
    text: 'Place 1 field tile on round space 12. At the start of that round, you can plow the field.',
  },
  {
    id: 'PR03',
    score: 0,
    round: 8,
    gain: { type: 'resource', resource: 'cattle', amount: 1 },
    text: 'Place 1 cattle on round space 8. At the start of that round, you get the cattle.',
  },
  {
    id: 'PR04',
    score: 0.1,
    round: 7,
    gain: { type: 'resource', resource: 'boar', amount: 1 },
    text: 'Place 1 wild boar on round space 7. At the start of that round, you get the wild boar.',
  },
  {
    id: 'PR05',
    score: 0.2,
    round: 4,
    gain: { type: 'resource', resource: 'sheep', amount: 1 },
    text: 'Place 1 sheep on round space 4. At the start of that round, you get the sheep.',
  },
  {
    id: 'PR06',
    score: 0.3,
    round: 7,
    gain: { type: 'resource', resource: 'vegetable', amount: 1 },
    text: 'Place 1 vegetable on round space 7. At the start of that round, you get the vegetable.',
  },
  {
    id: 'PR07',
    score: 0.4,
    round: 4,
    gain: { type: 'resource', resource: 'grain', amount: 1 },
    text: 'Place 1 grain on round space 4. At the start of that round, you get the grain.',
  },
  {
    id: 'PR08',
    score: 0.5,
    round: 3,
    gain: { type: 'resource', resource: 'stone', amount: 1 },
    text: 'Place 1 stone on round space 3. At the start of that round, you get the stone.',
  },
  {
    id: 'PR09',
    score: 0.6,
    round: 5,
    gain: { type: 'resource', resource: 'reed', amount: 1 },
    text: 'Place 1 reed on round space 5. At the start of that round, you get the reed.',
  },
  {
    id: 'PR10',
    score: 0.7,
    round: 1,
    gain: { type: 'resource', resource: 'wood', amount: 1 },
    text: 'Place 1 wood on round space 1. At the start of that round, you get the wood.',
  },
  {
    id: 'PR11',
    score: 0.8,
    round: 1,
    gain: { type: 'resource', resource: 'food', amount: 1 },
    text: 'Place 1 food on round space 1. At the start of that round, you get the food.',
  },
  {
    id: 'PR12',
    score: 0.9,
    round: 1,
    gain: { type: 'resource', resource: 'clay', amount: 1 },
    text: 'Place 1 clay on round space 1. At the start of that round, you get the clay.',
  },
] as const

const assertPngExists = (path: string) => {
  expect(existsSync(path), path).toBe(true)
  expect(statSync(path).size, path).toBeGreaterThan(0)
  expect(readFileSync(path).subarray(0, PNG_SIGNATURE.length), path).toEqual(PNG_SIGNATURE)
}

describe('mother parent cards', () => {
  it('keeps each mother definition in its own source file', () => {
    for (const id of MOTHER_PARENT_CARD_IDS) {
      expect(existsSync(join(process.cwd(), 'shared/parents/cards', `${id}.ts`)), id).toBe(true)
    }
  })

  it('extracts exactly the PR01-PR12 mother definitions as structured data', () => {
    expect(motherParentCards).toHaveLength(12)
    expect(motherParentCards.map((card) => card.id)).toEqual(MOTHER_PARENT_CARD_IDS)

    for (const expected of expectedMotherCards) {
      const card = getParentCardDefinition(expected.id)
      expect(card).toMatchObject({
        ...expected,
        kind: 'mother',
        assets: { front: `${expected.id}.png`, back: 'mother' },
      })
    }
  })

  it('keeps mother gains executable-data shaped without manual placeholders', () => {
    const seenIds = new Set<string>()

    for (const card of motherParentCards) {
      expect(seenIds.has(card.id), card.id).toBe(false)
      seenIds.add(card.id)
      expect(card.kind).toBe('mother')
      expect(card.text.trim().length, card.id).toBeGreaterThan(0)
      expect(Number.isFinite(card.score), card.id).toBe(true)
      expect(card.round, card.id).toBeGreaterThanOrEqual(1)
      expect(card.round, card.id).toBeLessThanOrEqual(14)
      expect(card.gain.type, card.id).not.toBe('manual')

      if (card.gain.type === 'resource') {
        expect(card.gain.resource, card.id).not.toBe('begging')
        expect(card.gain.amount, card.id).toBeGreaterThan(0)
      }
    }
  })

  it('resolves all runtime mother assets from the public asset tree', () => {
    const assetRoot = join(process.cwd(), 'public/assets/parents')

    assertPngExists(join(assetRoot, 'backs/mother.png'))

    for (const card of motherParentCards) {
      assertPngExists(join(assetRoot, 'cards', card.assets.front))
      expect(card.assets.back).toBe('mother')
    }
  })
})
