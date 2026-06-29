import { describe, expect, it } from 'vitest'
import { GameSession } from '../game/authoritative-session'
import { getCardEffect } from '../../shared/cards/card-effects'
import type { PlayerState, GameState } from '../../shared/contract/types'

import '../../shared/cards/B/B032_Kettle'

const CARD_ID = 'B032_Kettle'

const bonusScore = (state: GameState, player: PlayerState) => {
  const handler = getCardEffect(CARD_ID)?.computeBonusScore
  if (!handler) return 0
  const result = handler(state, player)
  return typeof result === 'number' ? result : 0
}

const setup = () => {
  const session = new GameSession()
  const state = session.getState().state
  state.players = state.players.slice(0, 2)
  state.currentPlayerIndex = 0
  state.round = 1

  const player = state.players[0]!
  player.minorPlayed.push(CARD_ID)
  // give plenty of grain so any of the trades is doable
  player.resources = { ...player.resources, grain: 10, food: 0 }
  // farmland action will trigger the anytime-exchange interaction
  session.loadState(state)
  return session
}

const enter = (session: GameSession) => {
  const resp = session.takeAction(0, 'farmland')
  expect(resp.ok).toBe(true)
  return resp
}

describe('B032_Kettle session', () => {
  it('1-grain trade gives 3 food and 0 bonus VP', () => {
    const session = setup()
    enter(session)
    let resp = session.takeAnytimeAction(0, 'exchange')
    expect(resp.ok).toBe(true)
    // bulk:0=1 → trade index 0 (grain→3food) once
    resp = session.resolveChoice(0, 'bulk:0=1')
    expect(resp.ok).toBe(true)
    const player = resp.state.players[0]!
    expect(player.resources.grain).toBe(9)
    expect(player.resources.food).toBe(3)
    expect(bonusScore(resp.state, player)).toBe(0)
  })

  it('3-grain trade gives 4 food and +1 bonus VP', () => {
    const session = setup()
    enter(session)
    let resp = session.takeAnytimeAction(0, 'exchange')
    // bulk:1=1 → trade index 1 (3 grain → 4 food + 1 bonus VP)
    resp = session.resolveChoice(0, 'bulk:1=1')
    expect(resp.ok).toBe(true)
    const player = resp.state.players[0]!
    expect(player.resources.grain).toBe(7)
    expect(player.resources.food).toBe(4)
    expect(bonusScore(resp.state, player)).toBe(1)
  })

  it('5-grain trade gives 5 food and +2 bonus VP', () => {
    const session = setup()
    enter(session)
    let resp = session.takeAnytimeAction(0, 'exchange')
    resp = session.resolveChoice(0, 'bulk:2=1')
    expect(resp.ok).toBe(true)
    const player = resp.state.players[0]!
    expect(player.resources.grain).toBe(5)
    expect(player.resources.food).toBe(5)
    expect(bonusScore(resp.state, player)).toBe(2)
  })

  it('bonus VP accumulates across multiple trades', () => {
    const session = setup()
    enter(session)
    // first 3-grain
    let resp = session.takeAnytimeAction(0, 'exchange')
    resp = session.resolveChoice(0, 'bulk:1=1')
    // second 5-grain
    resp = session.takeAnytimeAction(0, 'exchange')
    resp = session.resolveChoice(0, 'bulk:2=1')
    expect(resp.ok).toBe(true)
    const player = resp.state.players[0]!
    expect(player.resources.grain).toBe(2) // 10 - 3 - 5
    expect(player.resources.food).toBe(9) // 4 + 5
    expect(bonusScore(resp.state, player)).toBe(3) // 1 + 2
  })
})
