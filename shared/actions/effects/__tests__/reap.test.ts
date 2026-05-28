import { describe, it, expect, vi, afterEach } from 'vitest'
import { reap } from '../reap'
import type { GameState, PlayerState, Field } from '../../../contract/types'
import * as cardListeners from '../../../cards/card-listeners'

const mkState = (): Pick<GameState, 'players'> => ({ players: [] as PlayerState[] })

const mkPlayer = (fields: Field[]): Partial<PlayerState> => ({
  fields,
  resources: { grain: 0, vegetable: 0 },
})

describe('reap with stacks', () => {
  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('harvests top stack only, decrements remaining', () => {
    vi.spyOn(cardListeners, 'runCardListeners').mockImplementation(() => {})
    const p = mkPlayer([
      { stacks: [{ kind: 'grain', remaining: 3 }], row: 0, col: 0 },
    ])
    const res = reap(mkState(), p)
    expect(res.type).toBe('ok')
    expect(p.resources.grain).toBe(1)
    expect(p.fields[0].stacks).toEqual([{ kind: 'grain', remaining: 2 }])
    expect(res.reapSummary.grainFields).toBe(1)
    expect(res.reapSummary.resources.grain).toBe(1)
  })

  it('records harvested crop details for baseline reap', () => {
    vi.spyOn(cardListeners, 'runCardListeners').mockImplementation(() => {})
    const p = mkPlayer([
      { stacks: [{ kind: 'grain', remaining: 3 }], row: 0, col: 0 },
    ])
    const res = reap(mkState(), p)
    expect(res.reapSummary.harvestedCrops).toEqual([
      { row: 0, col: 0, crop: 'grain', amount: 1, sources: ['base'] },
    ])
    expect(res.reapSummary.harvestedPositions).toEqual([{ row: 0, col: 0 }])
  })

  it('uses harvest count to reap multiple crops from one field and keeps one position', () => {
    vi.spyOn(cardListeners, 'runCardListeners').mockImplementation(() => {})
    const p = mkPlayer([
      {
        stacks: [
          { kind: 'vegetable', remaining: 1 },
          { kind: 'grain', remaining: 2 },
        ],
        row: 0,
        col: 0,
      },
    ])
    const res = reap(mkState(), p, undefined, {
      harvestCounts: {
        '0-0': { count: 3, sources: ['base', 'test-extra'] },
      },
    })
    expect(p.resources.grain).toBe(2)
    expect(p.resources.vegetable).toBe(1)
    expect(p.fields[0].stacks).toEqual([])
    expect(res.reapSummary.grainFields).toBe(2)
    expect(res.reapSummary.vegetableFields).toBe(1)
    expect(res.reapSummary.harvestedCrops).toEqual([
      { row: 0, col: 0, crop: 'grain', amount: 2, sources: ['base', 'test-extra'] },
      { row: 0, col: 0, crop: 'vegetable', amount: 1, sources: ['base', 'test-extra'] },
    ])
    expect(res.reapSummary.harvestedPositions).toEqual([{ row: 0, col: 0 }])
  })

  it('does not record fields whose final harvest count is zero', () => {
    vi.spyOn(cardListeners, 'runCardListeners').mockImplementation(() => {})
    const p = mkPlayer([
      { stacks: [{ kind: 'grain', remaining: 2 }], row: 0, col: 0 },
    ])
    const res = reap(mkState(), p, undefined, {
      harvestCounts: {
        '0-0': { count: 0, sources: ['base', 'E112_GrainThief'] },
      },
    })
    expect(p.resources.grain).toBe(0)
    expect(p.fields[0].stacks).toEqual([{ kind: 'grain', remaining: 2 }])
    expect(res.reapSummary.resources).toEqual({})
    expect(res.reapSummary.harvestedCrops).toEqual([])
    expect(res.reapSummary.harvestedPositions).toEqual([])
  })

  it('pops empty top stack, exposes buried stack next round', () => {
    vi.spyOn(cardListeners, 'runCardListeners').mockImplementation(() => {})
    const p = mkPlayer([
      {
        stacks: [
          { kind: 'vegetable', remaining: 1 },
          { kind: 'grain', remaining: 1 },
        ],
        row: 0,
        col: 0,
      },
    ])
    reap(mkState(), p)
    expect(p.resources.grain).toBe(1)
    expect(p.fields[0].stacks).toEqual([{ kind: 'vegetable', remaining: 1 }])
    reap(mkState(), p)
    expect(p.resources.vegetable).toBe(1)
    expect(p.fields[0].stacks).toEqual([])
  })

  it('skips empty fields', () => {
    vi.spyOn(cardListeners, 'runCardListeners').mockImplementation(() => {})
    const p = mkPlayer([{ stacks: [], row: 0, col: 0 }])
    const res = reap(mkState(), p)
    expect(res.reapSummary.grainFields).toBe(0)
    expect(res.reapSummary.vegetableFields).toBe(0)
  })

  it('summary counts fields by TOP stack kind', () => {
    vi.spyOn(cardListeners, 'runCardListeners').mockImplementation(() => {})
    const p = mkPlayer([
      {
        stacks: [
          { kind: 'vegetable', remaining: 1 },
          { kind: 'grain', remaining: 2 },
        ],
        row: 0,
        col: 0,
      },
      {
        stacks: [{ kind: 'vegetable', remaining: 1 }],
        row: 0,
        col: 1,
      },
    ])
    const res = reap(mkState(), p)
    expect(res.reapSummary.grainFields).toBe(1)
    expect(res.reapSummary.vegetableFields).toBe(1)
  })

  it('harvests stone-kind top stack into player.resources.stone', () => {
    vi.spyOn(cardListeners, 'runCardListeners').mockImplementation(() => {})
    const p = mkPlayer([
      { stacks: [{ kind: 'stone', remaining: 1 }], row: 2, col: 3 },
    ])
    ;(p.resources as any).stone = 0
    const res = reap(mkState(), p)
    expect(res.type).toBe('ok')
    expect((p.resources as any).stone).toBe(1)
    expect(p.fields![0]!.stacks).toEqual([])
    expect(res.reapSummary.resources.stone).toBe(1)
    expect(res.reapSummary.grainFields).toBe(0)
    expect(res.reapSummary.vegetableFields).toBe(0)
    expect(res.reapSummary.harvestedPositions).toEqual([{ row: 2, col: 3 }])
  })

  it('dispatches reap listener once per crop kind including stone', () => {
    const spy = vi.spyOn(cardListeners, 'runCardListeners').mockImplementation(() => {})
    const p = mkPlayer([
      { stacks: [{ kind: 'grain', remaining: 1 }], row: 0, col: 0 },
      { stacks: [{ kind: 'stone', remaining: 1 }], row: 0, col: 1 },
    ])
    ;(p.resources as any).stone = 0
    reap(mkState(), p)
    const crops = spy.mock.calls.map((c) => (c[0] as { extraData?: { crop?: string } }).extraData?.crop)
    expect(crops).toContain('grain')
    expect(crops).toContain('stone')
    expect(crops).not.toContain('vegetable')
  })
})
