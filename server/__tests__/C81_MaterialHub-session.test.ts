import { type SessionResponse } from '../game/authoritative-session'
import { stabilizeRandomHands } from './_helpers/stabilize-random-hands'

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
  const session = new GameSession(42)
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
    const session = new GameSession(42)
    const state = session.getState().state
    const player = state.players[0]!
    player.resources.reed = 0
    player.resources.stone = 2
    expect(meetsCardPrerequisites(player, C081_MaterialHub, state.round, state)).toBe(false)
  })

  it('blocks when no stone in supply', () => {
    const session = new GameSession(42)
    const state = session.getState().state
    const player = state.players[0]!
    player.resources.reed = 2
    player.resources.stone = 0
    expect(meetsCardPrerequisites(player, C081_MaterialHub, state.round, state)).toBe(false)
  })

  it('allows when both reed and stone are >= 1', () => {
    const session = new GameSession(42)
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
    const session = new GameSession(42)
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

describe('C081 Material Hub parity', () => {
  const CARD_ID = 'C081_MaterialHub'

  const FILLER = '__test_placeholder__'

  const STORED = { wood: 2, clay: 2, reed: 2, stone: 2 }

  type BuildingResource = keyof typeof STORED

  const setup = ({
    played = true, actor = 0, resources = {}, stored = STORED,
  }: {
    played?: boolean
    actor?: number
    resources?: Partial<Record<BuildingResource, number>>
    stored?: Partial<Record<BuildingResource, number>>
  } = {}) => {
    const session = new GameSession(6081, undefined, { playerCount: 4 })
    const state = session.getState().state
    stabilizeRandomHands(state.players)
    state.currentPlayerIndex = actor
    state.round = 14
    state.roundPhase = 'work'
    state.actionSpaces.forEach((space) => { space.takenBy = [] })
    state.players.forEach((player, index) => {
      setWorkersAtHome(state, player, index === actor ? 2 : 0)
      player.minorHand = [FILLER]
      player.occupationHand = [FILLER]
      player.minorPlayed = []
      player.occupationPlayed = []
      player.cardStates = {}
      player.resources = {
        ...player.resources,
        wood: 0, clay: 0, reed: 0, stone: 0, food: 20, grain: 0, vegetable: 0,
        sheep: 0, boar: 0, cattle: 0, begging: 0,
      }
    })

    const owner = state.players[0]!
    owner.minorHand = played ? [FILLER] : [CARD_ID]
    owner.minorPlayed = played ? [CARD_ID] : []
    owner.resources = { ...owner.resources, ...resources }
    if (played) owner.cardStates[CARD_ID] = { counters: { ...stored } }

    session.loadState(state)
    return session
  }

  const options = (response: SessionResponse) => response.interaction.stateId === 'wait'
    ? response.interaction.request.options ?? []
    : []

  const enterMinor = (session: GameSession) => {
    let response = session.takeAction(0, 'meeting-place')
    if (response.interaction.stateId !== 'wait') return response
    if (!options(response).some((option) => option.value === CARD_ID)) {
      const improvement = options(response).find((option) =>
        option.value.startsWith('action-improvement-'))
      if (improvement) response = session.resolveChoice(response.interaction.playerIndex, improvement.value)
    }
    return response
  }

  const playMinor = (session: GameSession) => {
    let response = enterMinor(session)
    if (!response.state.players[0]!.minorHand.includes(CARD_ID)) return response
    if (response.interaction.stateId !== 'wait') return response
    const card = options(response).find((option) =>
      option.value === CARD_ID || option.value === `minor:${CARD_ID}`)
    if (card) response = session.resolveChoice(response.interaction.playerIndex, card.value)
    return response
  }

  const setSpaceResource = (
    session: GameSession, spaceId: string, resource: BuildingResource, amount: number,
  ) => {
    const state = session.getState().state
    const space = state.actionSpaces.find((candidate) => candidate.id === spaceId)
    expect(space).toBeDefined()
    space!.resources[resource] = amount
    session.loadState(state)
  }

  const storedCount = (response: SessionResponse, resource: BuildingResource) =>
    response.state.players[0]!.cardStates[CARD_ID]?.counters?.[resource] ?? 0

  it('C081 S1: paying wood and clay with reed and stone in supply initializes Material Hub', () => {
    const response = playMinor(setup({
      played: false, resources: { wood: 1, clay: 1, reed: 1, stone: 1 },
    }))

    expect(response.ok, response.error).toBe(true)
    expect(response.state.players[0]!.minorPlayed).toContain(CARD_ID)
    expect(response.state.players[0]!.resources).toMatchObject({
      wood: 0, clay: 0, reed: 1, stone: 1,
    })
    expect(response.state.players[0]!.cardStates[CARD_ID]?.counters).toMatchObject(STORED)
  })

  it.each([
    ['C081 S2', 'reed'],
    ['C081 S3', 'stone'],
  ] as const)('%s: without %s in supply Material Hub remains unavailable', (_scenario, missing) => {
    const response = enterMinor(setup({
      played: false,
      resources: { wood: 1, clay: 1, reed: 1, stone: 1, [missing]: 0 },
    }))

    expect(response.state.players[0]!.minorHand).toContain(CARD_ID)
    expect(options(response).some((option) =>
      option.value === CARD_ID || option.value === `minor:${CARD_ID}`)).toBe(false)
  })

  it('C081 S4: taking five wood gives the owner one wood from their Material Hub', () => {
    const session = setup()
    setSpaceResource(session, 'forest', 'wood', 5)

    const response = session.takeAction(0, 'forest')

    expect(response.ok, response.error).toBe(true)
    expect(response.state.players[0]!.resources.wood).toBe(6)
    expect(storedCount(response, 'wood')).toBe(1)
  })

  it('C081 S5: an opponent taking five wood gives the owner one stored wood', () => {
    const session = setup({ actor: 1 })
    setSpaceResource(session, 'forest', 'wood', 5)

    const response = session.takeAction(1, 'forest')

    expect(response.ok, response.error).toBe(true)
    expect(response.state.players[1]!.resources.wood).toBe(5)
    expect(response.state.players[0]!.resources.wood).toBe(1)
    expect(storedCount(response, 'wood')).toBe(1)
  })

  it('C081 S6: taking only four wood does not release stored wood', () => {
    const session = setup()
    setSpaceResource(session, 'forest', 'wood', 4)

    const response = session.takeAction(0, 'forest')

    expect(response.ok, response.error).toBe(true)
    expect(response.state.players[0]!.resources.wood).toBe(4)
    expect(storedCount(response, 'wood')).toBe(2)
  })

  it.each([
    { scenario: 'C081 S7a', spaceId: 'clay-pit', resource: 'clay', amount: 4 },
    { scenario: 'C081 S7b', spaceId: 'reed-bank', resource: 'reed', amount: 3 },
    { scenario: 'C081 S7c', spaceId: 'eastern-quarry', resource: 'stone', amount: 3 },
  ] as const)('$scenario: taking $amount $resource releases one stored resource', ({
    spaceId, resource, amount,
  }) => {
    const session = setup()
    setSpaceResource(session, spaceId, resource, amount)

    const response = session.takeAction(0, spaceId)

    expect(response.ok, response.error).toBe(true)
    expect(response.state.players[0]!.resources[resource]).toBe(amount + 1)
    expect(storedCount(response, resource)).toBe(1)
  })

  it('C081 S8: an exhausted resource stack cannot grant another bonus', () => {
    const session = setup({ stored: { ...STORED, wood: 0 } })
    setSpaceResource(session, 'forest', 'wood', 5)

    const response = session.takeAction(0, 'forest')

    expect(response.ok, response.error).toBe(true)
    expect(response.state.players[0]!.resources.wood).toBe(5)
    expect(storedCount(response, 'wood')).toBe(0)
  })
})
