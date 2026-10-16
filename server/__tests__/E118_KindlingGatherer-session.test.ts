import type { GameSession as SessionRuleOwner } from '../game/authoritative-session'
import { afterEach, describe, expect, it } from 'vitest'
import type { GameSession } from '../game/authoritative-session'
import { createWorkSession } from './_helpers/session-fixtures'
import { createPlayerActionSpaces } from '../../shared/cards/player-action-space'
import {
  executeCardListener,
  getMatchingListeners,
  getRegisteredCardListeners,
  type CardListenerContext,
} from '../../shared/cards/card-listeners'
import type { DraftGameEvent } from '../../shared/contract/events'
import type { ActionFlow, ActionSpace, Resource } from '../../shared/contract/types'
import { setWorkersAtHome } from '../../shared/domain/player'
import { resolveTriggerIfPresent } from './_helpers/trigger-select'

import '../../shared/cards/E/E118_KindlingGatherer'
import '../../shared/cards/C/C042_RavenousHunger'
import '../../shared/cards/C/C039_StudioBoat'
import '../../shared/cards/D/D051_Archway'

const CARD_ID = 'E118_KindlingGatherer'
const LISTENER_ID = 'E118-kindling-gatherer-after-action-space-food'

const findListener = (ruleOwner: SessionRuleOwner, id: string) =>
  {
  const lookupRule1 = () => getRegisteredCardListeners().find((listener) => listener.id === id)
  return ruleOwner.withCtx(lookupRule1)
}

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

const sessions: GameSession[] = []
afterEach(() => sessions.splice(0).forEach(session => session.dispose()))

const setup = () => {
  const session = createWorkSession({ seed: 42118, configure: state => {
    state.players[0]!.occupationPlayed.push(CARD_ID)
  } })
  sessions.push(session)
  const state = session.getState().state
  return { session, state, player: state.players[0]! }
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

const runListener = (ruleOwner: SessionRuleOwner,
  listenerId: string,
  actionId: string,
  spaceId: string,
  events: readonly DraftGameEvent<'resource.moved'>[],
  resourcesGained?: Partial<Resource>,
  actionEvents: readonly DraftGameEvent<'resource.moved'>[] = events,
): ActionFlow | undefined => {
  const listener = findListener(ruleOwner, listenerId)
  expect(listener).toBeDefined()
  const { session: ruleSession, state, player } = setup()
  const space = state.actionSpaces.find((entry) => entry.id === spaceId) ?? actionSpace(spaceId)
  return ruleSession.withCtx(() => executeCardListener(listener!, {
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
  } as unknown as CardListenerContext))?.flow
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
    const { session, state, player } = setup()
    setWorkersAtHome(state, player, 1)
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

  it('grants exactly one wood for a nested Ravenous Hunger placement onto Studio Boat', () => {
    const { session, state, player } = setup()
    state.round = 14
    player.minorPlayed = ['C042_RavenousHunger', 'C039_StudioBoat']
    player.resources.food = 0
    player.resources.wood = 0
    player.resources.vegetable = 0
    setWorkersAtHome(state, player, 2)
    state.actionSpaces.push(...createPlayerActionSpaces(state))
    state.actionSpaces.find(space => space.id === 'C039_StudioBoat')!.resources.food = 3
    session.loadState(state)

    let response = session.takeAction(0, 'vegetable-seeds')
    response = resolveTriggerIfPresent(session, response, 'C042_RavenousHunger')
    expect(response.ok, response.error).toBe(true)
    expect(response.interaction.stateId).toBe('wait')
    const accept = response.interaction.request.options?.find(option => option.value !== '__skip__')
    expect(accept).toBeDefined()
    response = session.resolveChoice(0, accept!.value)
    expect(response.ok, response.error).toBe(true)
    expect(response.interaction.request.options?.map(option => option.value)).toContain('C039_StudioBoat')
    response = session.resolveChoice(0, 'C039_StudioBoat')
    for (let count = 0; count < 6 && response.interaction.request.kind === 'select-trigger'; count += 1) {
      const option = response.interaction.request.options?.find(candidate => !candidate.disabled)
      expect(option).toBeDefined()
      response = session.resolveChoice(response.interaction.playerIndex, option!.value)
      expect(response.ok, response.error).toBe(true)
    }

    expect(response.ok, response.error).toBe(true)
    expect(response.state.players[0]!.resources).toMatchObject({ food: 4, wood: 1, vegetable: 1 })
    expect(response.state.actionSpaces.find(space => space.id === 'C039_StudioBoat')!.resources.food).toBe(0)
    expect(response.state.actionSpaces.find(space => space.id === 'C039_StudioBoat')!.takenBy).toHaveLength(1)
    expect(response.state.events.filter(event => event.type === 'card.triggered' && event.sourceCardId === CARD_ID)).toHaveLength(1)
    expect(response.state.events).toEqual(expect.arrayContaining([
      expect.objectContaining({ type: 'resource.moved', resources: { food: 3 }, from: { kind: 'actionSpace', spaceId: 'C039_StudioBoat' } }),
      expect.objectContaining({ type: 'resource.moved', resources: { food: 1 }, from: expect.objectContaining({ kind: 'card', cardId: 'C042_RavenousHunger' }) }),
    ]))
    expect(response.state.players[0]!.cardStates.C039_StudioBoat?.counters?.bonusVp).toBe(1)
    expect(response.scores).toHaveLength(2)
  })

  it.each([
    { action: 'meeting-place', food: 0, wood: 0 },
    { action: 'D051_Archway', food: 1, wood: 1 },
    { action: 'fishing', food: 3, wood: 1 },
  ])('uses actual food provenance through $action', ({ action, food, wood }) => {
    const { session, state, player } = setup()
    player.resources.food = 0
    player.resources.wood = 0
    if (action === 'D051_Archway') {
      player.minorPlayed.push(action)
      state.actionSpaces.push(...createPlayerActionSpaces(state))
    }
    if (action === 'fishing') state.actionSpaces.find(space => space.id === action)!.resources.food = food
    session.loadState(state)

    let response = session.takeAction(0, action)
    response = resolveTriggerIfPresent(session, response, CARD_ID)
    if (response.interaction.stateId === 'wait' && response.interaction.request.options?.some(option => option.value === '__skip__')) {
      response = session.resolveChoice(response.interaction.playerIndex, '__skip__')
    }
    expect(response.ok, response.error).toBe(true)
    expect(response.state.players[0]!.resources).toMatchObject({ food, wood })
    expect(response.state.events.filter(event => event.type === 'card.triggered' && event.sourceCardId === CARD_ID)).toHaveLength(wood)
    expect(response.scores).toHaveLength(2)
  })

  it('collect grants wood for food moved from an action space to the trigger player', () => {
    const { session: ruleSession, player } = setup()
    const events = [moved({ food: 2 }, player.id, { kind: 'actionSpace', spaceId: 'fishing' })]
    expect(events).toEqual(expect.arrayContaining([
      expect.objectContaining({
        type: 'resource.moved',
        from: expect.objectContaining({ kind: 'actionSpace' }),
        to: expect.objectContaining({ kind: 'player', playerId: player.id }),
      }),
    ]))
    const flow = runListener(ruleSession, LISTENER_ID, 'collect', 'fishing', events)

    expectWoodFlow(flow)
  })

  it('gain grants wood for food moved from an action space to the trigger player', () => {
    const { session: ruleSession, player } = setup()
    const events = [moved({ food: 2 }, player.id, { kind: 'supply' }, 'gain')]
    expect(events).toEqual(expect.arrayContaining([
      expect.objectContaining({
        type: 'resource.moved',
        from: expect.objectContaining({ kind: 'supply' }),
        to: expect.objectContaining({ kind: 'player', playerId: player.id }),
      }),
    ]))
    const flow = runListener(ruleSession, LISTENER_ID, 'gain', 'day-laborer', events)

    expectWoodFlow(flow)
  })

  it('does not grant wood for same-resource supply or card moves', () => {
    const { session: ruleSession, player } = setup()

    expect(runListener(ruleSession,
      LISTENER_ID,
      'gain',
      'resource-market-4',
      [moved({ food: 1 }, player.id, { kind: 'supply' })],
      { food: 1 },
    )).toBeUndefined()
    expect(runListener(ruleSession,
      LISTENER_ID,
      'gain',
      'resource-market-4',
      [moved({ food: 1 }, player.id, { kind: 'card', playerId: player.id, cardId: 'Test_Source' })],
      { food: 1 },
    )).toBeUndefined()
    expect(runListener(ruleSession,
      LISTENER_ID,
      'collect',
      'fishing',
      [moved({ food: 2 }, player.id, { kind: 'supply' })],
      { food: 2 },
    )).toBeUndefined()
    expect(runListener(ruleSession,
      LISTENER_ID,
      'collect',
      'fishing',
      [moved({ food: 2 }, player.id, { kind: 'card', playerId: player.id, cardId: 'Test_Source' })],
      { food: 2 },
    )).toBeUndefined()
    expect(runListener(ruleSession,
      LISTENER_ID,
      'gain',
      'day-laborer',
      [moved({ food: 2 }, player.id, { kind: 'card', playerId: player.id, cardId: 'Test_Source' })],
      { food: 2 },
    )).toBeUndefined()
  })

  it('does not register a second reward on a place-farmer ancestor carrying the same food receipt', () => {
    const { session: ruleSession, state, player } = setup()
    const events = [moved({ food: 3 }, player.id, { kind: 'actionSpace', spaceId: 'C039_StudioBoat' })]
    expect(ruleSession.withCtx(() => getMatchingListeners({
      state, player, space: actionSpace('C039_StudioBoat'), actionId: 'place-farmer', phase: 'after',
      transactionEvents: events, actionEvents: events,
    })).filter(entry => entry.registration.id === LISTENER_ID)).toEqual([])
  })

  it('does not replay stale action-space food from an earlier transaction frame during card gain follow-up', () => {
    const { session: ruleSession, player } = setup()
    const staleFood = moved({ food: 2 }, player.id, { kind: 'actionSpace', spaceId: 'fishing' })
    const currentWood = moved({ wood: 1 }, player.id, { kind: 'card', playerId: player.id, cardId: CARD_ID })

    expect(runListener(ruleSession,
      LISTENER_ID,
      'gain',
      'gain',
      [staleFood, currentWood],
      undefined,
      [currentWood],
    )).toBeUndefined()
  })
})
