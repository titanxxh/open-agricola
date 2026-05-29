import { afterEach, describe, expect, it, vi } from 'vitest'
import { reap } from '../../actions/effects/reap'
import {
  computeHarvestSelectionThreshold,
  registerHarvestSelectionThresholdModifier,
  unregisterHarvestSelectionThresholdModifier,
} from '../../actions/helpers/harvest-count-registry'
import type { Field, GameState, PlayerState } from '../../contract/types'
import * as cardListeners from '../card-listeners'
import { A112_ScytheWorker_impl } from '../A/A112_ScytheWorker'
import { D72_StableManure_impl } from '../D/D72_StableManure'
import { E112_GrainThief_impl } from '../E/E112_GrainThief'
import '../E/E73_Scythe'

const makePlayer = (fields: Field[]): PlayerState => ({
  id: 'p1',
  name: 'Player 1',
  color: 'red',
  resources: { grain: 0, vegetable: 0 },
  workers: [],
  rooms: 2,
  houseType: 'wood',
  fields,
  roomTiles: [],
  stableTiles: [],
  improvements: [],
  minorHand: [],
  minorPlayed: [],
  occupationHand: [],
  occupationPlayed: [],
  extraOccupationsFromCards: [],
  playedCards: [],
  houseAnimalType: null,
  houseAnimalCount: 0,
  stableAnimals: {},
  pastures: [],
  fenceSegments: [],
  majorEffects: {},
  startPlayer: false,
  activeModifiers: [],
  cardStates: {},
  stats: { actions: {} },
})

const makeState = (player: PlayerState): GameState => ({
  players: [player],
} as GameState)

describe('A112 and D72 harvest count integration', () => {
  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('normal reap records a base harvest count application', () => {
    vi.spyOn(cardListeners, 'runCardListeners').mockImplementation(() => [])
    const player = makePlayer([
      { row: 0, col: 0, stacks: [{ kind: 'grain', remaining: 2 }] },
    ])

    const result = reap(makeState(player), player)

    expect(result.reapSummary.harvestCountApplications).toEqual([
      {
        row: 0,
        col: 0,
        crop: 'grain',
        count: 1,
        sources: ['base'],
        tags: [],
        scope: 'top-stack',
      },
    ])
  })

  it('E73 full-field reap records a tagged field-scope application', () => {
    vi.spyOn(cardListeners, 'runCardListeners').mockImplementation(() => [])
    const player = makePlayer([
      { row: 0, col: 0, stacks: [{ kind: 'grain', remaining: 3 }] },
    ])
    player.minorPlayed.push('E73_Scythe')
    player.cardStates.E73_Scythe = {
      extraData: { fullReapPosition: '0-0' },
    }

    const result = reap(makeState(player), player)

    expect(result.reapSummary.harvestCountApplications).toEqual([
      {
        row: 0,
        col: 0,
        crop: 'grain',
        count: 3,
        sources: ['base', 'E73_Scythe'],
        tags: ['full-field-reap'],
        scope: 'field',
      },
    ])
  })

  it('E112 supply-style reap records a tagged zero-count application', () => {
    vi.spyOn(cardListeners, 'runCardListeners').mockImplementation(() => [])
    const player = makePlayer([
      { row: 0, col: 0, stacks: [{ kind: 'grain', remaining: 2 }] },
    ])
    player.occupationPlayed.push('E112_GrainThief')
    player.cardStates.E112_GrainThief = {
      extraData: { selectedPositions: ['0-0'] },
    }

    const result = reap(makeState(player), player)

    expect(player.resources.grain).toBe(0)
    expect(player.fields[0]!.stacks).toEqual([{ kind: 'grain', remaining: 2 }])
    expect(result.reapSummary.harvestCountApplications).toEqual([
      {
        row: 0,
        col: 0,
        crop: 'grain',
        count: 0,
        sources: ['base', 'E112_GrainThief'],
        tags: ['supply-instead-of-field'],
        scope: 'top-stack',
      },
    ])
  })

  it('E112 end field phase grants supply grain from harvest count applications', () => {
    const player = makePlayer([
      { row: 0, col: 0, stacks: [] },
      { row: 0, col: 1, stacks: [] },
    ])
    player.occupationPlayed.push('E112_GrainThief')
    player.cardStates.E112_GrainThief = {
      extraData: { selectedPositions: ['0-0', '0-1'] },
    }
    const state = makeState(player)
    state.harvestReapSummary = {
      [player.id]: {
        resources: { grain: 2 },
        grainFields: 1,
        vegetableFields: 0,
        harvestCountApplications: [
          {
            row: 0,
            col: 0,
            crop: 'grain',
            count: 0,
            sources: ['base', 'E112_GrainThief'],
            tags: ['supply-instead-of-field'],
            scope: 'top-stack',
          },
          {
            row: 0,
            col: 1,
            crop: 'grain',
            count: 2,
            sources: ['base', 'E112_GrainThief', 'E73_Scythe'],
            tags: ['supply-instead-of-field', 'full-field-reap'],
            scope: 'field',
          },
        ],
      },
    }

    const flow = E112_GrainThief_impl.effect.onEndHarvestFieldPhase!(state, player)

    expect(flow).toMatchObject({
      type: 'seq',
      children: [
        {
          type: 'leaf',
          actionId: 'gain',
          sourceCard: 'E112_GrainThief',
          params: { grain: 1 },
        },
        {
          type: 'leaf',
          actionId: 'special-effect',
          sourceCard: 'E112_GrainThief',
          params: { kind: 'set-extra-data', key: 'selectedPositions', value: undefined },
        },
      ],
    })
  })

  it('generic harvest selection threshold modifiers can lower field thresholds', () => {
    const modifierId = '__TEST_harvest_threshold__'
    registerHarvestSelectionThresholdModifier(modifierId, ({ field }) => {
      const top = field.stacks[0]
      if (top?.kind !== 'vegetable') return
      return { threshold: 1, sources: [modifierId] }
    })
    const player = makePlayer([
      { row: 0, col: 0, stacks: [{ kind: 'vegetable', remaining: 1 }] },
    ])

    const result = computeHarvestSelectionThreshold(makeState(player), player, player.fields[0]!, {
      sourceCard: 'D72_StableManure',
      baseThreshold: 2,
    })

    expect(result).toEqual({ threshold: 1, sources: [modifierId] })
    unregisterHarvestSelectionThresholdModifier(modifierId)
  })

  it('A112 adds one harvest count to selected grain fields and reports its source', () => {
    vi.spyOn(cardListeners, 'runCardListeners').mockImplementation(() => [])
    const player = makePlayer([
      { row: 0, col: 0, stacks: [{ kind: 'grain', remaining: 3 }] },
    ])
    player.occupationPlayed.push('A112_ScytheWorker')
    player.cardStates.A112_ScytheWorker = {
      extraData: { selectedPositions: ['0-0'] },
    }

    const result = reap(makeState(player), player)

    expect(player.resources.grain).toBe(2)
    expect(player.fields[0]!.stacks).toEqual([{ kind: 'grain', remaining: 1 }])
    expect(result.reapSummary.harvestedCrops).toEqual([
      {
        row: 0,
        col: 0,
        crop: 'grain',
        amount: 2,
        sources: ['base', 'A112_ScytheWorker'],
      },
    ])
  })

  it('A112 offers start-field-phase grain selection instead of immediately gaining grain', () => {
    const player = makePlayer([
      { row: 0, col: 0, stacks: [{ kind: 'grain', remaining: 2 }] },
      { row: 0, col: 1, stacks: [{ kind: 'grain', remaining: 1 }] },
      { row: 0, col: 2, stacks: [{ kind: 'vegetable', remaining: 3 }] },
    ])
    const state = makeState(player)

    const flow = A112_ScytheWorker_impl.effect.onStartHarvestFieldPhase!(state, player)
    A112_ScytheWorker_impl.effect.onHarvestFieldPhase?.(state, player)

    expect(player.resources.grain).toBe(0)
    expect(flow).toMatchObject({
      type: 'leaf',
      actionId: 'selection',
      sourceCard: 'A112_ScytheWorker',
      optional: true,
      actionContext: {
        selectionKind: 'farm-position',
        maxSelections: 1,
        selectableTiles: [{ row: 0, col: 0 }],
      },
    })
    expect((flow as { actionContext?: Record<string, unknown> }).actionContext?.selectionEffect).toBeUndefined()
  })

  it('D72 adds one harvest count to selected crop fields and reports its source', () => {
    vi.spyOn(cardListeners, 'runCardListeners').mockImplementation(() => [])
    const player = makePlayer([
      { row: 0, col: 0, stacks: [{ kind: 'vegetable', remaining: 3 }] },
    ])
    player.minorPlayed.push('D72_StableManure')
    player.cardStates.D72_StableManure = {
      extraData: { selectedPositions: ['0-0'] },
    }

    const result = reap(makeState(player), player)

    expect(player.resources.vegetable).toBe(2)
    expect(player.fields[0]!.stacks).toEqual([{ kind: 'vegetable', remaining: 1 }])
    expect(result.reapSummary.harvestedCrops).toEqual([
      {
        row: 0,
        col: 0,
        crop: 'vegetable',
        amount: 2,
        sources: ['base', 'D72_StableManure'],
      },
    ])
  })

  it('D72 without E112 only offers fields with at least two crops total', () => {
    const player = makePlayer([
      { row: 0, col: 0, stacks: [{ kind: 'grain', remaining: 1 }] },
      { row: 0, col: 1, stacks: [{ kind: 'vegetable', remaining: 1 }] },
      { row: 0, col: 2, stacks: [{ kind: 'grain', remaining: 2 }] },
      { row: 0, col: 3, stacks: [{ kind: 'vegetable', remaining: 2 }] },
    ])
    player.minorPlayed.push('D72_StableManure')
    player.stableTiles = [{ row: 2, col: 2 }, { row: 2, col: 3 }]

    const flow = D72_StableManure_impl.effect.onStartHarvestFieldPhase!(makeState(player), player)

    expect(flow).toMatchObject({
      type: 'leaf',
      actionId: 'selection',
      sourceCard: 'D72_StableManure',
      optional: true,
      actionContext: {
        selectionKind: 'farm-position',
        maxSelections: 2,
        selectableTiles: [{ row: 0, col: 2 }, { row: 0, col: 3 }],
      },
    })
    expect((flow as { actionContext?: Record<string, unknown> }).actionContext?.selectionEffect).toBeUndefined()
  })

  it('A112 and E112 on the same grain field cancel to one harvest count and report both sources', () => {
    vi.spyOn(cardListeners, 'runCardListeners').mockImplementation(() => [])
    const player = makePlayer([
      { row: 0, col: 0, stacks: [{ kind: 'grain', remaining: 3 }] },
    ])
    player.occupationPlayed.push('A112_ScytheWorker', 'E112_GrainThief')
    player.cardStates.A112_ScytheWorker = {
      extraData: { selectedPositions: ['0-0'] },
    }
    player.cardStates.E112_GrainThief = {
      extraData: { selectedPositions: ['0-0'] },
    }

    const result = reap(makeState(player), player)

    expect(player.resources.grain).toBe(1)
    expect(player.fields[0]!.stacks).toEqual([{ kind: 'grain', remaining: 2 }])
    const entry = result.reapSummary.harvestedCrops[0]!
    expect(entry).toMatchObject({
      row: 0,
      col: 0,
      crop: 'grain',
      amount: 1,
    })
    expect(entry.sources).toHaveLength(3)
    expect(entry.sources).toEqual(expect.arrayContaining(['base', 'A112_ScytheWorker', 'E112_GrainThief']))
  })

  it('D72 and E112 on the same grain field cancel to one harvest count and report both sources', () => {
    vi.spyOn(cardListeners, 'runCardListeners').mockImplementation(() => [])
    const player = makePlayer([
      { row: 0, col: 0, stacks: [{ kind: 'grain', remaining: 3 }] },
    ])
    player.occupationPlayed.push('E112_GrainThief')
    player.minorPlayed.push('D72_StableManure')
    player.cardStates.D72_StableManure = {
      extraData: { selectedPositions: ['0-0'] },
    }
    player.cardStates.E112_GrainThief = {
      extraData: { selectedPositions: ['0-0'] },
    }

    const result = reap(makeState(player), player)

    expect(player.resources.grain).toBe(1)
    expect(player.fields[0]!.stacks).toEqual([{ kind: 'grain', remaining: 2 }])
    const entry = result.reapSummary.harvestedCrops[0]!
    expect(entry).toMatchObject({
      row: 0,
      col: 0,
      crop: 'grain',
      amount: 1,
    })
    expect(entry.sources).toHaveLength(3)
    expect(entry.sources).toEqual(expect.arrayContaining(['base', 'D72_StableManure', 'E112_GrainThief']))
  })

  it('E112 relaxes A112 and D72 grain-field selection thresholds only', () => {
    const player = makePlayer([
      { row: 0, col: 0, stacks: [{ kind: 'grain', remaining: 1 }] },
      { row: 0, col: 1, stacks: [{ kind: 'vegetable', remaining: 1 }] },
    ])
    player.occupationPlayed.push('E112_GrainThief')
    player.stableTiles = [{ row: 2, col: 2 }, { row: 2, col: 3 }]

    const a112Flow = A112_ScytheWorker_impl.effect.onStartHarvestFieldPhase!(makeState(player), player)
    const d72Flow = D72_StableManure_impl.effect.onStartHarvestFieldPhase!(makeState(player), player)

    expect(a112Flow).toMatchObject({
      actionContext: {
        maxSelections: 1,
        selectableTiles: [{ row: 0, col: 0 }],
      },
    })
    expect(d72Flow).toMatchObject({
      actionContext: {
        maxSelections: 1,
        selectableTiles: [{ row: 0, col: 0 }],
      },
    })
  })

  it('A112 and D72 clear selected positions on end harvest', () => {
    const player = makePlayer([])
    const state = makeState(player)

    expect(A112_ScytheWorker_impl.effect.onEndHarvest!(state, player)).toEqual({
      type: 'leaf',
      actionId: 'special-effect',
      sourceCard: 'A112_ScytheWorker',
      params: { kind: 'set-extra-data', key: 'selectedPositions', value: undefined },
    })
    expect(D72_StableManure_impl.effect.onEndHarvest!(state, player)).toEqual({
      type: 'leaf',
      actionId: 'special-effect',
      sourceCard: 'D72_StableManure',
      params: { kind: 'set-extra-data', key: 'selectedPositions', value: undefined },
    })
  })
})
