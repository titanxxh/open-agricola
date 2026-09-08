import { describe, expect, it } from 'vitest'
import { canApplyHarvestFeedCounts, computeHarvestFeedCounterMax } from '../use-harvest-feed-counter'
import { emptyResources } from '../../../../shared/contract/state-constants'
import type { HarvestFeedOption } from '../use-harvest-flow'
import type { Resource } from '../../../../shared/contract/types'

const opt = (
  id: string,
  from: Partial<Resource>,
  to: Partial<Resource> = { food: 1 },
): HarvestFeedOption => ({
  id,
  sourceName: id,
  sourceId: id,
  exchangeIndex: 0,
  from,
  to,
})

describe('computeHarvestFeedCounterMax', () => {
  const playerResources: Resource = { ...emptyResources, sheep: 2, grain: 3 }

  it('debits placed animals before a later farmyard-only conversion', () => {
    const fireplace = opt('fireplace', { sheep: 1 }, { food: 2 })
    const walker = { ...opt('walker', { sheep: 1 }, { stone: 1 }), fromFarmyard: true, max: 1 }
    expect(computeHarvestFeedCounterMax(
      walker,
      [fireplace, walker],
      { fireplace: 1 },
      playerResources,
      { sheep: 1 },
    )).toBe(0)
  })

  it('does not credit newly gained animals to the placed balance', () => {
    const producer = opt('producer', { food: 1 }, { sheep: 1 })
    const walker = { ...opt('walker', { sheep: 1 }, { stone: 1 }), fromFarmyard: true }
    const resources = { ...emptyResources, food: 1, sheep: 1 }
    expect(canApplyHarvestFeedCounts([producer, walker], { producer: 1, walker: 2 }, resources, { sheep: 1 })).toBe(false)
    expect(canApplyHarvestFeedCounts([producer, walker], { producer: 1, walker: 1 }, resources, { sheep: 1 })).toBe(true)
  })

  it('returns floor(have / from[k]) when no other option shares the key', () => {
    const target = opt('A', { grain: 1 })
    const max = computeHarvestFeedCounterMax(target, [target], { A: 0 }, playerResources)
    expect(max).toBe(3)
  })

  it('caps by remaining when other options consume the same from key', () => {
    const a = opt('A', { sheep: 1 })
    const b = opt('B', { sheep: 1 })
    const max = computeHarvestFeedCounterMax(a, [a, b], { A: 0, B: 1 }, playerResources)
    // sheep total 2, B used 1 -> A can use up to 1
    expect(max).toBe(1)
  })

  it('handles multi-from keys: cap is min over all keys', () => {
    const target = opt('Z', { sheep: 1, grain: 2 })
    const max = computeHarvestFeedCounterMax(target, [target], { Z: 0 }, playerResources)
    // sheep allows 2, grain allows floor(3/2)=1 -> min = 1
    expect(max).toBe(1)
  })

  it('returns 0 when target option itself cannot be afforded once', () => {
    const a = opt('A', { sheep: 1 })
    const b = opt('B', { sheep: 1 })
    const max = computeHarvestFeedCounterMax(a, [a, b], { A: 0, B: 2 }, playerResources)
    // B already used 2 sheep; A has 0 left
    expect(max).toBe(0)
  })

  it('includes target current count in calculation (so + button decision is consistent)', () => {
    const a = opt('A', { sheep: 1 })
    const max = computeHarvestFeedCounterMax(a, [a], { A: 1 }, playerResources)
    // sheep 2, target's own count is excluded from "usedByOthers"; remaining is 2
    expect(max).toBe(2)
  })

  it('uses resources produced by an earlier selected exchange', () => {
    const producer = opt('producer', { vegetable: 1 }, { food: 5 })
    const target = { ...opt('target', { food: 2 }, { wood: 1, reed: 1, grain: 1 }), max: 1 }
    const resources = { ...emptyResources, vegetable: 1 }

    expect(computeHarvestFeedCounterMax(
      target,
      [producer, target],
      { producer: 1, target: 0 },
      resources,
    )).toBe(1)
    expect(computeHarvestFeedCounterMax(
      target,
      [target, producer],
      { producer: 1, target: 0 },
      resources,
    )).toBe(0)
  })

  it('shares a source max across exchange rows', () => {
    const first = { ...opt('tier-1', { grain: 1 }), sourceId: 'D062_BeerTap', max: 1 }
    const second = { ...opt('tier-2', { grain: 1 }), sourceId: 'D062_BeerTap', max: 1 }

    expect(computeHarvestFeedCounterMax(
      second,
      [first, second],
      { 'tier-1': 1, 'tier-2': 0 },
      playerResources,
    )).toBe(0)
  })
})
