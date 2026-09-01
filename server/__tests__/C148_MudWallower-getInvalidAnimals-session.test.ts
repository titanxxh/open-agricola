import { describe, expect, it } from 'vitest'
import { GameSession } from '../game/authoritative-session'
import {
  computeAnimalZones,
  computeInvalidAnimalsForZone,
} from '../../shared/domain/animal-zones'
import { stabilizeRandomHands } from './_helpers/stabilize-random-hands'

import '../../shared/cards/C/C148_MudWallower'

describe('C148_MudWallower getInvalidAnimals', () => {
  const setup = (held: number) => {
    const session = new GameSession(148, undefined, { playerCount: 4 })
    stabilizeRandomHands(session.state.players)
    const state = session.getState().state
    state.currentPlayerIndex = 0
    state.players.forEach((participant, index) => {
      participant.minorHand = [`__c148_minor_p${index + 1}__`]
      participant.occupationHand = [`__c148_occupation_p${index + 1}__`]
    })
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
