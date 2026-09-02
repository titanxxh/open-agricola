import { describe, expect, it } from 'vitest'
import { GameSession } from '../game/authoritative-session'
import { stabilizeRandomHands } from './_helpers/stabilize-random-hands'
import { setWorkersAtHome } from '../../shared/domain/player'

import '../../shared/cards/C/C141_SheepProvider'

const CARD_ID = 'C141_SheepProvider'

describe('C141_SheepProvider session', () => {
  const setup = (currentPlayerIndex: number, played = true) => {
    const session = new GameSession(141, undefined, { playerCount: 3 })
    stabilizeRandomHands(session.state.players)
    const state = session.getState().state
    state.currentPlayerIndex = currentPlayerIndex
    state.round = 14

    state.players.forEach((player) => {
      setWorkersAtHome(state, player, 2)
      player.minorHand = ['__test_placeholder__']
      player.occupationHand = ['__test_placeholder__']
      player.resources.grain = 0
    })

    const owner = state.players[0]!
    if (played) owner.occupationPlayed.push(CARD_ID)
    else owner.occupationHand = [CARD_ID]

    // Ensure sheep-market is the first round action (opens at round 1)
    state.roundActionOrder = state.roundActionOrder.map((id) =>
      id === 'sheep-market' ? null : id,
    )
    state.roundActionOrder[0] = 'sheep-market'

    // Ensure sheep-market has accumulated resources
    const sheepMarket = state.actionSpaces.find((s) => s.id === 'sheep-market')
    if (!sheepMarket) throw new Error('sheep-market space missing')
    sheepMarket.resources.sheep = 1

    session.loadState(state)
    return session
  }

  it('C141 S1: playing Sheep Provider through Lessons keeps the occupation in play', () => {
    const response = setup(0, false).takeAction(0, 'lessons')

    expect(response.ok, response.error).toBe(true)
    expect(response.state.players[0]!.occupationPlayed).toContain(CARD_ID)
  })

  it('C141 S3: another player using Sheep Market gives the owner one grain', () => {
    const session = setup(1)
    const grainBefore = session.getState().state.players[0]!.resources.grain

    // Opponent takes sheep-market; sheep collection triggers animalReorg first
    let resp = session.takeAction(1, 'sheep-market')
    expect(resp.ok).toBe(true)
    expect(resp.interaction.stateId).toBe('wait')

    // Confirm animal reorg for opponent (p1) — engine finishes, after-hooks fire
    resp = session.resolveChoice(1, 'confirm', [])

    // After-hooks silently switch to owner, auto-gain grain, and switch back
    // Grain should be gained by owner (no confirmPlayerSwitch needed for auto-gains)
    expect(resp.state.players[0]!.resources.grain).toBe(grainBefore + 1)
  })

  it('C141 S2: the owner using Sheep Market gains one grain', () => {
    const session = setup(0)
    const grainBefore = session.getState().state.players[0]!.resources.grain

    // Owner takes sheep-market; sheep collection triggers animalReorg first
    let resp = session.takeAction(0, 'sheep-market')
    expect(resp.ok).toBe(true)
    expect(resp.interaction.stateId).toBe('wait')

    // Confirm animal reorg for owner — engine finishes, after-hooks fire
    // No PlayerSwitch needed since owner triggered it
    resp = session.resolveChoice(0, 'confirm', [])

    // Grain should be gained by owner
    expect(resp.state.players[0]!.resources.grain).toBe(grainBefore + 1)
  })

  it('C141 S4: an unrelated action gives the owner no grain', () => {
    const response = setup(0).takeAction(0, 'day-laborer')

    expect(response.ok, response.error).toBe(true)
    expect(response.state.players[0]!.resources.grain).toBe(0)
  })
})
