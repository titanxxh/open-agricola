import { describe, expect, it } from 'vitest'
import { GameSession, type SessionResponse } from '../game/authoritative-session'
import { markAllWorkersUsed, setWorkersAtHome } from '../../shared/domain/player'
import { computeScores } from '../../shared/domain/scoring'
import { stabilizeRandomHands } from './_helpers/stabilize-random-hands'
import type { GameState, Resource } from '../../shared/contract/types'

import '../../shared/cards/B/B020_ChainFloat'
import '../../shared/cards/B/B037_Grange'
import '../../shared/cards/B/B045_StrawberryPatch'
import '../../shared/cards/B/B046_ClubHouse'
import '../../shared/cards/B/B066_SackCart'
import '../../shared/cards/B/B078_ReedBelt'

type CardId =
  | 'B020_ChainFloat' | 'B037_Grange' | 'B045_StrawberryPatch'
  | 'B046_ClubHouse' | 'B066_SackCart' | 'B078_ReedBelt'

const FILLER = '__test_placeholder__'
const OCCUPATIONS = ['A116_WoodCutter', 'B121_Geologist']

const setupMinor = ({
  cardId, resources = {}, round = 5, occupations = 0,
}: {
  cardId: CardId
  resources?: Partial<Resource>
  round?: number
  occupations?: number
}) => {
  const session = new GameSession(5200, undefined, { playerCount: 2 })
  stabilizeRandomHands(session.state.players)
  const state = session.getState().state
  state.currentPlayerIndex = 0
  state.round = round
  state.roundPhase = 'work'
  state.players.forEach((player) => {
    player.minorHand = [FILLER]
    player.occupationHand = [FILLER]
    setWorkersAtHome(state, player, 2)
  })
  const player = state.players[0]!
  player.minorHand = [cardId]
  player.occupationPlayed = OCCUPATIONS.slice(0, occupations)
  player.fields = []
  player.pastures = []
  player.resources = {
    ...player.resources,
    wood: 0, clay: 0, reed: 0, stone: 0, food: 0, grain: 0, vegetable: 0,
    sheep: 0, boar: 0, cattle: 0, ...resources,
  }
  state.availableMajorImprovements = []
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

const playMinor = (session: GameSession, cardId: CardId) => {
  let response = enterMinor(session)
  if (!response.state.players[0]!.minorHand.includes(cardId)) return response
  if (response.interaction.stateId === 'wait') {
    const card = response.interaction.request.options?.find((candidate) => candidate.value === cardId)
    if (card) response = session.resolveChoice(response.interaction.playerIndex, card.value)
  }
  if (response.interaction.stateId === 'wait' && response.interaction.promptKey === 'prompt.selectPayment') {
    const payment = response.interaction.request.options?.find((candidate) =>
      candidate.value.startsWith(`pay:improvement:minor:${cardId}:`))
    expect(payment).toBeDefined()
    response = session.resolveChoice(response.interaction.playerIndex, payment!.value)
  }
  return response
}

const cardIsOffered = (session: GameSession, cardId: CardId) => {
  const response = enterMinor(session)
  if (!response.state.players[0]!.minorHand.includes(cardId)) return true
  return response.interaction.stateId === 'wait'
    && (response.interaction.request.options?.some((candidate) => candidate.value === cardId) ?? false)
}

const futureRounds = (state: GameState, cardId: CardId, resource: keyof Resource) =>
  state.futureMeeples
    .filter((entry) => entry.cardId === cardId && (entry.resources[resource] ?? 0) > 0)
    .flatMap((entry) => Array.from({ length: entry.resources[resource] ?? 0 }, () => entry.round))
    .sort((left, right) => left - right)

const printedVp = (response: SessionResponse, cardId: CardId) => {
  const player = response.state.players[0]!
  const score = computeScores(response.state).find((summary) => summary.playerId === player.id)!
  const cards = score.categories.find((category) => category.key === 'cards')!
  return cards.entries.find((entry) => 'cardId' in entry && entry.cardId === cardId)?.score
}

const prepareRoundEnd = (session: GameSession, round: number) => {
  const state = session.getState().state
  state.round = round
  state.roundPhase = 'work'
  state.players.forEach((player) => {
    markAllWorkersUsed(state, player)
    player.minorHand = [FILLER]
    player.occupationHand = [FILLER]
    player.resources.food = 20
  })
  session.loadState(state)
}

describe('B020 Chain Float parity', () => {
  it('B020 S1: paying three wood in round five schedules optional fields for rounds twelve through fourteen', () => {
    const response = playMinor(setupMinor({ cardId: 'B020_ChainFloat', resources: { wood: 3 } }), 'B020_ChainFloat')

    expect(response.state.players[0]!.resources.wood).toBe(0)
    expect(futureRounds(response.state, 'B020_ChainFloat', 'field')).toEqual([12, 13, 14])
  })

  it('B020 S2: fewer than three wood keeps Chain Float unavailable', () => {
    const session = setupMinor({ cardId: 'B020_ChainFloat', resources: { wood: 2 } })

    expect(cardIsOffered(session, 'B020_ChainFloat')).toBe(false)
    expect(session.getState().state.players[0]!.minorHand).toContain('B020_ChainFloat')
    expect(session.getState().state.players[0]!.resources.wood).toBe(2)
  })

  it('B020 S3: a round-seven play keeps only the reachable round-fourteen field', () => {
    const response = playMinor(setupMinor({
      cardId: 'B020_ChainFloat', resources: { wood: 3 }, round: 7,
    }), 'B020_ChainFloat')

    expect(futureRounds(response.state, 'B020_ChainFloat', 'field')).toEqual([14])
  })

  const dueChainFloat = () => {
    const session = setupMinor({ cardId: 'B020_ChainFloat', resources: { wood: 3 } })
    playMinor(session, 'B020_ChainFloat')
    prepareRoundEnd(session, 11)
    return session
  }

  it('B020 S4: accepting the due Chain Float field plows one field for free', () => {
    const session = dueChainFloat()
    let response = session.performRoundEnd()
    expect(response.interaction.stateId).toBe('wait')
    if (response.interaction.stateId !== 'wait') throw new Error('expected future field choice')
    const accept = response.interaction.request.options?.find((option) => option.value !== '__skip__')
    expect(accept).toBeDefined()
    response = session.resolveChoice(response.interaction.playerIndex, accept!.value)
    expect(response.interaction.stateId).toBe('wait')
    if (response.interaction.stateId !== 'wait') throw new Error('expected plow selection')
    const tile = response.interaction.request.farm.selectableTiles[0]
    expect(tile).toBeDefined()

    response = session.commitSelectionChoice(response.interaction.playerIndex, { tile })

    expect(response.ok, response.error).toBe(true)
    expect(response.state.players[0]!.fields).toHaveLength(1)
    expect(futureRounds(response.state, 'B020_ChainFloat', 'field')).toEqual([13, 14])
  })

  it('B020 S5: declining the due Chain Float field consumes it without plowing', () => {
    const session = dueChainFloat()
    let response = session.performRoundEnd()
    expect(response.interaction.stateId).toBe('wait')
    if (response.interaction.stateId !== 'wait') throw new Error('expected future field choice')

    response = session.resolveChoice(response.interaction.playerIndex, '__skip__')

    expect(response.ok, response.error).toBe(true)
    expect(response.state.players[0]!.fields).toHaveLength(0)
    expect(futureRounds(response.state, 'B020_ChainFloat', 'field')).toEqual([13, 14])
  })
})

const strawberryPatch = (vegetableFields: number, round = 5) => {
  const session = setupMinor({ cardId: 'B045_StrawberryPatch', resources: { wood: 1 }, round })
  session.state.players[0]!.fields = Array.from({ length: vegetableFields }, (_, index) => ({
    row: 1, col: index + 1, stacks: [{ kind: 'vegetable' as const, remaining: 1 }],
  }))
  session.loadState(session.state)
  return session
}

describe('B045 Strawberry Patch parity', () => {
  it('B045 S1: two vegetable fields allow Strawberry Patch, pay one wood, schedule three food, and score two points', () => {
    const response = playMinor(strawberryPatch(2), 'B045_StrawberryPatch')

    expect(response.state.players[0]!.resources.wood).toBe(0)
    expect(futureRounds(response.state, 'B045_StrawberryPatch', 'food')).toEqual([6, 7, 8])
    expect(printedVp(response, 'B045_StrawberryPatch')).toBe(2)
  })

  it('B045 S2: one vegetable field keeps Strawberry Patch unavailable', () => {
    expect(cardIsOffered(strawberryPatch(1), 'B045_StrawberryPatch')).toBe(false)
  })

  it('B045 S3: a round-thirteen play schedules food only for round fourteen', () => {
    const response = playMinor(strawberryPatch(2, 13), 'B045_StrawberryPatch')
    expect(futureRounds(response.state, 'B045_StrawberryPatch', 'food')).toEqual([14])
  })

  it('B045 S4: scheduled Strawberry Patch food is received next round', () => {
    const session = strawberryPatch(2)
    playMinor(session, 'B045_StrawberryPatch')
    prepareRoundEnd(session, 5)

    const response = session.performRoundEnd()

    expect(response.state.players[0]!.resources.food).toBe(21)
    expect(futureRounds(response.state, 'B045_StrawberryPatch', 'food')).toEqual([7, 8])
  })

  it('B045 S5: two vegetable fields do not bypass the one-wood cost', () => {
    const session = strawberryPatch(2)
    session.state.players[0]!.resources.wood = 0

    expect(cardIsOffered(session, 'B045_StrawberryPatch')).toBe(false)
  })
})

const grange = (fields: number, animals: Partial<Resource>) => {
  const session = setupMinor({ cardId: 'B037_Grange', resources: animals })
  const player = session.state.players[0]!
  player.fields = Array.from({ length: fields }, (_, index) => ({
    row: Math.floor(index / 4), col: (index % 4) + 1, stacks: [],
  }))
  session.loadState(session.state)
  return session
}

describe('B037 Grange parity', () => {
  it('B037 S1: six fields and all three animal types allow Grange, grant one food, and score three points', () => {
    const response = playMinor(grange(6, { sheep: 1, boar: 1, cattle: 1 }), 'B037_Grange')

    expect(response.state.players[0]!.minorPlayed).toContain('B037_Grange')
    expect(response.state.players[0]!.resources.food).toBe(1)
    expect(printedVp(response, 'B037_Grange')).toBe(3)
  })

  it('B037 S2: characterize five fields even with all animal types', () => {
    const response = playMinor(grange(5, { sheep: 1, boar: 1, cattle: 1 }), 'B037_Grange')

    expect(response.state.players[0]!.minorPlayed).toContain('B037_Grange')
    expect(response.state.players[0]!.resources.food).toBe(1)
  })

  it('B037 S3: characterize six fields with one animal type missing', () => {
    const response = playMinor(grange(6, { sheep: 1, boar: 1 }), 'B037_Grange')

    expect(response.state.players[0]!.minorPlayed).toContain('B037_Grange')
    expect(response.state.players[0]!.resources.food).toBe(1)
  })
})

describe('B078 Reed Belt parity', () => {
  it('B078 S1: pays two food and schedules reed on remaining named rounds', () => {
    const response = playMinor(setupMinor({
      cardId: 'B078_ReedBelt', resources: { food: 2 }, round: 4,
    }), 'B078_ReedBelt')
    expect(response.state.players[0]!.resources.food).toBe(0)
    expect(futureRounds(response.state, 'B078_ReedBelt', 'reed')).toEqual([5, 8, 10, 12])
  })

  it('B078 S2: a round-eight play schedules only rounds ten and twelve', () => {
    const response = playMinor(setupMinor({
      cardId: 'B078_ReedBelt', resources: { food: 2 }, round: 8,
    }), 'B078_ReedBelt')
    expect(futureRounds(response.state, 'B078_ReedBelt', 'reed')).toEqual([10, 12])
  })

  it('B078 S3: after round twelve Reed Belt is played but schedules no reed', () => {
    const response = playMinor(setupMinor({
      cardId: 'B078_ReedBelt', resources: { food: 2 }, round: 13,
    }), 'B078_ReedBelt')
    expect(response.state.players[0]!.minorPlayed).toContain('B078_ReedBelt')
    expect(response.state.players[0]!.resources.food).toBe(0)
    expect(futureRounds(response.state, 'B078_ReedBelt', 'reed')).toEqual([])
  })

  it('B078 S4: scheduled Reed Belt reed is received on round five', () => {
    const session = setupMinor({ cardId: 'B078_ReedBelt', resources: { food: 2 }, round: 4 })
    playMinor(session, 'B078_ReedBelt')
    prepareRoundEnd(session, 4)
    const response = session.performRoundEnd()
    expect(response.state.players[0]!.resources.reed).toBe(1)
    expect(futureRounds(response.state, 'B078_ReedBelt', 'reed')).toEqual([8, 10, 12])
  })

  it('B078 S5: fewer than two food keeps Reed Belt unavailable', () => {
    expect(cardIsOffered(setupMinor({
      cardId: 'B078_ReedBelt', resources: { food: 1 }, round: 4,
    }), 'B078_ReedBelt')).toBe(false)
  })
})

describe('B066 Sack Cart parity', () => {
  it('B066 S1: two occupations and two wood allow Sack Cart and schedule all remaining named rounds', () => {
    const response = playMinor(setupMinor({
      cardId: 'B066_SackCart', resources: { wood: 2 }, round: 4, occupations: 2,
    }), 'B066_SackCart')
    expect(response.state.players[0]!.resources.wood).toBe(0)
    expect(futureRounds(response.state, 'B066_SackCart', 'grain')).toEqual([5, 8, 11, 14])
  })

  it('B066 S2: one occupation keeps Sack Cart unavailable', () => {
    expect(cardIsOffered(setupMinor({
      cardId: 'B066_SackCart', resources: { wood: 2 }, round: 4, occupations: 1,
    }), 'B066_SackCart')).toBe(false)
  })

  it('B066 S3: a round-eight play schedules only rounds eleven and fourteen', () => {
    const response = playMinor(setupMinor({
      cardId: 'B066_SackCart', resources: { wood: 2 }, round: 8, occupations: 2,
    }), 'B066_SackCart')
    expect(futureRounds(response.state, 'B066_SackCart', 'grain')).toEqual([11, 14])
  })

  it('B066 S4: scheduled Sack Cart grain is received on round five', () => {
    const session = setupMinor({
      cardId: 'B066_SackCart', resources: { wood: 2 }, round: 4, occupations: 2,
    })
    playMinor(session, 'B066_SackCart')
    prepareRoundEnd(session, 4)
    const response = session.performRoundEnd()
    expect(response.state.players[0]!.resources.grain).toBe(1)
    expect(futureRounds(response.state, 'B066_SackCart', 'grain')).toEqual([8, 11, 14])
  })

  it('B066 S5: two occupations do not bypass the two-wood cost', () => {
    expect(cardIsOffered(setupMinor({
      cardId: 'B066_SackCart', resources: { wood: 1 }, round: 4, occupations: 2,
    }), 'B066_SackCart')).toBe(false)
  })
})

describe('B046 Club House parity', () => {
  for (const [scenario, resource, amount] of [['S1', 'wood', 3], ['S2', 'clay', 2]] as const) {
    it(`B046 ${scenario}: paying ${amount} ${resource} schedules four food then one stone`, () => {
      const response = playMinor(setupMinor({
        cardId: 'B046_ClubHouse', resources: { [resource]: amount },
      }), 'B046_ClubHouse')
      expect(response.state.players[0]!.resources[resource]).toBe(0)
      expect(futureRounds(response.state, 'B046_ClubHouse', 'food')).toEqual([6, 7, 8, 9])
      expect(futureRounds(response.state, 'B046_ClubHouse', 'stone')).toEqual([10])
      expect(printedVp(response, 'B046_ClubHouse')).toBe(1)
    })
  }

  it('B046 S3: insufficient wood and clay keep Club House unavailable', () => {
    expect(cardIsOffered(setupMinor({
      cardId: 'B046_ClubHouse', resources: { wood: 2, clay: 1 },
    }), 'B046_ClubHouse')).toBe(false)
  })

  it('B046 S4: a round-twelve play schedules only reachable food and no stone', () => {
    const response = playMinor(setupMinor({
      cardId: 'B046_ClubHouse', resources: { clay: 2 }, round: 12,
    }), 'B046_ClubHouse')
    expect(futureRounds(response.state, 'B046_ClubHouse', 'food')).toEqual([13, 14])
    expect(futureRounds(response.state, 'B046_ClubHouse', 'stone')).toEqual([])
  })

  it('B046 S5: scheduled Club House food is received at the next round start', () => {
    const session = setupMinor({ cardId: 'B046_ClubHouse', resources: { clay: 2 } })
    playMinor(session, 'B046_ClubHouse')
    prepareRoundEnd(session, 5)
    const response = session.performRoundEnd()
    expect(response.state.players[0]!.resources.food).toBe(21)
    expect(futureRounds(response.state, 'B046_ClubHouse', 'food')).toEqual([7, 8, 9])
    expect(futureRounds(response.state, 'B046_ClubHouse', 'stone')).toEqual([10])
  })
})
