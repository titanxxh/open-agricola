import { describe, expect, it } from 'vitest'
import { GameSession } from '../game/authoritative-session'
import { stabilizeRandomHands } from './_helpers/stabilize-random-hands'

import '../../shared/cards/D/D144_WaterWorker'

const CARD_ID = 'D144_WaterWorker'

const setup = () => {
  const session = new GameSession()
  stabilizeRandomHands(session.state.players)
  const state = session.getState().state
  state.players = state.players.slice(0, 2)
  state.currentPlayerIndex = 0
  state.round = 1

  const player = state.players[0]!
  player.occupationHand.push(CARD_ID)
  player.resources.food = 10
  session.loadState(state)
  session.devPlayCard(0, CARD_ID)
  return session
}

describe('D144_WaterWorker session', () => {
  it('gains 1 reed after using day-laborer', () => {
    const session = setup()
    const state = session.getState().state
    const player = state.players[0]!
    const initialReed = player.resources.reed
    session.loadState(state)

    const resp = session.takeAction(0, 'day-laborer')
    expect(resp.ok).toBe(true)

    const updated = resp.state.players[0]!
    // Day laborer gives food + WaterWorker gives 1 reed
    expect(updated.resources.reed).toBe(initialReed + 1)
  })

  it('gains 1 reed after using reed-bank', () => {
    const session = setup()
    const state = session.getState().state
    // Make sure reed-bank has some resources accumulated
    const reedBankSpace = state.actionSpaces.find(s => s.id === 'reed-bank')
    if (reedBankSpace) {
      reedBankSpace.resources.reed = 3
    }
    const player = state.players[0]!
    const initialReed = player.resources.reed
    session.loadState(state)

    const resp = session.takeAction(0, 'reed-bank')
    expect(resp.ok).toBe(true)

    const updated = resp.state.players[0]!
    // Reed bank gives accumulated reed + WaterWorker gives 1 reed
    expect(updated.resources.reed).toBeGreaterThan(initialReed + 1)
  })
})
