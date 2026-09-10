import { describe, expect, it } from 'vitest'
import { GameSession, type SessionResponse } from '../game/authoritative-session'
import { setWorkersAtHome } from '../../shared/domain/player'
import { stabilizeRandomHands } from './_helpers/stabilize-random-hands'
import '../../shared/cards/E/E063_IronOven'

const CARD_ID = 'E063_IronOven'

const FILLER = '__test_placeholder__'

const setup = ({ played = true, grain = 0 }: { played?: boolean; grain?: number } = {}) => {
  const session = new GameSession(6063, undefined, { playerCount: 2 })
  stabilizeRandomHands(session.state.players)
  const state = session.getState().state
  state.currentPlayerIndex = 0
  state.round = 14
  state.roundPhase = 'work'
  state.availableMajorImprovements = []
  state.players.forEach((player, index) => {
    setWorkersAtHome(state, player, 2)
    player.minorHand = [FILLER]
    player.occupationHand = [FILLER]
    player.minorPlayed = []
    player.occupationPlayed = []
    player.cardStates = {}
    Object.assign(player.resources, {
      wood: 0, clay: 0, reed: 0, stone: 0, food: index === 0 ? 0 : 20,
      grain: 0, vegetable: 0, sheep: 0, boar: 0, cattle: 0, begging: 0,
    })
  })
  const owner = state.players[0]!
  owner.minorHand = played ? [FILLER] : [CARD_ID]
  owner.minorPlayed = played ? [CARD_ID] : []
  owner.resources.stone = played ? 0 : 3
  owner.resources.grain = grain
  state.actionSpaces.forEach((space) => { space.takenBy = [] })
  session.loadState(state)
  return session
}

const options = (response: SessionResponse) => response.interaction.stateId === 'wait'
  ? response.interaction.request.options ?? []
  : []

const playMinor = (session: GameSession) => {
  let response = session.takeAction(0, 'meeting-place')
  if (response.interaction.stateId !== 'wait') return response
  if (!options(response).some((option) => option.value === CARD_ID)) {
    const improvement = options(response).find((option) =>
      option.value.startsWith('action-improvement-'))
    if (improvement) response = session.resolveChoice(response.interaction.playerIndex, improvement.value)
  }
  if (!response.state.players[0]!.minorHand.includes(CARD_ID)) return response
  if (response.interaction.stateId !== 'wait') return response
  const card = options(response).find((option) => option.value === CARD_ID)
  expect(card).toBeDefined()
  return session.resolveChoice(response.interaction.playerIndex, card!.value)
}

const resolveBakeOffer = (session: GameSession, response: SessionResponse, accept: boolean) => {
  expect(response.interaction.stateId).toBe('wait')
  if (response.interaction.stateId !== 'wait') return response
  const choice = options(response).find((option) => accept
    ? option.value !== '__skip__'
    : option.value === '__skip__')
  expect(choice, JSON.stringify(response.interaction)).toBeDefined()
  return session.resolveChoice(response.interaction.playerIndex, choice!.value)
}

describe('E063 Iron Oven parity', () => {
  it('E063 S1: paying three stone plays Iron Oven and may immediately bake one grain for six food', () => {
    const session = setup({ played: false, grain: 1 })
    let response = playMinor(session)
    expect(response.state.players[0]!.minorPlayed).toContain(CARD_ID)
    expect(response.state.players[0]!.resources.stone).toBe(0)
    response = resolveBakeOffer(session, response, true)

    expect(response.ok, response.error).toBe(true)
    expect(response.state.players[0]!.resources).toMatchObject({ grain: 0, food: 6 })
  })

  it('E063 S2: the immediate Bake Bread action may be declined', () => {
    const session = setup({ played: false, grain: 1 })
    const response = resolveBakeOffer(session, playMinor(session), false)

    expect(response.ok, response.error).toBe(true)
    expect(response.state.players[0]!.minorPlayed).toContain(CARD_ID)
    expect(response.state.players[0]!.resources).toMatchObject({ stone: 0, grain: 1, food: 0 })
  })

  it('E063 S3: a later Grain Utilization action can use Iron Oven at most once', () => {
    const session = setup({ grain: 2 })
    const response = session.takeAction(0, 'grain-utilization')

    expect(response.ok, response.error).toBe(true)
    expect(response.state.players[0]!.resources).toMatchObject({ grain: 1, food: 6 })
  })

  it('E063 S4: Iron Oven contributes two printed points', () => {
    const response = setup().getState()

    expect(response.scores[0]!.categories.find((category) => category.key === 'cards')?.entries)
      .toContainEqual(expect.objectContaining({ cardId: CARD_ID, score: 2 }))
  })
})
