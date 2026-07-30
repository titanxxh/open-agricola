import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'

import { describe, expect, it } from 'vitest'

import {
  FATHER_PARENT_CARD_IDS,
  MOTHER_PARENT_CARD_IDS,
  PARENT_CARD_IDS,
  fatherParentCards,
  getParentCardDefinition,
  isParentCardId,
  motherParentCards,
  parentCards,
} from '../index'
import type {
  FatherRewardEffect,
  MotherRoundGain,
  ParentCardDefinition,
} from '../types'

const repoPath = (relativePath: string): string =>
  fileURLToPath(new URL(`../../../${relativePath}`, import.meta.url))

const requiredPublicAssets = new Set(
  (JSON.parse(readFileSync(repoPath('public-assets.required.json'), 'utf8')) as { files: string[] }).files,
)

const assertMotherGainShape = (gain: MotherRoundGain, id: string) => {
  if (gain.type === 'resource') {
    expect(gain.resource, id).not.toBe('begging')
    expect(gain.amount, id).toBeGreaterThan(0)
    return
  }

  if (gain.type === 'field') {
    expect(gain.amount, id).toBe(1)
    return
  }

  expect(gain).toEqual({
    type: 'stable',
    amount: 1,
    fromSupply: true,
    freeBuild: true,
  })
}

const assertReviewedManualEffect = (effect: FatherRewardEffect, id: string): void => {
  if (effect.type === 'manual') {
    expect(effect.key, id).not.toBe('')
    expect(effect.reviewed, id).toBe(true)
  }
}

describe('complete parent card extraction', () => {
  it('exposes exactly the complete PR01-PR12 and PS01-PS12 registry', () => {
    expect(parentCards).toHaveLength(24)
    expect(motherParentCards).toHaveLength(12)
    expect(fatherParentCards).toHaveLength(12)
    expect(parentCards.map(card => card.id)).toEqual(PARENT_CARD_IDS)
    expect(new Set(parentCards.map(card => card.id)).size).toBe(24)
    expect(parentCards.filter(card => card.kind === 'mother').map(card => card.id)).toEqual(MOTHER_PARENT_CARD_IDS)
    expect(parentCards.filter(card => card.kind === 'father').map(card => card.id)).toEqual(FATHER_PARENT_CARD_IDS)
  })

  it('returns the registry definition from lookup and omits unknown ids', () => {
    for (const card of parentCards) {
      expect(isParentCardId(card.id), card.id).toBe(true)
      expect(getParentCardDefinition(card.id), card.id).toBe(card)
    }

    expect(isParentCardId('PR00')).toBe(false)
    expect(isParentCardId('PS13')).toBe(false)
    expect(getParentCardDefinition('PR00')).toBeUndefined()
    expect(getParentCardDefinition('PS13')).toBeUndefined()
  })

  it('keeps mother scores, rounds, and gains in executable data shapes', () => {
    for (const card of motherParentCards) {
      expect(card.score, card.id).toSatisfy(Number.isFinite)
      expect(card.round, card.id).toBeGreaterThanOrEqual(1)
      expect(card.round, card.id).toBeLessThanOrEqual(14)
      expect(card.text.trim(), card.id).not.toBe('')
      assertMotherGainShape(card.gain, card.id)
    }
  })

  it('keeps father reward tiers structured and reviewed', () => {
    for (const card of fatherParentCards) {
      expect(card.conditionText.trim(), card.id).not.toBe('')
      expect(card.rewards.map(reward => reward.tier), card.id).toEqual([1, 2, 3])

      for (const reward of card.rewards) {
        expect(reward.requirementText.trim(), card.id).not.toBe('')
        expect(reward.rewardText.trim(), card.id).not.toBe('')
        expect(reward.effects.length, card.id).toBeGreaterThan(0)
        reward.effects.forEach(effect => assertReviewedManualEffect(effect, card.id))
      }
    }
  })

  it('keeps runtime asset references logical and backed by the public asset contract', () => {
    expect(requiredPublicAssets.has('assets/parents/backs/mother.png')).toBe(true)
    expect(requiredPublicAssets.has('assets/parents/backs/father.png')).toBe(true)

    for (const card of parentCards) {
      expect(card.assets).toEqual({
        front: `${card.id}.png`,
        back: card.kind,
      })
      expect(requiredPublicAssets.has(`assets/parents/portrait/${card.assets.front}`), card.id).toBe(true)
    }
  })

  it('does not put extraction intermediates or reference artifacts into runtime definitions', () => {
    const serializedDefinitions = JSON.stringify(parentCards satisfies readonly ParentCardDefinition[])

    for (const forbidden of [
      'output/rules/assets',
      'assets/pages',
      'assets/cards',
      '0581_001',
      '0582_001',
      '0583_001',
      'extraction-audit',
      'render-reference',
      '.pdf',
    ]) {
      expect(serializedDefinitions).not.toContain(forbidden)
    }
  })
})
