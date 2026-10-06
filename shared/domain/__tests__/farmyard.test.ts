import { describe, it, expect } from 'vitest'
import { GameSession } from '../../../server/game/authoritative-session.ts'
import { playerBoard } from '../index.ts'
import { CardRegistry } from '../../cards/registry'
import { withActiveRegistry } from '../../cards/active-registry'

describe('Farmyard', () => {
  it('preserves actual animals in multiple contributed zones when fencing', () => {
    const session = new GameSession(42, undefined, { playerCount: 2 })
    const state = session.state
    const player = state.players[0]!
    player.occupationPlayed = ['CUSTOM_PigZone', 'CUSTOM_SheepZone']
    player.resources.wood = 20
    player.resources.boar = 1
    player.resources.sheep = 1
    const registry = new CardRegistry()
    for (const [cardId, animalType] of [['CUSTOM_PigZone', 'boar'], ['CUSTOM_SheepZone', 'sheep']] as const) {
      player.cardStates[cardId] = { counters: { held: 3 } }
      registry.loadImpl(cardId, { effect: { id: cardId, onComputeAnimalZones: () => [{
        id: `card:${cardId}`, zoneType: 'card', capacity: 3, capacityCounterKey: 'held', animalType, animalCount: 1,
      }] } })
    }
    const before = JSON.stringify(state)
    const result = withActiveRegistry(registry, () => playerBoard(state, 0).farmyard.canBuildFence({
      edges: ['H-0-1', 'H-1-1', 'V-0-1', 'V-0-2'],
    }))
    expect(result.ok).toBe(true)
    if (!result.ok) throw new Error(result.error.code)
    expect(result.player.pastures.reduce((sum, pasture) => sum + pasture.animalCount, 0)).toBe(0)
    expect(result.player.resources.boar).toBe(1)
    expect(result.player.resources.sheep).toBe(1)
    expect(JSON.stringify(state)).toBe(before)
  })
  it('canPlow returns ok on a free initial position', () => {
    const session = new GameSession()
    const state = session.getState().state
    const board = playerBoard(state, 0)
    // 2-player initial farm: rooms occupy (2,0) and (1,0); (0,0) is free
    // and there are no existing fields, so the adjacency rule does not apply.
    const result = board.farmyard.canPlow({ row: 0, col: 0 })
    expect(result.ok).toBe(true)
  })

  it('canPlow rejects a tile occupied by an initial room', () => {
    const session = new GameSession()
    const state = session.getState().state
    const board = playerBoard(state, 0)
    const result = board.farmyard.canPlow({ row: 2, col: 0 })
    expect(result.ok).toBe(false)
    if (!result.ok) {
      expect(result.error.code).toBe('OCCUPIED')
    }
  })

  it("farmInteraction.selectableTiles('plow') returns a farm-interaction shape", () => {
    const session = new GameSession()
    const state = session.getState().state
    const board = playerBoard(state, 0)
    const interaction = board.farmInteraction.selectableTiles('plow')
    expect(interaction).toBeDefined()
    expect((interaction as { farmType?: string }).farmType).toBe('plow')
  })

  it('pastures() is empty on an initial farm (no fences)', () => {
    const session = new GameSession()
    const state = session.getState().state
    const board = playerBoard(state, 0)
    expect(board.farmyard.pastures()).toHaveLength(0)
  })
})
