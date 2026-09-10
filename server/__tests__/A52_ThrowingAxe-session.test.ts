import { type SessionResponse } from '../game/authoritative-session'
import { setWorkersAtHome } from '../../shared/domain/player'
import { stabilizeRandomHands } from './_helpers/stabilize-random-hands'

import { describe, expect, it } from 'vitest'
import { GameSession } from '../game/authoritative-session'
import { A052_ThrowingAxe } from '../../shared/cards/A/A052_ThrowingAxe'
import { meetsCardPrerequisites } from '../../shared/cards/helpers/prerequisites'

describe('A052_ThrowingAxe prerequisite', () => {
  it('blocks when round < 7', () => {
    const session = new GameSession()
    const state = session.getState().state
    state.round = 6
    const player = state.players[0]!
    expect(meetsCardPrerequisites(player, A052_ThrowingAxe, state.round, state)).toBe(false)
  })

  it('allows when round >= 7', () => {
    const session = new GameSession()
    const state = session.getState().state
    state.round = 7
    const player = state.players[0]!
    expect(meetsCardPrerequisites(player, A052_ThrowingAxe, state.round, state)).toBe(true)
  })
})

describe('A052 Throwing Axe parity', () => {
  const CARD_ID = 'A052_ThrowingAxe'

  const FILLER = '__test_placeholder__'

  const setup = ({
    played = true, round = 7, actor = 0, pigs = 1,
  }: {
    played?: boolean
    round?: number
    actor?: number
    pigs?: number
  } = {}) => {
    const session = new GameSession(6052, undefined, { playerCount: 2 })
    stabilizeRandomHands(session.state.players)
    const state = session.getState().state
    state.currentPlayerIndex = actor
    state.round = round
    state.roundPhase = 'work'
    state.availableMajorImprovements = []
    state.players.forEach((player) => {
      setWorkersAtHome(state, player, 2)
      player.minorHand = [FILLER]
      player.occupationHand = [FILLER]
      player.minorPlayed = []
      player.resources = {
        ...player.resources, wood: 0, clay: 0, reed: 0, stone: 0, food: 0, grain: 0,
        vegetable: 0, sheep: 0, boar: 0, cattle: 0,
      }
    })
    const owner = state.players[0]!
    if (played) owner.minorPlayed = [CARD_ID]
    else {
      owner.minorHand = [CARD_ID, FILLER]
      owner.resources.wood = 1
    }
    state.actionSpaces.find((space) => space.id === 'pig-market')!.resources.boar = pigs
    state.actionSpaces.find((space) => space.id === 'forest')!.resources.wood = 3
    session.loadState(state)
    return session
  }

  const options = (response: SessionResponse) => response.interaction.stateId === 'wait'
    ? response.interaction.request.options ?? []
    : []

  const enterMinor = (session: GameSession) => {
    let response = session.takeAction(0, 'major-improvement')
    if (response.interaction.stateId !== 'wait') return response
    if (options(response).some((option) => option.value === CARD_ID)) return response
    const improvement = options(response).find((option) => option.value.startsWith('action-improvement-'))
    if (improvement) response = session.resolveChoice(response.interaction.playerIndex, improvement.value)
    return response
  }

  const playCard = (session: GameSession) => {
    let response = enterMinor(session)
    if (!response.state.players[0]!.minorHand.includes(CARD_ID)) return response
    const card = options(response).find((option) => option.value === CARD_ID)
    expect(card).toBeDefined()
    if (card) response = session.resolveChoice(response.interaction.playerIndex, card.value)
    return response
  }

  it('A052 S1: in round seven paying one wood plays Throwing Axe', () => {
    const response = playCard(setup({ played: false }))

    expect(response.ok, response.error).toBe(true)
    expect(response.state.players[0]!.minorPlayed).toContain(CARD_ID)
    expect(response.state.players[0]!.resources.wood).toBe(0)
  })

  it('A052 S2: before round seven Throwing Axe remains unavailable', () => {
    const response = enterMinor(setup({ played: false, round: 6 }))

    expect(options(response).some((option) => option.value === CARD_ID)).toBe(false)
    expect(response.state.players[0]!.minorHand).toContain(CARD_ID)
    expect(response.state.players[0]!.resources.wood).toBe(1)
  })

  it('A052 S3: using a wood accumulation space while Pig Market holds a pig gains two food', () => {
    const response = setup().takeAction(0, 'forest')

    expect(response.ok, response.error).toBe(true)
    expect(response.state.players[0]!.resources).toMatchObject({ wood: 3, food: 2 })
  })

  it('A052 S4: an empty Pig Market prevents the food bonus', () => {
    const response = setup({ pigs: 0 }).takeAction(0, 'forest')

    expect(response.ok, response.error).toBe(true)
    expect(response.state.players[0]!.resources).toMatchObject({ wood: 3, food: 0 })
  })

  it('A052 S5: a non-wood accumulation space and an opponent wood action grant the owner no food', () => {
    const nonWood = setup().takeAction(0, 'day-laborer')
    expect(nonWood.ok, nonWood.error).toBe(true)
    expect(nonWood.state.players[0]!.resources).toMatchObject({ food: 2, wood: 0 })

    const opponent = setup({ actor: 1 }).takeAction(1, 'forest')
    expect(opponent.ok, opponent.error).toBe(true)
    expect(opponent.state.players[0]!.resources.food).toBe(0)
    expect(opponent.state.players[1]!.resources).toMatchObject({ food: 0, wood: 3 })
  })
})
