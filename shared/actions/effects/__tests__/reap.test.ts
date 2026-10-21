import { describe, it, expect } from 'vitest'
import { reap } from '../reap'
import type { DraftGameEvent } from '../../../contract/events'
import type { GameState, PlayerState, Field } from '../../../contract/types'
import { installOfficialCardRegistry } from '../../../cards/__tests__/card-environment'
import { makeCardFieldImpl } from '../../../cards/helpers/card-field'
import '../../../cards/B/B068_Beanfield'
import '../../../cards/D/D075_WoodField'

installOfficialCardRegistry()

const mkState = (): Pick<GameState, 'players'> => ({ players: [] as PlayerState[] })

const mkPlayer = (fields: Field[]): Partial<PlayerState> => ({
  fields,
  resources: { grain: 0, vegetable: 0 },
})

describe('reap with stacks', () => {
  it('harvests top stack only, decrements remaining', () => {
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
    const p = mkPlayer([{ stacks: [], row: 0, col: 0 }])
    const res = reap(mkState(), p)
    expect(res.reapSummary.grainFields).toBe(0)
    expect(res.reapSummary.vegetableFields).toBe(0)
  })

  it('summary counts fields by TOP stack kind', () => {
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
    const p = mkPlayer([
      { stacks: [{ kind: 'stone', remaining: 1 }], row: 2, col: 3 },
    ])
    p.resources!.stone = 0
    const res = reap(mkState(), p)
    expect(res.type).toBe('ok')
    expect(p.resources!.stone).toBe(1)
    expect(p.fields![0]!.stacks).toEqual([])
    expect(res.reapSummary.resources.stone).toBe(1)
    expect(res.reapSummary.grainFields).toBe(0)
    expect(res.reapSummary.vegetableFields).toBe(0)
    expect(res.reapSummary.harvestedPositions).toEqual([{ row: 2, col: 3 }])
  })

  it('includes stone and grain in the same harvest summary', () => {
    const p = mkPlayer([
      { stacks: [{ kind: 'grain', remaining: 1 }], row: 0, col: 0 },
      { stacks: [{ kind: 'stone', remaining: 1 }], row: 0, col: 1 },
    ])
    p.resources!.stone = 0
    const result = reap(mkState(), p)
    expect(result.reapSummary.resources).toEqual({ grain: 1, stone: 1 })
  })

  it('emits crop events before building Card Field owner reactions', () => {
    const order: string[] = []
    makeCardFieldImpl('A001_OrderField', { allowedCrops: ['grain'], capacity: 1 }, {
      onReap: () => { order.push('owner') },
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

    expect(order).toEqual(['farm.cropRemoved', 'resource.moved', 'owner'])
  })

  it('reaps Farmyard, single-slot, and multi-slot Card Fields through one summary', () => {
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

  })
})
