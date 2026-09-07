import { describe, expect, it } from 'vitest'
import { GameSession, type SessionResponse } from '../game/authoritative-session'
import { markAllWorkersUsed, setWorkersAtHome } from '../../shared/domain/player'
import { computeScores } from '../../shared/domain/scoring'
import { stabilizeRandomHands } from './_helpers/stabilize-random-hands'

import '../../shared/cards/B/B011_Feedyard'

const CARD_ID = 'B011_Feedyard'
const FILLER = '__test_placeholder__'

const setup = ({
  played = false, clay = 1, grain = 1, pastures = 0, sheep = 0, round = 4,
} = {}) => {
  const session = new GameSession(5011, undefined, { playerCount: 2 })
  stabilizeRandomHands(session.state.players)
  const state = session.getState().state
  state.currentPlayerIndex = 0
  state.round = round
  state.roundPhase = 'work'
  state.availableMajorImprovements = []
  state.players.forEach((player) => {
    setWorkersAtHome(state, player, 2)
    player.minorHand = [FILLER]
    player.occupationHand = [FILLER]
    player.resources.food = 20
  })
  const player = state.players[0]!
  player.minorHand = played ? [FILLER] : [CARD_ID]
  player.minorPlayed = played ? [CARD_ID] : []
  player.resources = {
    ...player.resources, wood: 0, clay, reed: 0, stone: 0, food: 20, grain, vegetable: 0,
    sheep, boar: 0, cattle: 0,
  }
  player.pastures = Array.from({ length: pastures }, (_, index) => ({
    id: `feedyard-pasture-${index + 1}`,
    size: 1,
    tiles: [{ row: index, col: 1 }],
    stables: 0,
    animalType: null,
    animalCount: 0,
  }))
  if (played && sheep > 0) {
    player.cardStates = {
      ...player.cardStates,
      [CARD_ID]: { extraData: { animalCounts: { sheep } } },
    }
  }
  session.loadState(state)
  return session
}

const enterMinor = (session: GameSession): SessionResponse => {
  let response = session.takeAction(0, 'major-improvement')
  if (response.interaction.stateId !== 'wait') return response
  const improvement = response.interaction.request.options?.find((candidate) =>
    candidate.value.startsWith('action-improvement-'))
  if (improvement) response = session.resolveChoice(response.interaction.playerIndex, improvement.value)
  return response
}

const playMinor = (session: GameSession): SessionResponse => {
  let response = enterMinor(session)
  if (!response.state.players[0]!.minorHand.includes(CARD_ID)) return response
  if (response.interaction.stateId !== 'wait') return response
  const option = response.interaction.request.options?.find((candidate) => candidate.value === CARD_ID)
  if (option) response = session.resolveChoice(response.interaction.playerIndex, option.value)
  return response
}

const printedVp = (response: SessionResponse) => {
  const player = response.state.players[0]!
  return computeScores(response.state).find((summary) => summary.playerId === player.id)!
    .categories.find((category) => category.key === 'cards')!.entries
    .find((entry) => 'cardId' in entry && entry.cardId === CARD_ID)?.score
}

const finishHarvest = (session: GameSession): SessionResponse => {
  const state = session.getState().state
  state.players.forEach((player) => {
    markAllWorkersUsed(state, player)
    player.minorHand = [FILLER]
    player.occupationHand = [FILLER]
  })
  session.loadState(state)
  return session.performRoundEnd()
}

describe('B011 Feedyard parity', () => {
  it('B011 S1: paying one clay and one grain plays Feedyard for one point', () => {
    const response = playMinor(setup())

    expect(response.ok, response.error).toBe(true)
    expect(response.state.players[0]!.minorPlayed).toContain(CARD_ID)
    expect(response.state.players[0]!.resources).toMatchObject({ clay: 0, grain: 0 })
    expect(printedVp(response)).toBe(1)
  })

  it('B011 S2: lacking grain keeps Feedyard unavailable without spending clay', () => {
    const response = enterMinor(setup({ grain: 0 }))

    expect(response.state.players[0]!.minorHand).toContain(CARD_ID)
    expect(response.state.players[0]!.resources).toMatchObject({ clay: 1, grain: 0 })
    expect(response.ok).toBe(false)
    expect(response.error).toBe('space unavailable')
    expect(response.interaction.stateId).toBe('idle')
    expect(response.state.actionSpaces.find((space) => space.id === 'major-improvement')!.takenBy).toEqual([])
  })

  it('B011 S3: two pastures let Feedyard hold two different animal types and discard a third', () => {
    const session = setup({ played: true, pastures: 2 })
    let response = session.devSetResources(0, { sheep: 1, boar: 1, cattle: 1 })
    expect(response.interaction).toMatchObject({ stateId: 'wait', request: { kind: 'animal-reorg' } })
    if (response.interaction.stateId !== 'wait' || response.interaction.request.kind !== 'animal-reorg') {
      throw new Error('expected native animal reorganization')
    }
    expect(response.interaction.request.zones.find((zone) => zone.id === `card:${CARD_ID}`))
      .toMatchObject({ capacity: 2, allowedAnimalTypes: ['sheep', 'boar', 'cattle'] })

    response = session.resolveChoice(0, 'confirm', [{
      id: `card:${CARD_ID}`,
      zoneType: 'card',
      cardId: CARD_ID,
      animalType: null,
      animalCount: 2,
      animalCounts: { sheep: 1, boar: 1 },
    }] as unknown as Record<string, unknown>)

    expect(response.ok, response.error).toBe(true)
    expect(response.state.players[0]!.resources).toMatchObject({ sheep: 1, boar: 1, cattle: 0 })
    expect(response.state.players[0]!.cardStates[CARD_ID]?.extraData?.animalCounts)
      .toEqual({ sheep: 1, boar: 1 })
  })

  it('B011 S4: an empty Feedyard with two pastures gains two food after breeding', () => {
    const session = setup({ played: true, pastures: 2 })
    const response = finishHarvest(session)

    expect(response.ok, response.error).toBe(true)
    expect(response.state.players[0]!.resources.food).toBe(18)
  })

  it('B011 S5: one animal on a two-pasture Feedyard leaves one food-producing spot', () => {
    const session = setup({ played: true, pastures: 2, sheep: 1 })
    const response = finishHarvest(session)

    expect(response.ok, response.error).toBe(true)
    expect(response.state.players[0]!.resources).toMatchObject({ food: 17, sheep: 1 })
  })

  it('B011 S6: without a pasture Feedyard has no capacity and grants no harvest food', () => {
    const session = setup({ played: true, pastures: 0 })
    const response = finishHarvest(session)

    expect(response.ok, response.error).toBe(true)
    expect(response.state.players[0]!.resources.food).toBe(16)
  })
})
