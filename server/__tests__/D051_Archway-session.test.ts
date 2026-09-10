import { describe, expect, it } from 'vitest'
import { GameSession, type SessionResponse } from '../game/authoritative-session'
import { markAllWorkersUsed, setWorkersAtHome } from '../../shared/domain/player'
import { stabilizeRandomHands } from './_helpers/stabilize-random-hands'
import { resolveNonSkipChoice, resolveSkipChoice, resolveTriggerIfPresent } from './_helpers/trigger-select'
import '../../shared/cards/D/D051_Archway'

const CARD_ID = 'D051_Archway'

const FILLER = '__test_placeholder__'

const options = (response: SessionResponse) => response.interaction.stateId === 'wait'
  ? response.interaction.request.options ?? []
  : []

const setup = ({ occupation = false }: { occupation?: boolean } = {}) => {
  const session = new GameSession(6051, undefined, { playerCount: 2 })
  stabilizeRandomHands(session.state.players)
  const state = session.getState().state
  state.currentPlayerIndex = 0
  state.round = 14
  state.roundPhase = 'work'
  state.availableMajorImprovements = []
  state.players.forEach((player) => {
    setWorkersAtHome(state, player, 2)
    player.minorHand = [FILLER]
    player.occupationHand = [FILLER]
    player.minorPlayed = []
    player.occupationPlayed = []
    player.resources = {
      ...player.resources,
      wood: 0, clay: 0, reed: 0, stone: 0, food: 20, grain: 0, vegetable: 0,
      sheep: 0, boar: 0, cattle: 0, begging: 0,
    }
  })
  const owner = state.players[0]!
  owner.minorHand = [CARD_ID]
  owner.resources.clay = 2
  if (occupation) owner.occupationPlayed = ['A116_WoodCutter']
  session.loadState(state)
  return session
}

const enterMinor = (session: GameSession) => {
  let response = session.takeAction(0, 'meeting-place')
  if (response.interaction.stateId !== 'wait') return response
  const improvement = options(response).find((option) =>
    option.value.startsWith('action-improvement-'))
  if (improvement) {
    response = session.resolveChoice(response.interaction.playerIndex, improvement.value)
  }
  return response
}

const playArchway = (session: GameSession) => {
  let response = enterMinor(session)
  if (response.state.players[0]!.minorPlayed.includes(CARD_ID)) return response
  if (response.interaction.stateId === 'wait') {
    const card = options(response).find((option) => option.value === CARD_ID)
    if (card) response = session.resolveChoice(response.interaction.playerIndex, card.value)
  }
  return response
}

const playedSession = (actor = 0) => {
  const session = setup()
  const played = playArchway(session)
  expect(played.ok, played.error).toBe(true)
  expect(played.state.players[0]!.minorPlayed).toContain(CARD_ID)
  const state = session.getState().state
  state.currentPlayerIndex = actor
  state.roundPhase = 'work'
  session.loadState(state)
  return session
}

const prepareRoundEnd = (occupiedTarget = false) => {
  const session = playedSession()
  const used = session.takeAction(0, CARD_ID)
  expect(used.ok, used.error).toBe(true)
  const state = session.getState().state
  const opponent = state.players[1]!
  if (occupiedTarget) {
    for (const space of state.actionSpaces) {
      space.takenBy = space.takenBy.filter((worker) => worker.playerId !== opponent.id)
    }
    const worker = opponent.workers.find((candidate) => candidate.isActive)!
    state.actionSpaces.find((space) => space.id === 'day-laborer')!.takenBy = [
      { playerId: opponent.id, workerId: worker.id },
    ]
  }
  markAllWorkersUsed(state, opponent)
  session.loadState(state)
  return session
}

const startArchwayMove = (session: GameSession) => {
  let response = resolveTriggerIfPresent(session, session.performRoundEnd(), CARD_ID)
  response = resolveNonSkipChoice(session, response)
  expect(response.interaction).toMatchObject({
    stateId: 'wait',
    promptKey: 'ui.interactionMoveFarmerToSpace',
  })
  return response
}

describe('D051 Archway parity', () => {
  it('D051 S1: with no occupation paying two clay plays Archway as a four-point action space', () => {
    const session = setup()
    const scoreBefore = session.getState().scores[0]!.total

    const response = playArchway(session)

    expect(response.ok, response.error).toBe(true)
    expect(response.state.players[0]!.minorPlayed).toContain(CARD_ID)
    expect(response.state.players[0]!.resources.clay).toBe(0)
    expect(response.state.actionSpaces.some((space) => space.id === CARD_ID)).toBe(true)
    expect(response.scores[0]!.total).toBe(scoreBefore + 4)
  })

  it('D051 S2: an occupation keeps Archway unavailable', () => {
    const response = enterMinor(setup({ occupation: true }))

    expect(options(response).some((option) => option.value === CARD_ID)).toBe(false)
    expect(response.state.players[0]!.minorHand).toContain(CARD_ID)
    expect(response.state.players[0]!.resources.clay).toBe(2)
  })

  it('D051 S3: the owner may use Archway and immediately gains one food', () => {
    const response = playedSession().takeAction(0, CARD_ID)

    expect(response.ok, response.error).toBe(true)
    expect(response.state.players[0]!.resources.food).toBe(21)
    expect(response.state.actionSpaces.find((space) => space.id === CARD_ID)!.takenBy)
      .toEqual([expect.objectContaining({ playerId: response.state.players[0]!.id })])
  })

  it('D051 S4: an opponent may use Archway and immediately gains one food', () => {
    const response = playedSession(1).takeAction(1, CARD_ID)

    expect(response.ok, response.error).toBe(true)
    expect(response.state.players[1]!.resources.food).toBe(21)
    expect(response.state.actionSpaces.find((space) => space.id === CARD_ID)!.takenBy)
      .toEqual([expect.objectContaining({ playerId: response.state.players[1]!.id })])
  })

  it('D051 S5: before returning home the same person may move to Day Laborer and execute it', () => {
    const session = prepareRoundEnd()
    let response = startArchwayMove(session)
    expect(options(response).some((option) => option.value === 'day-laborer')).toBe(true)

    response = session.resolveChoice(response.interaction.playerIndex, 'day-laborer')

    expect(response.ok, response.error).toBe(true)
    expect(response.state.players[0]!.resources.food).toBe(19)
    expect(response.state.actionSpaces.find((space) => space.id === CARD_ID)?.takenBy).toEqual([])
  })

  it('D051 S6: the before-return-home move may be declined', () => {
    const session = prepareRoundEnd()
    let response = resolveTriggerIfPresent(session, session.performRoundEnd(), CARD_ID)

    response = resolveSkipChoice(session, response)

    expect(response.ok, response.error).toBe(true)
    expect(response.state.players[0]!.resources.food).toBe(17)
    expect(response.state.actionSpaces.find((space) => space.id === 'day-laborer')?.takenBy)
      .toEqual([])
    expect(response.state.actionSpaces.find((space) => space.id === CARD_ID)?.takenBy).toEqual([])
  })

  it('D051 S7: an occupied action is excluded, forged movement is rejected, and a legal retry works', () => {
    const session = prepareRoundEnd(true)
    let response = startArchwayMove(session)
    expect(options(response).some((option) => option.value === 'day-laborer')).toBe(false)
    expect(options(response).some((option) => option.value === 'grain-seeds')).toBe(true)
    const playerIndex = response.interaction.playerIndex
    const archwayWorker = response.state.actionSpaces
      .find((space) => space.id === CARD_ID)!.takenBy[0]!

    const forged = session.resolveChoice(playerIndex, 'day-laborer')

    expect(forged.ok).toBe(false)
    expect(forged.state.actionSpaces.find((space) => space.id === CARD_ID)?.takenBy)
      .toEqual([archwayWorker])
    response = session.resolveChoice(playerIndex, 'grain-seeds')
    expect(response.ok, response.error).toBe(true)
    expect(response.state.players[0]!.resources.food).toBe(17)
    expect(response.state.players[0]!.resources.grain).toBe(1)
    expect(response.state.actionSpaces.find((space) => space.id === CARD_ID)?.takenBy).toEqual([])
  })
})
