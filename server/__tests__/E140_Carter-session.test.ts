import { describe, expect, it } from 'vitest'
import { GameSession } from '../game/authoritative-session'
import { stabilizeRandomHands } from './_helpers/stabilize-random-hands'
import { resolveTriggerIfPresent } from './_helpers/trigger-select'
import {
  executeCardListener,
  getRegisteredCardListeners,
  type CardListenerContext,
} from '../../shared/cards/card-listeners'
import { runCardEffectHook } from '../../shared/cards/card-effects'
import { readCardExtraData } from '../../shared/cards/helpers/card-state'
import type { DraftGameEvent } from '../../shared/contract/events'
import type { ActionFlow, Resource } from '../../shared/contract/types'

import '../../shared/cards/E/E140_Carter'

const CARD_ID = 'E140_Carter'

const findCollectListener = () =>
  getRegisteredCardListeners().find((listener) => listener.id === 'E140-carter-after-collect')

const moved = (
  resources: Partial<Resource>,
  playerId: string,
  from: DraftGameEvent<'resource.moved'>['from'] = { kind: 'actionSpace', spaceId: 'forest' },
): DraftGameEvent<'resource.moved'> => ({
  type: 'resource.moved',
  resources,
  from,
  to: { kind: 'player', playerId },
  reason: from.kind === 'actionSpace' ? 'collect' : 'cardEffect',
})

const runCollectListener = (
  events: readonly DraftGameEvent<'resource.moved'>[],
  resourcesGained?: Partial<Resource>,
  actionEvents: readonly DraftGameEvent<'resource.moved'>[] = events,
): ActionFlow | undefined => {
  const listener = findCollectListener()
  expect(listener).toBeDefined()
  const session = new GameSession(42)
  stabilizeRandomHands(session.state.players)
  const state = session.getState().state
  state.players = state.players.slice(0, 2)
  state.currentPlayerIndex = 0
  state.round = 1
  const player = state.players[0]!
  player.occupationPlayed.push(CARD_ID)
  runCardEffectHook(state, player, CARD_ID, 'onBuy')
  state.round = 2
  const space = state.actionSpaces.find((entry) => entry.id === 'forest')!
  return executeCardListener(listener!, {
    state,
    player,
    triggerPlayer: player,
    ownerPlayer: player,
    space,
    actionId: 'collect',
    phase: 'after',
    result: resourcesGained ? { type: 'ok', resourcesGained } : { type: 'ok' },
    transactionEvents: events,
    actionEvents,
  } as unknown as CardListenerContext)?.flow
}

describe('E140_Carter session', () => {
  const setup = (buyRound = 1) => {
    const session = new GameSession(42)
    stabilizeRandomHands(session.state.players)
    const state = session.getState().state
    state.players = state.players.slice(0, 2)
    state.currentPlayerIndex = 0
    state.round = buyRound

    const player = state.players[0]!
    player.occupationPlayed.push(CARD_ID)

    // Manually trigger onBuy
    runCardEffectHook(state, player, CARD_ID, 'onBuy')

    session.loadState(state)
    return session
  }

  it('onBuy sets triggerRound to round + 1', () => {
    const session = setup(3)
    const state = session.getState().state
    const player = state.players[0]!
    const triggerRound = readCardExtraData<number>(player, CARD_ID, 'triggerRound')
    expect(triggerRound).toBe(4)
  })

  it('collecting building resources during trigger round grants food', () => {
    const session = setup(1) // triggerRound = 2
    const state = session.getState().state
    state.round = 2

    // Set up forest (wood accumulation space)
    const forest = state.actionSpaces.find((s) => s.id === 'forest')
    expect(forest).toBeDefined()
    if (forest) {
      forest.resources.wood = 3
    }
    state.players[0]!.resources.food = 0
    session.loadState(state)

    let resp = session.takeAction(0, 'forest')
    resp = resolveTriggerIfPresent(session, resp, CARD_ID)
    expect(resp.ok).toBe(true)

    // Player should get 3 wood + 3 food (1 food per building resource taken)
    expect(resp.state.players[0]!.resources.wood).toBe(3)
    expect(resp.state.players[0]!.resources.food).toBe(3)
  })

  it('does not trigger outside trigger round', () => {
    const session = setup(1) // triggerRound = 2
    const state = session.getState().state
    state.round = 3 // not trigger round

    const forest = state.actionSpaces.find((s) => s.id === 'forest')
    if (forest) {
      forest.resources.wood = 3
    }
    state.players[0]!.resources.food = 0
    session.loadState(state)

    const resp = session.takeAction(0, 'forest')
    expect(resp.ok).toBe(true)

    // No extra food
    expect(resp.state.players[0]!.resources.food).toBe(0)
  })

  it('does not trigger for non-building-resource spaces', () => {
    const session = setup(1) // triggerRound = 2
    const state = session.getState().state
    state.round = 2

    state.players[0]!.resources.food = 0
    session.loadState(state)

    // Day laborer gives food, not building resources
    const resp = session.takeAction(0, 'day-laborer')
    expect(resp.ok).toBe(true)

    // Only the day laborer food (2 food), no Carter bonus
    expect(resp.state.players[0]!.resources.food).toBe(2)
  })

  it('counts building resources moved from an action space to the trigger player', () => {
    const session = setup(1)
    const player = session.getState().state.players[0]!
    const events = [moved({ wood: 2, clay: 1 }, player.id)]
    expect(events).toEqual(expect.arrayContaining([
      expect.objectContaining({
        type: 'resource.moved',
        from: expect.objectContaining({ kind: 'actionSpace' }),
        to: expect.objectContaining({ kind: 'player', playerId: player.id }),
      }),
    ]))
    const flow = runCollectListener(events)

    expect(flow).toEqual(expect.objectContaining({
      type: 'leaf',
      actionId: 'gain',
      params: { food: 3 },
      sourceCard: CARD_ID,
    }))
  })

  it('does not count building resources moved from supply or a card', () => {
    const session = setup(1)
    const player = session.getState().state.players[0]!

    expect(runCollectListener([moved({ wood: 2 }, player.id, { kind: 'supply' })], { wood: 2 })).toBeUndefined()
    expect(runCollectListener([moved({ wood: 2 }, player.id, { kind: 'card', playerId: player.id, cardId: 'Test_Source' })], { wood: 2 })).toBeUndefined()
  })

  it('ignores stale earlier transaction building-resource events when current actionEvents has none', () => {
    const session = setup(1)
    const player = session.getState().state.players[0]!
    const stale = moved({ wood: 3 }, player.id)

    expect(runCollectListener([stale], undefined, [])).toBeUndefined()
  })
})
