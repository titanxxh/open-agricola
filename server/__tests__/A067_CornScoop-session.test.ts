import { describe, expect, it } from 'vitest'
import { GameSession } from '../game/authoritative-session'
import { setWorkersAtHome } from '../../shared/domain/player'
import { stabilizeRandomHands } from './_helpers/stabilize-random-hands'

import '../../shared/cards/A/A067_CornScoop'

const CARD_ID = 'A067_CornScoop'
const FILLER = '__test_placeholder__'

const setup = ({ played = true, wood = 0, actor = 0 } = {}) => {
  const session = new GameSession(5067, undefined, { playerCount: 2 })
  stabilizeRandomHands(session.state.players)
  const state = session.getState().state
  state.currentPlayerIndex = actor
  state.round = 1
  state.roundPhase = 'work'
  state.availableMajorImprovements = []
  state.players.forEach((player) => {
    setWorkersAtHome(state, player, 2)
    player.minorHand = [FILLER]
    player.occupationHand = [FILLER]
    player.resources.grain = 0
  })
  const player = state.players[0]!
  player.minorHand = played ? [FILLER] : [CARD_ID]
  player.minorPlayed = played ? [CARD_ID] : []
  player.resources.wood = wood
  session.loadState(state)
  return session
}

const playCornScoop = (session: GameSession) => {
  let response = session.takeAction(0, 'major-improvement')
  if (response.interaction.stateId !== 'wait') return response
  if (!response.interaction.request.options?.some((option) => option.value === CARD_ID)) {
    const improvement = response.interaction.request.options?.find((option) =>
      option.value.startsWith('action-improvement-'))
    if (improvement) response = session.resolveChoice(0, improvement.value)
  }
  if (!response.state.players[0]!.minorHand.includes(CARD_ID)) return response
  if (response.interaction.stateId !== 'wait') return response
  const card = response.interaction.request.options?.find((option) => option.value === CARD_ID)
  expect(card).toBeDefined()
  return session.resolveChoice(0, card!.value)
}

describe('A067 Corn Scoop parity', () => {
  it('A067 S1: Corn Scoop costs one wood to play', () => {
    const response = playCornScoop(setup({ played: false, wood: 1 }))

    expect(response.ok, response.error).toBe(true)
    expect(response.state.players[0]!.minorPlayed).toContain(CARD_ID)
    expect(response.state.players[0]!.resources.wood).toBe(0)
  })

  it('A067 S2: Grain Seeds gives its grain plus one additional grain', () => {
    const response = setup().takeAction(0, 'grain-seeds')

    expect(response.ok, response.error).toBe(true)
    expect(response.state.players[0]!.resources.grain).toBe(2)
  })

  it('A067 S3: a different action space gives no additional grain', () => {
    const response = setup().takeAction(0, 'day-laborer')

    expect(response.ok, response.error).toBe(true)
    expect(response.state.players[0]!.resources.grain).toBe(0)
  })

  it('A067 S4: another player using Grain Seeds gives the owner no grain', () => {
    const response = setup({ actor: 1 }).takeAction(1, 'grain-seeds')

    expect(response.ok, response.error).toBe(true)
    expect(response.state.players[0]!.resources.grain).toBe(0)
    expect(response.state.players[1]!.resources.grain).toBe(1)
  })
})
