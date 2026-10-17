import { type SessionResponse } from '../game/authoritative-session'
import { markAllWorkersUsed, setWorkersAtHome } from '../../shared/domain/player'

import { describe, expect, it, afterEach } from 'vitest'
import { GameSession } from '../game/authoritative-session'
import { stabilizeRandomHands } from './_helpers/stabilize-random-hands'
import { createPlayerActionSpaces } from '../../shared/cards/player-action-space'
import type { CardListenerContext } from '../../shared/cards/card-listeners'
import type { DraftGameEvent, ResourceMovedEvent } from '../../shared/contract/events'
import { E047_SyrupTap_impl } from '../../shared/cards/E/E047_SyrupTap'

import '../../shared/cards/E/E047_SyrupTap'
import '../../shared/cards/C/C162_ForestOwner'
import assert from 'node:assert/strict'
import * as audit36Native from './_helpers/audit/ae-negative-36-native'

const CARD_ID = 'E047_SyrupTap'

describe('E047_SyrupTap session', () => {
  const setup = () => {
    const session = new GameSession(42)
    stabilizeRandomHands(session.state.players)
    const state = session.getState().state
    state.players = state.players.slice(0, 2)
    state.currentPlayerIndex = 0
    state.round = 1

    const player = state.players[0]!
    player.minorPlayed.push(CARD_ID)

    session.loadState(state)
    return session
  }

  const listener = E047_SyrupTap_impl.listeners?.[0]

  const movedWood = (
    playerId: string,
    resources: ResourceMovedEvent['resources'] = { wood: 1 },
  ): DraftGameEvent<'resource.moved'> => ({
    type: 'resource.moved',
    resources,
    from: { kind: 'actionSpace', spaceId: 'forest' },
    to: { kind: 'player', playerId },
    reason: 'collect',
  })

  const listenerContext = (
    events: DraftGameEvent<'resource.moved'>[],
    actionEvents?: DraftGameEvent<'resource.moved'>[],
  ): CardListenerContext => {
    const session = setup()
    const state = session.getState().state
    const player = state.players[0]!
    return {
      state,
      player,
      space: state.actionSpaces.find((space) => space.id === 'forest')!,
      actionId: 'collect',
      phase: 'after',
      result: { type: 'ok' },
      transactionEvents: events,
      ...(actionEvents ? { actionEvents } : {}),
    }
  }

  it('falls back to transactionEvents when actionEvents is absent', () => {
    if (!listener) throw new Error('missing listener')
    const ctx = listenerContext([movedWood('p1')])

    const result = listener.handler(ctx)

    expect(result?.flow?.type).toBe('leaf')
    if (result?.flow?.type !== 'leaf') return
    expect(result.flow.actionId).toBe('future-meeples')
    expect(result.sourceCard).toBe(CARD_ID)
  })

  it('ignores stale transaction wood when current actionEvents have no wood', () => {
    if (!listener) throw new Error('missing listener')
    const ctx = listenerContext([movedWood('p1')], [movedWood('p1', { clay: 1 })])

    const result = listener.handler(ctx)

    expect(result).toBeUndefined()
  })

  it('collecting wood from forest queues 1 food on next round', () => {
    const session = setup()
    const state = session.getState().state
    // Ensure forest has wood
    const forest = state.actionSpaces.find((s) => s.id === 'forest')
    expect(forest).toBeDefined()
    if (forest) {
      forest.resources.wood = 3
    }
    session.loadState(state)

    const resp = session.takeAction(0, 'forest')
    expect(resp.ok).toBe(true)

    // Check futureMeeples are queued for round 2
    const futureMeeples = resp.state.futureMeeples.filter(
      (fm) => fm.cardId === CARD_ID,
    )
    expect(futureMeeples.length).toBe(1)
    expect(futureMeeples[0]!.round).toBe(2)
    expect(futureMeeples[0]!.resources.food).toBe(1)
    const playerId = resp.state.players[0]!.id
    const woodIndex = resp.state.events.findIndex((event) =>
      event.type === 'resource.moved'
      && event.from.kind === 'actionSpace'
      && event.to.kind === 'player'
      && event.to.playerId === playerId
      && (event.resources.wood ?? 0) > 0
    )
    const triggerIndex = resp.state.events.findIndex((event) =>
      event.type === 'card.triggered' && event.sourceCardId === CARD_ID
    )
    const queuedIndex = resp.state.events.findIndex((event) =>
      event.type === 'futureMeeple.queued' && event.sourceCardId === CARD_ID
    )
    expect(woodIndex).toBeGreaterThanOrEqual(0)
    expect(triggerIndex).toBeGreaterThan(woodIndex)
    expect(queuedIndex).toBeGreaterThan(triggerIndex)
    expect(resp.state.events).toEqual(expect.arrayContaining([
      expect.objectContaining({
        type: 'resource.moved',
        from: expect.objectContaining({ kind: 'actionSpace' }),
        to: { kind: 'player', playerId },
        resources: expect.objectContaining({ wood: expect.any(Number) }),
      }),
      expect.objectContaining({
        type: 'card.triggered',
        sourceCardId: CARD_ID,
      }),
      expect.objectContaining({
        type: 'futureMeeple.queued',
        sourceCardId: CARD_ID,
      }),
    ]))
  })

  it('getting wood from a player action space queues 1 food on next round', () => {
    const session = setup()
    const state = session.getState().state
    const player = state.players[0]!
    player.minorPlayed.push('C162_ForestOwner')
    for (const space of createPlayerActionSpaces(state)) {
      if (!state.actionSpaces.some((entry) => entry.id === space.id)) {
        state.actionSpaces.push(space)
      }
    }
    session.loadState(state)

    const resp = session.takeAction(0, 'C162_ForestOwner')
    expect(resp.ok).toBe(true)

    expect(resp.state.futureMeeples).toEqual(expect.arrayContaining([
      expect.objectContaining({
        cardId: CARD_ID,
        round: 2,
        resources: { food: 1 },
      }),
    ]))
    expect(resp.state.events).toEqual(expect.arrayContaining([
      expect.objectContaining({
        type: 'resource.moved',
        from: { kind: 'actionSpace', spaceId: 'C162_ForestOwner' },
        to: { kind: 'player', playerId: player.id },
        resources: { wood: 4 },
      }),
      expect.objectContaining({ type: 'card.triggered', sourceCardId: CARD_ID }),
    ]))
  })

  it('collecting non-wood resources does not trigger', () => {
    const session = setup()
    const state = session.getState().state
    // Use clay-pit (clay accumulation space)
    const clayPit = state.actionSpaces.find((s) => s.id === 'clay-pit')
    expect(clayPit).toBeDefined()
    if (clayPit) {
      clayPit.resources.clay = 2
      clayPit.resources.wood = 0
    }
    session.loadState(state)

    const resp = session.takeAction(0, 'clay-pit')
    expect(resp.ok).toBe(true)

    const futureMeeples = resp.state.futureMeeples.filter(
      (fm) => fm.cardId === CARD_ID,
    )
    expect(futureMeeples.length).toBe(0)
    expect(resp.state.events).not.toEqual(expect.arrayContaining([
      expect.objectContaining({ type: 'card.triggered', sourceCardId: CARD_ID }),
      expect.objectContaining({ type: 'futureMeeple.queued', sourceCardId: CARD_ID }),
    ]))
  })

  it('does not trigger on round 14 (no next round)', () => {
    const session = setup()
    const state = session.getState().state
    state.round = 14

    const forest = state.actionSpaces.find((s) => s.id === 'forest')
    if (forest) {
      forest.resources.wood = 3
    }
    session.loadState(state)

    const resp = session.takeAction(0, 'forest')
    expect(resp.ok).toBe(true)

    const futureMeeples = resp.state.futureMeeples.filter(
      (fm) => fm.cardId === CARD_ID,
    )
    expect(futureMeeples.length).toBe(0)
  })
})

describe('E047 Syrup Tap parity', () => {
  const CARD_ID = 'E047_SyrupTap'

  const FOREST_OWNER = 'C162_ForestOwner'

  const FILLER = '__test_placeholder__'

  const setup = ({
    played = true, playerCount = 2, round = 1, resources = {},
  }: {
    played?: boolean
    playerCount?: number
    round?: number
    resources?: Partial<{ wood: number; stone: number }>
  } = {}) => {
    const session = new GameSession(6047 + round, undefined, { playerCount })
    stabilizeRandomHands(session.state.players)
    const state = session.getState().state
    state.currentPlayerIndex = 0
    state.round = round
    state.roundPhase = 'work'
    state.availableMajorImprovements = []
    state.actionSpaces.forEach((space) => { space.takenBy = [] })
    state.players.forEach((player) => {
      setWorkersAtHome(state, player, 2)
      player.minorHand = [FILLER]
      player.occupationHand = [FILLER]
      player.minorPlayed = []
      player.occupationPlayed = []
      Object.assign(player.resources, {
        wood: 0, clay: 0, reed: 0, stone: 0, food: 20, grain: 0, vegetable: 0,
        sheep: 0, boar: 0, cattle: 0, begging: 0,
      })
    })
    const owner = state.players[0]!
    owner.minorHand = played ? [FILLER] : [CARD_ID]
    owner.minorPlayed = played ? [CARD_ID] : []
    Object.assign(owner.resources, resources)
    session.loadState(state)
    return session
  }

  const options = (response: SessionResponse) => response.interaction.stateId === 'wait'
    ? response.interaction.request.options ?? []
    : []

  const setActionResources = (session: GameSession, spaceId: string, resources: { wood?: number; clay?: number }) => {
    const state = session.getState().state
    const space = state.actionSpaces.find((candidate) => candidate.id === spaceId)
    if (!space) throw new Error(`missing action space ${spaceId}`)
    Object.assign(space.resources, { wood: 0, clay: 0, ...resources })
    session.loadState(state)
  }

  const futureFood = (response: SessionResponse) => response.state.futureMeeples
    .filter((entry) => entry.cardId === CARD_ID && entry.resources.food === 1)
    .map((entry) => entry.round)
    .sort((left, right) => left - right)

  const playForestOwner = (session: GameSession) => {
    const state = session.getState().state
    state.currentPlayerIndex = 0
    state.players[0]!.occupationHand = [FOREST_OWNER]
    session.loadState(state)

    let response = session.takeAction(0, 'lessons')
    expect(response.ok, response.error).toBe(true)
    if (response.state.players[0]!.occupationPlayed.includes(FOREST_OWNER)) return response
    if (response.interaction.stateId !== 'wait') return response
    const occupation = options(response).find((option) => option.value === FOREST_OWNER)
    expect(occupation, JSON.stringify(response.interaction)).toBeDefined()
    response = session.resolveChoice(response.interaction.playerIndex, occupation!.value)
    expect(response.ok, response.error).toBe(true)
    expect(response.state.players[0]!.occupationPlayed).toContain(FOREST_OWNER)
    expect(response.state.actionSpaces.some((space) => space.id === FOREST_OWNER)).toBe(true)
    return response
  }

  it('E047 S3: the scheduled food is received at the start of the next round', () => {
    const session = setup()
    setActionResources(session, 'forest', { wood: 3 })
    let response = session.takeAction(0, 'forest')
    expect(futureFood(response)).toEqual([2])

    const state = session.getState().state
    state.players.forEach((player) => markAllWorkersUsed(state, player))
    session.loadState(state)
    response = session.performRoundEnd()

    expect(response.state.round).toBe(2)
    expect(response.state.players[0]!.resources.food).toBe(21)
    expect(futureFood(response)).toEqual([])
  })

  it('E047 S6: wood given to the owner when an opponent uses Forest Owner schedules no food', () => {
    const session = setup({ playerCount: 4 })
    playForestOwner(session)
    const state = session.getState().state
    state.currentPlayerIndex = 1
    session.loadState(state)

    const response = session.takeAction(1, FOREST_OWNER)

    expect(response.ok, response.error).toBe(true)
    expect(response.state.players[1]!.resources.wood).toBe(3)
    expect(response.state.players[0]!.resources.wood).toBe(1)
    expect(futureFood(response)).toEqual([])
  })
})

describe('ae-negative-36-native', () => {
  const { sessions, traces, save, make, take, choose, finish, ready, fill, end, final, minor, purchase, rejectBuy, resource, future, points, ownMajor } = audit36Native
  afterEach(() => { sessions.splice(0).forEach(s => s.dispose()); traces.splice(0); });
  it("E047 N1 real purchase and an actual wood accumulation collection queue exactly one next-round food", () => { const s = make('E047_SyrupTap', st => Object.assign(st.players[0]!.resources, { wood: 1, stone: 1 }), false), bought = purchase(s, 'E047_SyrupTap'); resource(bought, { wood: 0, stone: 0 }); fill(s); ready(s); const r = finish(s, take(s, 0, 'forest')); resource(r, { wood: 3, food: 100 }); assert.deepEqual(future(r, 'E047_SyrupTap'), [6]); const due = end(s); resource(due, { food: 101 }); assert.deepEqual(future(due, 'E047_SyrupTap'), []); save('E047-N1', { bought, r, due }); });
  it("E047 N2 held card opponent and nonwood actions cannot schedule Syrup Tap and either cost shortage rejects", () => { for (const mode of ['wood', 'stone'])
      save(`E047-N2-buy-${mode}`, rejectBuy(make('E047_SyrupTap', st => Object.assign(st.players[0]!.resources, { wood: mode === 'wood' ? 0 : 1, stone: mode === 'stone' ? 0 : 1 }), false), 'E047_SyrupTap')); for (const mode of ['hand', 'opponent', 'clay', 'labor']) {
      const a = mode === 'opponent' ? 1 : 0, s = make('E047_SyrupTap', st => { st.currentPlayerIndex = a; Object.assign(st.players[0]!.resources, { wood: 1, stone: 1 }); }, mode !== 'hand'), r = finish(s, take(s, a, mode === 'clay' ? 'clay-pit' : mode === 'labor' ? 'day-laborer' : 'forest'), true, [], 'E047_SyrupTap');
      assert.deepEqual(future(r, 'E047_SyrupTap'), []);
      resource(r, { food: mode === 'labor' ? 102 : 100 });
      save(`E047-N2-${mode}`, r);
  } });
  it("E047 N3 card-granted wood is excluded and late wood collections never schedule round fifteen", () => { const s = make('E047_SyrupTap', st => ownMajor(st, 'Major_Joinery')), p = minor(s), gift = finish(s, choose(s, 0, 'A006_StorageBarn'), true, [], 'E047_SyrupTap'); resource(gift, { wood: 1 }); assert.deepEqual(future(gift, 'E047_SyrupTap'), []); save('E047-N3-gift', { p, gift }); for (const round of [13, 14]) {
      const t = make('E047_SyrupTap', undefined, true, round), r = finish(t, take(t, 0, 'forest'));
      resource(r, { wood: 3 });
      assert.deepEqual(future(r, 'E047_SyrupTap'), round === 13 ? [14] : []);
      const due = round === 13 ? end(t) : final(t);
      if (round === 13)
          resource(due, { food: 97 });
      else assert.equal(points(due,'E047_SyrupTap'),1);
      save(`E047-N3-${round}`, { r, due });
  } });
})
