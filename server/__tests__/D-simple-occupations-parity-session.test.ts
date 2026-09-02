import { describe, expect, it } from 'vitest'
import { GameSession } from '../game/authoritative-session'
import { setWorkersAtHome } from '../../shared/domain/player'
import { stabilizeRandomHands } from './_helpers/stabilize-random-hands'

import '../../shared/cards/D/D100_LordoftheManor'
import '../../shared/cards/D/D104_Cultivator'
import '../../shared/cards/D/D105_Sculptor'
import '../../shared/cards/D/D145_RoofExaminer'

type CardId = 'D100_LordoftheManor' | 'D104_Cultivator' | 'D105_Sculptor' | 'D145_RoofExaminer'

const setup = (cardId: CardId, {
  playerCount = 2,
  played = true,
  majors = [],
}: {
  playerCount?: number
  played?: boolean
  majors?: string[]
} = {}) => {
  const session = new GameSession(100, undefined, { playerCount })
  stabilizeRandomHands(session.state.players)
  const state = session.getState().state
  state.currentPlayerIndex = 0
  state.round = 14
  state.roundPhase = 'work'
  state.players.forEach((player) => {
    player.minorHand = ['__test_placeholder__']
    player.occupationHand = ['__test_placeholder__']
  })
  const player = state.players[0]!
  setWorkersAtHome(state, player, 2)
  player.occupationHand = played ? ['__test_placeholder__'] : [cardId]
  player.occupationPlayed = played ? [cardId] : []
  player.improvements = [...majors]
  player.resources = {
    ...player.resources,
    wood: 0,
    clay: 0,
    reed: 0,
    stone: 0,
    grain: 0,
    vegetable: 0,
    food: 0,
  }
  session.loadState(state)
  return session
}

const playOccupation = (session: GameSession, cardId: CardId) => {
  let response = session.takeAction(0, 'lessons')
  if (response.interaction.stateId === 'wait') {
    const option = response.interaction.request.options?.find((candidate) => candidate.value === cardId)
    if (option) response = session.resolveChoice(0, option.value)
  }
  return response
}

const plowOneField = (session: GameSession) => {
  let response = session.takeAction(0, 'farmland')
  expect(response.ok, response.error).toBe(true)
  expect(response.interaction.stateId).toBe('wait')
  if (response.interaction.stateId !== 'wait' || response.interaction.request.farm.farmType !== 'plow') {
    return response
  }
  response = session.commitSelectionChoice(0, {
    tile: response.interaction.request.farm.selectableTiles[0]!,
  })
  return response
}

const bonusScore = (session: GameSession, cardId: CardId) =>
  session.getState().scores[0]!.categories
    .find((category) => category.key === 'cardBonusVp')
    ?.entries.find((entry) => entry.type === 'bonus' && entry.cardId === cardId)?.score ?? 0

describe('D104 Cultivator parity', () => {
  it('D104 S1: playing Cultivator through Lessons leaves it in play', () => {
    const response = playOccupation(setup('D104_Cultivator', { played: false }), 'D104_Cultivator')

    expect(response.ok, response.error).toBe(true)
    expect(response.state.players[0]!.occupationPlayed).toContain('D104_Cultivator')
  })

  it('D104 S2: plowing one field grants one wood and one food', () => {
    const response = plowOneField(setup('D104_Cultivator'))

    expect(response.ok, response.error).toBe(true)
    expect(response.state.players[0]!.fields).toHaveLength(1)
    expect(response.state.players[0]!.resources).toMatchObject({ wood: 1, food: 1 })
  })

  it('D104 S3: plowing without Cultivator grants no wood or food', () => {
    const response = plowOneField(setup('D104_Cultivator', { played: false }))

    expect(response.state.players[0]!.fields).toHaveLength(1)
    expect(response.state.players[0]!.resources).toMatchObject({ wood: 0, food: 0 })
  })

  it('D104 S4: a non-plow action grants no Cultivator resources', () => {
    const response = setup('D104_Cultivator').takeAction(0, 'grain-seeds')

    expect(response.ok, response.error).toBe(true)
    expect(response.state.players[0]!.resources).toMatchObject({ wood: 0, food: 0 })
  })
})

describe('D105 Sculptor parity', () => {
  it('D105 S1: playing Sculptor through Lessons leaves it in play', () => {
    const response = playOccupation(setup('D105_Sculptor', { played: false }), 'D105_Sculptor')

    expect(response.ok, response.error).toBe(true)
    expect(response.state.players[0]!.occupationPlayed).toContain('D105_Sculptor')
  })

  it('D105 S2: using a clay accumulation space grants one food', () => {
    const session = setup('D105_Sculptor')
    session.state.actionSpaces.find((space) => space.id === 'clay-pit')!.resources.clay = 2

    const response = session.takeAction(0, 'clay-pit')

    expect(response.ok, response.error).toBe(true)
    expect(response.state.players[0]!.resources).toMatchObject({ clay: 2, food: 1 })
  })

  it('D105 S3: using a stone accumulation space grants one grain', () => {
    const session = setup('D105_Sculptor')
    session.state.actionSpaces.find((space) => space.id === 'western-quarry')!.resources.stone = 2

    const response = session.takeAction(0, 'western-quarry')

    expect(response.ok, response.error).toBe(true)
    expect(response.state.players[0]!.resources).toMatchObject({ stone: 2, grain: 1 })
  })

  it('D105 S4: a non-clay and non-stone accumulation space grants no Sculptor bonus', () => {
    const response = setup('D105_Sculptor').takeAction(0, 'grain-seeds')

    expect(response.ok, response.error).toBe(true)
    expect(response.state.players[0]!.resources).toMatchObject({ grain: 1, food: 0 })
  })
})

describe('D100 Lord of the Manor parity', () => {
  it('D100 S1: playing Lord of the Manor through Lessons leaves it in play', () => {
    const response = playOccupation(setup('D100_LordoftheManor', { played: false }), 'D100_LordoftheManor')

    expect(response.ok, response.error).toBe(true)
    expect(response.state.players[0]!.occupationPlayed).toContain('D100_LordoftheManor')
  })

  it('D100 S2: three standard categories at four points grant three bonus points', () => {
    const session = setup('D100_LordoftheManor')
    const player = session.state.players[0]!
    player.fields = Array.from({ length: 5 }, (_, col) => ({ row: 1, col, stacks: [] }))
    player.resources.grain = 8
    player.resources.vegetable = 4

    expect(bonusScore(session, 'D100_LordoftheManor')).toBe(3)
  })

  it('D100 S3: four fenced stables grant one Lord of the Manor bonus point', () => {
    const session = setup('D100_LordoftheManor')
    const player = session.state.players[0]!
    player.pastures = [{
      id: 'pasture',
      size: 4,
      tiles: [{ row: 1, col: 0 }, { row: 1, col: 1 }, { row: 2, col: 0 }, { row: 2, col: 1 }],
      stables: 4,
      animalType: null,
      animalCount: 0,
    }]
    player.stableTiles = [{ row: 1, col: 0 }, { row: 1, col: 1 }, { row: 2, col: 0 }, { row: 2, col: 1 }]

    expect(bonusScore(session, 'D100_LordoftheManor')).toBe(1)
  })

  it('D100 S4: a non-standard category at four points grants no bonus', () => {
    const session = setup('D100_LordoftheManor')
    const player = session.state.players[0]!
    player.houseType = 'stone'

    const response = session.getState()

    expect(response.scores[0]!.categories.find((category) => category.key === 'stoneRooms')?.total).toBe(4)
    expect(bonusScore(session, 'D100_LordoftheManor')).toBe(0)
  })
})

const ROOF_EXAMINER_MAJORS = [
  'Major_Fireplace1',
  'Major_CookingHearth1',
  'Major_Well',
  'Major_Joinery',
]

describe('D145 Roof Examiner parity', () => {
  it.each([
    ['S1', 0, 0],
    ['S2', 1, 2],
    ['S3', 2, 3],
    ['S4', 4, 5],
  ])('D145 %s: %i major improvements grant %i reed', (_scenario, majorCount, reed) => {
    const session = setup('D145_RoofExaminer', {
      playerCount: 3,
      played: false,
      majors: ROOF_EXAMINER_MAJORS.slice(0, majorCount),
    })

    const response = playOccupation(session, 'D145_RoofExaminer')

    expect(response.ok, response.error).toBe(true)
    expect(response.state.players[0]!.occupationPlayed).toContain('D145_RoofExaminer')
    expect(response.state.players[0]!.resources.reed).toBe(reed)
  })
})
