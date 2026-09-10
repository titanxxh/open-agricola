import { describe, expect, it } from 'vitest'
import { bonusWoodAction, gainAction } from '../gain'
import type { DraftGameEvent, EventSink } from '../../../contract/events'
import type { ActionMutationContext, ActionSpace, GameState, PlayerState, Resource } from '../../../contract/types'

const makeEventSink = (capturedEvents: DraftGameEvent[]): EventSink => ({
  emit: (event) => {
    capturedEvents.push(event)
  },
  emitMany: (events) => {
    capturedEvents.push(...events)
  },
})

const makePlayer = (id: string, resources: Partial<Resource> = {}): PlayerState => ({
  id,
  resources: {
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
    ...resources,
  },
  improvements: [],
  minorPlayed: [],
  occupationPlayed: [],
  cardStates: {},
} as unknown as PlayerState)

const callGain = (
  player: PlayerState,
  params: Record<string, unknown>,
  state: GameState = { players: [player], workPhaseObtainedResources: {}, actionSpaces: [] } as unknown as GameState,
  extra: Partial<{ sourceCard: string }> = {},
) => {
  const capturedEvents: DraftGameEvent[] = []
  const result = gainAction.execute({
    state,
    player,
    space: { id: 'test-gain' } as ActionSpace,
    params,
    sourceCard: extra.sourceCard,
    eventSink: makeEventSink(capturedEvents),
  } as ActionMutationContext)
  return { result, capturedEvents }
}

describe('bonus resource actions', () => {
  it('returns explicit resourcesGained for action-detail logging', () => {
    const capturedEvents: DraftGameEvent[] = []
    const player = {
      id: 'p1',
      resources: {
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
      },
    } as unknown as PlayerState
    const state = { players: [player], workPhaseObtainedResources: {}, actionSpaces: [] } as unknown as GameState
    const result = bonusWoodAction.execute({
      state,
      player,
      space: { id: 'bonus-wood' } as ActionSpace,
      eventSink: makeEventSink(capturedEvents),
    } as ActionMutationContext)

    expect(result.type).toBe('ok')
    if (result.type !== 'ok') return
    expect(result.resourcesGained).toEqual({ wood: 1 })
    expect(player.resources.wood).toBe(1)
    expect(capturedEvents).toEqual([
      {
        type: 'resource.moved',
        resources: { wood: 1 },
        from: { kind: 'supply' },
        to: { kind: 'player', playerId: 'p1' },
        reason: 'gain',
      },
    ])
  })

  it('emits resource.moved from supply for normal gains', () => {
    const player = makePlayer('p1')
    const { result, capturedEvents } = callGain(player, { wood: 2, clay: 1 })
    expect(result.type).toBe('ok')
    expect(capturedEvents).toEqual([
      {
        type: 'resource.moved',
        resources: { wood: 2, clay: 1 },
        from: { kind: 'supply' },
        to: { kind: 'player', playerId: 'p1' },
        reason: 'gain',
      },
    ])
  })

  it('emits resource.moved from card for sourceCard gains', () => {
    const player = makePlayer('p1')
    const { result, capturedEvents } = callGain(player, { food: 2 }, undefined, { sourceCard: 'B021_HayloftBarn' })
    expect(result.type).toBe('ok')
    expect(capturedEvents).toEqual([
      {
        type: 'resource.moved',
        resources: { food: 2 },
        from: { kind: 'card', playerId: 'p1', cardId: 'B021_HayloftBarn' },
        to: { kind: 'player', playerId: 'p1' },
        reason: 'cardEffect',
        sourceCardId: 'B021_HayloftBarn',
      },
    ])
  })

  it('emits one resource.moved event per actual recipient', () => {
    const player = makePlayer('p1')
    const other = makePlayer('p2')
    const state = { players: [player, other], workPhaseObtainedResources: {}, actionSpaces: [] } as unknown as GameState
    const { result, capturedEvents } = callGain(player, { food: 1, recipientMode: 'others' }, state)
    expect(result.type).toBe('ok')
    expect(capturedEvents).toEqual([
      {
        type: 'resource.moved',
        resources: { food: 1 },
        from: { kind: 'supply' },
        to: { kind: 'player', playerId: 'p2' },
        reason: 'gain',
      },
    ])
  })

  it.each([3, 4])('checks the complete transfer to two recipients with %i food', (food) => {
    const payer = makePlayer('p1', { food })
    const recipients = [makePlayer('p2'), makePlayer('p3')]
    const state = { players: [payer, ...recipients], workPhaseObtainedResources: {}, actionSpaces: [] } as unknown as GameState
    const params = { food: 2, payerId: payer.id, recipientMode: 'others' }
    expect(gainAction.canBeExecutedByPlayer(state, payer, { params })).toBe(food === 4)
    const { result, capturedEvents } = callGain(payer, params, state)
    expect(result.type).toBe(food === 4 ? 'ok' : 'fail')
    expect(payer.resources.food).toBe(food === 4 ? 0 : 3)
    expect(recipients.map((player) => player.resources.food)).toEqual(food === 4 ? [2, 2] : [0, 0])
    expect(capturedEvents).toHaveLength(food === 4 ? 2 : 0)
    if (result.type === 'ok') {
      expect(result.extraData?.actionDetailDeltas).toEqual([{ playerId: payer.id, costs: { food: 4 } }])
    }
  })

  it('rejects a missing payer without creating resources or events', () => {
    const player = makePlayer('p1')
    const { result, capturedEvents } = callGain(player, { food: 2, payerId: 'missing' })
    expect(result.type).toBe('fail')
    expect(player.resources.food).toBe(0)
    expect(capturedEvents).toEqual([])
  })

  it('payerId: emits resource.moved from payer to recipient when payer actually pays', () => {
    const actor = makePlayer('p1')
    const payer = makePlayer('payer', { food: 3 })
    const recipient = makePlayer('recipient')
    const state = { players: [actor, payer, recipient], workPhaseObtainedResources: {}, actionSpaces: [] } as unknown as GameState
    const { result, capturedEvents } = callGain(actor, {
      food: 2,
      payerId: 'payer',
      recipientPlayerId: 'recipient',
    }, state)

    expect(result.type).toBe('ok')
    expect(payer.resources.food).toBe(1)
    expect(recipient.resources.food).toBe(2)
    expect(capturedEvents).toEqual([
      {
        type: 'resource.moved',
        resources: { food: 2 },
        from: { kind: 'player', playerId: 'payer' },
        to: { kind: 'player', playerId: 'recipient' },
        reason: 'gain',
      },
    ])
  })
})
