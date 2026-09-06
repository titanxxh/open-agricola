import { describe, expect, it } from 'vitest'
import { GameSession, type SessionResponse } from '../game/authoritative-session'
import { isCardFlagged } from '../../shared/cards/helpers/card-state'
import { markAllWorkersUsed, setWorkersAtHome } from '../../shared/domain/player'
import { stabilizeRandomHands } from './_helpers/stabilize-random-hands'

import '../../shared/cards/A/A120_ClayHutBuilder'

const CARD_ID = 'A120_ClayHutBuilder'
const FILLER = '__test_placeholder__'

const setup = ({
  houseType = 'wood',
  played = false,
  flagged = false,
  round = 5,
}: {
  houseType?: 'wood' | 'clay' | 'stone'
  played?: boolean
  flagged?: boolean
  round?: number
} = {}) => {
  const session = new GameSession(5120, undefined, { playerCount: 2 })
  stabilizeRandomHands(session.state.players)
  const state = session.getState().state
  state.currentPlayerIndex = 0
  state.round = round
  state.roundPhase = 'work'
  state.availableMajorImprovements = []
  state.players.forEach((player) => {
    player.minorHand = [FILLER]
    player.occupationHand = [FILLER]
    player.resources.food = 0
    setWorkersAtHome(state, player, 2)
  })
  const player = state.players[0]!
  player.occupationHand = played ? [FILLER] : [CARD_ID]
  player.occupationPlayed = played ? [CARD_ID] : []
  player.houseType = houseType
  player.resources.clay = 2
  player.resources.stone = 2
  player.resources.reed = 1
  if (flagged) player.cardStates[CARD_ID] = { flagged: true }
  const redevelopment = state.actionSpaces.find((space) => space.id === 'house-redevelopment')
  if (!redevelopment) throw new Error('missing house-redevelopment')
  redevelopment.roundAvailable = 1
  redevelopment.takenBy = []
  session.loadState(state)
  return session
}

const playOccupation = (session: GameSession): SessionResponse => {
  const response = session.takeAction(0, 'lessons')
  if (!response.state.players[0]!.occupationHand.includes(CARD_ID)) return response
  if (response.interaction.stateId !== 'wait') return response
  const card = response.interaction.request.options?.find((option) => option.value === CARD_ID)
  expect(card).toBeDefined()
  return session.resolveChoice(response.interaction.playerIndex, card!.value)
}

const renovate = (session: GameSession): SessionResponse => {
  let response = session.takeAction(0, 'house-redevelopment')
  expect(response.ok, response.error).toBe(true)
  for (let step = 0; step < 8 && response.interaction.stateId === 'wait'; step++) {
    if (response.interaction.promptKey === 'ui.interactionChooseRenovationTarget') {
      const targetType = response.state.players[0]!.houseType === 'wood' ? 'clay' : 'stone'
      const target = response.interaction.request.options?.find((option) => option.value === targetType)
      expect(target).toBeDefined()
      response = session.resolveChoice(response.interaction.playerIndex, target!.value)
      continue
    }
    const skip = response.interaction.request.options?.find((option) =>
      option.value === '__skip__' || option.value === 'skip')
    if (!skip) break
    response = session.resolveChoice(response.interaction.playerIndex, skip.value)
  }
  return response
}

const clayEntries = (response: SessionResponse) => response.state.futureMeeples
  .filter((entry) => entry.cardId === CARD_ID)

describe('A120 Clay Hut Builder parity', () => {
  it('A120 S1: playing Clay Hut Builder in a wooden house schedules nothing', () => {
    const response = playOccupation(setup())

    expect(response.ok, response.error).toBe(true)
    expect(response.state.players[0]!.occupationPlayed).toContain(CARD_ID)
    expect(clayEntries(response)).toEqual([])
    expect(isCardFlagged(response.state.players[0]!, CARD_ID)).toBe(false)
  })

  it('A120 S2: playing Clay Hut Builder in a clay house schedules two clay for five rounds', () => {
    const response = playOccupation(setup({ houseType: 'clay' }))
    const entries = clayEntries(response)

    expect(entries.map((entry) => entry.round)).toEqual([6, 7, 8, 9, 10])
    entries.forEach((entry) => expect(entry.resources).toEqual({ clay: 2 }))
    expect(isCardFlagged(response.state.players[0]!, CARD_ID)).toBe(true)
  })

  it('A120 S3: the first renovation out of wood schedules two clay for five rounds', () => {
    const response = renovate(setup({ played: true }))
    const entries = clayEntries(response)

    expect(response.state.players[0]!.houseType).toBe('clay')
    expect(entries.map((entry) => entry.round)).toEqual([6, 7, 8, 9, 10])
    entries.forEach((entry) => expect(entry.resources).toEqual({ clay: 2 }))
    expect(isCardFlagged(response.state.players[0]!, CARD_ID)).toBe(true)
  })

  it('A120 S4: after its first trigger a later renovation schedules no additional clay', () => {
    const response = renovate(setup({ houseType: 'clay', played: true, flagged: true }))

    expect(response.state.players[0]!.houseType).toBe('stone')
    expect(clayEntries(response)).toEqual([])
  })

  it('A120 S5: scheduled clay is received at the next round start', () => {
    const session = setup({ houseType: 'clay' })
    playOccupation(session)
    const state = session.getState().state
    state.players.forEach((player) => {
      markAllWorkersUsed(state, player)
      player.resources.food = 20
      player.minorHand = [FILLER]
      player.occupationHand = [FILLER]
    })
    const clayBefore = state.players[0]!.resources.clay
    session.loadState(state)

    const response = session.performRoundEnd()

    expect(response.state.round).toBe(6)
    expect(response.state.players[0]!.resources.clay).toBe(clayBefore + 2)
    expect(clayEntries(response).map((entry) => entry.round)).toEqual([7, 8, 9, 10])
  })

  it('A120 S6: late activation schedules clay only on rounds that still exist', () => {
    const response = playOccupation(setup({ houseType: 'stone', round: 12 }))
    const entries = clayEntries(response)

    expect(entries.map((entry) => entry.round)).toEqual([13, 14])
    entries.forEach((entry) => expect(entry.resources).toEqual({ clay: 2 }))
  })
})
