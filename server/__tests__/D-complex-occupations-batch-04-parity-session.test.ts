import { describe, expect, it } from 'vitest'
import { GameSession, type SessionResponse } from '../game/authoritative-session'
import { stabilizeRandomHands } from './_helpers/stabilize-random-hands'
import { resolveTriggerIfPresent } from './_helpers/trigger-select'
import { familySize, markAllWorkersUsed, setWorkersAtHome, workersAvailable } from '../../shared/domain/player'
import { getCardStack, readCardExtraData } from '../../shared/cards/helpers/card-state'
import type { GameState, Resource } from '../../shared/contract/types'

import '../../shared/cards/A/A116_WoodCutter'
import '../../shared/cards/B/B081_Handcart'
import '../../shared/cards/B/B086_TruffleSearcher'
import '../../shared/cards/D/D086_SheepAgent'
import '../../shared/cards/D/D092_ChildOmbudsman'
import '../../shared/cards/D/D093_SheepInspector'
import '../../shared/cards/D/D098_Transactor'
import '../../shared/cards/D/D103_CanalBoatman'
import '../../shared/cards/D/D107_Bellfounder'
import '../../shared/cards/D/D112_YoungFarmer'
import '../../shared/cards/D/D117_WoodExpert'
import '../../shared/cards/D/D118_Bonehead'
import '../../shared/cards/D/D147_TrapBuilder'

type CardId =
  | 'D086_SheepAgent' | 'D092_ChildOmbudsman' | 'D093_SheepInspector'
  | 'D098_Transactor' | 'D103_CanalBoatman' | 'D107_Bellfounder'
  | 'D112_YoungFarmer' | 'D117_WoodExpert' | 'D118_Bonehead' | 'D147_TrapBuilder'

const FILLER = '__test_placeholder__'

const setupOccupation = (cardId: CardId, {
  playerCount = 2, played = false, round = 14, resources = {}, workers = 2,
}: {
  playerCount?: number
  played?: boolean
  round?: number
  resources?: Partial<Resource>
  workers?: number
} = {}) => {
  const session = new GameSession(4055, undefined, { playerCount })
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
  setWorkersAtHome(state, player, workers)
  player.occupationHand = played ? [FILLER] : [cardId]
  player.occupationPlayed = played ? [cardId] : []
  player.resources = {
    ...player.resources,
    wood: 0, clay: 0, reed: 0, stone: 0, food: 0, grain: 0, vegetable: 0,
    sheep: 0, boar: 0, cattle: 0, ...resources,
  }
  session.loadState(state)
  return session
}

const playOccupation = (session: GameSession, cardId: string) => {
  const response = session.takeAction(0, 'lessons')
  if (response.interaction.stateId !== 'wait') return response
  const option = response.interaction.request.options?.find((candidate) => candidate.value === cardId)
  return option ? session.resolveChoice(response.interaction.playerIndex, option.value) : response
}

const chooseNonSkip = (session: GameSession, response: SessionResponse, sourceCard?: string) => {
  const current = sourceCard ? resolveTriggerIfPresent(session, response, sourceCard) : response
  expect(current.interaction.stateId).toBe('wait')
  if (current.interaction.stateId !== 'wait') throw new Error('expected choice')
  const option = current.interaction.request.options?.find((candidate) => candidate.value !== '__skip__')
  expect(option).toBeDefined()
  return session.resolveChoice(current.interaction.playerIndex, option!.value)
}

const chooseSkip = (session: GameSession, response: SessionResponse, sourceCard?: string) => {
  const current = sourceCard ? resolveTriggerIfPresent(session, response, sourceCard) : response
  expect(current.interaction.stateId).toBe('wait')
  if (current.interaction.stateId !== 'wait') throw new Error('expected choice')
  expect(current.interaction.request.options?.some((candidate) => candidate.value === '__skip__')).toBe(true)
  return session.resolveChoice(current.interaction.playerIndex, '__skip__')
}

const setSpaceResource = (state: GameState, spaceId: string, resource: keyof Resource, count: number) => {
  const space = state.actionSpaces.find((candidate) => candidate.id === spaceId)
  if (!space) throw new Error(`${spaceId} missing`)
  space.resources[resource] = count
  space.takenBy = []
}

const occupy = (state: GameState, actionId: string, playerIndex = 0) => {
  const space = state.actionSpaces.find((candidate) => candidate.id === actionId)
  if (!space) throw new Error(`${actionId} missing`)
  const player = state.players[playerIndex]!
  const usedIds = new Set(state.actionSpaces.flatMap((candidate) => candidate.takenBy)
    .filter((worker) => worker.playerId === player.id).map((worker) => worker.workerId))
  const worker = player.workers.find((candidate) => candidate.isActive && !usedIds.has(candidate.id))
  if (!worker) throw new Error('no worker available')
  space.takenBy = [{ playerId: player.id, workerId: worker.id }]
}

const prepareRoundEnd = (session: GameSession) => {
  const state = session.getState().state
  state.players.forEach((player) => {
    markAllWorkersUsed(state, player)
    player.resources.food = Math.max(player.resources.food, 20)
  })
  session.loadState(state)
}

const futureRounds = (state: GameState, cardId: CardId, resource: keyof Resource) =>
  state.futureMeeples.filter((entry) => entry.cardId === cardId && (entry.resources[resource] ?? 0) > 0)
    .flatMap((entry) => Array.from({ length: entry.resources[resource] ?? 0 }, () => entry.round))
    .sort((left, right) => left - right)

describe('D092 Child Ombudsman parity', () => {
  const setup = (round: number) => {
    const session = setupOccupation('D092_ChildOmbudsman', { played: true, round })
    const player = session.state.players[0]!
    player.rooms = 3
    player.roomTiles = [{ row: 0, col: 0 }, { row: 1, col: 0 }, { row: 2, col: 0 }]
    session.loadState(session.state)
    return session
  }

  it('D092 S1: from round five a person action may grow the family for minus two points', () => {
    const session = setup(5)
    const before = familySize(session.state.players[0]!)
    const response = chooseNonSkip(session, session.takeAction(0, 'day-laborer'), 'D092_ChildOmbudsman')
    expect(familySize(response.state.players[0]!)).toBe(before + 1)
    expect(readCardExtraData<number>(response.state.players[0]!, 'D092_ChildOmbudsman', 'negativeScore')).toBe(2)
    const score = response.scores[0]!.categories.find((category) => category.key === 'cardBonusVp')?.entries
      .find((entry) => 'cardId' in entry && entry.cardId === 'D092_ChildOmbudsman')?.score
    expect(score).toBe(-2)
  })

  it('D092 S2: may be declined without growth or penalty', () => {
    const session = setup(5)
    const before = familySize(session.state.players[0]!)
    const response = chooseSkip(session, session.takeAction(0, 'day-laborer'), 'D092_ChildOmbudsman')
    expect(familySize(response.state.players[0]!)).toBe(before)
    expect(readCardExtraData<number>(response.state.players[0]!, 'D092_ChildOmbudsman', 'negativeScore') ?? 0).toBe(0)
  })

  it('D092 S3: before round five it does not trigger', () => {
    const response = setup(4).takeAction(0, 'day-laborer')
    expect(response.interaction.stateId === 'wait' ? response.interaction.sourceCard : undefined)
      .not.toBe('D092_ChildOmbudsman')
  })
})

describe('D117 Wood Expert parity', () => {
  it('D117 S1: playing immediately gains two wood', () => {
    const response = playOccupation(setupOccupation('D117_WoodExpert'), 'D117_WoodExpert')
    expect(response.state.players[0]!.resources.wood).toBe(2)
  })

  const playHandcart = (resources: Partial<Resource>) => {
    const session = setupOccupation('D117_WoodExpert', { played: true, resources })
    session.state.players[0]!.minorHand = ['B081_Handcart']
    session.loadState(session.state)
    let response = session.takeAction(0, 'major-improvement')
    if (response.interaction.stateId !== 'wait') return response
    const improvement = response.interaction.request.options?.find((option) => option.value.startsWith('action-improvement-'))
    if (improvement) response = session.resolveChoice(0, improvement.value)
    if (response.interaction.stateId !== 'wait') return response
    const card = response.interaction.request.options?.find((option) => option.value === 'B081_Handcart')
    if (card) response = session.resolveChoice(0, card.value)
    return response
  }

  it('D117 S2: one food replaces up to two wood in an improvement cost', () => {
    const response = playHandcart({ food: 1 })
    expect(response.state.players[0]!.minorPlayed).toContain('B081_Handcart')
    expect(response.state.players[0]!.resources).toMatchObject({ food: 0, wood: 0 })
  })

  it('D117 S3: without food the original one-wood payment remains usable', () => {
    const response = playHandcart({ wood: 1 })
    expect(response.state.players[0]!.minorPlayed).toContain('B081_Handcart')
    expect(response.state.players[0]!.resources).toMatchObject({ food: 0, wood: 0 })
  })
})

describe('D112 Young Farmer parity', () => {
  const setup = () => {
    const session = setupOccupation('D112_YoungFarmer', { played: true, round: 14, resources: { clay: 2 } })
    const player = session.state.players[0]!
    player.fields = [{ row: 0, col: 1, stacks: [] }]
    session.state.availableMajorImprovements = ['Major_Fireplace1']
    session.loadState(session.state)
    return session
  }

  const buildFireplace = (session: GameSession) => {
    let response = session.takeAction(0, 'major-improvement')
    if (response.interaction.stateId !== 'wait') return response
    const improvement = response.interaction.request.options?.find((option) => option.value.startsWith('action-improvement-'))
    if (improvement) response = session.resolveChoice(0, improvement.value)
    if (response.interaction.stateId !== 'wait') return response
    const fireplace = response.interaction.request.options?.find((option) => option.value === 'Major_Fireplace1')
    return fireplace ? session.resolveChoice(0, fireplace.value) : response
  }

  it('D112 S1: OA builds the major improvement but grants neither grain nor sow', () => {
    const session = setup()
    const response = buildFireplace(session)
    expect(response.state.players[0]!.improvements).toContain('Major_Fireplace1')
    expect(response.state.players[0]!.resources.grain).toBe(0)
    expect(response.interaction.stateId === 'wait' ? response.interaction.sourceCard : undefined)
      .not.toBe('D112_YoungFarmer')
  })

  it('D112 S2: OA exposes no optional sow to decline after Major Improvement', () => {
    const session = setup()
    const response = buildFireplace(session)
    expect(response.interaction.stateId === 'wait' ? response.interaction.request.kind : undefined)
      .not.toBe('farm-select')
    expect(response.state.players[0]!.resources.grain).toBe(0)
  })
})

describe('D086 Sheep Agent parity', () => {
  const animalPrompt = (occupations: string[]) => {
    const session = setupOccupation('D086_SheepAgent', { played: true, round: 5 })
    session.state.players[0]!.occupationPlayed = occupations
    session.loadState(session.state)
    return session.devSetResources(0, { sheep: 4 })
  }

  it('D086 S1: capacity equals occupations not already able to hold animals', () => {
    const response = animalPrompt(['D086_SheepAgent', 'A116_WoodCutter', 'B086_TruffleSearcher'])
    expect(response.interaction.stateId).toBe('wait')
    if (response.interaction.stateId !== 'wait' || response.interaction.request.kind !== 'animal-reorg') return
    expect(response.interaction.request.zones.find((zone) => zone.cardId === 'D086_SheepAgent'))
      .toMatchObject({ capacity: 2, allowedAnimalType: 'sheep' })
  })

  it('D086 S2: with only Sheep Agent in play its capacity is one sheep', () => {
    const response = animalPrompt(['D086_SheepAgent'])
    expect(response.interaction.stateId).toBe('wait')
    if (response.interaction.stateId !== 'wait' || response.interaction.request.kind !== 'animal-reorg') return
    expect(response.interaction.request.zones.find((zone) => zone.cardId === 'D086_SheepAgent'))
      .toMatchObject({ capacity: 1, allowedAnimalType: 'sheep' })
  })
})

describe('D107 Bellfounder parity', () => {
  const finishRound = (clay: number) => {
    const session = setupOccupation('D107_Bellfounder', { played: true, round: 3, resources: { clay, food: 20 } })
    prepareRoundEnd(session)
    return { session, response: session.performRoundEnd() }
  }

  it('D107 S1: may discard all clay for three food', () => {
    const { session, response: initial } = finishRound(3)
    let response = resolveTriggerIfPresent(session, initial, 'D107_Bellfounder')
    expect(response.interaction.stateId).toBe('wait')
    if (response.interaction.stateId !== 'wait') return
    const food = response.interaction.request.options?.find((option) => option.effectPreview?.resourcesGained?.food === 3)
    expect(food).toBeDefined()
    response = session.resolveChoice(response.interaction.playerIndex, food!.value)
    expect(response.state.players[0]!.resources).toMatchObject({ clay: 0, food: 23 })
  })

  it('D107 S2: may discard all clay for one bonus point', () => {
    const { session, response: initial } = finishRound(3)
    let response = resolveTriggerIfPresent(session, initial, 'D107_Bellfounder')
    expect(response.interaction.stateId).toBe('wait')
    if (response.interaction.stateId !== 'wait') return
    const point = response.interaction.request.options?.find((option) => option.effectPreview?.bonusVpGained === 1)
      ?? response.interaction.request.options?.find((option) => option.value !== '__skip__' && option.effectPreview?.resourcesGained?.food !== 3)
    expect(point).toBeDefined()
    response = session.resolveChoice(response.interaction.playerIndex, point!.value)
    expect(response.state.players[0]!.resources.clay).toBe(0)
    expect(response.state.players[0]!.cardStates.D107_Bellfounder?.counters?.bonusVp).toBe(1)
  })

  it('D107 S3: with no clay OA skips the Bellfounder prompt', () => {
    const { response } = finishRound(0)
    expect(response.interaction.stateId === 'wait' ? response.interaction.sourceCard : undefined)
      .not.toBe('D107_Bellfounder')
  })
})

describe('D103 Canal Boatman parity', () => {
  const setup = (workers = 2) => {
    const session = setupOccupation('D103_CanalBoatman', { played: true, round: 5, resources: { food: 1 }, workers })
    setSpaceResource(session.state, 'fishing', 'food', 2)
    session.loadState(session.state)
    return session
  }

  const accept = (session: GameSession, branch: number) => {
    const response = chooseNonSkip(session, session.takeAction(0, 'fishing'), 'D103_CanalBoatman')
    expect(response.interaction.stateId).toBe('wait')
    if (response.interaction.stateId !== 'wait') return response
    const options = response.interaction.request.options?.filter((option) => option.value !== '__skip__') ?? []
    expect(options).toHaveLength(2)
    return session.resolveChoice(response.interaction.playerIndex, options[branch]!.value)
  }

  it('D103 S1: after Fishing may pay, place another person, and gain three stone', () => {
    const session = setup()
    const response = accept(session, 0)
    expect(response.state.players[0]!.resources).toMatchObject({ food: 2, stone: 3 })
    expect(workersAvailable(response.state, response.state.players[0]!)).toBe(0)
  })

  it('D103 S2: may instead gain one grain and one vegetable', () => {
    const response = accept(setup(), 1)
    expect(response.state.players[0]!.resources).toMatchObject({ grain: 1, vegetable: 1 })
  })

  it('D103 S3: with no remaining person it does not trigger', () => {
    const response = setup(1).takeAction(0, 'fishing')
    expect(response.interaction.stateId === 'wait' ? response.interaction.sourceCard : undefined)
      .not.toBe('D103_CanalBoatman')
  })
})

describe('D147 Trap Builder parity', () => {
  const takeDayLaborer = (round: number) => setupOccupation('D147_TrapBuilder', {
    playerCount: 3, played: true, round,
  }).takeAction(0, 'day-laborer')

  it('D147 S1: schedules food, food, then boar on the next three rounds', () => {
    const response = takeDayLaborer(5)
    expect(futureRounds(response.state, 'D147_TrapBuilder', 'food')).toEqual([6, 7])
    expect(futureRounds(response.state, 'D147_TrapBuilder', 'boar')).toEqual([8])
  })

  it('D147 S2: OA clamps all three future goods onto round fourteen', () => {
    const response = takeDayLaborer(13)
    expect(futureRounds(response.state, 'D147_TrapBuilder', 'food')).toEqual([14, 14])
    expect(futureRounds(response.state, 'D147_TrapBuilder', 'boar')).toEqual([14])
  })
})

describe('D098 Transactor parity', () => {
  const finishRound = (round: number) => {
    const session = setupOccupation('D098_Transactor', { played: true, round, resources: { food: 20 } })
    for (const space of session.state.actionSpaces) {
      space.resources.wood = 0
      space.resources.clay = 0
      space.resources.reed = 0
      space.resources.stone = 0
    }
    setSpaceResource(session.state, 'forest', 'wood', 2)
    setSpaceResource(session.state, 'clay-pit', 'clay', 3)
    setSpaceResource(session.state, 'fishing', 'food', 4)
    session.loadState(session.state)
    prepareRoundEnd(session)
    return { session, response: session.performRoundEnd() }
  }

  it('D098 S1: before the final harvest collects all board building resources', () => {
    const { response } = finishRound(14)
    expect(response.state.players[0]!.resources).toMatchObject({ wood: 2, clay: 3 })
    expect(response.state.actionSpaces.find((space) => space.id === 'forest')!.resources.wood).toBe(0)
    expect(response.state.actionSpaces.find((space) => space.id === 'fishing')!.resources.food).toBe(4)
  })

  it('D098 S2: OA auto-collects and exposes no decline choice', () => {
    const { response } = finishRound(14)
    expect(response.state.players[0]!.resources.wood).toBe(2)
    expect(response.interaction.stateId === 'wait'
      ? response.interaction.request.options?.some((option) => option.value === '__skip__' && option.sourceCard === 'D098_Transactor')
      : false).toBe(false)
  })

  it('D098 S3: does not collect before a nonfinal harvest', () => {
    const { response } = finishRound(13)
    expect(response.state.players[0]!.resources.wood).toBe(0)
    expect(response.state.actionSpaces.find((space) => space.id === 'forest')!.resources.wood).toBeGreaterThanOrEqual(2)
  })
})

describe('D093 Sheep Inspector parity', () => {
  const setup = (priorSpace = 'forest') => {
    const session = setupOccupation('D093_SheepInspector', {
      played: true, round: 5, resources: { sheep: 1, food: 2 }, workers: 2,
    })
    occupy(session.state, priorSpace)
    session.loadState(session.state)
    return session
  }

  it('D093 S1: may pay and return a prior non-Meeting-Place person home', () => {
    const session = setup()
    let response = chooseNonSkip(session, session.takeAction(0, 'day-laborer'), 'D093_SheepInspector')
    if (response.interaction.stateId === 'wait') {
      const forest = response.interaction.request.options?.find((option) => option.value === 'forest')
      if (forest) response = session.resolveChoice(response.interaction.playerIndex, forest.value)
    }
    expect(response.state.players[0]!.resources).toMatchObject({ sheep: 0, food: 2 })
    expect(response.state.actionSpaces.find((space) => space.id === 'forest')!.takenBy).toHaveLength(0)
  })

  it('D093 S2: declining leaves the prior worker and resources unchanged', () => {
    const session = setup()
    const response = chooseSkip(session, session.takeAction(0, 'day-laborer'), 'D093_SheepInspector')
    expect(response.state.players[0]!.resources).toMatchObject({ sheep: 1, food: 4 })
    expect(response.state.actionSpaces.find((space) => space.id === 'forest')!.takenBy).toHaveLength(1)
  })

  it('D093 S3: Meeting Place is never offered as a recalled worker location', () => {
    const response = setup('meeting-place').takeAction(0, 'day-laborer')
    expect(response.interaction.stateId === 'wait' ? response.interaction.sourceCard : undefined)
      .not.toBe('D093_SheepInspector')
  })
})

describe('D118 Bonehead parity', () => {
  it('D118 S1: OA triggers both onBuy and after-occupation and receives two wood', () => {
    const response = playOccupation(setupOccupation('D118_Bonehead'), 'D118_Bonehead')
    expect(response.state.players[0]!.resources.wood).toBe(2)
    expect(getCardStack(response.state.players[0]!, 'D118_Bonehead')).toEqual([
      'wood', 'wood', 'wood', 'wood',
    ])
  })

  const laterOccupation = (stack: string[]) => {
    const session = setupOccupation('D118_Bonehead', { played: true, resources: { food: 1 } })
    session.state.players[0]!.cardStates.D118_Bonehead = { stack }
    session.state.players[0]!.occupationHand = ['A116_WoodCutter']
    session.loadState(session.state)
    return resolveTriggerIfPresent(session, playOccupation(session, 'A116_WoodCutter'), 'D118_Bonehead')
  }

  it('D118 S2: playing a later occupation receives one wood from Bonehead', () => {
    const response = laterOccupation(['wood', 'wood', 'wood', 'wood', 'wood'])
    expect(response.state.players[0]!.resources.wood).toBe(1)
    expect(getCardStack(response.state.players[0]!, 'D118_Bonehead')).toHaveLength(4)
  })

  it('D118 S3: an empty Bonehead stack grants no wood', () => {
    const response = laterOccupation([])
    expect(response.state.players[0]!.resources.wood).toBe(0)
  })
})
