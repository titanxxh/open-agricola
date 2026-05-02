import { describe, expect, it } from 'vitest'
import { computeHarvestFeedCounterMax } from '../use-harvest-feed-counter'
import { emptyResources } from '../../../../shared/logic/state-constants'
import type { HarvestFeedOption } from '../use-harvest-flow'
import type { Resource } from '../../../../shared/game/types'

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
})
