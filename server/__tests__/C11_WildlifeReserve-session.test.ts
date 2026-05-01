import { describe, expect, it } from 'vitest'
import { GameSession } from '../game/authoritative-session'
import { computeAnimalZones } from '../../shared/actions/helpers/animal-zones'

import '../../shared/cards/C/C11_WildlifeReserve'

describe('C11_WildlifeReserve session', () => {
  const setup = () => {
    const session = new GameSession()
    const state = session.getState().state
    state.players = state.players.slice(0, 2)
    state.currentPlayerIndex = 0
    state.round = 1

    const player = state.players[0]!
    player.minorPlayed.push('C11_WildlifeReserve')
    session.loadState(state)
    return session
  }

  it('zone exists with capacity 3 and any animal type', () => {
    const session = setup()
    const state = session.getState().state
    const player = state.players[0]!

    const zones = computeAnimalZones(player)
    const cardZone = zones.find(z => z.id === 'card:C11_WildlifeReserve')
    expect(cardZone).toBeDefined()
    expect(cardZone!.zoneType).toBe('card')
    expect(cardZone!.capacity).toBe(3)
    expect(cardZone!.animalType).toBeNull()
  })

  it('zone is not present if card is not played', () => {
    const session = new GameSession()
    const state = session.getState().state
    state.players = state.players.slice(0, 2)
    session.loadState(state)

    const player = state.players[0]!
    const zones = computeAnimalZones(player)
    const cardZone = zones.find(z => z.id === 'card:C11_WildlifeReserve')
    expect(cardZone).toBeUndefined()
  })
})
