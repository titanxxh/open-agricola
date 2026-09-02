import { afterEach, describe, expect, it, vi } from 'vitest'
import { internalActionDefinitions } from '../../internal-actions'
import type { GameState, PlayerState, Resource } from '../../../contract/types'
import * as cardListeners from '../../../cards/card-listeners'
import { makeCardFieldImpl } from '../../../cards/helpers/card-field'
import '../../../cards/E/E068_CherryOrchard'
import '../../../cards/E/E072_ArtichokeField'

const emptyResources = (): Resource => ({
  wood: 0,
  clay: 0,
  reed: 0,
  stone: 0,
  food: 0,
  grain: 0,
  vegetable: 0,
  sheep: 0,
  boar: 0,
  cattle: 0,
  begging: 0,
})

const privateReapContext = { trigger: { phase: 'private-field-phase' } }

describe('reap action private-field-phase trigger', () => {
  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('reaps ordinary fields with private-field-phase trigger metadata', () => {
    vi.spyOn(cardListeners, 'runCardListeners').mockImplementation(() => [])
    const action = internalActionDefinitions.find((entry) => entry.id === 'reap')
    expect(action).toBeDefined()
    const events: unknown[] = []
    const player = {
      id: 'p1',
      resources: emptyResources(),
      fields: [
        { row: 0, col: 0, stacks: [{ kind: 'vegetable' as const, remaining: 1 }] },
      ],
    } as PlayerState
    const state = {
      players: [player],
      harvestReapSummary: {
        p1: { resources: {}, grainFields: 0, vegetableFields: 0, harvestedPositions: [] },
      },
    } as unknown as GameState

    const result = action!.execute({
      state,
      player,
      space: { id: 'reap' },
      sourceCard: 'C072_FestivalPlanning',
      actionContext: privateReapContext,
      eventSink: { emit: (event: unknown) => events.push(event) },
    } as never)

    expect(result.type).toBe('ok')
    expect(player.resources.vegetable).toBe(1)
    expect(player.fields[0]!.stacks).toEqual([])
    expect(state.harvestReapSummary!.p1).toEqual({
      resources: {},
      grainFields: 0,
      vegetableFields: 0,
      harvestedPositions: [],
    })
    expect(events).toEqual([
      expect.objectContaining({
        type: 'farm.cropRemoved',
        reason: 'reap',
        trigger: { phase: 'private-field-phase', cardId: 'C072_FestivalPlanning' },
      }),
      expect.objectContaining({
        type: 'resource.moved',
        reason: 'reap',
        trigger: { phase: 'private-field-phase', cardId: 'C072_FestivalPlanning' },
      }),
    ])
  })

  it('is not executable and does not no-op when the current player has no harvestable crops', () => {
    const action = internalActionDefinitions.find((entry) => entry.id === 'reap')
    expect(action).toBeDefined()
    const player = {
      id: 'p1',
      resources: emptyResources(),
      fields: [{ row: 0, col: 0, stacks: [] }],
      minorPlayed: [],
      occupationPlayed: [],
      improvements: [],
      cardStates: {},
    } as unknown as PlayerState
    const state = { players: [player] } as unknown as GameState

    expect(action!.canBeExecutedByPlayer(state, player, { actionContext: privateReapContext })).toBe(false)
    expect(action!.execute({
      state,
      player,
      space: { id: 'reap' },
      sourceCard: 'C072_FestivalPlanning',
      actionContext: privateReapContext,
    } as never)).toEqual({ type: 'fail', errorKey: 'log.action' })
  })

  it('reaps Card Fields after ordinary fields and returns onReap flow in the same parallel reaction', () => {
    const listenerSpy = vi.spyOn(cardListeners, 'runCardListeners').mockImplementation(() => [])
    const action = internalActionDefinitions.find((entry) => entry.id === 'reap')
    expect(action).toBeDefined()
    const events: unknown[] = []
    const player = {
      id: 'p1',
      resources: emptyResources(),
      fields: [
        { row: 0, col: 0, stacks: [{ kind: 'grain' as const, remaining: 1 }] },
      ],
      minorPlayed: ['E068_CherryOrchard'],
      occupationPlayed: [],
      improvements: [],
      cardStates: {
        E068_CherryOrchard: {
          extraData: { cardFieldStacks: [{ crop: 'wood', remaining: 1 }] },
        },
      },
    } as unknown as PlayerState
    const state = {
      players: [player],
      harvestReapSummary: {
        p1: { resources: {}, grainFields: 0, vegetableFields: 0, harvestedPositions: [] },
      },
    } as unknown as GameState

    const result = action!.execute({
      state,
      player,
      space: { id: 'reap' },
      sourceCard: 'C072_FestivalPlanning',
      actionContext: privateReapContext,
      eventSink: { emit: (event: unknown) => events.push(event) },
    } as never)

    expect(player.resources.grain).toBe(1)
    expect(player.resources.wood).toBe(1)
    expect(player.cardStates.E068_CherryOrchard?.extraData?.cardFieldStacks).toEqual([null])
    expect(state.harvestReapSummary?.p1?.harvestedPositions).toEqual([])
    expect(events.map((event) => (event as { from?: { kind?: string } }).from?.kind)).toEqual([
      undefined,
      'field',
      'card',
    ])
    expect(listenerSpy.mock.calls.map((call) => call[0].extraData)).toEqual([
      {
        crop: 'grain',
        amount: 1,
        trigger: { phase: 'private-field-phase', cardId: 'C072_FestivalPlanning' },
        sourceCard: 'C072_FestivalPlanning',
      },
      {
        crop: 'wood',
        amount: 1,
        trigger: { phase: 'private-field-phase', cardId: 'C072_FestivalPlanning' },
        sourceCard: 'C072_FestivalPlanning',
      },
    ])
    expect(result).toEqual({
      type: 'flow',
      flow: {
        type: 'parallel',
        children: [{
          type: 'leaf',
          actionId: 'gain',
          params: { vegetable: 1 },
          sourceCard: 'E068_CherryOrchard',
          choiceLabelKey: undefined,
          choiceLabelParams: undefined,
        }],
      },
    })
  })

  it('reaps only the current player ordinary fields and Card Fields', () => {
    vi.spyOn(cardListeners, 'runCardListeners').mockImplementation(() => [])
    const action = internalActionDefinitions.find((entry) => entry.id === 'reap')
    expect(action).toBeDefined()
    const actor = {
      id: 'p1',
      resources: emptyResources(),
      fields: [
        { row: 0, col: 0, stacks: [{ kind: 'grain' as const, remaining: 1 }] },
      ],
      minorPlayed: ['E068_CherryOrchard'],
      occupationPlayed: [],
      improvements: [],
      cardStates: {
        E068_CherryOrchard: {
          extraData: { cardFieldStacks: [{ crop: 'wood', remaining: 1 }] },
        },
      },
    } as unknown as PlayerState
    const opponent = {
      id: 'p2',
      resources: emptyResources(),
      fields: [
        { row: 0, col: 0, stacks: [{ kind: 'vegetable' as const, remaining: 1 }] },
      ],
      minorPlayed: ['E068_CherryOrchard'],
      occupationPlayed: [],
      improvements: [],
      cardStates: {
        E068_CherryOrchard: {
          extraData: { cardFieldStacks: [{ crop: 'wood', remaining: 1 }] },
        },
      },
    } as unknown as PlayerState
    const state = { players: [actor, opponent] } as unknown as GameState

    action!.execute({
      state,
      player: actor,
      space: { id: 'reap' },
      sourceCard: 'C072_FestivalPlanning',
      actionContext: privateReapContext,
    } as never)

    expect(actor.resources.grain).toBe(1)
    expect(actor.resources.wood).toBe(1)
    expect(actor.fields[0]!.stacks).toEqual([])
    expect(actor.cardStates.E068_CherryOrchard?.extraData?.cardFieldStacks).toEqual([null])
    expect(opponent.resources.vegetable).toBe(0)
    expect(opponent.resources.wood).toBe(0)
    expect(opponent.fields[0]!.stacks).toEqual([{ kind: 'vegetable', remaining: 1 }])
    expect(opponent.cardStates.E068_CherryOrchard?.extraData?.cardFieldStacks).toEqual([{ crop: 'wood', remaining: 1 }])
  })

  it('passes private-field-phase trigger to Card Field onReap so harvest-only effects can skip', () => {
    vi.spyOn(cardListeners, 'runCardListeners').mockImplementation(() => [])
    const harvestOnlyCard = 'A999_HarvestOnlyCardField'
    makeCardFieldImpl(harvestOnlyCard, { allowedCrops: ['grain'], capacity: 1 }, {
      onReap: ({ trigger }) =>
        trigger.phase === 'harvest'
          ? { type: 'leaf', actionId: 'gain', params: { food: 1 }, sourceCard: harvestOnlyCard }
          : undefined,
    })
    const action = internalActionDefinitions.find((entry) => entry.id === 'reap')
    expect(action).toBeDefined()
    const player = {
      id: 'p1',
      resources: emptyResources(),
      fields: [],
      minorPlayed: [harvestOnlyCard],
      occupationPlayed: [],
      improvements: [],
      cardStates: {
        [harvestOnlyCard]: {
          extraData: { cardFieldStacks: [{ crop: 'grain', remaining: 1 }] },
        },
      },
    } as unknown as PlayerState
    const state = { players: [player] } as unknown as GameState

    const result = action!.execute({
      state,
      player,
      space: { id: 'reap' },
      sourceCard: 'C072_FestivalPlanning',
      actionContext: privateReapContext,
    } as never)

    expect(player.resources.grain).toBe(1)
    expect(result.type).toBe('ok')
  })

  it('reaps E72 Artichoke Field in private-field-phase without harvest-only bonus food', () => {
    vi.spyOn(cardListeners, 'runCardListeners').mockImplementation(() => [])
    const action = internalActionDefinitions.find((entry) => entry.id === 'reap')
    expect(action).toBeDefined()
    const player = {
      id: 'p1',
      resources: emptyResources(),
      fields: [],
      minorPlayed: ['E072_ArtichokeField'],
      occupationPlayed: [],
      improvements: [],
      cardStates: {
        E072_ArtichokeField: {
          extraData: { cardFieldStacks: [{ crop: 'grain', remaining: 1 }] },
        },
      },
    } as unknown as PlayerState
    const state = { players: [player] } as unknown as GameState

    const result = action!.execute({
      state,
      player,
      space: { id: 'reap' },
      sourceCard: 'C072_FestivalPlanning',
      actionContext: privateReapContext,
    } as never)

    expect(player.resources.grain).toBe(1)
    expect(player.resources.food).toBe(0)
    expect(player.cardStates.E072_ArtichokeField?.extraData?.cardFieldStacks).toEqual([null])
    expect(result.type).toBe('ok')
  })
})
