import { describe, expect, it } from 'vitest'
import { GameSession } from '../game/authoritative-session'

type SeasonId = 'winter' | 'spring' | 'summer' | 'autumn'
type SeasonsState = {
  enableThroughTheSeasons?: boolean
  throughTheSeasons?: {
    startSeason: SeasonId
    currentSeason: SeasonId
  } | null
}

const seasonsOf = (session: GameSession) => session.state as typeof session.state & SeasonsState

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
})
