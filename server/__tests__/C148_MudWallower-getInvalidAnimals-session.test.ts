import { describe, expect, it } from 'vitest'
import { GameSession } from '../game/authoritative-session'
import {
  computeAnimalZones,
  computeInvalidAnimalsForZone,
} from '../../shared/domain/animal-zones'

import '../../shared/cards/C/C148_MudWallower'

describe('C148_MudWallower getInvalidAnimals', () => {
  const setup = (held: number) => {
    const session = new GameSession()
    const state = session.getState().state
    state.players = state.players.slice(0, 2)
    state.currentPlayerIndex = 0
    const player = state.players[0]!
    player.occupationPlayed.push('C148_MudWallower')
    player.cardStates = player.cardStates ?? {}
    player.cardStates['C148_MudWallower'] = { counters: { counter: 0, held } }
    session.loadState(state)
    return session
  }

  it('zone push carries cardId for hook dispatch', () => {
    const session = setup(2)
    const player = session.getState().state.players[0]!
    const zone = computeAnimalZones(player).find(z => z.id === `card:C148_MudWallower`)!
    expect(zone.cardId).toBe('C148_MudWallower')
  })

  it('hook returns empty (capacity self-managed via held)', () => {
    const session = setup(2)
    const state = session.getState().state
    const player = state.players[0]!
    const zone = computeAnimalZones(player).find(z => z.id === `card:C148_MudWallower`)!
    zone.animalType = 'boar'
    zone.animalCount = 2
    expect(computeInvalidAnimalsForZone(state, player, zone)).toEqual([])
  })
})
