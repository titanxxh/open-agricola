import { describe, expect, it } from 'vitest'
import { GameSession } from '../game/authoritative-session'
import { markAllWorkersUsed } from '../../shared/domain/player'
import type { ActionAccumulatedEvent, GameEvent } from '../../shared/contract/events'
import { rehydrateState, serializeState, serializeSessionSnapshot } from '../../shared/session/serialization'
import { emptyResources } from '../../shared/session/state-bootstrap'

type SeasonId = 'winter' | 'spring' | 'summer' | 'autumn'
type SeasonsState = {
  enableThroughTheSeasons?: boolean
  throughTheSeasons?: {
    startSeason: SeasonId
    currentSeason: SeasonId
  } | null
}

const seasonsOf = (session: GameSession) => session.state as typeof session.state & SeasonsState

const setSeason = (session: GameSession, season: SeasonId) => {
  const state = seasonsOf(session)
  state.throughTheSeasons = { startSeason: season, currentSeason: season }
}

const finishRound = (session: GameSession) => {
  const state = session.state
  state.players.forEach((player) => markAllWorkersUsed(state, player))
  return session.performRoundEnd()
}

const spaceOf = (session: GameSession, id: string) => {
  const space = session.state.actionSpaces.find((entry) => entry.id === id)
  if (!space) throw new Error(`missing action space ${id}`)
  return space
}

const accumulatedEvents = (events: GameEvent[]): ActionAccumulatedEvent[] =>
  events.filter((event): event is ActionAccumulatedEvent => event.type === 'action.accumulated')

const seasonActionIds: Record<SeasonId, string> = {
  winter: 'season-winter-romantic-evening',
  spring: 'season-spring-animal-and-fruit',
  summer: 'season-summer-farmers-market',
  autumn: 'season-autumn-thanksgiving',
}

const auditSeasons = ['winter', 'spring', 'summer', 'autumn'] as const
const auditSeeds = { winter: 2, spring: 9, summer: 1, autumn: 3 }
const auditClone = <T>(value: T): T => JSON.parse(JSON.stringify(value))
const auditSetup = (season: SeasonId, enabled = true) => {
  const session = new GameSession(auditSeeds[season], undefined, { playerCount: 2, enableThroughTheSeasons: enabled })
  for (const player of session.state.players) {
    player.minorHand = player.occupationHand = ['__test_placeholder__']
    player.resources = { ...emptyResources, food: 50 }
  }
  expect(session.loadState(session.state).ok).toBe(true)
  return session
}
const auditRestore = (session: GameSession) => {
  const restored = new GameSession(1, undefined, { playerCount: 2 })
  const response = restored.loadState(rehydrateState(auditClone(serializeSessionSnapshot(session.state, session))))
  expect(response.ok, response.error).toBe(true)
  expect(response.interaction).toEqual(session.getState().interaction)
  expect(response.state.throughTheSeasons).toEqual(session.state.throughTheSeasons)
  const resources = (state: typeof session.state) => Object.fromEntries(state.actionSpaces.filter((space) => space.id !== '__test-worker-sink__').map((space) => [space.id, space.resources]))
  expect(resources(response.state)).toEqual(resources(session.state))
  return restored
}
const auditRoundEnd = (session: GameSession) => {
  session.state.players.forEach((player) => markAllWorkersUsed(session.state, player))
  expect(session.loadState(session.state).ok).toBe(true)
  let response = session.performRoundEnd()
  for (let step = 0; response.state.roundPhase !== 'work' && !response.state.gameOver && step < 20; step++) {
    expect(response.ok, response.error).toBe(true)
    const request = response.interaction.request
    if (request.kind === 'feed') response = session.resolveChoice(response.interaction.playerIndex, 'confirm', { selections: [] })
    else if (request.kind === 'choice') response = session.resolveChoice(response.interaction.playerIndex, '__skip__')
    else throw new Error(JSON.stringify(response.interaction))
  }
  expect(response.ok, response.error).toBe(true)
  return response
}

describe('Seasons batch 3 setup audit', () => {
  it.each(auditSeasons)('%s initial season is deterministic, public, and survives restore without another accumulation', (season) => {
    let session = auditSetup(season)
    expect(session.state.throughTheSeasons).toEqual({ startSeason: season, currentSeason: season })
    expect(auditSetup(season).state.throughTheSeasons).toEqual(session.state.throughTheSeasons)
    const totals = { winter: [3, 0, 0, 1], spring: [2, 1, 1, 1], summer: [3, 2, 1, 2], autumn: [4, 1, 2, 1] }
    expect(['forest', 'clay-pit', 'reed-bank', 'fishing'].map((id, index) => spaceOf(session, id).resources[(['wood', 'clay', 'reed', 'food'] as const)[index]!])).toEqual(totals[season])
    session = auditRestore(session)
    for (const viewer of ['p1', 'p2', null]) expect(session.buildSyncPayload(session.getState(), viewer).state.throughTheSeasons).toEqual({ startSeason: season, currentSeason: season })
    for (const other of auditSeasons.filter((entry) => entry !== season)) {
      const before = auditClone(session.state)
      const response = session.takeAction(0, seasonActionIds[other])
      expect(response.ok).toBe(false)
      expect(auditClone(session.state)).toEqual(before)
    }
  })

  it.each(auditSeasons)('%s actions and adjustments are absent when Seasons is disabled', (season) => {
    const session = auditSetup(season, false)
    expect(session.state.throughTheSeasons).toBeNull()
    expect(session.state.actionSpaces.some((space) => Object.values(seasonActionIds).includes(space.id))).toBe(false)
    const before = auditClone(session.state)
    expect(session.takeAction(0, seasonActionIds[season]).ok).toBe(false)
    expect(auditClone(session.state)).toEqual(before)
    expect(['forest', 'clay-pit', 'reed-bank', 'fishing'].map((id, index) => spaceOf(session, id).resources[(['wood', 'clay', 'reed', 'food'] as const)[index]!])).toEqual([3, 1, 1, 1])
  })

  it.each(auditSeasons.flatMap((season) => [0, 4].flatMap((leftover) => [2, 7, 11].map((round) => ({ season, leftover, round })))))(
    '$season round $round adds the printed accumulation with $leftover left over exactly once', ({ season, leftover, round }) => {
      let session = auditSetup(season)
      session.state.round = round - 1
      session.state.throughTheSeasons!.currentSeason = auditSeasons[(auditSeasons.indexOf(season) + 3) % 4]!
      session.state.roundActionOrder = ['major-improvement', 'grain-utilization', 'sheep-market', 'fencing', 'wish-children', 'house-redevelopment', 'western-quarry', 'pig-market', 'vegetable-seeds', 'cattle-market', 'eastern-quarry', 'cultivation', 'urgent-wish-children', 'farm-redevelopment']
      for (const space of session.state.actionSpaces) space.resources = { ...emptyResources }
      for (const [id, resource] of [['forest', 'wood'], ['clay-pit', 'clay'], ['reed-bank', 'reed'], ['fishing', 'food'], ['western-quarry', 'stone']] as const) {
        if (id !== 'western-quarry' || round > 7) spaceOf(session, id).resources[resource] = leftover
      }
      session = auditRestore(session)
      const response = auditRoundEnd(session)
      expect(response.state.round).toBe(round)
      expect(response.state.throughTheSeasons!.currentSeason).toBe(season)
      const amounts = { winter: [3, 0, 0, 1, 1], spring: [2, 1, 1, 1, 2], summer: [3, 2, 1, 2, 0], autumn: [4, 1, 2, 1, 1] }
      const ids = ['forest', 'clay-pit', 'reed-bank', 'fishing', 'western-quarry', 'eastern-quarry']
      for (const [index, id] of ids.entries()) {
        const resource = (['wood', 'clay', 'reed', 'food', 'stone', 'stone'] as const)[index]!
        const opened = index < 4 || (id === 'western-quarry' ? round >= 7 : round >= 11)
        const amount = opened ? amounts[season][Math.min(index, 4)]! : 0
        const retained = index < 4 || (id === 'western-quarry' && round > 7) ? leftover : 0
        expect(spaceOf(session, id).resources[resource], id).toBe(retained + amount)
        expect(spaceOf(session, id).resources.vegetable).toBe(0)
        const events = response.state.events.filter((event) => event.type === 'action.accumulated' && event.round === round && event.spaceId === id)
        if (amount > 0) expect(events).toEqual([expect.objectContaining({ resources: { [resource]: amount } })])
        else expect(events).toHaveLength(0)
      }
      expect(response.state.players.map((player) => player.resources)).toEqual([{ ...emptyResources, food: 50 }, { ...emptyResources, food: 50 }])
      expect(response.state.log.length).toBeGreaterThan(0)
      session = auditRestore(session)
      expect(session.getState().state.round).toBe(round)
    },
  )

  it.each(auditSeasons)('%s cycles through a real harvest boundary without advancing twice', (season) => {
    let session = auditSetup(season)
    for (let step = 1; step <= 4; step++) {
      const response = auditRoundEnd(session)
      expect(response.state.round).toBe(step + 1)
      expect(response.state.throughTheSeasons!.currentSeason).toBe(auditSeasons[(auditSeasons.indexOf(season) + step) % 4])
      expect(response.state.players.map((player) => player.resources.food)).toEqual(step < 4 ? [50, 50] : [46, 46])
      session = auditRestore(session)
    }
  })
})

describe('Through the Seasons setup', () => {
  it('creates deterministic public season state only when the variant is enabled', () => {
    const first = new GameSession(4242, undefined, {
      playerCount: 2,
      enableThroughTheSeasons: true,
    } as never)
    const repeat = new GameSession(4242, undefined, {
      playerCount: 2,
      enableThroughTheSeasons: true,
    } as never)
    const disabled = new GameSession(4242)

    const enabledState = seasonsOf(first)
    expect(enabledState.enableThroughTheSeasons).toBe(true)
    expect(enabledState.throughTheSeasons).not.toBeNull()
    expect(['winter', 'spring', 'summer', 'autumn']).toContain(
      enabledState.throughTheSeasons?.startSeason,
    )
    expect(enabledState.throughTheSeasons?.currentSeason).toBe(
      enabledState.throughTheSeasons?.startSeason,
    )
    expect(seasonsOf(repeat).throughTheSeasons).toEqual(enabledState.throughTheSeasons)

    expect(seasonsOf(disabled).enableThroughTheSeasons).toBe(false)
    expect(seasonsOf(disabled).throughTheSeasons).toBeNull()
  })

  it('exposes all season action spaces but only the current season is available', () => {
    const session = new GameSession(4242, undefined, {
      playerCount: 2,
      enableThroughTheSeasons: true,
    } as never)
    const state = seasonsOf(session)
    const currentSeason = state.throughTheSeasons!.currentSeason
    const currentActionId = seasonActionIds[currentSeason]
    const nonCurrentActionId = Object.values(seasonActionIds).find((id) => id !== currentActionId)!

    expect(state.actionSpaces.filter((space) => Object.values(seasonActionIds).includes(space.id))).toHaveLength(4)
    expect(session.getAvailableActions(0).map((action) => action.spaceId)).toContain(currentActionId)
    expect(session.getAvailableActions(0).map((action) => action.spaceId)).not.toContain(nonCurrentActionId)
    expect(session.takeAction(0, nonCurrentActionId)).toMatchObject({
      ok: false,
      error: 'space unavailable',
    })
  })

  it('restores season action spaces when a persisted seasons room is rehydrated', () => {
    const session = new GameSession(4242, undefined, {
      playerCount: 2,
      enableThroughTheSeasons: true,
    } as never)
    setSeason(session, 'summer')
    const serialized = serializeState(session.getState().state, {
      engineStack: session.getEngineStack(),
    })
    const restored = rehydrateState(JSON.parse(JSON.stringify(serialized))).state

    expect(restored.actionSpaces.filter((space) => Object.values(seasonActionIds).includes(space.id))).toHaveLength(4)
    expect(restored.actionSpaces.find((space) => space.id === seasonActionIds.summer)?.canBeExecutedByPlayer(restored, restored.players[0]!)).toBe(true)
  })

  it('applies the starting season preparation adjustment during setup', () => {
    const session = new GameSession(4242, undefined, {
      playerCount: 2,
      enableThroughTheSeasons: true,
    } as never)

    expect(seasonsOf(session).throughTheSeasons?.currentSeason).toBe('summer')
    expect(spaceOf(session, 'clay-pit').resources.clay).toBe(2)
    expect(spaceOf(session, 'fishing').resources.food).toBe(2)
    expect(spaceOf(session, 'western-quarry').resources.stone).toBe(0)
  })

  it('advances to the next season when the next round starts', () => {
    const session = new GameSession(4242, undefined, {
      playerCount: 2,
      enableThroughTheSeasons: true,
    } as never)
    setSeason(session, 'winter')
    const player = session.state.players[0]!
    player.resources.grain = 1
    player.fields = [{ row: 0, col: 0, stacks: [] }]

    const resp = finishRound(session)

    expect(resp.ok).toBe(true)
    expect(resp.state.round).toBe(2)
    expect(resp.state.roundPhase).toBe('work')
    expect(seasonsOf(session).throughTheSeasons?.currentSeason).toBe('spring')
    expect(session.getAvailableActions(0).map((action) => action.spaceId)).toContain(
      seasonActionIds.spring,
    )
    expect(session.getAvailableActions(0).map((action) => action.spaceId)).not.toContain(
      seasonActionIds.winter,
    )
  })

  it('applies Winter preparation adjustments after the season advances', () => {
    const session = new GameSession(4242, undefined, {
      playerCount: 2,
      enableThroughTheSeasons: true,
    } as never)
    setSeason(session, 'autumn')
    spaceOf(session, 'clay-pit').resources.clay = 0
    spaceOf(session, 'reed-bank').resources.reed = 0

    const resp = finishRound(session)

    expect(resp.ok).toBe(true)
    expect(seasonsOf(session).throughTheSeasons?.currentSeason).toBe('winter')
    expect(spaceOf(session, 'clay-pit').resources.clay).toBe(0)
    expect(spaceOf(session, 'reed-bank').resources.reed).toBe(0)
  })

  it('applies Summer preparation adjustments after the season advances', () => {
    const session = new GameSession(4242, undefined, {
      playerCount: 2,
      enableThroughTheSeasons: true,
    } as never)
    setSeason(session, 'spring')
    spaceOf(session, 'clay-pit').resources.clay = 0
    spaceOf(session, 'fishing').resources.food = 0
    spaceOf(session, 'western-quarry').resources.stone = 0
    spaceOf(session, 'eastern-quarry').resources.stone = 0

    const resp = finishRound(session)

    expect(resp.ok).toBe(true)
    expect(seasonsOf(session).throughTheSeasons?.currentSeason).toBe('summer')
    expect(spaceOf(session, 'clay-pit').resources.clay).toBe(2)
    expect(spaceOf(session, 'fishing').resources.food).toBe(2)
    expect(spaceOf(session, 'western-quarry').resources.stone).toBe(0)
    expect(spaceOf(session, 'eastern-quarry').resources.stone).toBe(0)
  })

  it('logs accumulated resources after season preparation adjustments are applied', () => {
    const summerSession = new GameSession(4242, undefined, {
      playerCount: 2,
      enableThroughTheSeasons: true,
    } as never)
    setSeason(summerSession, 'spring')
    spaceOf(summerSession, 'clay-pit').resources.clay = 0
    spaceOf(summerSession, 'fishing').resources.food = 0

    const summerResp = finishRound(summerSession)
    const summerAccumulated = accumulatedEvents(summerResp.state.events)

    expect(summerAccumulated).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          type: 'action.accumulated',
          spaceId: 'clay-pit',
          resources: { clay: 2 },
        }),
        expect.objectContaining({
          type: 'action.accumulated',
          spaceId: 'fishing',
          resources: { food: 2 },
        }),
      ]),
    )

    const winterSession = new GameSession(4242, undefined, {
      playerCount: 2,
      enableThroughTheSeasons: true,
    } as never)
    setSeason(winterSession, 'autumn')
    spaceOf(winterSession, 'clay-pit').resources.clay = 0
    spaceOf(winterSession, 'reed-bank').resources.reed = 0

    const winterResp = finishRound(winterSession)
    const winterAccumulated = accumulatedEvents(winterResp.state.events)

    expect(winterAccumulated).not.toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          type: 'action.accumulated',
          spaceId: 'clay-pit',
          resources: { clay: 1 },
        }),
        expect.objectContaining({
          type: 'action.accumulated',
          spaceId: 'reed-bank',
          resources: { reed: 1 },
        }),
      ]),
    )
  })

  it('cycles through all four seasons at successive round starts', () => {
    const session = new GameSession(4242, undefined, {
      playerCount: 2,
      enableThroughTheSeasons: true,
    } as never)
    setSeason(session, 'winter')

    expect(seasonsOf(session).throughTheSeasons?.currentSeason).toBe('winter')
    expect(finishRound(session).state.round).toBe(2)
    expect(seasonsOf(session).throughTheSeasons?.currentSeason).toBe('spring')
    expect(finishRound(session).state.round).toBe(3)
    expect(seasonsOf(session).throughTheSeasons?.currentSeason).toBe('summer')
    expect(finishRound(session).state.round).toBe(4)
    expect(seasonsOf(session).throughTheSeasons?.currentSeason).toBe('autumn')
    expect(finishRound(session).state.round).toBe(5)
    expect(seasonsOf(session).throughTheSeasons?.currentSeason).toBe('winter')
  })
})
