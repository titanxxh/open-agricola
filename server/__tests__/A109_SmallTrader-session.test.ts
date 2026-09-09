import { describe, expect, it } from 'vitest'
import { GameSession, type SessionResponse } from '../game/authoritative-session'
import { setWorkersAtHome } from '../../shared/domain/player'
import { stabilizeRandomHands } from './_helpers/stabilize-random-hands'

import '../../shared/cards/A/A030_BakingSheet'
import '../../shared/cards/A/A109_SmallTrader'

const CARD_ID = 'A109_SmallTrader'
const MINOR_ID = 'A030_BakingSheet'
const MAJOR_ID = 'Major_Fireplace1'
const FILLER = '__test_placeholder__'

const setup = ({ played = true, clay = 0 } = {}) => {
  const session = new GameSession(5109, undefined, { playerCount: 2 })
  stabilizeRandomHands(session.state.players)
  const state = session.getState().state
  state.currentPlayerIndex = 0
  state.round = 14
  state.roundPhase = 'work'
  state.players.forEach((player) => {
    player.minorHand = [FILLER]
    player.occupationHand = [FILLER]
    player.resources.food = 0
    player.resources.clay = 0
    setWorkersAtHome(state, player, 2)
  })
  const owner = state.players[0]!
  owner.occupationHand = played ? [FILLER] : [CARD_ID]
  owner.occupationPlayed = played ? [CARD_ID] : []
  owner.minorHand = played ? [MINOR_ID] : [FILLER]
  owner.resources.clay = clay
  state.availableMajorImprovements = [MAJOR_ID]
  session.loadState(state)
  return session
}

const chooseCard = (session: GameSession, response: SessionResponse, cardId: string) => {
  for (let step = 0; step < 3; step += 1) {
    const player = response.state.players[0]!
    if (player.minorPlayed.includes(cardId)
      || player.occupationPlayed.includes(cardId)
      || player.improvements.includes(cardId)) return response
    if (response.interaction.stateId !== 'wait') return response
    const option = response.interaction.request.options?.find((candidate) =>
      candidate.value === cardId || candidate.value.startsWith('action-improvement-'))
    if (!option) return response
    response = session.resolveChoice(response.interaction.playerIndex, option.value)
  }
  return response
}

describe('A109 Small Trader parity', () => {
  it('A109 S1: Small Trader is played as the first occupation without paying food', () => {
    const session = setup({ played: false })
    const response = chooseCard(session, session.takeAction(0, 'lessons'), CARD_ID)

    expect(response.ok, response.error).toBe(true)
    expect(response.state.players[0]!.occupationPlayed).toContain(CARD_ID)
    expect(response.state.players[0]!.resources.food).toBe(0)
  })

  it('A109 S2: playing a minor from hand with Major or Minor Improvement gains three food', () => {
    const session = setup()
    const response = chooseCard(session, session.takeAction(0, 'major-improvement'), MINOR_ID)

    expect(response.ok, response.error).toBe(true)
    expect(response.state.players[0]!.minorPlayed).toContain(MINOR_ID)
    expect(response.state.players[0]!.resources.food).toBe(3)
  })

  it('A109 S3: taking a major improvement from the board grants no Small Trader food', () => {
    const session = setup({ clay: 2 })
    const response = chooseCard(session, session.takeAction(0, 'major-improvement'), MAJOR_ID)

    expect(response.ok, response.error).toBe(true)
    expect(response.state.players[0]!.improvements).toContain(MAJOR_ID)
    expect(response.state.players[0]!.resources).toMatchObject({ clay: 0, food: 0 })
  })

  it('A109 S4: Meeting Place minor improvements do not grant Small Trader food', () => {
    const session = setup()
    const response = chooseCard(session, session.takeAction(0, 'meeting-place'), MINOR_ID)

    expect(response.ok, response.error).toBe(true)
    expect(response.state.players[0]!.minorPlayed).toContain(MINOR_ID)
    expect(response.state.players[0]!.resources.food).toBe(0)
  })
  it('rewards a minor played through a card-granted major-or-minor action', () => {
    const session = setup()
    const state = session.state
    const owner = state.players[0]!
    owner.minorPlayed = ['A023_StoneCompany']
    owner.minorHand = ['E047_SyrupTap']
    owner.resources.wood = 1
    state.availableMajorImprovements = []
    state.actionSpaces.find((space) => space.id === 'western-quarry')!.resources.stone = 1
    session.loadState(state)
    let response = session.takeAction(0, 'western-quarry')
    for (let step = 0; step < 8 && response.interaction.stateId === 'wait'; step++) {
      const options = response.interaction.request.options ?? []
      const option = options.find((candidate) => candidate.value === 'A023_StoneCompany')
        ?? options.find((candidate) => candidate.value === 'E047_SyrupTap')
        ?? options.find((candidate) => candidate.value !== '__skip__' && candidate.value !== 'confirm')
      if (!option) break
      response = session.resolveChoice(0, option.value)
    }
    expect(response.ok, response.error).toBe(true)
    expect(response.state.players[0]!.minorPlayed).toContain('E047_SyrupTap')
    expect(response.state.players[0]!.resources.food).toBe(3)
  })

})
