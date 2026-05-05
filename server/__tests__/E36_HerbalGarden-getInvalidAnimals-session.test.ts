import { describe, expect, it } from 'vitest'
import { GameSession } from '../game/authoritative-session'
import { computeAnimalZones } from '../../shared/domain/animal-zones'
import { getCardEffect } from '../../shared/cards/card-effects'

import '../../shared/cards/E/E36_HerbalGarden'

// E36 HerbalGarden: BGA moved this restriction to PlayerBoard.php main path.
// We enforce via `onComputeAnimalZones` blocking one pasture (cap=0). Hook
// returns [] for parity.
describe('E36_HerbalGarden getInvalidAnimals', () => {
  const setup = () => {
    const session = new GameSession()
    const state = session.getState().state
    state.players = state.players.slice(0, 2)
    state.currentPlayerIndex = 0
    const player = state.players[0]!
    player.minorPlayed.push('E36_HerbalGarden')
    player.pastures = [
      {
        id: 'p1',
        tiles: [{ row: 0, col: 0 }],
        size: 1,
        stables: 0,
        animalType: null,
        animalCount: 0,
      },
      {
        id: 'p2',
        tiles: [{ row: 0, col: 1 }, { row: 0, col: 2 }],
        size: 2,
        stables: 0,
        animalType: null,
        animalCount: 0,
      },
    ]
    session.loadState(state)
    return session
  }

  it('hook is registered on the card', () => {
    const effect = getCardEffect('E36_HerbalGarden')
    expect(effect?.getInvalidAnimals).toBeDefined()
  })

  it('blocks the smallest empty pasture (cap=0)', () => {
    const session = setup()
    const player = session.getState().state.players[0]!
    const zones = computeAnimalZones(player)
    const blockedZone = zones.find(z => z.zoneType === 'pasture' && z.capacity === 0)
    expect(blockedZone).toBeDefined()
  })
})
