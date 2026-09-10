import { describe, expect, it } from 'vitest'
import { GameSession, type SessionResponse } from '../game/authoritative-session'
import { markAllWorkersUsed, setWorkersAtHome } from '../../shared/domain/player'
import { stabilizeRandomHands } from './_helpers/stabilize-random-hands'
import '../../shared/cards/A/A089_StablePlanner'

const CARD_ID = 'A089_StablePlanner'

const FILLER = '__test_placeholder__'

const setup = ({ round = 2, reserveStables = 4 }: { round?: number; reserveStables?: number } = {}) => {
  const session = new GameSession(6089 + round, undefined, { playerCount: 2 })
  const state = session.getState().state
  stabilizeRandomHands(state.players)
  state.currentPlayerIndex = 0
  state.round = round
  state.roundPhase = 'work'
  state.players.forEach((player) => {
    setWorkersAtHome(state, player, 2)
    player.minorHand = [FILLER]
    player.occupationHand = [FILLER]
    player.minorPlayed = []
    player.occupationPlayed = []
    player.resources = {
      ...player.resources, wood: 0, clay: 0, reed: 0, stone: 0, food: 20, grain: 0,
      vegetable: 0, sheep: 0, boar: 0, cattle: 0,
    }
  })
  const owner = state.players[0]!
  owner.occupationHand = [CARD_ID]
  const usedStables = 4 - reserveStables
  owner.stableTiles = Array.from({ length: usedStables }, (_, index) => ({
    row: index, col: 1,
  }))
  session.loadState(state)
  return session
}

const playOccupation = (session: GameSession) => {
  const response = session.takeAction(0, 'lessons')
  if (!response.state.players[0]!.occupationHand.includes(CARD_ID)) return response
  if (response.interaction.stateId !== 'wait') return response
  const option = response.interaction.request.options?.find((candidate) => candidate.value === CARD_ID)
  expect(option).toBeDefined()
  return session.resolveChoice(response.interaction.playerIndex, option!.value)
}

const chooseSchedule = (session: GameSession, response: SessionResponse, count: number) => {
  expect(response.interaction.stateId).toBe('wait')
  if (response.interaction.stateId !== 'wait') return response
  const option = response.interaction.request.options?.find((candidate) => {
    return candidate.value !== '__skip__'
      && candidate.labelParams?.count === count
  }) ?? response.interaction.request.options?.filter((candidate) => candidate.value !== '__skip__')[count - 1]
  expect(option).toBeDefined()
  return session.resolveChoice(response.interaction.playerIndex, option!.value)
}

const scheduledRounds = (response: SessionResponse) => response.state.futureMeeples
  .filter((entry) => entry.cardId === CARD_ID && entry.resources.stable === 1)
  .map((entry) => entry.round)
  .sort((left, right) => left - right)

describe('A089 Stable Planner parity', () => {
  it('A089 S1: Stable Planner may be played and its scheduling declined', () => {
    const session = setup()
    let response = playOccupation(session)
    expect(response.interaction.stateId).toBe('wait')
    if (response.interaction.stateId !== 'wait') return

    response = session.resolveChoice(response.interaction.playerIndex, '__skip__')

    expect(response.ok, response.error).toBe(true)
    expect(response.state.players[0]!.occupationPlayed).toContain(CARD_ID)
    expect(scheduledRounds(response)).toEqual([])
  })

  it('A089 S2: choosing three in round two schedules stables for rounds five eight and eleven', () => {
    const session = setup()

    const response = chooseSchedule(session, playOccupation(session), 3)

    expect(response.ok, response.error).toBe(true)
    expect(scheduledRounds(response)).toEqual([5, 8, 11])
  })

  it('A089 S3: only two reserve stables cap the available schedule at two', () => {
    const session = setup({ reserveStables: 2 })
    const played = playOccupation(session)
    expect(played.interaction.stateId).toBe('wait')
    if (played.interaction.stateId !== 'wait') return
    expect(played.interaction.request.options?.filter((option) => option.value !== '__skip__')).toHaveLength(2)

    const response = chooseSchedule(session, played, 2)

    expect(response.ok, response.error).toBe(true)
    expect(scheduledRounds(response)).toEqual([5, 8])
  })

  it('A089 S4: round eleven schedules only the still-existing round fourteen', () => {
    const session = setup({ round: 11 })

    const response = chooseSchedule(session, playOccupation(session), 1)

    expect(response.ok, response.error).toBe(true)
    expect(scheduledRounds(response)).toEqual([14])
  })

  it('A089 S5: a due Stable Planner stable can be built free at round start', () => {
    const session = setup({ round: 3 })
    const scheduled = chooseSchedule(session, playOccupation(session), 1)
    expect(scheduledRounds(scheduled)).toEqual([6])
    const state = session.getState().state
    state.round = 5
    state.players.forEach((player) => markAllWorkersUsed(state, player))
    session.loadState(state)

    let response = session.performRoundEnd()
    expect(response.interaction).toMatchObject({
      stateId: 'wait', promptKey: 'ui.interactionOptionalAction',
    })
    if (response.interaction.stateId !== 'wait') return
    const accept = response.interaction.request.options?.find((option) => option.value !== '__skip__')
    expect(accept).toBeDefined()
    response = session.resolveChoice(response.interaction.playerIndex, accept!.value)
    expect(response.interaction).toMatchObject({
      stateId: 'wait', promptKey: 'ui.interactionStableSelect',
    })
    if (response.interaction.stateId !== 'wait') return
    const stable = response.interaction.request.farm.selectableTiles[0]
    expect(stable).toBeDefined()
    response = session.commitSelectionChoice(response.interaction.playerIndex, { stables: [stable!] })

    expect(response.ok, response.error).toBe(true)
    expect(response.state.players[0]!.stableTiles).toHaveLength(1)
    expect(response.state.players[0]!.resources.wood).toBe(0)
    expect(scheduledRounds(response)).toEqual([])
  })
})
