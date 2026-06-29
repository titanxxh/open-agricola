import { describe, expect, it } from 'vitest'
import { GameSession } from '../game/authoritative-session'
import {
  executeCardListener,
  getRegisteredCardListeners,
  type CardListenerContext,
} from '../../shared/cards/card-listeners'
import { C081_MaterialHub } from '../../shared/cards/C/C081_MaterialHub'
import { meetsCardPrerequisites } from '../../shared/cards/helpers/prerequisites'
import { getStoredResource, setStoredResource } from '../../shared/cards/helpers/card-storage'
import { setWorkersAtHome } from '../../shared/domain/player'
import type { DraftGameEvent } from '../../shared/contract/events'
import type { ActionFlow, Resource } from '../../shared/contract/types'

import '../../shared/cards/C/C081_MaterialHub'

const CARD_ID = 'C081_MaterialHub'

const findCollectListener = () =>
  getRegisteredCardListeners().find((listener) => listener.id === 'C81-material-hub-after-collect')

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

const setupListener = () => {
  const session = new GameSession()
  const state = session.getState().state
  state.players = state.players.slice(0, 2)
  const owner = state.players[0]!
  const trigger = state.players[1]!
  owner.minorPlayed.push(CARD_ID)
  setStoredResource(owner, CARD_ID, 'wood', 1)
  const space = state.actionSpaces.find((entry) => entry.id === 'forest')!
  return { state, owner, trigger, space }
}

const runCollectListener = (
  events: readonly DraftGameEvent<'resource.moved'>[],
  resourcesGained?: Partial<Resource>,
  actionEvents: readonly DraftGameEvent<'resource.moved'>[] = events,
): ActionFlow | undefined => {
  const listener = findCollectListener()
  expect(listener).toBeDefined()
  const { state, owner, trigger, space } = setupListener()
  return executeCardListener(listener!, {
    state,
    player: trigger,
    triggerPlayer: trigger,
    ownerPlayer: owner,
    space,
    actionId: 'collect',
    phase: 'after',
    result: resourcesGained ? { type: 'ok', resourcesGained } : { type: 'ok' },
    transactionEvents: events,
    actionEvents,
  } as unknown as CardListenerContext, { ownerPlayerId: owner.id })?.flow
}

describe('C081_MaterialHub prerequisite', () => {
  it('blocks when no reed in supply', () => {
    const session = new GameSession()
    const state = session.getState().state
    const player = state.players[0]!
    player.resources.reed = 0
    player.resources.stone = 2
    expect(meetsCardPrerequisites(player, C081_MaterialHub, state.round, state)).toBe(false)
  })

  it('blocks when no stone in supply', () => {
    const session = new GameSession()
    const state = session.getState().state
    const player = state.players[0]!
    player.resources.reed = 2
    player.resources.stone = 0
    expect(meetsCardPrerequisites(player, C081_MaterialHub, state.round, state)).toBe(false)
  })

  it('allows when both reed and stone are >= 1', () => {
    const session = new GameSession()
    const state = session.getState().state
    const player = state.players[0]!
    player.resources.reed = 1
    player.resources.stone = 1
    expect(meetsCardPrerequisites(player, C081_MaterialHub, state.round, state)).toBe(true)
  })
})

describe('C081_MaterialHub action-space provenance', () => {
  it('releases a stored resource when the trigger player takes enough from an action space', () => {
    const { trigger } = setupListener()
    const events = [moved({ wood: 5 }, trigger.id)]
    expect(events).toEqual(expect.arrayContaining([
      expect.objectContaining({
        type: 'resource.moved',
        from: expect.objectContaining({ kind: 'actionSpace' }),
        to: expect.objectContaining({ kind: 'player', playerId: trigger.id }),
      }),
    ]))
    const flow = runCollectListener(events)

    expect(flow?.type).toBe('seq')
    if (flow?.type !== 'seq') throw new Error('expected sequence flow')
    expect(flow.children).toEqual([
      expect.objectContaining({
        type: 'leaf',
        actionId: 'take-from-card',
        params: { wood: 1 },
        sourceCard: CARD_ID,
      }),
    ])
  })

	  it('does not release a stored resource for same-resource supply or card moves', () => {
    const { trigger } = setupListener()

    expect(runCollectListener([moved({ wood: 5 }, trigger.id, { kind: 'supply' })], { wood: 5 })).toBeUndefined()
	    expect(runCollectListener([moved({ wood: 5 }, trigger.id, { kind: 'card', playerId: trigger.id, cardId: 'Test_Source' })], { wood: 5 })).toBeUndefined()
	  })

	  it('ignores stale transaction events when current actionEvents do not include the threshold', () => {
	    const { trigger } = setupListener()
	    const staleWood = moved({ wood: 5 }, trigger.id)
	    const currentClay = moved({ clay: 1 }, trigger.id)

	    expect(runCollectListener([staleWood, currentClay], undefined, [currentClay])).toBeUndefined()
	  })

	  it('lets the owner take from the card when another player collects enough from an action space', () => {
    const session = new GameSession()
    const state = session.getState().state
    state.players = state.players.slice(0, 2)
    state.currentPlayerIndex = 1
    state.roundPhase = 'work'

    const owner = state.players[0]!
    const trigger = state.players[1]!
    state.players.forEach((player) => {
      player.minorHand = ['__test_placeholder__']
      player.occupationHand = ['__test_placeholder__']
    })
    owner.minorPlayed.push(CARD_ID)
    setStoredResource(owner, CARD_ID, 'wood', 1)
    setWorkersAtHome(state, trigger, 1)

    const forest = state.actionSpaces.find((entry) => entry.id === 'forest')!
    forest.resources.wood = 5
    session.loadState(state)

    const resp = session.takeAction(1, 'forest')

    expect(resp.ok).toBe(true)
    expect(resp.state.players[1]!.resources.wood).toBe(5)
    expect(resp.state.players[0]!.resources.wood).toBe(1)
    expect(getStoredResource(resp.state.players[0]!, CARD_ID, 'wood')).toBe(0)
    expect(resp.state.events).toEqual(expect.arrayContaining([
      expect.objectContaining({
        type: 'resource.moved',
        from: { kind: 'actionSpace', spaceId: 'forest' },
        to: { kind: 'player', playerId: trigger.id },
        resources: { wood: 5 },
      }),
      expect.objectContaining({
        type: 'card.stackChanged',
        cardId: CARD_ID,
        targetPlayerId: owner.id,
        resources: { wood: 1 },
        delta: -1,
      }),
      expect.objectContaining({
        type: 'resource.moved',
        from: { kind: 'card', playerId: owner.id, cardId: CARD_ID },
        to: { kind: 'player', playerId: owner.id },
        resources: { wood: 1 },
      }),
    ]))
  })
})
