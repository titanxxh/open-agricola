import { describe, expect, it } from 'vitest'
import { GameSession, type SessionResponse } from '../game/authoritative-session'
import { markAllWorkersUsed, setActiveWorkerCount, setNewbornCount, setWorkersAtHome } from '../../shared/domain/player'
import { stabilizeRandomHands } from './_helpers/stabilize-random-hands'
import { confirmNextPlayer, confirmPlayerSwitch } from './_helpers/pending-confirms'

import '../../shared/cards/C/C113_WinterCaretaker'

const CARD_ID = 'C113_WinterCaretaker'
const FILLER = '__test_placeholder__'

const setup = ({
  played = true, food = 6, round = 4,
}: {
  played?: boolean
  food?: number
  round?: number
} = {}) => {
  const session = new GameSession(5113, undefined, { playerCount: 2 })
  stabilizeRandomHands(session.state.players)
  const state = session.getState().state
  state.currentPlayerIndex = 0
  state.round = round
  state.roundPhase = 'work'
  state.players.forEach((player) => {
    player.minorHand = [FILLER]
    player.occupationHand = [FILLER]
    player.minorPlayed = []
    player.occupationPlayed = []
    player.improvements = []
    player.fields = []
    player.pastures = []
    player.stableTiles = []
    player.stableAnimals = {}
    player.houseAnimalType = null
    player.houseAnimalCount = 0
    player.resources = {
      ...player.resources, wood: 0, clay: 0, reed: 0, stone: 0, food: 20, grain: 0,
      vegetable: 0, sheep: 0, boar: 0, cattle: 0, begging: 0,
    }
    setWorkersAtHome(state, player, 2)
    setActiveWorkerCount(player, 2)
    setNewbornCount(player, 0)
  })
  const owner = state.players[0]!
  owner.resources.food = food
  owner.occupationHand = played ? [FILLER] : [CARD_ID]
  owner.occupationPlayed = played ? [CARD_ID] : []
  session.loadState(state)
  return session
}

const playOccupation = (session: GameSession) => {
  let response = session.takeAction(0, 'lessons')
  expect(response.ok, response.error).toBe(true)
  if (response.interaction.stateId !== 'wait') return response
  const option = response.interaction.request.options?.find((candidate) => candidate.value === CARD_ID)
  if (option) response = session.resolveChoice(response.interaction.playerIndex, option.value)
  return response
}

const prepareRoundEnd = (session: GameSession) => {
  const state = session.getState().state
  state.players.forEach((player) => {
    markAllWorkersUsed(state, player)
    setActiveWorkerCount(player, 2)
    setNewbornCount(player, 0)
  })
  session.loadState(state)
}

const advanceToWinterCaretaker = (session: GameSession, response: SessionResponse) => {
  let current = response
  let safety = 40
  while (safety-- > 0) {
    if (current.interaction.stateId !== 'wait') return current
    if (current.interaction.sourceCard === CARD_ID) return current
    if (current.interaction.request.kind === 'feed') {
      current = session.resolveChoice(current.interaction.playerIndex, 'confirm', { selections: [] })
    } else if (current.interaction.request.kind === 'animal-reorg') {
      current = session.resolveChoice(
        current.interaction.playerIndex, 'confirm', current.interaction.request.zones,
      )
    } else if (current.interaction.request.kind === 'confirm-next-player') {
      current = confirmNextPlayer(session)
    } else if (current.interaction.request.kind === 'confirm-player-switch') {
      current = confirmPlayerSwitch(session)
    } else if (session.peekEnginePendingEnvelope()?.syntheticKind === 'post-reap-anytime') {
      current = session.resolveChoice(current.interaction.playerIndex, '__skip__')
    } else if (current.interaction.request.kind === 'select-trigger') {
      const option = current.interaction.request.options?.find((candidate) =>
        candidate.value === CARD_ID || candidate.sourceCard === CARD_ID,
      )
      if (!option) return current
      current = session.resolveChoice(current.interaction.playerIndex, option.value)
    } else {
      return current
    }
  }
  throw new Error('failed to reach Winter Caretaker')
}

const resolveWinterCaretaker = (session: GameSession, response: SessionResponse, accept: boolean) => {
  const prompt = advanceToWinterCaretaker(session, response)
  expect(prompt.interaction.stateId).toBe('wait')
  if (prompt.interaction.stateId !== 'wait') throw new Error('expected Winter Caretaker choice')
  expect(prompt.interaction.sourceCard).toBe(CARD_ID)
  const option = prompt.interaction.request.options?.find((candidate) =>
    accept ? candidate.value !== '__skip__' : candidate.value === '__skip__',
  )
  expect(option).toBeDefined()
  return session.resolveChoice(prompt.interaction.playerIndex, option!.value)
}

describe('C113 Winter Caretaker parity', () => {
  it('C113 S1: Winter Caretaker can be played as the first occupation for no food and gains one grain', () => {
    const session = setup({ played: false, food: 0, round: 5 })

    const response = playOccupation(session)

    expect(response.state.players[0]!.occupationPlayed).toContain(CARD_ID)
    expect(response.state.players[0]!.resources).toMatchObject({ food: 0, grain: 1 })
  })

  it('C113 S2: after feeding, paying two remaining food gains one vegetable', () => {
    const session = setup()
    prepareRoundEnd(session)

    const response = resolveWinterCaretaker(session, session.performRoundEnd(), true)

    expect(response.ok, response.error).toBe(true)
    expect(response.state.players[0]!.resources).toMatchObject({ food: 0, vegetable: 1 })
  })

  it('C113 S3: declining the end-harvest purchase preserves the two food left after feeding', () => {
    const session = setup()
    prepareRoundEnd(session)

    const response = resolveWinterCaretaker(session, session.performRoundEnd(), false)

    expect(response.ok, response.error).toBe(true)
    expect(response.state.players[0]!.resources).toMatchObject({ food: 2, vegetable: 0 })
  })

  it('C113 S4: less than two food after feeding cannot buy a vegetable', () => {
    const session = setup({ food: 5 })
    prepareRoundEnd(session)

    const response = advanceToWinterCaretaker(session, session.performRoundEnd())

    expect(response.ok, response.error).toBe(true)
    expect(response.interaction.stateId === 'wait' ? response.interaction.sourceCard : undefined).not.toBe(CARD_ID)
    expect(response.state.players[0]!.resources).toMatchObject({ food: 1, vegetable: 0 })
  })

  it('C113 S5: a non-harvest round end neither offers nor grants the purchase', () => {
    const session = setup({ round: 3 })
    prepareRoundEnd(session)

    const response = session.performRoundEnd()

    expect(response.ok, response.error).toBe(true)
    expect(response.state.round).toBe(4)
    expect(response.interaction.stateId === 'wait' ? response.interaction.sourceCard : undefined).not.toBe(CARD_ID)
    expect(response.state.players[0]!.resources).toMatchObject({ food: 6, vegetable: 0 })
  })

  it('C113 S6: Winter Caretaker can buy one vegetable again at the next harvest', () => {
    const session = setup({ food: 12 })
    prepareRoundEnd(session)
    let response = resolveWinterCaretaker(session, session.performRoundEnd(), true)
    expect(response.state.players[0]!.resources).toMatchObject({ food: 6, vegetable: 1 })

    const state = response.state
    state.round = 7
    state.roundPhase = 'work'
    state.players.forEach((player) => markAllWorkersUsed(state, player))
    session.loadState(state)
    response = resolveWinterCaretaker(session, session.performRoundEnd(), true)

    expect(response.ok, response.error).toBe(true)
    expect(response.state.players[0]!.resources).toMatchObject({ food: 0, vegetable: 2 })
  })
})
