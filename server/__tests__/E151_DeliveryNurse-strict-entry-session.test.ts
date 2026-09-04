import { describe, expect, it } from 'vitest'
import { GameSession } from '../game/authoritative-session'
import { stabilizeRandomHands } from './_helpers/stabilize-random-hands'
import { familySize, setActiveWorkerCount, setWorkersAtHome } from '../../shared/domain/player'

import '../../shared/cards/E/E151_DeliveryNurse'

describe('E151 Delivery Nurse strict action entry', () => {
  it('keeps Wish for Children available without room when all animal types enable the replacement', () => {
    const session = new GameSession(151, undefined, { playerCount: 4 })
    stabilizeRandomHands(session.state.players)
    const state = session.getState().state
    state.round = 14
    state.roundPhase = 'work'
    state.currentPlayerIndex = 0
    const player = state.players[0]!
    player.occupationPlayed = ['E151_DeliveryNurse']
    player.rooms = 2
    player.roomTiles = [{ row: 1, col: 0 }, { row: 2, col: 0 }]
    setActiveWorkerCount(player, 2)
    setWorkersAtHome(state, player, 2)
    Object.assign(player.resources, { sheep: 1, boar: 1, cattle: 1 })
    const wishChildren = state.actionSpaces.find((space) => space.id === 'wish-children')
    if (!wishChildren) throw new Error('wish-children missing')
    wishChildren.takenBy = []
    session.loadState(state)

    expect(session.getState().actionAvailability?.['wish-children']).toBe(true)
    const response = session.takeAction(0, 'wish-children')

    expect(response.ok, response.error).toBe(true)
    expect(familySize(response.state.players[0]!)).toBe(3)
    expect(response.state.players[0]!.cardStates.E151_DeliveryNurse?.flagged).toBe(true)
  })
})
