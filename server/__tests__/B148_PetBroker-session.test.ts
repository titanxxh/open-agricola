import { describe, expect, it } from 'vitest'
import { GameSession } from '../game/authoritative-session'
import { computeAnimalZones } from '../../shared/domain/animal-zones'

import '../../shared/cards/B/B148_PetBroker'

describe('B148_PetBroker session', () => {
  const setup = () => {
    const session = new GameSession()
    const state = session.getState().state
    state.players = state.players.slice(0, 2)
    state.currentPlayerIndex = 0
    state.round = 1

    const player = state.players[0]!
    player.occupationHand.push('B148_PetBroker')
    session.loadState(state)
    session.devPlayCard(0, 'B148_PetBroker')
    return session
  }

  it('card zone exists with capacity=1 after playing (1 occupation)', () => {
    const session = setup()
    const state = session.getState().state
    const player = state.players[0]!

    const zones = computeAnimalZones(player)
    const cardZone = zones.find(z => z.id === 'card:B148_PetBroker')
    expect(cardZone).toBeDefined()
    expect(cardZone!.zoneType).toBe('card')
    expect(cardZone!.capacity).toBe(1)
    expect(cardZone!.animalType).toBe('sheep')
  })

  it('capacity increases with additional occupations', () => {
    const session = setup()
    const state = session.getState().state
    const player = state.players[0]!

    // Add another occupation
    player.occupationPlayed.push('SomeOtherOccupation')
    session.loadState(state)

    const updatedState = session.getState().state
    const updatedPlayer = updatedState.players[0]!
    const zones = computeAnimalZones(updatedPlayer)
    const cardZone = zones.find(z => z.id === 'card:B148_PetBroker')
    expect(cardZone).toBeDefined()
    expect(cardZone!.capacity).toBe(2)
  })

  it('animalType restricted to sheep', () => {
    const session = setup()
    const state = session.getState().state
    const player = state.players[0]!

    const zones = computeAnimalZones(player)
    const cardZone = zones.find(z => z.id === 'card:B148_PetBroker')
    expect(cardZone).toBeDefined()
    expect(cardZone!.animalType).toBe('sheep')
  })
})
