import { describe, expect, it } from 'vitest'
import { GameSession } from '../game/authoritative-session'
import { setWorkersAtHome } from '../../shared/domain/player'
import { stabilizeRandomHands } from './_helpers/stabilize-random-hands'

import '../../shared/cards/C/C161_PotatoDigger'

const CARD_ID = 'C161_PotatoDigger'

const setup = (emptyFields: number, plantedFields = 0) => {
  const session = new GameSession(161, undefined, { playerCount: 4 })
  const state = session.getState().state
  stabilizeRandomHands(state.players)
  state.currentPlayerIndex = 0
  state.round = 14
  state.players.forEach((player) => {
    setWorkersAtHome(state, player, 2)
    player.occupationHand = ['__test_placeholder__']
    player.minorHand = ['__test_placeholder__']
  })
  const owner = state.players[0]!
  owner.occupationHand = [CARD_ID]
  owner.resources.vegetable = 0
  owner.fields = Array.from({ length: emptyFields + plantedFields }, (_, index) => ({
    row: Math.floor(index / 5),
    col: index % 5,
    stacks: index < emptyFields ? [] : [{ kind: 'grain' as const, remaining: 1 }],
  }))
  session.loadState(state)
  return session
}

const play = (emptyFields: number, plantedFields = 0) =>
  setup(emptyFields, plantedFields).takeAction(0, 'lessons')

describe('C161 Potato Digger parity', () => {
  it('C161 S1: fewer than two empty fields grants no vegetable when Potato Digger is played', () => {
    const response = play(1)

    expect(response.ok, response.error).toBe(true)
    expect(response.state.players[0]!.occupationPlayed).toContain(CARD_ID)
    expect(response.state.players[0]!.resources.vegetable).toBe(0)
  })

  it('C161 S2: two empty fields grant one vegetable', () => {
    expect(play(2).state.players[0]!.resources.vegetable).toBe(1)
  })

  it('C161 S3: four empty fields grant two vegetables', () => {
    expect(play(4).state.players[0]!.resources.vegetable).toBe(2)
  })

  it('C161 S4: five empty fields grant three vegetables', () => {
    expect(play(5).state.players[0]!.resources.vegetable).toBe(3)
  })

  it('C161 S5: planted fields do not count toward the Potato Digger thresholds', () => {
    expect(play(3, 2).state.players[0]!.resources.vegetable).toBe(1)
  })
})
