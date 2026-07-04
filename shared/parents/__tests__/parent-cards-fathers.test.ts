import { existsSync, readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'

import {
  FATHER_PARENT_CARD_IDS,
  fatherParentCards,
  getParentCardDefinition,
} from '../index'
import type { FatherRewardEffect, FatherRequirement } from '../types'

const assetPath = (relativePath: string): string =>
  fileURLToPath(new URL(`../../../public/assets/parents/${relativePath}`, import.meta.url))

const cardSourcePath = (id: string): string =>
  fileURLToPath(new URL(`../cards/${id}.ts`, import.meta.url))

const fathersRegistryPath = fileURLToPath(new URL('../cards/fathers.ts', import.meta.url))

const expectedFatherCards = {
  PS01: {
    conditionText: 'If you have at least 2/3/5 fields, you can turn this card face down.',
    rewards: [
      {
        requirementText: '2 fields',
        requirement: { type: 'farm-count-at-least', target: 'field', amount: 2 },
        rewardText: 'If you do, you immediately get 1 stone.',
        effects: [{ type: 'gain-resources', resources: { stone: 1 } }],
      },
      {
        requirementText: '3 fields',
        requirement: { type: 'farm-count-at-least', target: 'field', amount: 3 },
        rewardText: 'If you do, you immediately get 2 stone.',
        effects: [{ type: 'gain-resources', resources: { stone: 2 } }],
      },
      {
        requirementText: '5 fields',
        requirement: { type: 'farm-count-at-least', target: 'field', amount: 5 },
        rewardText: 'If you do, you immediately get 3 stone.',
        effects: [{ type: 'gain-resources', resources: { stone: 3 } }],
      },
    ],
  },
  PS02: {
    conditionText: 'If you have at least 1/2/3 pastures, you can turn this card face down.',
    rewards: [
      {
        requirementText: '1 pasture',
        requirement: { type: 'farm-count-at-least', target: 'pasture', amount: 1 },
        rewardText: 'If you do, you immediately get 1 building resource of the type that your house is made of.',
        effects: [{ type: 'manual', key: 'gain-house-material-1', reviewed: true }],
      },
      {
        requirementText: '2 pastures',
        requirement: { type: 'farm-count-at-least', target: 'pasture', amount: 2 },
        rewardText: 'If you do, you immediately get 2 building resources of the type that your house is made of.',
        effects: [{ type: 'manual', key: 'gain-house-material-2', reviewed: true }],
      },
      {
        requirementText: '3 pastures',
        requirement: { type: 'farm-count-at-least', target: 'pasture', amount: 3 },
        rewardText: 'If you do, you immediately get 3 building resources of the type that your house is made of.',
        effects: [{ type: 'manual', key: 'gain-house-material-3', reviewed: true }],
      },
    ],
  },
  PS03: {
    conditionText: 'If you have animals of at least 1/2/3 types, you can turn this card face down.',
    rewards: [
      {
        requirementText: 'animals of 1 type',
        requirement: { type: 'animal-type-count-at-least', amount: 1 },
        rewardText: 'If you do, you immediately get 1 minor improvement. To do so, draw three cards of each eligible type and keep one.',
        effects: [{ type: 'manual', key: 'draw-3-minor-improvements-keep-1', reviewed: true }],
      },
      {
        requirementText: 'animals of 2 types',
        requirement: { type: 'animal-type-count-at-least', amount: 2 },
        rewardText: 'If you do, you immediately get 1 occupation. To do so, draw three cards of each eligible type and keep one.',
        effects: [{ type: 'manual', key: 'draw-3-occupations-keep-1', reviewed: true }],
      },
      {
        requirementText: 'animals of 3 types',
        requirement: { type: 'animal-type-count-at-least', amount: 3 },
        rewardText: 'If you do, you immediately get both 1 minor improvement and 1 occupation. To do so, draw three cards of each eligible type and keep one.',
        effects: [{ type: 'manual', key: 'draw-3-minor-improvements-and-3-occupations-keep-1-each', reviewed: true }],
      },
    ],
  },
  PS04: {
    conditionText: 'If you have at least 3/4/6 animals of the same type, you can turn this card face down.',
    rewards: [
      {
        requirementText: '3 animals of the same type',
        requirement: { type: 'same-animal-type-at-least', amount: 3 },
        rewardText: 'If you do, you immediately get 1 different building resource of your choice.',
        effects: [{ type: 'manual', key: 'choose-1-different-building-resource', reviewed: true }],
      },
      {
        requirementText: '4 animals of the same type',
        requirement: { type: 'same-animal-type-at-least', amount: 4 },
        rewardText: 'If you do, you immediately get 2 different building resources of your choice.',
        effects: [{ type: 'manual', key: 'choose-2-different-building-resources', reviewed: true }],
      },
      {
        requirementText: '6 animals of the same type',
        requirement: { type: 'same-animal-type-at-least', amount: 6 },
        rewardText: 'If you do, you immediately get 3 different building resources of your choice.',
        effects: [{ type: 'manual', key: 'choose-3-different-building-resources', reviewed: true }],
      },
    ],
  },
  PS05: {
    conditionText: 'If you have at least 1/2/3 major improvements, you can turn this card face down.',
    rewards: [
      {
        requirementText: '1 major improvement',
        requirement: { type: 'played-card-at-least', cardType: 'major-improvement', amount: 1 },
        rewardText: 'If you do, you immediately get 1 wood.',
        effects: [{ type: 'gain-resources', resources: { wood: 1 } }],
      },
      {
        requirementText: '2 major improvements',
        requirement: { type: 'played-card-at-least', cardType: 'major-improvement', amount: 2 },
        rewardText: 'If you do, you immediately get 2 clay.',
        effects: [{ type: 'gain-resources', resources: { clay: 2 } }],
      },
      {
        requirementText: '3 major improvements',
        requirement: { type: 'played-card-at-least', cardType: 'major-improvement', amount: 3 },
        rewardText: 'If you do, you immediately get 3 reed.',
        effects: [{ type: 'gain-resources', resources: { reed: 3 } }],
      },
    ],
  },
  PS06: {
    conditionText: 'If you have at least 6/8/10 total cards in play, including the parent cards, you can turn this card face down.',
    rewards: [
      {
        requirementText: '6 total cards in play, including the parent cards',
        requirement: { type: 'total-cards-in-play-including-parents-at-least', amount: 6 },
        rewardText: 'If you do, you immediately get 1 food.',
        effects: [{ type: 'gain-resources', resources: { food: 1 } }],
      },
      {
        requirementText: '8 total cards in play, including the parent cards',
        requirement: { type: 'total-cards-in-play-including-parents-at-least', amount: 8 },
        rewardText: 'If you do, you immediately get 3 food.',
        effects: [{ type: 'gain-resources', resources: { food: 3 } }],
      },
      {
        requirementText: '10 total cards in play, including the parent cards',
        requirement: { type: 'total-cards-in-play-including-parents-at-least', amount: 10 },
        rewardText: 'If you do, you immediately get 5 food.',
        effects: [{ type: 'gain-resources', resources: { food: 5 } }],
      },
    ],
  },
  PS07: {
    conditionText: 'If you have at least 2/3/4 occupations, you can turn this card face down.',
    rewards: [
      {
        requirementText: '2 occupations',
        requirement: { type: 'played-card-at-least', cardType: 'occupation', amount: 2 },
        rewardText: 'If you do, you can immediately sow up to 1 field. (This is considered a single __Sow__ action.)',
        effects: [{ type: 'manual', key: 'sow-up-to-1-field-single-sow-action', reviewed: true }],
      },
      {
        requirementText: '3 occupations',
        requirement: { type: 'played-card-at-least', cardType: 'occupation', amount: 3 },
        rewardText: 'If you do, you can immediately sow up to 2 fields. (This is considered a single __Sow__ action.)',
        effects: [{ type: 'manual', key: 'sow-up-to-2-fields-single-sow-action', reviewed: true }],
      },
      {
        requirementText: '4 occupations',
        requirement: { type: 'played-card-at-least', cardType: 'occupation', amount: 4 },
        rewardText: 'If you do, you can immediately sow up to 3 fields. (This is considered a single __Sow__ action.)',
        effects: [{ type: 'manual', key: 'sow-up-to-3-fields-single-sow-action', reviewed: true }],
      },
    ],
  },
  PS08: {
    conditionText: 'If you have at most 7/5/3 unused farmyard spaces left, you can turn this card face down.',
    rewards: [
      {
        requirementText: 'at most 7 unused farmyard spaces left',
        requirement: { type: 'unused-farmyard-spaces-at-most', amount: 7 },
        rewardText: 'If you do, you immediately get 1 grain.',
        effects: [{ type: 'gain-resources', resources: { grain: 1 } }],
      },
      {
        requirementText: 'at most 5 unused farmyard spaces left',
        requirement: { type: 'unused-farmyard-spaces-at-most', amount: 5 },
        rewardText: 'If you do, you immediately get 1 vegetable.',
        effects: [{ type: 'gain-resources', resources: { vegetable: 1 } }],
      },
      {
        requirementText: 'at most 3 unused farmyard spaces left',
        requirement: { type: 'unused-farmyard-spaces-at-most', amount: 3 },
        rewardText: 'If you do, you immediately get both 1 grain and 1 vegetable.',
        effects: [{ type: 'gain-resources', resources: { grain: 1, vegetable: 1 } }],
      },
    ],
  },
  PS09: {
    conditionText: 'If you have built at least 2/3/4 stables, you can turn this card face down.',
    rewards: [
      {
        requirementText: '2 built stables',
        requirement: { type: 'farm-count-at-least', target: 'stable', amount: 2 },
        rewardText: 'If you do, you immediately get 1 sheep.',
        effects: [{ type: 'gain-resources', resources: { sheep: 1 } }],
      },
      {
        requirementText: '3 built stables',
        requirement: { type: 'farm-count-at-least', target: 'stable', amount: 3 },
        rewardText: 'If you do, you immediately get 2 sheep.',
        effects: [{ type: 'gain-resources', resources: { sheep: 2 } }],
      },
      {
        requirementText: '4 built stables',
        requirement: { type: 'farm-count-at-least', target: 'stable', amount: 4 },
        rewardText: 'If you do, you immediately get 3 sheep.',
        effects: [{ type: 'gain-resources', resources: { sheep: 3 } }],
      },
    ],
  },
  PS10: {
    conditionText: 'If you have built at least 6/9/12 fences, you can turn this card face down.',
    rewards: [
      {
        requirementText: '6 built fences',
        requirement: { type: 'farm-count-at-least', target: 'fence', amount: 6 },
        rewardText: 'If you do, you immediately get 1 wild boar.',
        effects: [{ type: 'gain-resources', resources: { boar: 1 } }],
      },
      {
        requirementText: '9 built fences',
        requirement: { type: 'farm-count-at-least', target: 'fence', amount: 9 },
        rewardText: 'If you do, you immediately get 2 wild boar.',
        effects: [{ type: 'gain-resources', resources: { boar: 2 } }],
      },
      {
        requirementText: '12 built fences',
        requirement: { type: 'farm-count-at-least', target: 'fence', amount: 12 },
        rewardText: 'If you do, you immediately get 3 wild boar.',
        effects: [{ type: 'gain-resources', resources: { boar: 3 } }],
      },
    ],
  },
  PS11: {
    conditionText: 'If you have at least 3/4/5 grain in your supply, you can turn this card face down.',
    rewards: [
      {
        requirementText: '3 grain in your supply',
        requirement: { type: 'resource-at-least', resource: 'grain', amount: 3 },
        rewardText: 'If you do, you immediately get 1 clay.',
        effects: [{ type: 'gain-resources', resources: { clay: 1 } }],
      },
      {
        requirementText: '4 grain in your supply',
        requirement: { type: 'resource-at-least', resource: 'grain', amount: 4 },
        rewardText: 'If you do, you immediately get 2 clay.',
        effects: [{ type: 'gain-resources', resources: { clay: 2 } }],
      },
      {
        requirementText: '5 grain in your supply',
        requirement: { type: 'resource-at-least', resource: 'grain', amount: 5 },
        rewardText: 'If you do, you immediately get 3 clay.',
        effects: [{ type: 'gain-resources', resources: { clay: 3 } }],
      },
    ],
  },
  PS12: {
    conditionText: 'If you have at least 2/3/4 vegetables in your supply, you can turn this card face down.',
    rewards: [
      {
        requirementText: '2 vegetables in your supply',
        requirement: { type: 'resource-at-least', resource: 'vegetable', amount: 2 },
        rewardText: 'If you do, you immediately get 2 food.',
        effects: [{ type: 'gain-resources', resources: { food: 2 } }],
      },
      {
        requirementText: '3 vegetables in your supply',
        requirement: { type: 'resource-at-least', resource: 'vegetable', amount: 3 },
        rewardText: 'If you do, you immediately get 3 food.',
        effects: [{ type: 'gain-resources', resources: { food: 3 } }],
      },
      {
        requirementText: '4 vegetables in your supply',
        requirement: { type: 'resource-at-least', resource: 'vegetable', amount: 4 },
        rewardText: 'If you do, you immediately get 4 food.',
        effects: [{ type: 'gain-resources', resources: { food: 4 } }],
      },
    ],
  },
} as const satisfies Record<string, {
  conditionText: string
  rewards: readonly {
    requirementText: string
    requirement: FatherRequirement
    rewardText: string
    effects: readonly FatherRewardEffect[]
  }[]
}>

describe('father parent cards', () => {
  it('keeps each father card in a dedicated definition file', () => {
    const fathersRegistrySource = readFileSync(fathersRegistryPath, 'utf8')

    for (const id of FATHER_PARENT_CARD_IDS) {
      expect(existsSync(cardSourcePath(id))).toBe(true)
      expect(fathersRegistrySource).toContain(`import { ${id} } from './${id}'`)
    }

    expect(fathersRegistrySource).not.toContain('conditionText:')
    expect(fathersRegistrySource).not.toContain('rewards:')
  })

  it('extracts exactly the PS01-PS12 father definitions without gameplay hooks', () => {
    expect(fatherParentCards).toHaveLength(12)
    expect(fatherParentCards.map(card => card.id)).toEqual(FATHER_PARENT_CARD_IDS)
    expect(new Set(fatherParentCards.map(card => card.id)).size).toBe(12)

    for (const card of fatherParentCards) {
      expect(card.kind).toBe('father')
      expect(card.text).toContain(card.conditionText)
      expect(card.assets).toEqual({ front: `${card.id}.png`, back: 'father' })
      expect(getParentCardDefinition(card.id)).toBe(card)
      expect(JSON.stringify(card)).not.toContain('function')
    }
  })

  it('keeps every father reward tier mutually exclusive and structurally reviewed', () => {
    for (const card of fatherParentCards) {
      expect(card.rewards.map(reward => reward.tier)).toEqual([1, 2, 3])

      for (const reward of card.rewards) {
        expect(reward.requirementText).not.toBe('')
        expect(reward.rewardText).not.toBe('')
        expect(reward.effects.length).toBeGreaterThan(0)

        for (const effect of reward.effects) {
          if (effect.type === 'manual') {
            expect(effect.key).not.toBe('')
            expect(effect.reviewed).toBe(true)
          }
        }
      }
    }
  })

  it('matches the scanned English source text and structured reward data', () => {
    for (const id of FATHER_PARENT_CARD_IDS) {
      const card = fatherParentCards.find(candidate => candidate.id === id)
      const expected = expectedFatherCards[id]
      expect(card?.conditionText).toBe(expected.conditionText)
      expect(card?.rewards.map(({ requirementText, requirement, rewardText, effects }) => ({
        requirementText,
        requirement,
        rewardText,
        effects,
      }))).toEqual(expected.rewards)
    }
  })

  it('uses typed requirement data for characterized father runtime requirements', () => {
    const expectedTypes = {
      PS03: 'animal-type-count-at-least',
      PS04: 'same-animal-type-at-least',
      PS06: 'total-cards-in-play-including-parents-at-least',
      PS08: 'unused-farmyard-spaces-at-most',
    } as const

    for (const [id, type] of Object.entries(expectedTypes)) {
      const card = fatherParentCards.find(candidate => candidate.id === id)
      expect(card?.rewards.map(reward => reward.requirement.type)).toEqual([type, type, type])
    }
  })

  it('keeps father runtime assets available under the resolved public asset paths', () => {
    for (const id of FATHER_PARENT_CARD_IDS) {
      expect(existsSync(assetPath(`portrait/${id}.png`))).toBe(true)
    }

    expect(existsSync(assetPath('backs/father.png'))).toBe(true)
  })
})
