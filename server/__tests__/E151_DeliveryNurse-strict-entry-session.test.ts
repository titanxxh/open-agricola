import { describe, expect, it } from 'vitest'
import { GameSession } from '../game/authoritative-session'
import { stabilizeRandomHands } from './_helpers/stabilize-random-hands'
import { familySize, setActiveWorkerCount, setWorkersAtHome } from '../../shared/domain/player'
import { runCardListeners, type CardListenerContext } from '../../shared/cards/card-listeners'

import '../../shared/cards/E/E151_DeliveryNurse'
import '../../shared/cards/B/B092_LittleStickKnitter'

const CARD_ID = 'E151_DeliveryNurse'

const setupDeliveryNurse = (activeWorkerCount = 2) => {
  const session = new GameSession(151, undefined, { playerCount: 4 })
  stabilizeRandomHands(session.state.players)
  const state = session.getState().state
  state.round = 14
  state.roundPhase = 'work'
  state.currentPlayerIndex = 0
  const player = state.players[0]!
  player.occupationPlayed = [CARD_ID]
  player.rooms = 2
  player.roomTiles = [{ row: 1, col: 0 }, { row: 2, col: 0 }]
  setActiveWorkerCount(player, activeWorkerCount)
  setWorkersAtHome(state, player, activeWorkerCount)
  Object.assign(player.resources, { sheep: 1, boar: 1, cattle: 1 })
  const wishChildren = state.actionSpaces.find((space) => space.id === 'wish-children')
  if (!wishChildren) throw new Error('wish-children missing')
  wishChildren.takenBy = []
  session.loadState(state)
  return session
}

describe('E151 Delivery Nurse strict action entry', () => {
  it('keeps Wish for Children available without room when all animal types enable the replacement', () => {
    const session = setupDeliveryNurse()

    expect(session.getState().actionAvailability?.['wish-children']).toBe(true)
    const response = session.takeAction(0, 'wish-children')

    expect(response.ok, response.error).toBe(true)
    expect(familySize(response.state.players[0]!)).toBe(3)
    expect(response.state.players[0]!.cardStates[CARD_ID]?.flagged).toBe(true)
  })

  it('does not make card-granted family growth doable outside a Wish for Children space', () => {
    const session = setupDeliveryNurse()
    const state = session.getState().state
    const player = state.players[0]!
    player.occupationPlayed.push('B092_LittleStickKnitter')
    const sheepMarket = state.actionSpaces.find((space) => space.id === 'sheep-market')
    if (!sheepMarket) throw new Error('sheep-market missing')

    const results = runCardListeners({
      state,
      player,
      space: sheepMarket,
      actionId: 'family-growth',
      phase: 'isDoable',
    } as CardListenerContext)

    expect(results).toEqual([])
  })

  it('keeps Wish for Children unavailable when no worker remains in supply', () => {
    const session = setupDeliveryNurse(5)

    expect(session.getState().actionAvailability?.['wish-children']).toBe(false)
    const response = session.takeAction(0, 'wish-children')

    expect(response.ok).toBe(false)
    expect(response.error).toBe('space unavailable')
    expect(response.state.actionSpaces.find((space) => space.id === 'wish-children')?.takenBy).toEqual([])
    expect(response.state.players[0]!.cardStates[CARD_ID]?.flagged).not.toBe(true)
  })
})
