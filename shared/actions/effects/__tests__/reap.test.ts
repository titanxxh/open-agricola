import { describe, it, expect, vi, afterEach } from 'vitest'
import { reap } from '../reap'
import type { DraftGameEvent } from '../../../contract/events'
import type { GameState, PlayerState, Field } from '../../../contract/types'
import * as cardListeners from '../../../cards/card-listeners'
import { makeCardFieldImpl } from '../../../cards/helpers/card-field'
import '../../../cards/B/B068_Beanfield'
import '../../../cards/D/D075_WoodField'

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

  it('uses field-scope harvest count to reap multiple crops from one field and keeps field counters distinct from amounts', () => {
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
        '0-0': { count: 3, sources: ['base', 'test-extra'], scope: 'field' },
      },
    })
    expect(p.resources.grain).toBe(2)
    expect(p.resources.vegetable).toBe(1)
    expect(p.fields[0].stacks).toEqual([])
    expect(res.reapSummary.grainFields).toBe(1)
    expect(res.reapSummary.vegetableFields).toBe(1)
    expect(res.reapSummary.harvestedCrops).toEqual([
      { row: 0, col: 0, crop: 'grain', amount: 2, sources: ['base', 'test-extra'] },
      { row: 0, col: 0, crop: 'vegetable', amount: 1, sources: ['base', 'test-extra'] },
    ])
    expect(res.reapSummary.harvestedPositions).toEqual([{ row: 0, col: 0 }])
  })

  it('continues ordinary harvest count modifiers into the next stack when the top stack is depleted', () => {
    vi.spyOn(cardListeners, 'runCardListeners').mockImplementation(() => {})
    const events: DraftGameEvent[] = []
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
    const res = reap(mkState(), p, {
      emit: (event) => events.push(event),
      emitMany: (nextEvents) => events.push(...nextEvents),
    }, {
      harvestCounts: {
        '0-0': { count: 2, sources: ['base', 'test-extra'] },
      },
    })
    expect(p.resources.grain).toBe(1)
    expect(p.resources.vegetable).toBe(1)
    expect(p.fields[0].stacks).toEqual([])
    expect(res.reapSummary.grainFields).toBe(1)
    expect(res.reapSummary.vegetableFields).toBe(1)
    expect(res.reapSummary.harvestedCrops).toEqual([
      { row: 0, col: 0, crop: 'grain', amount: 1, sources: ['base', 'test-extra'] },
      { row: 0, col: 0, crop: 'vegetable', amount: 1, sources: ['base', 'test-extra'] },
    ])
    expect(events).toEqual([
      expect.objectContaining({ type: 'farm.cropRemoved', crops: [expect.objectContaining({ crop: 'grain', amount: 1 })] }),
      expect.objectContaining({ type: 'resource.moved', resources: { grain: 1 } }),
      expect.objectContaining({ type: 'farm.cropRemoved', crops: [expect.objectContaining({ crop: 'vegetable', amount: 1 })] }),
      expect.objectContaining({ type: 'resource.moved', resources: { vegetable: 1 } }),
    ])
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

  it('emits crop events and dispatches generic listeners before Card Field owner callbacks', () => {
    const order: string[] = []
    makeCardFieldImpl('A001_OrderField', { allowedCrops: ['grain'], capacity: 1 }, {
      onReap: () => { order.push('owner') },
    })
    vi.spyOn(cardListeners, 'runCardListeners').mockImplementation(() => {
      order.push('listener')
      return []
    })
    const player = {
      id: 'p1',
      ...mkPlayer([]),
      minorPlayed: ['A001_OrderField'],
      occupationPlayed: [],
      improvements: [],
      cardStates: {
        A001_OrderField: { extraData: { cardFieldStacks: [{ crop: 'grain', remaining: 1 }] } },
      },
    } as PlayerState

    reap({ players: [player], round: 4 } as GameState, player, {
      emit: (event) => { order.push(event.type) },
      emitMany: (events) => { order.push(...events.map((event) => event.type)) },
    })

    expect(order).toEqual(['farm.cropRemoved', 'resource.moved', 'listener', 'owner'])
  })

  it('reaps Farmyard, single-slot, and multi-slot Card Fields through one summary', () => {
    const spy = vi.spyOn(cardListeners, 'runCardListeners').mockImplementation(() => [])
    const events: DraftGameEvent[] = []
    const player = {
      id: 'p1',
      ...mkPlayer([{ stacks: [{ kind: 'grain', remaining: 2 }], row: 0, col: 0 }]),
      minorPlayed: ['B068_Beanfield', 'D075_WoodField'],
      occupationPlayed: [],
      improvements: [],
      cardStates: {
        B068_Beanfield: { extraData: { cardFieldStacks: [{ crop: 'vegetable', remaining: 2 }] } },
        D075_WoodField: {
          extraData: {
            cardFieldStacks: [
              { crop: 'wood', remaining: 1 },
              { crop: 'wood', remaining: 2 },
            ],
          },
        },
      },
    } as PlayerState
    const state = { players: [player], round: 4 } as GameState

    const result = reap(state, player, {
      emit: (event) => events.push(event),
      emitMany: (nextEvents) => events.push(...nextEvents),
    })

    expect(player.resources).toMatchObject({ grain: 1, vegetable: 1, wood: 2 })
    expect(player.fields[0]?.stacks).toEqual([{ kind: 'grain', remaining: 1 }])
    expect(player.cardStates.B068_Beanfield?.extraData?.cardFieldStacks).toEqual([
      { crop: 'vegetable', remaining: 1 },
    ])
    expect(player.cardStates.D075_WoodField?.extraData?.cardFieldStacks).toEqual([
      null,
      { crop: 'wood', remaining: 1 },
    ])
    expect(result.reapSummary).toMatchObject({
      resources: { grain: 1, vegetable: 1, wood: 2 },
      grainFields: 1,
      vegetableFields: 1,
      harvestedPositions: [
        { row: 0, col: 0 },
        { row: -1, col: 2068 },
        { row: -1, col: 4075 },
      ],
    })
    expect(result.reapSummary.harvestedCrops).toEqual([
      { row: 0, col: 0, crop: 'grain', amount: 1, sources: ['base'] },
      { row: -1, col: 2068, crop: 'vegetable', amount: 1, sources: ['base'] },
      { row: -1, col: 4075, crop: 'wood', amount: 1, sources: ['base'] },
      { row: -1, col: 4076, crop: 'wood', amount: 1, sources: ['base'] },
    ])
    expect(result.reapSummary.harvestCountApplications).toEqual([
      { row: 0, col: 0, crop: 'grain', count: 1, sources: ['base'], tags: [], scope: 'top-stack' },
      { row: -1, col: 2068, crop: 'vegetable', count: 1, sources: ['base'], tags: [], scope: 'top-stack' },
      { row: -1, col: 4075, crop: 'wood', count: 1, sources: ['base'], tags: [], scope: 'top-stack' },
      { row: -1, col: 4076, crop: 'wood', count: 1, sources: ['base'], tags: [], scope: 'top-stack' },
    ])
    expect(events.filter((event) => event.type === 'farm.cropRemoved')).toHaveLength(4)
    expect(events.filter((event) => event.type === 'resource.moved')).toHaveLength(4)
    expect(spy.mock.calls.map((call) => call[0].extraData)).toEqual([
      expect.objectContaining({ crop: 'grain', amount: 1 }),
      expect.objectContaining({ crop: 'vegetable', amount: 1 }),
      expect.objectContaining({ crop: 'wood', amount: 2 }),
    ])
  })
})
