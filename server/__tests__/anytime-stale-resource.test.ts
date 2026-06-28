import { describe, expect, it } from 'vitest'
import { GameSession } from '../game/authoritative-session'

import '../../shared/cards/B/B032_Kettle'
import '../../shared/cards/D/D106_WhiskyDistiller'

const KETTLE = 'B032_Kettle'
const WHISKY = 'D106_WhiskyDistiller'
const WHISKY_ANYTIME_ID = 'D106-whisky-distiller-anytime'

const setupOneGrain = () => {
  const session = new GameSession()
  const state = session.getState().state
  state.players = state.players.slice(0, 2)
  state.currentPlayerIndex = 0
  state.round = 1
  for (const p of state.players) {
    p.minorHand = ['__test_placeholder__']
    p.occupationHand = ['__test_placeholder__']
  }
  const p0 = state.players[0]!
  p0.minorPlayed.push(KETTLE)
  p0.minorPlayed.push(WHISKY)
  p0.resources = { ...p0.resources, grain: 1, food: 0 }
  session.loadState(state)
  return session
}

describe('anytime — stale resource after nested', () => {
  it('exchange: D106 eats last grain, then exchange grain-trade gracefully fails / degrades', () => {
    const session = setupOneGrain()
    expect(session.takeAction(0, 'farmland').ok).toBe(true)
    expect(session.takeAnytimeAction(0, 'exchange').ok).toBe(true)

    const nested = session.takeAnytimeAction(0, WHISKY_ANYTIME_ID)
    expect(nested.ok).toBe(true)
    expect(nested.state.players[0]!.resources.grain).toBe(0)

    // Attempt original 1-grain → 3-food trade. Engine must not allow negative grain.
    const finalize = session.resolveChoice(0, 'bulk:0=1')
    // Acceptable outcomes: degraded to 0 trades + ok=true, OR ok=false rejection.
    if (finalize.ok) {
      expect(finalize.state.players[0]!.resources.grain).toBe(0)
      expect(finalize.state.players[0]!.resources.food).toBe(0)
    } else {
      expect(finalize.error).toBeTruthy()
    }
  })
})
