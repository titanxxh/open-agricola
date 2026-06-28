import { describe, expect, it } from 'vitest'
import { GameSession } from '../game/authoritative-session'
import {
  computeAnimalZones,
  computeInvalidAnimalsForZone,
} from '../../shared/domain/animal-zones'

import '../../shared/cards/E/E086_PenBuilder'

describe('E086_PenBuilder getInvalidAnimals', () => {
  const setup = (discards: number) => {
    const session = new GameSession()
    const state = session.getState().state
    state.players = state.players.slice(0, 2)
    state.currentPlayerIndex = 0
    const player = state.players[0]!
    player.occupationPlayed.push('E086_PenBuilder')
    player.cardStates = player.cardStates ?? {}
    player.cardStates['E086_PenBuilder'] = { counters: { discards } }
    session.loadState(state)
    return session
  }

  it('zone push carries cardId', () => {
    const session = setup(2)
    const player = session.getState().state.players[0]!
    const zone = computeAnimalZones(player).find(z => z.id === `card:E086_PenBuilder`)!
    expect(zone.cardId).toBe('E086_PenBuilder')
  })

  it('hook returns empty (BGA mirror; capacity = discards * 2)', () => {
    const session = setup(2)
    const state = session.getState().state
    const player = state.players[0]!
    const zone = computeAnimalZones(player).find(z => z.id === `card:E086_PenBuilder`)!
    zone.animalType = 'cattle'
    zone.animalCount = 4
    expect(computeInvalidAnimalsForZone(state, player, zone)).toEqual([])
  })
})
