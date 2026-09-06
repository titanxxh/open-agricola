import { describe, expect, it } from 'vitest'
import { GameSession, type SessionResponse } from '../game/authoritative-session'
import { setWorkersAtHome } from '../../shared/domain/player'
import { stabilizeRandomHands } from './_helpers/stabilize-random-hands'

import '../../shared/cards/E/E136_AnimalHusbandryWorker'

const CARD_ID = 'E136_AnimalHusbandryWorker'
const FILLER = '__test_placeholder__'
const ONE_TILE_PASTURE = ['H-1-1', 'H-2-1', 'V-1-1', 'V-1-2']

const setup = ({
  played = false, round = 5, wood = 0, pastureCounts = [0, 0, 0],
} = {}) => {
  const session = new GameSession(7136, undefined, { playerCount: 3 })
  stabilizeRandomHands(session.state.players)
  const state = session.getState().state
  state.currentPlayerIndex = 0
  state.round = round
  state.roundPhase = 'work'
  state.availableMajorImprovements = []
  state.players.forEach((player, playerIndex) => {
    player.minorHand = [FILLER]
    player.occupationHand = playerIndex === 0 && !played ? [CARD_ID] : [FILLER]
    player.minorPlayed = []
    player.occupationPlayed = playerIndex === 0 && played ? [CARD_ID] : []
    player.improvements = []
    player.cardStates = {}
    Object.assign(player.resources, {
      wood: playerIndex === 0 ? wood : 0, clay: 0, reed: 0, stone: 0, food: 20,
      grain: 0, vegetable: 0, sheep: 0, boar: 0, cattle: 0, begging: 0,
    })
    setWorkersAtHome(state, player, 2)
    player.pastures = Array.from({ length: pastureCounts[playerIndex] ?? 0 }, (_, index) => ({
      id: `husbandry-${playerIndex}-${index}`,
      size: 1,
      tiles: [{ row: 2 - index, col: 1 + playerIndex }],
      stables: 0,
      animalType: null,
      animalCount: 0,
    }))
  })
  session.loadState(state)
  return session
}

const optionsOf = (response: SessionResponse) => response.interaction.stateId === 'wait'
  ? response.interaction.request.options ?? []
  : []

const playAnimalHusbandryWorker = (session: GameSession) => {
  const response = session.takeAction(0, 'lessons')
  expect(response.ok, response.error).toBe(true)
  if (!response.state.players[0]!.occupationHand.includes(CARD_ID)) return response
  if (response.interaction.stateId !== 'wait') return response
  const option = optionsOf(response).find((candidate) => candidate.value === CARD_ID)
  expect(option, JSON.stringify(response.interaction, null, 2)).toBeDefined()
  return session.resolveChoice(response.interaction.playerIndex, option!.value)
}

const declineFencing = (session: GameSession, response: SessionResponse) => {
  expect(response.interaction.stateId).toBe('wait')
  if (response.interaction.stateId !== 'wait') return response
  const skip = optionsOf(response).find((candidate) => candidate.value === '__skip__')
  expect(skip, JSON.stringify(response.interaction, null, 2)).toBeDefined()
  return session.resolveChoice(response.interaction.playerIndex, skip!.value)
}

const declineFencingIfOffered = (session: GameSession, response: SessionResponse) =>
  optionsOf(response).some((candidate) => candidate.value === '__skip__')
    ? declineFencing(session, response)
    : response

const acceptFencing = (session: GameSession, response: SessionResponse) => {
  expect(response.interaction.stateId).toBe('wait')
  if (response.interaction.stateId !== 'wait') return response
  const accept = optionsOf(response).find((candidate) => candidate.value !== '__skip__')
  expect(accept, JSON.stringify(response.interaction, null, 2)).toBeDefined()
  return session.resolveChoice(response.interaction.playerIndex, accept!.value)
}

const cardBonusScore = (response: SessionResponse, playerIndex: number) =>
  response.scores[playerIndex]!.categories.find((category) => category.key === 'cardBonusVp')?.entries
    .find((entry) => 'cardId' in entry && entry.cardId === CARD_ID)?.score ?? 0

describe('E136 Animal Husbandry Worker parity', () => {
  it('E136 S1: playing as the first occupation grants wood by complete rounds remaining', () => {
    for (const [round, wood] of [[5, 4], [6, 3], [9, 2], [12, 0]] as const) {
      const session = setup({ round })
      let response = playAnimalHusbandryWorker(session)
      response = declineFencingIfOffered(session, response)

      expect(response.state.players[0]!.occupationPlayed).toContain(CARD_ID)
      expect(response.state.players[0]!.resources.wood, `round ${round}`).toBe(wood)
    }
  })

  it('E136 S2: an unaffordable granted fencing action is skipped instead of being shown for decline', () => {
    const session = setup({ round: 11 })

    const response = playAnimalHusbandryWorker(session)

    expect(response.state.players[0]!.resources.wood).toBe(2)
    expect(response.state.players[0]!.fenceSegments).toHaveLength(0)
    expect(optionsOf(response).some((option) => option.sourceCard === CARD_ID)).toBe(false)
  })

  it('E136 S3: the granted fencing action builds a normal four-fence pasture at normal cost', () => {
    const session = setup({ round: 11, wood: 2 })

    let response = acceptFencing(session, playAnimalHusbandryWorker(session))
    expect(response.interaction).toMatchObject({ stateId: 'wait', request: { kind: 'farm-select' } })
    response = session.commitSelectionChoice(0, { edges: ONE_TILE_PASTURE, extraWood: 0 })

    expect(response.ok, response.error).toBe(true)
    expect(response.state.players[0]!.resources.wood).toBe(0)
    expect(response.state.players[0]!.fenceSegments).toHaveLength(4)
    expect(response.state.players[0]!.pastures).toHaveLength(1)
  })

  it('E136 S4: with fewer than three complete rounds left, playing grants no wood or fencing action', () => {
    const response = playAnimalHusbandryWorker(setup({ round: 12 }))

    expect(response.state.players[0]!.resources.wood).toBe(0)
    expect(response.interaction.stateId === 'wait' ? response.interaction.request.kind : null)
      .not.toBe('farm-select')
    expect(optionsOf(response).some((option) => option.sourceCard === CARD_ID)).toBe(false)
  })

  it('E136 S5: a non-owner who alone has the most pastures receives no shared score', () => {
    const response = setup({ played: true, pastureCounts: [1, 2, 0] }).getState()

    expect([0, 1, 2].map((index) => cardBonusScore(response, index))).toEqual([0, 0, 0])
  })

  it('E136 S6: only the owner scores when tied for the most positive pasture count', () => {
    const response = setup({ played: true, pastureCounts: [2, 2, 1] }).getState()

    expect([0, 1, 2].map((index) => cardBonusScore(response, index))).toEqual([2, 0, 0])
  })

  it('E136 S7: no player scores when all are tied at zero pastures', () => {
    const response = setup({ played: true }).getState()

    expect([0, 1, 2].map((index) => cardBonusScore(response, index))).toEqual([0, 0, 0])
  })
})
