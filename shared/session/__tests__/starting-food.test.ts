import { describe, expect, it } from 'vitest'
import { createInitialState, normalizeState } from '../state-bootstrap'

describe('starting food', () => {
  it.each([2, 3, 4, 5, 6] as const)(
    'gives the start player 2 food and every other player 3 food at %sp',
    (playerCount) => {
      const state = createInitialState(42, { playerCount })

      expect(state.players.map((player) => [player.startPlayer, player.resources.food])).toEqual(
        state.players.map((_, index) => [index === 0, index === 0 ? 2 : 3]),
      )
    },
  )

  it('uses the same 2/3 split when Farmers of the Moor is enabled', () => {
    const state = createInitialState(42, {
      playerCount: 3,
      enableFarmersOfTheMoor: true,
      allowIncompleteFarmersOfTheMoorMinorDeal: true,
    })

    expect(state.players.map((player) => player.resources.food)).toEqual([2, 3, 3])
    expect(state.players.every((player) => player.resources.fuel === 0)).toBe(true)
  })

  it('leaves Snake Opening off by default', () => {
    const state = createInitialState(42, { playerCount: 2 })

    expect(state.enableSnakeOpening).toBe(false)
    expect(state.snakeOpening).toBeNull()
  })

  describe('Snake Opening', () => {
    it.each([2, 3, 4, 5, 6] as const)('gives every player 3 food at %sp', (playerCount) => {
      const state = createInitialState(42, { playerCount, enableSnakeOpening: true })

      expect(state.players.map((player) => player.resources.food)).toEqual(
        state.players.map(() => 3),
      )
      expect(state.enableSnakeOpening).toBe(true)
      expect(state.snakeOpening).toEqual({ reversed: false })
    })

    it('is ignored in a single-player game', () => {
      const state = createInitialState(42, { playerCount: 1, enableSnakeOpening: true })

      expect(state.players.map((player) => player.resources.food)).toEqual([2])
      expect(state.enableSnakeOpening).toBe(false)
      expect(state.snakeOpening).toBeNull()
    })

    it('stacks with Farmers of the Moor', () => {
      const state = createInitialState(42, {
        playerCount: 3,
        enableSnakeOpening: true,
        enableFarmersOfTheMoor: true,
        allowIncompleteFarmersOfTheMoorMinorDeal: true,
      })

      expect(state.players.map((player) => player.resources.food)).toEqual([3, 3, 3])
      expect(state.players.every((player) => player.resources.fuel === 0)).toBe(true)
    })

    it('normalizes a persisted reversed marker and drops it when the variant is off', () => {
      const enabled = createInitialState(42, { playerCount: 2, enableSnakeOpening: true })
      enabled.snakeOpening = { reversed: true }
      expect(normalizeState(JSON.parse(JSON.stringify(enabled)) as typeof enabled).snakeOpening)
        .toEqual({ reversed: true })

      const disabled = createInitialState(42, { playerCount: 2 })
      const raw = JSON.parse(JSON.stringify(disabled)) as Record<string, unknown>
      delete raw.enableSnakeOpening
      raw.snakeOpening = { reversed: true }
      const normalized = normalizeState(raw as unknown as typeof disabled)
      expect(normalized.enableSnakeOpening).toBe(false)
      expect(normalized.snakeOpening).toBeNull()
    })
  })
})
