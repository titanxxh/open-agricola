import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs'
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
  FatherRequirement,
  MotherRoundGain,
  ParentCardDefinition,
} from '../types'

const PNG_SIGNATURE = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])

const repoPath = (relativePath: string): string =>
  fileURLToPath(new URL(`../../../${relativePath}`, import.meta.url))

const assertPngExists = (relativePath: string) => {
  const path = repoPath(relativePath)
  expect(existsSync(path), relativePath).toBe(true)
  expect(statSync(path).size, relativePath).toBeGreaterThan(0)
  expect(readFileSync(path).subarray(0, PNG_SIGNATURE.length), relativePath).toEqual(PNG_SIGNATURE)
}

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

const assertReviewedManualRequirement = (requirement: FatherRequirement, id: string): void => {
  if (requirement.type === 'manual') {
    expect(requirement.key, id).not.toBe('')
    expect(requirement.reviewed, id).toBe(true)
    return
  }

  if (requirement.type === 'all' || requirement.type === 'any') {
    expect(requirement.requirements.length, id).toBeGreaterThan(0)
    requirement.requirements.forEach(child => assertReviewedManualRequirement(child, id))
  }
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
        assertReviewedManualRequirement(reward.requirement, card.id)
        reward.effects.forEach(effect => assertReviewedManualEffect(effect, card.id))
      }
    }
  })

  it('keeps runtime asset references logical and backed by public assets', () => {
    const cardFiles = readdirSync(repoPath('public/assets/parents/portrait'))
      .filter(file => file.endsWith('.png'))
      .sort()

    expect(cardFiles).toEqual(PARENT_CARD_IDS.map(id => `${id}.png`).sort())
    expect(existsSync(repoPath('public/assets/parents/cards'))).toBe(false)
    assertPngExists('public/assets/parents/backs/mother.png')
    assertPngExists('public/assets/parents/backs/father.png')

    for (const card of parentCards) {
      expect(card.assets).toEqual({
        front: `${card.id}.png`,
        back: card.kind,
      })
      assertPngExists(`public/assets/parents/portrait/${card.assets.front}`)
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
