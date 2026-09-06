import { describe, expect, it } from 'vitest'
import { GameSession, type SessionResponse } from '../game/authoritative-session'
import { setWorkersAtHome } from '../../shared/domain/player'
import { stabilizeRandomHands } from './_helpers/stabilize-random-hands'

import '../../shared/cards/B/B095_MasterBricklayer'
import '../../shared/cards/E/E047_SyrupTap'

const CARD_ID = 'B095_MasterBricklayer'
const FILLER = '__test_placeholder__'

const setup = ({
  rooms = 2, played = true, wood = 0, reed = 0, stone = 0, minor = false,
} = {}) => {
  const session = new GameSession(5095, undefined, { playerCount: 2 })
  stabilizeRandomHands(session.state.players)
  const state = session.getState().state
  state.currentPlayerIndex = 0
  state.round = 6
  state.roundPhase = 'work'
  state.availableMajorImprovements = minor ? [] : ['Major_Basket']
  state.players.forEach((player) => {
    setWorkersAtHome(state, player, 2)
    player.minorHand = [FILLER]
    player.occupationHand = [FILLER]
    player.resources.food = 20
  })
  const owner = state.players[0]!
  owner.rooms = rooms
  owner.occupationPlayed = played ? [CARD_ID] : []
  owner.occupationHand = played ? [FILLER] : [CARD_ID]
  owner.minorHand = minor ? ['E047_SyrupTap'] : [FILLER]
  owner.resources = {
    ...owner.resources,
    wood, clay: 0, reed, stone, grain: 0, vegetable: 0, sheep: 0, boar: 0, cattle: 0,
  }
  session.loadState(state)
  return session
}

const chooseCard = (session: GameSession, response: SessionResponse, cardId: string) => {
  if (response.interaction.stateId !== 'wait') return response
  const option = response.interaction.request.options?.find((candidate) => candidate.value === cardId)
  return option ? session.resolveChoice(response.interaction.playerIndex, option.value) : response
}

const buyBasket = (session: GameSession) =>
  chooseCard(session, session.takeAction(0, 'major-improvement'), 'Major_Basket')

const playMinor = (session: GameSession) => {
  let response = session.takeAction(0, 'meeting-place')
  if (response.interaction.stateId === 'wait') {
    const improvement = response.interaction.request.options?.find((option) =>
      option.value.startsWith('action-improvement-'))
    if (improvement) response = session.resolveChoice(response.interaction.playerIndex, improvement.value)
  }
  return chooseCard(session, response, 'E047_SyrupTap')
}

describe('B095 Master Bricklayer parity', () => {
  it('B095 S1: playing Master Bricklayer through Lessons leaves it in play', () => {
    const session = setup({ played: false })
    const response = chooseCard(session, session.takeAction(0, 'lessons'), CARD_ID)

    expect(response.ok, response.error).toBe(true)
    expect(response.state.players[0]!.occupationPlayed).toContain(CARD_ID)
  })

  it('B095 S2: with only the two initial rooms Master Bricklayer gives no major stone discount', () => {
    const response = buyBasket(setup({ reed: 2, stone: 2 }))

    expect(response.ok, response.error).toBe(true)
    expect(response.state.players[0]!.improvements).toContain('Major_Basket')
    expect(response.state.players[0]!.resources).toMatchObject({ reed: 0, stone: 0 })
  })

  it('B095 S3: one room built onto the initial house reduces a major cost by one stone', () => {
    const response = buyBasket(setup({ rooms: 3, reed: 2, stone: 1 }))

    expect(response.ok, response.error).toBe(true)
    expect(response.state.players[0]!.improvements).toContain('Major_Basket')
    expect(response.state.players[0]!.resources).toMatchObject({ reed: 0, stone: 0 })
  })

  it('B095 S4: two added rooms reduce a two-stone major cost to zero without creating stone', () => {
    const response = buyBasket(setup({ rooms: 4, reed: 2 }))

    expect(response.ok, response.error).toBe(true)
    expect(response.state.players[0]!.improvements).toContain('Major_Basket')
    expect(response.state.players[0]!.resources).toMatchObject({ reed: 0, stone: 0 })
  })

  it('B095 S5: added rooms do not discount the stone cost of a minor improvement', () => {
    const response = playMinor(setup({ rooms: 4, wood: 1, stone: 1, minor: true }))

    expect(response.ok, response.error).toBe(true)
    expect(response.state.players[0]!.minorPlayed).toContain('E047_SyrupTap')
    expect(response.state.players[0]!.resources).toMatchObject({ wood: 0, stone: 0 })
  })
})
