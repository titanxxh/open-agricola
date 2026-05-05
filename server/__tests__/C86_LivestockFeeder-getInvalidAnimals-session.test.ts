import { describe, expect, it } from 'vitest'
import { GameSession } from '../game/authoritative-session'
import {
  computeAnimalZones,
  computeInvalidAnimalsForZone,
} from '../../shared/domain/animal-zones'

import '../../shared/cards/C/C86_LivestockFeeder'

describe('C86_LivestockFeeder getInvalidAnimals', () => {
  const setup = (grain: number) => {
    const session = new GameSession()
    const state = session.getState().state
    state.players = state.players.slice(0, 2)
    state.currentPlayerIndex = 0
    const player = state.players[0]!
    player.occupationPlayed.push('C86_LivestockFeeder')
    player.resources.grain = grain
    session.loadState(state)
    return session
  }

  it('zone push carries cardId for hook dispatch', () => {
    const session = setup(2)
    const player = session.getState().state.players[0]!
    const zone = computeAnimalZones(player).find(z => z.id === `card:C86_LivestockFeeder`)!
    expect(zone.cardId).toBe('C86_LivestockFeeder')
  })

  it('hook returns empty (BGA mirror; capacity = grain)', () => {
    const session = setup(2)
    const state = session.getState().state
    const player = state.players[0]!
    const zone = computeAnimalZones(player).find(z => z.id === `card:C86_LivestockFeeder`)!
    zone.animalType = 'sheep'
    zone.animalCount = 2
    expect(computeInvalidAnimalsForZone(state, player, zone)).toEqual([])
  })
})
