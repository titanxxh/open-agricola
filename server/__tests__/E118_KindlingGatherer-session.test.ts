import { describe, expect, it } from 'vitest'
import { GameSession } from '../game/authoritative-session'
import { stabilizeRandomHands } from './_helpers/stabilize-random-hands'
import {
  executeCardListener,
  getRegisteredCardListeners,
  type CardListenerContext,
} from '../../shared/cards/card-listeners'
import type { DraftGameEvent } from '../../shared/contract/events'
import type { ActionFlow, ActionSpace, Resource } from '../../shared/contract/types'
import { setWorkersAtHome } from '../../shared/domain/player'
import { resolveTriggerIfPresent } from './_helpers/trigger-select'

import '../../shared/cards/E/E118_KindlingGatherer'

const CARD_ID = 'E118_KindlingGatherer'
const LISTENER_ID = 'E118-kindling-gatherer-after-action-space-food'

const findListener = (id: string) =>
  getRegisteredCardListeners().find((listener) => listener.id === id)

const moved = (
  resources: Partial<Resource>,
  playerId: string,
  from: DraftGameEvent<'resource.moved'>['from'],
  reason: DraftGameEvent<'resource.moved'>['reason'] =
    from.kind === 'actionSpace' ? 'gain' : 'cardEffect',
): DraftGameEvent<'resource.moved'> => ({
  type: 'resource.moved',
  resources,
  from,
  to: { kind: 'player', playerId },
  reason,
})

const setup = () => {
  const session = new GameSession(42)
  stabilizeRandomHands(session.state.players)
  const state = session.getState().state
  state.players = state.players.slice(0, 2)
  const player = state.players[0]!
  player.occupationPlayed.push(CARD_ID)
  return { state, player }
}

const actionSpace = (id: string): ActionSpace => ({
  id,
  nameKey: `actions.${id}.name`,
  descriptionKey: `actions.${id}.description`,
  roundAvailable: 1,
  gainPerRound: {},
  players: [],
  available: true,
  resources: {},
  takenBy: [],
} as unknown as ActionSpace)

const runListener = (
  listenerId: string,
  actionId: string,
  spaceId: string,
  events: readonly DraftGameEvent<'resource.moved'>[],
  resourcesGained?: Partial<Resource>,
  actionEvents: readonly DraftGameEvent<'resource.moved'>[] = events,
): ActionFlow | undefined => {
  const listener = findListener(listenerId)
  expect(listener).toBeDefined()
  const { state, player } = setup()
  const space = state.actionSpaces.find((entry) => entry.id === spaceId) ?? actionSpace(spaceId)
  return executeCardListener(listener!, {
    state,
    player,
    triggerPlayer: player,
    ownerPlayer: player,
    space,
    actionId,
    phase: 'after',
    result: resourcesGained ? { type: 'ok', resourcesGained } : { type: 'ok' },
    transactionEvents: events,
    actionEvents,
  } as unknown as CardListenerContext)?.flow
}

const expectWoodFlow = (flow: ActionFlow | undefined) => {
  expect(flow).toEqual(expect.objectContaining({
    type: 'leaf',
    actionId: 'gain',
    params: { wood: 1 },
    sourceCard: CARD_ID,
  }))
}

describe('E118_KindlingGatherer action-space provenance', () => {
  it('grants wood on the real day-laborer gain flow', () => {
    const session = new GameSession(42)
    stabilizeRandomHands(session.state.players)
    const state = session.getState().state
    state.players = state.players.slice(0, 2)
    state.currentPlayerIndex = 0
    const player = state.players[0]!
    setWorkersAtHome(state, player, 1)
    player.occupationPlayed.push(CARD_ID)
    player.resources.food = 0
    player.resources.wood = 0
    session.loadState(state)

    let resp = session.takeAction(0, 'day-laborer')
    resp = resolveTriggerIfPresent(session, resp, CARD_ID)

    expect(resp.ok).toBe(true)
    expect(resp.state.players[0]!.resources.food).toBe(2)
    expect(resp.state.players[0]!.resources.wood).toBe(1)
    expect(resp.state.events).toEqual(expect.arrayContaining([
      expect.objectContaining({
        type: 'resource.moved',
        resources: expect.objectContaining({ food: 2 }),
        from: expect.objectContaining({ kind: 'actionSpace', spaceId: 'day-laborer' }),
        to: expect.objectContaining({ kind: 'player', playerId: player.id }),
        reason: 'gain',
      }),
      expect.objectContaining({
        type: 'resource.moved',
        resources: expect.objectContaining({ wood: 1 }),
        from: expect.objectContaining({ kind: 'card', cardId: CARD_ID }),
        to: expect.objectContaining({ kind: 'player', playerId: player.id }),
      }),
    ]))
  })

  it('place-farmer grants wood for food moved from an action space to the trigger player', () => {
    const { player } = setup()
    const events = [moved({ food: 1 }, player.id, { kind: 'actionSpace', spaceId: 'resource-market-4' })]
    expect(events).toEqual(expect.arrayContaining([
      expect.objectContaining({
        type: 'resource.moved',
        from: expect.objectContaining({ kind: 'actionSpace' }),
        to: expect.objectContaining({ kind: 'player', playerId: player.id }),
      }),
    ]))
    const flow = runListener(LISTENER_ID, 'place-farmer', 'resource-market-4', events)

    expectWoodFlow(flow)
  })

  it('collect grants wood for food moved from an action space to the trigger player', () => {
    const { player } = setup()
    const events = [moved({ food: 2 }, player.id, { kind: 'actionSpace', spaceId: 'fishing' })]
    expect(events).toEqual(expect.arrayContaining([
      expect.objectContaining({
        type: 'resource.moved',
        from: expect.objectContaining({ kind: 'actionSpace' }),
        to: expect.objectContaining({ kind: 'player', playerId: player.id }),
      }),
    ]))
    const flow = runListener(LISTENER_ID, 'collect', 'fishing', events)

    expectWoodFlow(flow)
  })

  it('gain grants wood for food moved from an action space to the trigger player', () => {
    const { player } = setup()
    const events = [moved({ food: 2 }, player.id, { kind: 'supply' }, 'gain')]
    expect(events).toEqual(expect.arrayContaining([
      expect.objectContaining({
        type: 'resource.moved',
        from: expect.objectContaining({ kind: 'supply' }),
        to: expect.objectContaining({ kind: 'player', playerId: player.id }),
      }),
    ]))
    const flow = runListener(LISTENER_ID, 'gain', 'day-laborer', events)

    expectWoodFlow(flow)
  })

  it('does not grant wood for same-resource supply or card moves', () => {
    const { player } = setup()

    expect(runListener(
      LISTENER_ID,
      'place-farmer',
      'resource-market-4',
      [moved({ food: 1 }, player.id, { kind: 'supply' })],
      { food: 1 },
    )).toBeUndefined()
    expect(runListener(
      LISTENER_ID,
      'place-farmer',
      'resource-market-4',
      [moved({ food: 1 }, player.id, { kind: 'card', playerId: player.id, cardId: 'Test_Source' })],
      { food: 1 },
    )).toBeUndefined()
    expect(runListener(
      LISTENER_ID,
      'collect',
      'fishing',
      [moved({ food: 2 }, player.id, { kind: 'supply' })],
      { food: 2 },
    )).toBeUndefined()
    expect(runListener(
      LISTENER_ID,
      'collect',
      'fishing',
      [moved({ food: 2 }, player.id, { kind: 'card', playerId: player.id, cardId: 'Test_Source' })],
      { food: 2 },
    )).toBeUndefined()
    expect(runListener(
      LISTENER_ID,
      'gain',
      'day-laborer',
      [moved({ food: 2 }, player.id, { kind: 'card', playerId: player.id, cardId: 'Test_Source' })],
      { food: 2 },
    )).toBeUndefined()
  })

  it('does not replay stale action-space food from an earlier transaction frame during card gain follow-up', () => {
    const { player } = setup()
    const staleFood = moved({ food: 2 }, player.id, { kind: 'actionSpace', spaceId: 'fishing' })
    const currentWood = moved({ wood: 1 }, player.id, { kind: 'card', playerId: player.id, cardId: CARD_ID })

    expect(runListener(
      LISTENER_ID,
      'gain',
      'gain',
      [staleFood, currentWood],
      undefined,
      [currentWood],
    )).toBeUndefined()
  })
})
