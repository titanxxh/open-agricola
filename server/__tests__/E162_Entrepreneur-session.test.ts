import { describe, expect, it } from 'vitest'
import { GameSession, type SessionResponse } from '../game/authoritative-session'
import { getCardStack, pushToCardStack } from '../../shared/cards/helpers/card-state'
import { markAllWorkersUsed, setWorkersAtHome } from '../../shared/domain/player'
import { stabilizeRandomHands } from './_helpers/stabilize-random-hands'

import '../../shared/cards/E/E162_Entrepreneur'

const CARD_ID = 'E162_Entrepreneur'
const FILLER = '__test_placeholder__'

const setup = ({
  played = true, food = 1, storedFood = 0, resources = {},
}: {
  played?: boolean
  food?: number
  storedFood?: number
  resources?: Partial<{ wood: number; clay: number; reed: number; stone: number }>
} = {}) => {
  const session = new GameSession(7162, undefined, { playerCount: 4 })
  stabilizeRandomHands(session.state.players)
  const state = session.getState().state
  state.currentPlayerIndex = 0
  state.round = 5
  state.roundPhase = 'work'
  state.availableMajorImprovements = []
  state.players.forEach((player) => {
    player.minorHand = [FILLER]
    player.occupationHand = [FILLER]
    player.minorPlayed = []
    player.occupationPlayed = []
    player.improvements = []
    player.cardStates = {}
    Object.assign(player.resources, {
      wood: 0, clay: 0, reed: 0, stone: 0, food: 20, grain: 0, vegetable: 0,
      sheep: 0, boar: 0, cattle: 0, begging: 0,
    })
    setWorkersAtHome(state, player, 2)
  })
  const owner = state.players[0]!
  owner.occupationHand = played ? [FILLER] : [CARD_ID]
  owner.occupationPlayed = played ? [CARD_ID] : []
  Object.assign(owner.resources, { food, ...resources })
  if (storedFood > 0) pushToCardStack(owner, CARD_ID, Array(storedFood).fill('food'))
  session.loadState(state)
  return session
}

const optionsOf = (response: SessionResponse) => response.interaction.stateId === 'wait'
  ? response.interaction.request.options ?? []
  : []

const playEntrepreneur = (session: GameSession) => {
  const response = session.takeAction(0, 'lessons')
  expect(response.ok, response.error).toBe(true)
  if (!response.state.players[0]!.occupationHand.includes(CARD_ID)) return response
  if (response.interaction.stateId !== 'wait') return response
  const option = optionsOf(response).find((candidate) => candidate.value === CARD_ID)
  expect(option, JSON.stringify(response.interaction, null, 2)).toBeDefined()
  return session.resolveChoice(response.interaction.playerIndex, option!.value)
}

const startNextRound = (session: GameSession) => {
  const state = session.getState().state
  state.players.forEach((player) => markAllWorkersUsed(state, player))
  session.loadState(state)
  return session.performRoundEnd()
}

const resolveEntrepreneur = (
  session: GameSession,
  initial: SessionResponse,
  mode: 'store' | 'discard' | 'pass',
) => {
  let response = initial
  for (let step = 0; step < 8 && response.interaction.stateId === 'wait'; step++) {
    const options = optionsOf(response)
    const cardOptions = options.filter((option) => option.sourceCard === CARD_ID)
    if (mode === 'pass') {
      const skip = options.find((option) => option.value === '__skip__' || option.value === '__pass__')
      if (!skip) break
      response = session.resolveChoice(response.interaction.playerIndex, skip.value)
      break
    }
    const preferred = options.find((option) =>
      option.sourceCard === CARD_ID && (mode === 'discard'
        ? option.labelKey === 'actions.pop-card-stack.name'
        : option.labelKey !== 'actions.pop-card-stack.name' && option.value !== '__skip__'),
    )
    const option = preferred
      ?? cardOptions.find((candidate) => candidate.value !== '__skip__')
      ?? options.find((candidate) => candidate.value !== '__skip__' && candidate.value !== '__pass__')
    if (!option) break
    response = session.resolveChoice(response.interaction.playerIndex, option.value)
  }
  return response
}

describe('E162 Entrepreneur parity', () => {
  it('E162 S1: Entrepreneur can be played as the first occupation in a four-player game', () => {
    const response = playEntrepreneur(setup({ played: false, food: 0 }))

    expect(response.ok, response.error).toBe(true)
    expect(response.state.players[0]!.occupationPlayed).toContain(CARD_ID)
    expect(response.state.players[0]!.resources.food).toBe(0)
  })

  it('E162 S2: storing one food auto-picks wood instead of offering every missing resource', () => {
    const session = setup({ food: 1 })

    const response = resolveEntrepreneur(session, startNextRound(session), 'store')

    expect(response.ok, response.error).toBe(true)
    expect(response.state.players[0]!.resources).toMatchObject({
      food: 0, wood: 1, clay: 0, reed: 0, stone: 0,
    })
    expect(getCardStack(response.state.players[0]!, CARD_ID)).toEqual(['food'])
  })

  it('E162 S3: taking stored food returns it to supply and auto-picks wood', () => {
    const session = setup({ food: 0, storedFood: 1 })

    const response = resolveEntrepreneur(session, startNextRound(session), 'discard')

    expect(response.ok, response.error).toBe(true)
    expect(response.state.players[0]!.resources).toMatchObject({
      food: 1, wood: 1, clay: 0, reed: 0, stone: 0,
    })
    expect(getCardStack(response.state.players[0]!, CARD_ID)).toEqual([])
  })

  it('E162 S4: when both food sources exist the player may take the stored food', () => {
    const session = setup({ food: 1, storedFood: 1 })

    const response = resolveEntrepreneur(session, startNextRound(session), 'discard')

    expect(response.state.players[0]!.resources).toMatchObject({ food: 2, wood: 1 })
    expect(getCardStack(response.state.players[0]!, CARD_ID)).toEqual([])
  })

  it('E162 S5: the round-start action may be declined', () => {
    const session = setup({ food: 1, storedFood: 1 })

    const response = resolveEntrepreneur(session, startNextRound(session), 'pass')

    expect(response.state.players[0]!.resources).toMatchObject({
      food: 1, wood: 0, clay: 0, reed: 0, stone: 0,
    })
    expect(getCardStack(response.state.players[0]!, CARD_ID)).toEqual(['food'])
  })

  it('E162 S6: owning all four building-resource types suppresses the round-start action', () => {
    const session = setup({
      food: 1, storedFood: 1, resources: { wood: 1, clay: 1, reed: 1, stone: 1 },
    })

    const response = startNextRound(session)

    expect(optionsOf(response).some((option) => option.sourceCard === CARD_ID)).toBe(false)
    expect(response.state.players[0]!.resources.food).toBe(1)
    expect(getCardStack(response.state.players[0]!, CARD_ID)).toEqual(['food'])
  })

  it('E162 S7: without food in either place no Entrepreneur prompt is shown', () => {
    const response = startNextRound(setup({ food: 0 }))

    expect(optionsOf(response).some((option) => option.sourceCard === CARD_ID)).toBe(false)
    expect(response.state.players[0]!.resources).toMatchObject({
      wood: 0, clay: 0, reed: 0, stone: 0,
    })
  })
})
