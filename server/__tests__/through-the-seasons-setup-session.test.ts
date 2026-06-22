import { describe, expect, it } from 'vitest'
import { GameSession } from '../game/authoritative-session'
import { markAllWorkersUsed } from '../../shared/domain/player'

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

const seasonActionIds: Record<SeasonId, string> = {
  winter: 'season-winter-romantic-evening',
  spring: 'season-spring-animal-and-fruit',
  summer: 'season-summer-farmers-market',
  autumn: 'season-autumn-thanksgiving',
}

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
})
