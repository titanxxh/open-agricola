import { describe, expect, it } from 'vitest'
import { GameSession, type SessionResponse } from '../game/authoritative-session'
import { computeScores } from '../../shared/domain/scoring'
import { markAllWorkersUsed, setWorkersAtHome } from '../../shared/domain/player'
import { stabilizeRandomHands } from './_helpers/stabilize-random-hands'

import '../../shared/cards/C/C011_WildlifeReserve'
import '../../shared/cards/C/C067_MineralFeeder'

const CARD_ID = 'C011_WildlifeReserve'
const FILLER = '__test_placeholder__'

const setup = ({ played = false, wood = 2, occupations = 2 } = {}) => {
  const session = new GameSession(5011, undefined, { playerCount: 2 })
  stabilizeRandomHands(session.state.players)
  const state = session.getState().state
  state.currentPlayerIndex = 0
  state.round = 5
  state.roundPhase = 'work'
  state.availableMajorImprovements = []
  state.players.forEach((player) => {
    player.minorHand = [FILLER]
    player.occupationHand = [FILLER]
    player.resources = {
      ...player.resources, wood: 0, clay: 0, reed: 0, stone: 0, food: 20, grain: 0,
      vegetable: 0, sheep: 0, boar: 0, cattle: 0,
    }
    setWorkersAtHome(state, player, 2)
  })
  const player = state.players[0]!
  player.minorHand = played ? [FILLER] : [CARD_ID]
  player.minorPlayed = played ? [CARD_ID] : []
  player.occupationPlayed = Array.from({ length: occupations }, (_, index) => `STUB_OCC_${index}`)
  player.resources.wood = wood
  session.loadState(state)
  return session
}

const enterMinor = (session: GameSession) => {
  let response = session.takeAction(0, 'major-improvement')
  if (response.interaction.stateId !== 'wait') return response
  const improvement = response.interaction.request.options?.find((candidate) =>
    candidate.value.startsWith('action-improvement-'))
  if (improvement) response = session.resolveChoice(response.interaction.playerIndex, improvement.value)
  return response
}

const play = (session: GameSession) => {
  let response = enterMinor(session)
  if (!response.state.players[0]!.minorHand.includes(CARD_ID)) return response
  if (response.interaction.stateId !== 'wait') return response
  const card = response.interaction.request.options?.find((candidate) => candidate.value === CARD_ID)
  if (card) response = session.resolveChoice(response.interaction.playerIndex, card.value)
  return response
}

const offered = (response: SessionResponse) => response.interaction.stateId === 'wait'
  && (response.interaction.request.options?.some((candidate) => candidate.value === CARD_ID) ?? false)

const printedVp = (response: SessionResponse) => {
  const player = response.state.players[0]!
  const score = computeScores(response.state).find((summary) => summary.playerId === player.id)!
  const cards = score.categories.find((category) => category.key === 'cards')!
  return cards.entries.find((entry) => 'cardId' in entry && entry.cardId === CARD_ID)?.score
}

const collectAnimals = (session: GameSession, { sheep = 2, boar = 1, cattle = 1 } = {}) => {
  const state = session.getState().state
  const sheepMarket = state.actionSpaces.find((space) => space.id === 'sheep-market')!
  sheepMarket.resources = { ...sheepMarket.resources, sheep, boar, cattle }
  session.loadState(state)
  return session.takeAction(0, 'sheep-market')
}

const wildlifeAssignment = (animalCounts: { sheep?: number; boar?: number; cattle?: number }) => ({
  id: `card:${CARD_ID}`,
  zoneType: 'card' as const,
  cardId: CARD_ID,
  animalType: null,
  animalCount: Object.values(animalCounts).reduce((sum, count) => sum + (count ?? 0), 0),
  animalCounts,
})

describe('C011 Wildlife Reserve parity', () => {
  it('C011 S1: two occupations and two wood play Wildlife Reserve for one point', () => {
    const response = play(setup())

    expect(response.ok, response.error).toBe(true)
    expect(response.state.players[0]!.minorPlayed).toContain(CARD_ID)
    expect(response.state.players[0]!.resources.wood).toBe(0)
    expect(printedVp(response)).toBe(1)
  })

  it('C011 S2: one occupation keeps Wildlife Reserve unavailable without spending wood', () => {
    const response = enterMinor(setup({ occupations: 1 }))

    expect(offered(response)).toBe(false)
    expect(response.state.players[0]!.minorHand).toContain(CARD_ID)
    expect(response.state.players[0]!.resources.wood).toBe(2)
  })

  it('C011 S3: lacking wood keeps Wildlife Reserve unavailable', () => {
    const response = enterMinor(setup({ wood: 1 }))

    expect(offered(response)).toBe(false)
    expect(response.state.players[0]!.minorHand).toContain(CARD_ID)
    expect(response.state.players[0]!.resources.wood).toBe(1)
  })

  it('C011 S4: Wildlife Reserve holds one sheep, one boar, and one cattle while an extra sheep is discarded', () => {
    const session = setup({ played: true })
    let response = collectAnimals(session)
    expect(response.interaction).toMatchObject({ stateId: 'wait', request: { kind: 'animal-reorg' } })
    if (response.interaction.stateId !== 'wait' || response.interaction.request.kind !== 'animal-reorg') {
      throw new Error('expected native animal reorganization')
    }
    expect(response.interaction.request.zones.find((zone) => zone.id === `card:${CARD_ID}`))
      .toMatchObject({ capacity: 3, allowedAnimalTypes: ['sheep', 'boar', 'cattle'] })

    response = session.resolveChoice(0, 'confirm', [
      wildlifeAssignment({ sheep: 1, boar: 1, cattle: 1 }),
    ] as unknown as Record<string, unknown>)

    expect(response.ok, response.error).toBe(true)
    expect(response.state.players[0]!.resources).toMatchObject({ sheep: 1, boar: 1, cattle: 1 })
    expect(response.state.players[0]!.cardStates[CARD_ID]?.extraData?.animalCounts)
      .toEqual({ sheep: 1, boar: 1, cattle: 1 })
  })

  it('C011 S5: rejects two assigned sheep atomically and accepts a legal retry', () => {
    const session = setup({ played: true })
    let response = collectAnimals(session, { sheep: 2, boar: 0, cattle: 0 })
    expect(response.interaction).toMatchObject({ stateId: 'wait', request: { kind: 'animal-reorg' } })

    const before = session.getState()
    response = session.resolveChoice(0, 'confirm', [
      wildlifeAssignment({ sheep: 2 }),
    ] as unknown as Record<string, unknown>)

    expect(response.ok).toBe(false)
    expect(response.error).toBe('log.reorganizeFail')
    expect(response.state).toEqual(before.state)
    expect(response.interaction).toEqual(before.interaction)
    response = session.resolveChoice(0, 'confirm', [
      wildlifeAssignment({ sheep: 1 }),
      { id: 'house', zoneType: 'house', animalType: 'sheep', animalCount: 1 },
    ])
    expect(response.ok, response.error).toBe(true)
    expect(response.interaction.stateId === 'wait' ? response.interaction.request.kind : response.interaction.stateId)
      .toBe('confirm-next-player')
    expect(response.state.players[0]!.resources.sheep).toBe(2)
    expect(response.state.players[0]!.cardStates[CARD_ID]?.extraData?.animalCounts)
      .toEqual({ sheep: 1 })
  })

  it('C011 S6: an animal held by Wildlife Reserve does not count as being in a pasture', () => {
    const session = setup({ played: true })
    let response = collectAnimals(session, { sheep: 1, boar: 0, cattle: 0 })
    expect(response.interaction).toMatchObject({ stateId: 'wait', request: { kind: 'animal-reorg' } })
    response = session.resolveChoice(0, 'confirm', [
      wildlifeAssignment({ sheep: 1 }),
    ] as unknown as Record<string, unknown>)
    expect(response.ok, response.error).toBe(true)

    const state = session.getState().state
    state.round = 5
    state.currentPlayerIndex = 0
    state.players[0]!.minorPlayed.push('C067_MineralFeeder')
    state.players[0]!.resources.grain = 0
    state.players.forEach((player) => markAllWorkersUsed(state, player))
    session.loadState(state)
    response = session.performRoundEnd()

    expect(response.state.round).toBe(6)
    expect(response.state.players[0]!.cardStates[CARD_ID]?.extraData?.animalCounts)
      .toEqual({ sheep: 1 })
    expect(response.state.players[0]!.resources.grain).toBe(0)
  })
})
