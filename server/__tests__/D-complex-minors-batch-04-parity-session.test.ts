import { describe, expect, it } from 'vitest'
import { GameSession, type SessionResponse } from '../game/authoritative-session'
import { stabilizeRandomHands } from './_helpers/stabilize-random-hands'
import { resolveTriggerIfPresent } from './_helpers/trigger-select'
import { isCardFlagged } from '../../shared/cards/helpers/card-state'
import { markAllWorkersUsed, setWorkersAtHome } from '../../shared/domain/player'
import type { GameState, Resource } from '../../shared/contract/types'

import '../../shared/cards/D/D001_ZigzagHarrow'
import '../../shared/cards/D/D003_Furrows'
import '../../shared/cards/D/D006_PetrifiedWood'
import '../../shared/cards/D/D029_MuckRake'
import '../../shared/cards/D/D042_EducationBonus'
import '../../shared/cards/D/D046_PelletPress'
import '../../shared/cards/D/D065_GrainSieve'
import '../../shared/cards/D/D084_FeedPellets'

type CardId =
  | 'D001_ZigzagHarrow' | 'D003_Furrows' | 'D006_PetrifiedWood' | 'D029_MuckRake'
  | 'D042_EducationBonus' | 'D046_PelletPress' | 'D065_GrainSieve' | 'D084_FeedPellets'

const FILLER = '__test_placeholder__'
const OCCUPATIONS = [
  'A116_WoodCutter', 'B121_Geologist', 'C123_Freemason', 'D152_Patron',
  'A103_Portmonger', 'B119_Lumberjack',
]

const setupMinor = ({
  cardId, resources = {}, round = 5, occupations = 0, played = false, improvements = 0,
}: {
  cardId: CardId
  resources?: Partial<Resource>
  round?: number
  occupations?: number
  played?: boolean
  improvements?: number
}) => {
  const session = new GameSession(4053, undefined, { playerCount: 2 })
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
  player.improvements = ['Major_Fireplace1', 'Major_Well'].slice(0, improvements)
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

const playOccupation = (session: GameSession, cardId: string, actionId = 'lessons') => {
  let response = session.takeAction(0, actionId)
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

const chooseNonSkip = (session: GameSession, response: SessionResponse, sourceCard?: string) => {
  const current = sourceCard ? resolveTriggerIfPresent(session, response, sourceCard) : response
  expect(current.interaction.stateId).toBe('wait')
  if (current.interaction.stateId !== 'wait') throw new Error('expected choice')
  const option = current.interaction.request.options?.find((candidate) => candidate.value !== '__skip__')
  expect(option).toBeDefined()
  return session.resolveChoice(current.interaction.playerIndex, option!.value)
}

const futureRounds = (state: GameState, cardId: CardId, resource: keyof Resource) =>
  state.futureMeeples.filter((entry) => entry.cardId === cardId && (entry.resources[resource] ?? 0) > 0)
    .flatMap((entry) => Array.from({ length: entry.resources[resource] ?? 0 }, () => entry.round))
    .sort((a, b) => a - b)

const prepareHarvest = (session: GameSession) => {
  const state = session.getState().state
  state.players.forEach((player) => {
    markAllWorkersUsed(state, player)
    player.resources.food = Math.max(player.resources.food, 20)
  })
  session.loadState(state)
}

const cardBonusScore = (response: SessionResponse, cardId: CardId) =>
  response.scores?.[0]!.categories.find((category) => category.key === 'cardBonusVp')?.entries
    .find((entry) => 'cardId' in entry && entry.cardId === cardId)?.score ?? 0

describe('D003 Furrows parity', () => {
  const furrows = () => {
    const session = setupMinor({ cardId: 'D003_Furrows', resources: { grain: 2 } })
    session.state.players[0]!.fields = [
      { row: 0, col: 1, stacks: [] }, { row: 0, col: 2, stacks: [] },
    ]
    session.loadState(session.state)
    return session
  }

  it('D003 S1: may immediately sow exactly one field and passes', () => {
    const session = furrows()
    let response = chooseNonSkip(session, playMinor(session, 'D003_Furrows'))
    expect(response.interaction.stateId).toBe('wait')
    if (response.interaction.stateId !== 'wait') return
    const field = response.interaction.request.farm?.farmType === 'sow'
      ? response.interaction.request.farm.selectableFields[0]!.tile
      : undefined
    expect(field).toBeDefined()
    response = session.commitSelectionChoice(0, { crops: [{ ...field!, crop: 'grain' }] })
    expect(response.state.players[0]!.resources.grain).toBe(1)
    expect(response.state.players[0]!.fields.filter((candidate) => candidate.stacks.length > 0)).toHaveLength(1)
    expect(response.state.players[1]!.minorHand).toContain('D003_Furrows')
  })

  it('D003 S2: sow may be declined and still passes', () => {
    const session = furrows()
    const played = playMinor(session, 'D003_Furrows')
    expect(played.interaction.stateId).toBe('wait')
    const response = session.resolveChoice(0, '__skip__')
    expect(response.state.players[0]!.resources.grain).toBe(2)
  })
})

describe('D006 Petrified Wood parity', () => {
  it('D006 S1: two occupations allow exchange of three wood for three stone and pass', () => {
    const session = setupMinor({ cardId: 'D006_PetrifiedWood', resources: { wood: 3 }, occupations: 2 })
    let response = playMinor(session, 'D006_PetrifiedWood')
    expect(response.interaction.stateId).toBe('wait')
    if (response.interaction.stateId !== 'wait') return
    const option = response.interaction.request.options?.find((candidate) =>
      candidate.effectPreview?.resourcesGained?.stone === 3,
    )
    expect(option).toBeDefined()
    response = session.resolveChoice(0, option!.value)
    expect(response.state.players[0]!.resources).toMatchObject({ wood: 0, stone: 3 })
    expect(response.state.players[1]!.minorHand).toContain('D006_PetrifiedWood')
  })

  it('D006 S2: with one wood the one-for-one exchange resolves', () => {
    const session = setupMinor({
      cardId: 'D006_PetrifiedWood', resources: { wood: 1 }, occupations: 2,
    })
    const response = chooseNonSkip(session, playMinor(session, 'D006_PetrifiedWood'))
    expect(response.state.players[0]!.resources).toMatchObject({ wood: 0, stone: 1 })
  })

  it('D006 S3: fewer than two occupations keeps Petrified Wood unavailable', () => {
    expect(cardIsOffered(setupMinor({
      cardId: 'D006_PetrifiedWood', resources: { wood: 3 }, occupations: 1,
    }), 'D006_PetrifiedWood')).toBe(false)
  })
})

describe('D065 Grain Sieve parity', () => {
  const harvest = (fields: number) => {
    const session = setupMinor({ cardId: 'D065_GrainSieve', played: true, round: 4 })
    session.state.players[0]!.fields = Array.from({ length: fields }, (_, index) => ({
      row: 0, col: index + 1, stacks: [{ kind: 'grain' as const, remaining: 1 }],
    }))
    prepareHarvest(session)
    return session.performRoundEnd()
  }

  it('D065 S1: harvesting two grain fields grants one additional grain', () => {
    expect(harvest(2).state.players[0]!.resources.grain).toBe(3)
  })

  it('D065 S2: harvesting one grain field grants no additional grain', () => {
    expect(harvest(1).state.players[0]!.resources.grain).toBe(1)
  })
})

describe('D001 Zigzag Harrow parity', () => {
  const zigzag = (valid: boolean) => {
    const session = setupMinor({ cardId: 'D001_ZigzagHarrow', resources: { wood: 1 } })
    session.state.players[0]!.fields = valid
      ? [{ row: 0, col: 2, stacks: [] }, { row: 0, col: 3, stacks: [] }, { row: 1, col: 3, stacks: [] }]
      : [{ row: 0, col: 2, stacks: [] }, { row: 0, col: 3, stacks: [] }]
    session.loadState(session.state)
    return session
  }

  it('D001 S1: an L-shaped set of three fields allows a free zigzag-completing field and passes', () => {
    const session = zigzag(true)
    let response = chooseNonSkip(session, playMinor(session, 'D001_ZigzagHarrow'))
    expect(response.interaction.stateId).toBe('wait')
    if (response.interaction.stateId !== 'wait') return
    const tile = response.interaction.request.farm?.farmType === 'plow'
      ? response.interaction.request.farm.selectableTiles[0]
      : undefined
    expect(tile).toBeDefined()
    response = session.commitSelectionChoice(0, { tile })
    expect(response.state.players[0]!.fields).toHaveLength(4)
    expect(response.state.players[1]!.minorHand).toContain('D001_ZigzagHarrow')
  })

  it('D001 S2: a non-zigzag field layout keeps Zigzag Harrow unavailable', () => {
    expect(cardIsOffered(zigzag(false), 'D001_ZigzagHarrow')).toBe(false)
  })
})

describe('D046 Pellet Press parity', () => {
  it('D046 S1: two occupations allow play for two clay', () => {
    const response = playMinor(setupMinor({
      cardId: 'D046_PelletPress', resources: { clay: 2 }, occupations: 2,
    }), 'D046_PelletPress')
    expect(response.state.players[0]!.minorPlayed).toContain('D046_PelletPress')
    expect(response.state.players[0]!.resources.clay).toBe(0)
  })

  it('D046 S2: paying one reed once per round schedules food for the next four rounds', () => {
    const session = setupMinor({ cardId: 'D046_PelletPress', resources: { reed: 2 }, played: true })
    session.takeAction(0, 'farmland')
    const response = session.takeAnytimeAction(0, 'D46-pellet-press-anytime')
    expect(response.state.players[0]!.resources.reed).toBe(1)
    expect(futureRounds(response.state, 'D046_PelletPress', 'food')).toEqual([6, 7, 8, 9])
    expect(isCardFlagged(response.state.players[0]!, 'D046_PelletPress')).toBe(true)
    expect(response.interaction.anytimeActions.map((action) => action.id)).not.toContain('D46-pellet-press-anytime')
  })

  it('D046 S3: resets at the start of the next round', () => {
    const session = setupMinor({ cardId: 'D046_PelletPress', resources: { reed: 2, food: 20 }, played: true })
    session.takeAction(0, 'farmland')
    session.takeAnytimeAction(0, 'D46-pellet-press-anytime')
    const state = session.getState().state
    state.players.forEach((player) => markAllWorkersUsed(state, player))
    state.players.slice(1).forEach((player) => { player.resources.food = 20 })
    session.loadState(state)
    session.performRoundEnd()
    const next = session.takeAction(0, 'day-laborer')
    expect(next.interaction.anytimeActions.map((action) => action.id)).toContain('D46-pellet-press-anytime')
  })
})

describe('D042 Education Bonus parity', () => {
  const withImprovements = (count: number) => {
    const session = setupMinor({ cardId: 'D042_EducationBonus', resources: { food: 1 }, improvements: count })
    session.loadState(session.state)
    return session
  }

  it('D042 S1: two improvements allow play for one food', () => {
    const response = playMinor(withImprovements(2), 'D042_EducationBonus')
    expect(response.state.players[0]!.minorPlayed).toContain('D042_EducationBonus')
    expect(response.state.players[0]!.resources.food).toBe(0)
  })

  it('D042 S2: fewer than two improvements keeps Education Bonus unavailable', () => {
    expect(cardIsOffered(withImprovements(1), 'D042_EducationBonus')).toBe(false)
  })

  it('D042 S3: the first occupation played after Education Bonus gains one grain', () => {
    const session = setupMinor({ cardId: 'D042_EducationBonus', played: true })
    session.state.players[0]!.occupationHand = [OCCUPATIONS[0]!]
    session.loadState(session.state)
    const response = resolveTriggerIfPresent(session, playOccupation(session, OCCUPATIONS[0]!), 'D042_EducationBonus')
    expect(response.state.players[0]!.resources.grain).toBe(1)
  })

  it('D042 S4: the sixth occupation played after Education Bonus may plow one field', () => {
    const session = setupMinor({ cardId: 'D042_EducationBonus', resources: { food: 1 }, played: true })
    session.state.players[0]!.occupationPlayed = OCCUPATIONS.slice(0, 5)
    session.state.players[0]!.occupationHand = [OCCUPATIONS[5]!]
    session.loadState(session.state)
    let response = resolveTriggerIfPresent(session, playOccupation(session, OCCUPATIONS[5]!), 'D042_EducationBonus')
    if (response.interaction.stateId === 'wait' && response.interaction.request.kind === 'choice') {
      response = chooseNonSkip(session, response)
    }
    expect(response.interaction.stateId).toBe('wait')
    if (response.interaction.stateId !== 'wait') return
    const tile = response.interaction.request.farm?.farmType === 'plow'
      ? response.interaction.request.farm.selectableTiles[0]
      : undefined
    expect(tile).toBeDefined()
    response = session.commitSelectionChoice(0, { tile })
    expect(response.state.players[0]!.fields).toHaveLength(1)
  })
})

describe('D084 Feed Pellets parity', () => {
  it('D084 S1: playing immediately gains one sheep', () => {
    const response = playMinor(setupMinor({ cardId: 'D084_FeedPellets' }), 'D084_FeedPellets')
    expect(response.state.players[0]!.resources.sheep).toBe(1)
  })

  const harvest = (boar: number) => {
    const session = setupMinor({
      cardId: 'D084_FeedPellets', resources: { vegetable: 1, boar, food: 20 }, played: true, round: 4,
    })
    const player = session.state.players[0]!
    player.pastures = boar > 0 ? [{
      id: 'boar-pasture', size: 1, tiles: [{ row: 0, col: 1 }], stables: 1,
      animalType: 'boar', animalCount: boar,
    }] : []
    player.stableTiles = boar > 0 ? [{ row: 0, col: 1 }] : []
    prepareHarvest(session)
    session.state.players[0]!.resources.vegetable = 1
    session.loadState(session.state)
    return session
  }

  it('D084 S2: during feeding may pay one vegetable for an animal type already owned', () => {
    const session = harvest(1)
    let response = resolveTriggerIfPresent(session, session.performRoundEnd(), 'D084_FeedPellets')
    response = chooseNonSkip(session, response)
    expect(response.state.players[0]!.resources.vegetable).toBe(0)
    expect(response.state.players[0]!.resources.boar).toBe(2)
  })

  it('D084 S3: no owned animal type skips Feed Pellets during feeding', () => {
    const response = harvest(0).performRoundEnd()
    expect(response.interaction.stateId === 'wait' ? response.interaction.sourceCard : undefined).not.toBe('D084_FeedPellets')
  })
})

describe('D029 Muck Rake parity', () => {
  const score = (types: ('sheep' | 'boar' | 'cattle')[]) => {
    const session = setupMinor({ cardId: 'D029_MuckRake', played: true })
    const player = session.state.players[0]!
    player.stableTiles = types.map((_, index) => ({ row: 0, col: index + 1 }))
    player.stableAnimals = Object.fromEntries(types.map((type, index) => [`0-${index + 1}`, type]))
    player.resources.sheep = types.filter((type) => type === 'sheep').length
    player.resources.boar = types.filter((type) => type === 'boar').length
    player.resources.cattle = types.filter((type) => type === 'cattle').length
    session.loadState(session.state)
    return session.getState()
  }

  it('D029 S1: sheep, pig, and cattle in distinct unfenced stables score three bonus points', () => {
    expect(cardBonusScore(score(['sheep', 'boar', 'cattle']), 'D029_MuckRake')).toBe(3)
  })

  it('D029 S2: two sheep in distinct unfenced stables score only one bonus point', () => {
    expect(cardBonusScore(score(['sheep', 'sheep']), 'D029_MuckRake')).toBe(1)
  })
})
