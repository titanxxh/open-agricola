import { describe, expect, it } from 'vitest'
import { GameSession } from '../game/authoritative-session'
import { getCardEffect } from '../../shared/cards/card-effects'

import '../../shared/cards/A/A165_PigBreeder'

const CARD_ID = 'A165_PigBreeder'

const setupPlayerWithCard = (round: number) => {
  const session = new GameSession()
  const state = session.getState().state
  state.players = state.players.slice(0, 2)
  state.round = round
  const player = state.players[0]!
  player.occupationPlayed.push(CARD_ID)
  session.loadState(state)
  return { state, player }
}

describe('A165_PigBreeder session', () => {
  it('round 11: no breed (only fires at round 12)', () => {
    const { state, player } = setupPlayerWithCard(11)
    player.resources.boar = 4
    const effect = getCardEffect(CARD_ID)
    expect(effect?.onRoundEnd).toBeDefined()
    effect!.onRoundEnd!(state, player)
    expect(player.resources.boar).toBe(4)
  })

  it('round 12 with 0 boar: no breed', () => {
    const { state, player } = setupPlayerWithCard(12)
    player.resources.boar = 0
    const effect = getCardEffect(CARD_ID)
    effect!.onRoundEnd!(state, player)
    expect(player.resources.boar).toBe(0)
  })

  it('round 12 with 1 boar: no breed (need ≥2)', () => {
    const { state, player } = setupPlayerWithCard(12)
    player.resources.boar = 1
    const effect = getCardEffect(CARD_ID)
    effect!.onRoundEnd!(state, player)
    expect(player.resources.boar).toBe(1)
  })

  it('round 12 with ≥2 boar and free capacity: +1 boar', () => {
    const { state, player } = setupPlayerWithCard(12)
    // create a fenced pasture so capacity > 0
    player.pastures = [
      { id: 'past-1', tiles: [{ row: 0, col: 0 }], stables: 0, animalType: null, animalCount: 0 },
    ] as unknown as typeof player.pastures
    player.resources.boar = 2
    const effect = getCardEffect(CARD_ID)
    effect!.onRoundEnd!(state, player)
    expect(player.resources.boar).toBe(3)
  })
})
