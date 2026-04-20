import { describe, expect, it } from 'vitest'
import { GameSession } from '../game/authoritative-session'

import { setWorkersAtHome } from '../../shared/game/player'
import '../../shared/cards/D/D74_RoyalWood'
import '../../shared/cards/B/B81_Handcart'
import '../../shared/cards/E/E14_WoodSaw'

const CARD_ID = 'D74_RoyalWood'

const setup = (options?: { wood?: number }) => {
  const session = new GameSession()
  const state = session.getState().state
  state.players = state.players.slice(0, 2)
  state.currentPlayerIndex = 0
  state.round = 1

  const player = state.players[0]!
  setWorkersAtHome(state, player, 2)
  player.resources.food = 10
  player.resources.wood = options?.wood ?? 10
  player.resources.clay = 10
  player.resources.reed = 10
  player.resources.stone = 10
  player.minorHand.push(CARD_ID)

  session.loadState(state)
  session.devPlayCard(0, CARD_ID)
  return session
}

const playOneWoodMinorTurn = (session: GameSession, minorId: string) => {
  const state = session.getState().state
  state.currentPlayerIndex = 0
  const player = state.players[0]!
  setWorkersAtHome(state, player, 1)
  const majorImprovement = state.actionSpaces.find((space) => space.id === 'major-improvement')
  if (!majorImprovement) throw new Error('major-improvement missing')
  majorImprovement.takenBy = []
  if (!player.minorHand.includes(minorId)) {
    player.minorHand.push(minorId)
  }
  session.loadState(state)

  let resp = session.takeAction(0, 'major-improvement')
  expect(resp.ok).toBe(true)
  expect(resp.pending.type).toBe('choice')

  resp = session.resolveChoice(0, `minor:${minorId}`)
  expect(resp.ok).toBe(true)
  expect(resp.pending.type).toBe('confirmNextPlayer')
  return resp
}

describe('D74_RoyalWood session', () => {
  it('refunds wood before confirmNextPlayer after building Joinery', () => {
    const session = setup({ wood: 5 })
    const state = session.getState().state
    const player = state.players[0]!
    player.resources.stone = 10
    if (!state.availableMajorImprovements.includes('Major_Joinery')) {
      state.availableMajorImprovements.push('Major_Joinery')
    }
    session.loadState(state)

    let resp = session.takeAction(0, 'major-improvement')
    expect(resp.pending.type).toBe('choice')

    resp = session.resolveChoice(0, 'major:Major_Joinery')
    expect(resp.ok).toBe(true)
    expect(resp.pending.type).toBe('confirmNextPlayer')
    expect(resp.state.players[0]!.resources.wood).toBe(4)
    expect(resp.state.players[0]!.cardStates?.[CARD_ID]?.extraData?.woodSpent).toBe(0)
  })

  it('does not carry separate 1-wood payments across turns', () => {
    const session = setup({ wood: 10 })

    let resp = playOneWoodMinorTurn(session, 'B81_Handcart')
    expect(resp.state.players[0]!.resources.wood).toBe(9)
    expect(resp.state.players[0]!.cardStates?.[CARD_ID]?.extraData?.woodSpent).toBe(0)

    resp = playOneWoodMinorTurn(session, 'E14_WoodSaw')
    expect(resp.state.players[0]!.resources.wood).toBe(8)
    expect(resp.state.players[0]!.cardStates?.[CARD_ID]?.extraData?.woodSpent).toBe(0)
  })

  it('does nothing on turns without tracked wood payments', () => {
    const session = setup({ wood: 10 })
    const resp = session.takeAction(0, 'day-laborer')
    expect(resp.ok).toBe(true)
    expect(resp.pending.type).toBe('confirmNextPlayer')
    expect(resp.state.players[0]!.resources.wood).toBe(10)
  })
})
