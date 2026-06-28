import { describe, expect, it } from 'vitest'
import { GameSession } from '../game/authoritative-session'
import { computeAnimalZones } from '../../shared/domain/animal-zones'
import { getCardEffect } from '../../shared/cards/card-effects'

import '../../shared/cards/E/E033_BeaverColony'

// E33 BeaverColony: BGA moved this restriction to PlayerBoard.php main-path
// `getInvalidAnimals`. Our model uses `onComputeAnimalZones` to set cap=0 on
// the smallest pasture-with-stable, which forces overflow on reorg.
// We still expose a `getInvalidAnimals` hook (returns []) for parity with BGA
// per-card method registration; the actual constraint runs via cap-zero.
describe('E033_BeaverColony getInvalidAnimals', () => {
  const setup = () => {
    const session = new GameSession()
    const state = session.getState().state
    state.players = state.players.slice(0, 2)
    state.currentPlayerIndex = 0
    const player = state.players[0]!
    player.minorPlayed.push('E033_BeaverColony')
    player.pastures = [
      {
        id: 'p1',
        tiles: [{ row: 0, col: 0 }],
        size: 1,
        stables: 1,
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
    player.stableTiles = [{ row: 0, col: 0 }]
    session.loadState(state)
    return session
  }

  it('hook is registered on the card', () => {
    const effect = getCardEffect('E033_BeaverColony')
    expect(effect?.getInvalidAnimals).toBeDefined()
  })

  it('blocks the smallest stabled pasture (capacity = 0)', () => {
    const session = setup()
    const player = session.getState().state.players[0]!
    const zones = computeAnimalZones(player)
    const stabledPastureZone = zones.find(z => z.zoneType === 'pasture' && z.pastureIndex === 0)
    expect(stabledPastureZone?.capacity).toBe(0)
    expect(stabledPastureZone?.blocked).toBe(true)
  })
})
