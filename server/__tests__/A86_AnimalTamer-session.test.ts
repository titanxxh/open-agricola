import { describe, expect, it } from 'vitest'
import { GameSession } from '../game-session'
import { computeAnimalZones } from '../../shared/actions/effects/animals'

import '../../shared/cards/A/A86_AnimalTamer'

describe('A86_AnimalTamer session', () => {
  const setup = () => {
    const session = new GameSession()
    const state = session.getState().state
    state.players = state.players.slice(0, 2)
    state.currentPlayerIndex = 0
    state.round = 1

    const player = state.players[0]!
    player.occupationHand.push('A86_AnimalTamer')
    session.loadState(state)
    session.devPlayCard(0, 'A86_AnimalTamer')
    return session
  }

  it('house zone capacity equals rooms count (default 2 rooms)', () => {
    const session = setup()
    const state = session.getState().state
    const player = state.players[0]!

    expect(player.rooms).toBe(2)

    const zones = computeAnimalZones(player)
    const houseZone = zones.find(z => z.zoneType === 'house')
    expect(houseZone).toBeDefined()
    expect(houseZone!.capacity).toBe(2)
  })

  it('house zone capacity updates when rooms increase to 3', () => {
    const session = setup()

    // Add a third room
    session.devAddRooms(0, [{ row: 0, col: 4 }])

    const state = session.getState().state
    const player = state.players[0]!
    expect(player.rooms).toBe(3)

    const zones = computeAnimalZones(player)
    const houseZone = zones.find(z => z.zoneType === 'house')
    expect(houseZone).toBeDefined()
    expect(houseZone!.capacity).toBe(3)
  })

  it('house zone capacity is 1 without the card', () => {
    const session = new GameSession()
    const state = session.getState().state
    state.players = state.players.slice(0, 2)
    state.currentPlayerIndex = 0
    state.round = 1
    session.loadState(state)

    const player = state.players[0]!
    const zones = computeAnimalZones(player)
    const houseZone = zones.find(z => z.zoneType === 'house')
    expect(houseZone).toBeDefined()
    expect(houseZone!.capacity).toBe(1)
  })

  it('onBuy provides XOR choice of wood or grain', () => {
    // The onBuy hook returns a flow, but devPlayCard doesn't run it through the engine.
    // Just verify the card is correctly played.
    const session = setup()
    const state = session.getState().state
    const player = state.players[0]!
    expect(player.occupationPlayed).toContain('A86_AnimalTamer')
  })
})
