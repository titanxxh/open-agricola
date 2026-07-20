import { describe, expect, it } from 'vitest'
import { GameSession } from '../game/authoritative-session'
import { stabilizeRandomHands } from './_helpers/stabilize-random-hands'

const playerCounts = [2, 3, 4, 5, 6] as const
const variants = [
  { variant: 'base', seasons: false, moor: false },
  { variant: 'Through the Seasons', seasons: true, moor: false },
  { variant: 'Farmers of the Moor', seasons: false, moor: true },
  { variant: 'combined', seasons: true, moor: true },
] as const
const seasonActionIds = [
  'season-winter-romantic-evening',
  'season-spring-animal-and-fruit',
  'season-summer-farmers-market',
  'season-autumn-thanksgiving',
]
const playerCountActionId = {
  2: 'forest',
  3: 'resource-market',
  4: 'resource-market-4',
  5: 'animal-market-56',
  6: 'farm-supplies-6',
} as const
const scenarios = playerCounts.flatMap((playerCount) =>
  variants.map((variant, variantIndex) => ({
    ...variant,
    playerCount,
    seed: 550_000 + playerCount * 10 + variantIndex,
  })),
)

describe('frontend scenario matrix through the GameSession seam', () => {
  it('covers every 2-6 player and supported variant combination', () => {
    expect(scenarios).toHaveLength(20)
    expect(new Set(scenarios.map(({ playerCount }) => playerCount))).toEqual(
      new Set([2, 3, 4, 5, 6]),
    )
    expect(new Set(scenarios.map(({ variant }) => variant))).toEqual(
      new Set(['base', 'Through the Seasons', 'Farmers of the Moor', 'combined']),
    )
  })

  it.each(scenarios)(
    '$playerCount players / $variant creates a public playable snapshot',
    ({ playerCount, seasons, moor, seed }) => {
      const session = new GameSession(seed, undefined, {
        playerCount,
        enableThroughTheSeasons: seasons,
        enableFarmersOfTheMoor: moor,
      })
      stabilizeRandomHands(session.state.players)
      session.loadState(session.state)

      const initial = session.getState()
      const publicInitial = session.buildSyncPayload(initial, null)
      const actionIds = publicInitial.state.actionSpaces.map((space) => space.id)

      expect(initial.ok).toBe(true)
      expect(initial.interaction.stateId).toBe('idle')
      expect(publicInitial.state.players).toHaveLength(playerCount)
      expect(publicInitial.state.enableThroughTheSeasons).toBe(seasons)
      expect(publicInitial.state.enableFarmersOfTheMoor).toBe(moor)
      expect(publicInitial.state.throughTheSeasons).toEqual(seasons ? expect.any(Object) : null)
      expect(publicInitial.state.farmersOfTheMoor).toEqual(moor ? expect.any(Object) : null)
      expect(actionIds).toContain(playerCountActionId[playerCount])
      expect(actionIds.filter((id) => seasonActionIds.includes(id))).toHaveLength(seasons ? 4 : 0)
      expect(actionIds.includes('moor-infirmary')).toBe(moor)
      expect(publicInitial.actionAvailability?.farmland).toBe(true)
      expect(publicInitial.scores?.map((score) => score.playerId)).toEqual(
        publicInitial.state.players.map((player) => player.id),
      )

      const started = session.takeAction(0, 'farmland')
      const playerStarted = session.buildSyncPayload(started, initial.state.players[0]!.id)

      expect(started.ok).toBe(true)
      expect(started.interaction.stateId).toBe('wait')
      expect(playerStarted.interaction.stateId).toBe('wait')
      expect(playerStarted.interaction.stateId === 'wait' && playerStarted.interaction.request.kind).toBe('farm-select')
      if (started.interaction.stateId !== 'wait') throw new Error('expected farm selection')
      expect(started.interaction.request.kind).toBe('farm-select')
      expect(started.interaction.allowedCommands).toContain('commitSelection')
      if (started.interaction.request.kind !== 'farm-select') throw new Error('expected farm selection')
      const tile = started.interaction.request.farm.selectableTiles[0]
      expect(tile).toBeDefined()

      const completed = session.commitSelectionChoice(0, { tile })
      const publicCompleted = session.buildSyncPayload(completed, null)

      expect(completed.ok).toBe(true)
      expect(completed.state.players[0]!.fields).toContainEqual({ ...tile, stacks: [] })
      expect(publicCompleted.scores).toHaveLength(playerCount)
      expect(publicCompleted.scores?.every((score) => Number.isFinite(score.total))).toBe(true)
      expect(publicCompleted.state.log).toEqual(expect.arrayContaining([
        expect.objectContaining({
          key: 'log.actionDetail',
          params: expect.objectContaining({ action: 'actions.farmland.name' }),
        }),
      ]))
    },
  )
})
