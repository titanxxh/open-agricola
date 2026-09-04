import { describe, expect, it } from 'vitest'
import { GameSession, type SessionResponse } from '../game/authoritative-session'
import { stabilizeRandomHands } from './_helpers/stabilize-random-hands'
import { markAllWorkersUsed, setWorkersAtHome } from '../../shared/domain/player'
import { getAllTilePositions } from '../../shared/domain/farm'
import type { GameState, Resource } from '../../shared/contract/types'

import '../../shared/cards/D/D005_FieldClay'
import '../../shared/cards/D/D007_Trident'
import '../../shared/cards/D/D040_Cesspit'
import '../../shared/cards/D/D041_HorseDrawnBoat'
import '../../shared/cards/D/D043_Hutch'
import '../../shared/cards/D/D069_SmallGreenhouse'
import '../../shared/cards/D/D078_ReedPond'
import '../../shared/cards/D/D079_CarrotMuseum'

type CardId =
  | 'D005_FieldClay' | 'D007_Trident' | 'D040_Cesspit' | 'D041_HorseDrawnBoat'
  | 'D043_Hutch' | 'D069_SmallGreenhouse' | 'D078_ReedPond' | 'D079_CarrotMuseum'

const FILLER = '__test_placeholder__'
const OCCUPATIONS = ['A116_WoodCutter', 'B121_Geologist', 'C123_Freemason']

const setupMinor = ({
  cardId, resources = {}, round = 5, occupations = 0, played = false,
}: {
  cardId: CardId
  resources?: Partial<Resource>
  round?: number
  occupations?: number
  played?: boolean
}) => {
  const session = new GameSession(4052, undefined, { playerCount: 2 })
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
  player.minorHand = played ? [FILLER] : [cardId]
  player.minorPlayed = played ? [cardId] : []
  player.occupationPlayed = OCCUPATIONS.slice(0, occupations)
  player.resources = {
    ...player.resources,
    wood: 0, clay: 0, reed: 0, stone: 0, food: 0, grain: 0, vegetable: 0,
    sheep: 0, boar: 0, cattle: 0, ...resources,
  }
  state.availableMajorImprovements = []
  session.loadState(state)
  return session
}

const enterImprovement = (session: GameSession) => {
  let response = session.takeAction(0, 'major-improvement')
  if (response.interaction.stateId !== 'wait') return response
  const option = response.interaction.request.options?.find((candidate) => candidate.value.startsWith('action-improvement-'))
  if (option) response = session.resolveChoice(0, option.value)
  return response
}

const playMinor = (session: GameSession, cardId: CardId) => {
  let response = enterImprovement(session)
  if (!response.state.players[0]!.minorHand.includes(cardId)) return response
  if (response.interaction.stateId !== 'wait') return response
  const option = response.interaction.request.options?.find((candidate) => candidate.value === cardId)
  if (option) response = session.resolveChoice(0, option.value)
  return response
}

const cardIsOffered = (session: GameSession, cardId: CardId) => {
  const response = enterImprovement(session)
  if (!response.state.players[0]!.minorHand.includes(cardId)) return true
  if (response.interaction.stateId !== 'wait') return false
  return response.interaction.request.options?.some((candidate) => candidate.value === cardId) ?? false
}

const futureRounds = (state: GameState, cardId: CardId, resource: keyof Resource) =>
  state.futureMeeples.filter((entry) => entry.cardId === cardId && (entry.resources[resource] ?? 0) > 0)
    .flatMap((entry) => Array.from({ length: entry.resources[resource] ?? 0 }, () => entry.round))
    .sort((a, b) => a - b)

describe('D005 Field Clay parity', () => {
  it('D005 S1: two planted fields grant two clay and Field Clay passes', () => {
    const session = setupMinor({ cardId: 'D005_FieldClay', resources: { food: 1 } })
    session.state.players[0]!.fields = [
      { row: 0, col: 1, stacks: [{ kind: 'grain', remaining: 1 }] },
      { row: 0, col: 2, stacks: [{ kind: 'vegetable', remaining: 1 }] },
    ]
    session.loadState(session.state)
    const response = playMinor(session, 'D005_FieldClay')
    expect(response.state.players[0]!.resources).toMatchObject({ food: 0, clay: 2 })
    expect(response.state.players[1]!.minorHand).toContain('D005_FieldClay')
  })

  it('D005 S2: no planted field keeps Field Clay unavailable', () => {
    const session = setupMinor({ cardId: 'D005_FieldClay', resources: { food: 1 } })
    expect(cardIsOffered(session, 'D005_FieldClay')).toBe(false)
    const response = playMinor(setupMinor({ cardId: 'D005_FieldClay', resources: { food: 1 } }), 'D005_FieldClay')
    expect(response.state.players[0]!.resources).toMatchObject({ food: 1, clay: 0 })
    expect(response.state.players[0]!.minorHand).toContain('D005_FieldClay')
  })
})

describe('D069 Small Greenhouse parity', () => {
  it('D069 S1: one occupation and two wood schedule paid vegetables four and seven rounds later', () => {
    const response = playMinor(setupMinor({
      cardId: 'D069_SmallGreenhouse', resources: { wood: 2 }, occupations: 1, round: 5,
    }), 'D069_SmallGreenhouse')
    expect(response.state.players[0]!.resources.wood).toBe(0)
    expect(futureRounds(response.state, 'D069_SmallGreenhouse', 'vegetable')).toEqual([9, 12])
  })

  it('D069 S2: no occupation keeps Small Greenhouse unavailable', () => {
    expect(cardIsOffered(setupMinor({
      cardId: 'D069_SmallGreenhouse', resources: { wood: 2 },
    }), 'D069_SmallGreenhouse')).toBe(false)
  })

  it('D069 S3: round ten keeps only the round-fourteen vegetable', () => {
    const response = playMinor(setupMinor({
      cardId: 'D069_SmallGreenhouse', resources: { wood: 2 }, occupations: 1, round: 10,
    }), 'D069_SmallGreenhouse')
    expect(futureRounds(response.state, 'D069_SmallGreenhouse', 'vegetable')).toEqual([14])
  })
})

describe('D007 Trident parity', () => {
  for (const [round, food] of [[3, 3], [6, 4], [9, 5], [12, 6]] as const) {
    it(`D007 round ${round}: gains ${food} food and passes`, () => {
      const response = playMinor(setupMinor({
        cardId: 'D007_Trident', resources: { wood: 1 }, round,
      }), 'D007_Trident')
      expect(response.state.players[0]!.resources.food).toBe(food)
      expect(response.state.players[1]!.minorHand).toContain('D007_Trident')
    })
  }

  it('D007 S5: unavailable outside rounds three, six, nine, and twelve', () => {
    expect(cardIsOffered(setupMinor({
      cardId: 'D007_Trident', resources: { wood: 1 }, round: 5,
    }), 'D007_Trident')).toBe(false)
  })
})

describe('D040 Cesspit parity', () => {
  const cesspit = (round = 5, fields = 2, occupations = 1) => {
    const session = setupMinor({ cardId: 'D040_Cesspit', round, occupations })
    session.state.players[0]!.fields = getAllTilePositions().slice(0, fields).map((tile) => ({ ...tile, stacks: [] }))
    session.loadState(session.state)
    return session
  }

  it('D040 S1: two fields and one occupation schedule alternating clay then pigs', () => {
    const response = playMinor(cesspit(), 'D040_Cesspit')
    expect(futureRounds(response.state, 'D040_Cesspit', 'clay')).toEqual([6, 8, 10, 12, 14])
    expect(futureRounds(response.state, 'D040_Cesspit', 'boar')).toEqual([7, 9, 11, 13])
  })

  it('D040 S2: fewer than two fields keeps Cesspit unavailable', () => {
    expect(cardIsOffered(cesspit(5, 1), 'D040_Cesspit')).toBe(false)
  })

  it('D040 S3: round twelve schedules clay on thirteen and pig on fourteen', () => {
    const response = playMinor(cesspit(12), 'D040_Cesspit')
    expect(futureRounds(response.state, 'D040_Cesspit', 'clay')).toEqual([13])
    expect(futureRounds(response.state, 'D040_Cesspit', 'boar')).toEqual([14])
  })
})

describe('D078 Reed Pond parity', () => {
  it('D078 S1: three occupations schedule reed on the next three rounds', () => {
    const response = playMinor(setupMinor({
      cardId: 'D078_ReedPond', occupations: 3, round: 5,
    }), 'D078_ReedPond')
    expect(futureRounds(response.state, 'D078_ReedPond', 'reed')).toEqual([6, 7, 8])
  })

  it('D078 S2: fewer than three occupations keeps Reed Pond unavailable', () => {
    expect(cardIsOffered(setupMinor({ cardId: 'D078_ReedPond', occupations: 2 }), 'D078_ReedPond')).toBe(false)
  })

  it('D078 S3: round thirteen schedules only round fourteen reed', () => {
    const response = playMinor(setupMinor({
      cardId: 'D078_ReedPond', occupations: 3, round: 13,
    }), 'D078_ReedPond')
    expect(futureRounds(response.state, 'D078_ReedPond', 'reed')).toEqual([14])
  })
})

describe('D043 Hutch parity', () => {
  it('D043 S1: pays one wood and one reed and schedules zero, one, two, then three food', () => {
    const response = playMinor(setupMinor({
      cardId: 'D043_Hutch', resources: { wood: 1, reed: 1 }, round: 5,
    }), 'D043_Hutch')
    expect(response.state.players[0]!.resources).toMatchObject({ wood: 0, reed: 0 })
    expect(futureRounds(response.state, 'D043_Hutch', 'food')).toEqual([7, 8, 8, 9, 9, 9])
  })

  it('D043 S2: round twelve keeps one food on fourteen and drops later entries', () => {
    const response = playMinor(setupMinor({
      cardId: 'D043_Hutch', resources: { wood: 1, reed: 1 }, round: 12,
    }), 'D043_Hutch')
    expect(futureRounds(response.state, 'D043_Hutch', 'food')).toEqual([14])
  })
})

describe('D041 Horse-Drawn Boat parity', () => {
  it('D041 S1: three occupations and two wood schedule alternating food then sheep', () => {
    const response = playMinor(setupMinor({
      cardId: 'D041_HorseDrawnBoat', resources: { wood: 2 }, occupations: 3, round: 5,
    }), 'D041_HorseDrawnBoat')
    expect(futureRounds(response.state, 'D041_HorseDrawnBoat', 'food')).toEqual([6, 8, 10, 12, 14])
    expect(futureRounds(response.state, 'D041_HorseDrawnBoat', 'sheep')).toEqual([7, 9, 11, 13])
  })

  it('D041 S2: fewer than three occupations keeps Horse-Drawn Boat unavailable', () => {
    expect(cardIsOffered(setupMinor({
      cardId: 'D041_HorseDrawnBoat', resources: { wood: 2 }, occupations: 2,
    }), 'D041_HorseDrawnBoat')).toBe(false)
  })

  it('D041 S3: round twelve schedules food on thirteen and sheep on fourteen', () => {
    const response = playMinor(setupMinor({
      cardId: 'D041_HorseDrawnBoat', resources: { wood: 2 }, occupations: 3, round: 12,
    }), 'D041_HorseDrawnBoat')
    expect(futureRounds(response.state, 'D041_HorseDrawnBoat', 'food')).toEqual([13])
    expect(futureRounds(response.state, 'D041_HorseDrawnBoat', 'sheep')).toEqual([14])
  })
})

describe('D079 Carrot Museum parity', () => {
  it('D079 S1: can be played through round eight for one wood and two clay', () => {
    const response = playMinor(setupMinor({
      cardId: 'D079_CarrotMuseum', resources: { wood: 1, clay: 2 }, round: 8,
    }), 'D079_CarrotMuseum')
    expect(response.state.players[0]!.minorPlayed).toContain('D079_CarrotMuseum')
  })

  it('D079 S2: round nine keeps Carrot Museum unavailable', () => {
    const session = setupMinor({
      cardId: 'D079_CarrotMuseum', resources: { wood: 1, clay: 2 }, round: 9,
    })
    expect(cardIsOffered(session, 'D079_CarrotMuseum')).toBe(false)
    expect(session.state.players[0]!.minorPlayed).not.toContain('D079_CarrotMuseum')
  })

  const roundEnd = (round: number) => {
    const session = setupMinor({
      cardId: 'D079_CarrotMuseum', resources: { vegetable: 2, food: 20 }, played: true, round,
    })
    session.state.players[0]!.fields = [{ row: 0, col: 1, stacks: [{ kind: 'vegetable', remaining: 1 }] }]
    session.state.players.forEach((player) => { markAllWorkersUsed(session.state, player); player.resources.food = 20 })
    session.state.players[0]!.resources.vegetable = 2
    session.loadState(session.state)
    return session.performRoundEnd()
  }

  it('D079 S3: round eight end gains stone per vegetable field and wood per supplied vegetable', () => {
    const response = roundEnd(8)
    expect(response.state.players[0]!.resources).toMatchObject({ stone: 1, wood: 2 })
  })

  it('D079 S4: other round ends grant no Carrot Museum resources', () => {
    const response = roundEnd(7)
    expect(response.state.players[0]!.resources).toMatchObject({ stone: 0, wood: 0 })
  })
})
