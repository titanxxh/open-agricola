import { afterEach, describe, expect, it } from 'vitest'
import { GameSession, type SessionResponse } from '../game/authoritative-session'
import { stabilizeRandomHands } from './_helpers/stabilize-random-hands'
import { resolveTriggerIfPresent } from './_helpers/trigger-select'
import { createWorkSession } from './_helpers/session-fixtures'
import { familySize, markAllWorkersUsed, setActiveWorkerCount, setWorkersAtHome, workersAvailable } from '../../shared/domain/player'
import type { GameState, Resource } from '../../shared/contract/types'

import '../../shared/cards/C/C003_CarriageTrip'
import '../../shared/cards/C/C009_AutomaticWaterTrough'
import '../../shared/cards/C/C010_BunkBeds'
import '../../shared/cards/C/C029_BeerTable'
import '../../shared/cards/C/C041_FarmStore'
import '../../shared/cards/C/C043_FarmBuilding'
import '../../shared/cards/C/C066_EternalRyeCultivation'
import '../../shared/cards/C/C075_Firewood'
import '../../shared/cards/A/A074_StableTree'

type CardId =
  | 'C003_CarriageTrip' | 'C009_AutomaticWaterTrough' | 'C010_BunkBeds'
  | 'C029_BeerTable' | 'C041_FarmStore' | 'C043_FarmBuilding'
  | 'C066_EternalRyeCultivation' | 'C075_Firewood' | 'A074_StableTree'

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
  const session = new GameSession(4049, undefined, { playerCount: 2 })
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

const chooseNonSkip = (session: GameSession, response: SessionResponse, sourceCard?: string) => {
  const current = sourceCard ? resolveTriggerIfPresent(session, response, sourceCard) : response
  expect(current.interaction.stateId).toBe('wait')
  if (current.interaction.stateId !== 'wait') throw new Error('expected choice')
  const option = current.interaction.request.options?.find((candidate) => candidate.value !== '__skip__')
  expect(option).toBeDefined()
  return session.resolveChoice(current.interaction.playerIndex, option!.value)
}

const chooseByPreview = (
  session: GameSession,
  response: SessionResponse,
  resource: keyof Resource,
) => {
  expect(response.interaction.stateId).toBe('wait')
  if (response.interaction.stateId !== 'wait') throw new Error('expected choice')
  const option = response.interaction.request.options?.find((candidate) =>
    (candidate.effectPreview?.resourcesGained?.[resource] ?? 0) > 0,
  )
  expect(option).toBeDefined()
  return session.resolveChoice(response.interaction.playerIndex, option!.value)
}

const futureRounds = (state: GameState, cardId: CardId, resource: keyof Resource) =>
  state.futureMeeples.filter((entry) => entry.cardId === cardId && (entry.resources[resource] ?? 0) > 0)
    .flatMap((entry) => Array.from({ length: entry.resources[resource] ?? 0 }, () => entry.round))
    .sort((a, b) => a - b)

const cardBonusScore = (response: SessionResponse, cardId: CardId) =>
  response.scores?.[0]!.categories.find((category) => category.key === 'cardBonusVp')?.entries
    .find((entry) => 'cardId' in entry && entry.cardId === cardId)?.score ?? 0

const prepareRoundEnd = (session: GameSession) => {
  const state = session.getState().state
  state.players.forEach((player) => {
    markAllWorkersUsed(state, player)
    setActiveWorkerCount(player, 2)
    player.resources.food = Math.max(player.resources.food, 20)
  })
  session.loadState(state)
}

describe('C003 Carriage Trip parity', () => {
  const sessions: GameSession[] = []
  afterEach(() => sessions.splice(0).forEach((session) => session.dispose()))

  const setupTrip = () => {
    const session = createWorkSession({
      seed: 4242,
      options: { playerCount: 2 },
      configure(state) {
        state.round = 8
        state.players[0]!.minorHand = ['C003_CarriageTrip', 'B004_WoodPile', 'A006_StorageBarn']
        for (const player of state.players) {
          Object.assign(player.resources, { food: 10, wood: 0, clay: 0, reed: 0, stone: 0, grain: 0, vegetable: 0 })
        }
      },
    })
    sessions.push(session)
    return session
  }

  const tripMenu = (session: GameSession) => {
    let response = session.takeAction(0, 'meeting-place')
    expect(response.ok, response.error).toBe(true)
    expect(response.interaction.stateId).toBe('wait')
    if (response.interaction.stateId !== 'wait' || response.interaction.request.kind !== 'choice') {
      throw new Error('expected Meeting Place choice')
    }
    const action = response.interaction.request.options.find((option) => option.value.startsWith('action-improvement-'))
    if (action) response = session.resolveChoice(0, action.value)
    expect(response.ok, response.error).toBe(true)
    return response
  }

  it('C003 S1: with another person available may place that person immediately', () => {
    const session = setupTrip()
    const initial = session.getState()
    const workersBefore = initial.state.players[0]!.workers.map((worker) => worker.id)
    const spacesBefore = JSON.stringify(initial.state.actionSpaces)
    const resourcesBefore = JSON.stringify(initial.state.players[0]!.resources)
    const logBefore = JSON.stringify(initial.state.log)
    const scoresBefore = JSON.stringify(initial.scores)
    const menu = tripMenu(session)
    expect(workersAvailable(menu.state, menu.state.players[0]!)).toBe(1)
    const bought = session.resolveChoice(0, 'C003_CarriageTrip')
    expect(bought.ok, bought.error).toBe(true)
    let response = chooseNonSkip(session, bought)
    expect(response.ok, response.error).toBe(true)
    if (response.interaction.stateId !== 'wait' || response.interaction.request.kind !== 'choice') {
      throw new Error('expected extra person placement choice')
    }
    expect(response.interaction.promptKey).toBe('ui.interactionPlaceFarmerExtra')
    expect(response.interaction.request.options.map((option) => option.value)).toContain('forest')
    response = session.resolveChoice(0, 'forest')
    expect(response.ok, response.error).toBe(true)
    const first = response.state.actionSpaces.find((space) => space.id === 'meeting-place')!.takenBy
    const extra = response.state.actionSpaces.find((space) => space.id === 'forest')!.takenBy
    expect(first).toHaveLength(1)
    expect(extra).toHaveLength(1)
    expect(first[0]!.workerId).not.toBe(extra[0]!.workerId)
    expect(response.state.players[0]!.workers.map((worker) => worker.id)).toEqual(workersBefore)
    expect(workersAvailable(response.state, response.state.players[0]!)).toBe(0)
    expect(response.state.players[0]!.resources.wood).toBe(3)
    expect(response.state.players[0]!.minorHand).not.toContain('C003_CarriageTrip')
    expect(response.state.players[0]!.minorPlayed).not.toContain('C003_CarriageTrip')
    expect(response.state.players[1]!.minorHand).toContain('C003_CarriageTrip')
    expect(response.state.events.filter((event) => event.type === 'card.passed' && event.cardId === 'C003_CarriageTrip')).toHaveLength(1)
    expect(JSON.stringify(response.scores)).toBe(scoresBefore)

    const undone = session.undoAction()
    expect(undone.ok, undone.error).toBe(true)
    expect(JSON.stringify(undone.state.actionSpaces)).toBe(spacesBefore)
    expect(JSON.stringify(undone.state.players[0]!.resources)).toBe(resourcesBefore)
    expect(JSON.stringify(undone.state.log)).toBe(logBefore)
    expect(JSON.stringify(undone.scores)).toBe(scoresBefore)
    expect(undone.state.players[0]!.workers.map((worker) => worker.id)).toEqual(workersBefore)
    expect(workersAvailable(undone.state, undone.state.players[0]!)).toBe(2)
    expect(undone.state.players[0]!.minorHand).toContain('C003_CarriageTrip')
    expect(undone.state.players[1]!.minorHand).not.toContain('C003_CarriageTrip')

    tripMenu(session)
    chooseNonSkip(session, session.resolveChoice(0, 'C003_CarriageTrip'))
    const replayed = session.resolveChoice(0, 'forest')
    expect(replayed.ok, replayed.error).toBe(true)
    expect(replayed.state.players[0]!.resources.wood).toBe(3)
    expect(replayed.state.players[0]!.workers.map((worker) => worker.id)).toEqual(workersBefore)
    expect(workersAvailable(replayed.state, replayed.state.players[0]!)).toBe(0)
    expect(replayed.state.players[1]!.minorHand.filter((card) => card === 'C003_CarriageTrip')).toHaveLength(1)
  })

  it('C003 S2: extra placement may be declined while the card still passes', () => {
    const session = setupTrip()
    tripMenu(session)
    const response = session.resolveChoice(0, 'C003_CarriageTrip')
    expect(response.ok, response.error).toBe(true)
    expect(workersAvailable(response.state, response.state.players[0]!)).toBe(1)
    const skipped = session.resolveChoice(0, '__skip__')
    expect(skipped.ok, skipped.error).toBe(true)
    expect(skipped.state.players[1]!.minorHand).toContain('C003_CarriageTrip')
    expect(skipped.state.players[0]!.minorHand).not.toContain('C003_CarriageTrip')
    expect(skipped.state.players[0]!.resources).toMatchObject({ wood: 0, food: 10 })
    expect(workersAvailable(skipped.state, skipped.state.players[0]!)).toBe(1)
    expect(skipped.state.events.filter((event) => event.type === 'card.passed' && event.cardId === 'C003_CarriageTrip')).toHaveLength(1)
    expect(skipped.state.actionSpaces.filter((space) => space.takenBy.some((worker) => worker.playerId === skipped.state.players[0]!.id))).toHaveLength(1)
  })

  it('C003 S3: the last person may enter Meeting Place but cannot buy Carriage Trip', () => {
    const session = setupTrip()
    const forest = session.takeAction(0, 'forest')
    expect(forest.ok, forest.error).toBe(true)
    expect(forest.interaction).toMatchObject({ stateId: 'wait', request: { kind: 'confirm-next-player' } })
    expect(session.resolveChoice(1, 'confirm').ok).toBe(true)
    const clay = session.takeAction(1, 'clay-pit')
    expect(clay.ok, clay.error).toBe(true)
    expect(clay.interaction).toMatchObject({ stateId: 'wait', request: { kind: 'confirm-next-player' } })
    expect(session.resolveChoice(0, 'confirm').ok).toBe(true)

    const menu = tripMenu(session)
    expect(workersAvailable(menu.state, menu.state.players[0]!)).toBe(0)
    if (menu.interaction.stateId !== 'wait' || menu.interaction.request.kind !== 'choice') {
      throw new Error('expected minor purchase choice')
    }
    expect(menu.interaction.request.options.map((option) => option.value)).not.toContain('C003_CarriageTrip')
    const before = JSON.stringify({ state: menu.state, interaction: menu.interaction, scores: menu.scores })
    const rejected = session.resolveChoice(0, 'C003_CarriageTrip')
    expect(rejected.ok).toBe(false)
    expect(JSON.stringify({ state: rejected.state, interaction: rejected.interaction, scores: rejected.scores })).toBe(before)
    expect(rejected.state.players[0]!.minorHand).toContain('C003_CarriageTrip')
    expect(rejected.state.players[1]!.minorHand).not.toContain('C003_CarriageTrip')

    const woodBefore = rejected.state.players[0]!.resources.wood
    const alternative = session.resolveChoice(0, 'B004_WoodPile')
    expect(alternative.ok, alternative.error).toBe(true)
    expect(alternative.state.players[0]!.resources.wood).toBe(woodBefore + 1)
    expect(alternative.state.players[0]!.minorHand).toContain('C003_CarriageTrip')
    expect(alternative.state.players[1]!.minorHand).not.toContain('C003_CarriageTrip')
    expect(workersAvailable(alternative.state, alternative.state.players[0]!)).toBe(0)
  })
})

describe('C075 Firewood parity', () => {
  it('C075 S1: each returning-home phase adds one wood to Firewood', () => {
    const session = setupMinor({ cardId: 'C075_Firewood', played: true, round: 3 })
    prepareRoundEnd(session)
    const response = session.performRoundEnd()
    expect(response.state.players[0]!.cardStates.C075_Firewood?.counters?.wood).toBe(1)
  })

  it('C075 S2: after building a Fireplace may take up to four stored wood', () => {
    const session = setupMinor({ cardId: 'C075_Firewood', resources: { clay: 2 }, played: true })
    const player = session.state.players[0]!
    player.cardStates.C075_Firewood = { counters: { wood: 5 } }
    session.state.availableMajorImprovements = ['Major_Fireplace1']
    session.loadState(session.state)
    let response = session.takeAction(0, 'major-improvement')
    response = resolveTriggerIfPresent(session, response, 'C075_Firewood')
    expect(response.interaction.stateId).toBe('wait')
    if (response.interaction.stateId !== 'wait') throw new Error('expected Firewood quantity')
    const four = response.interaction.request.options?.find((option) =>
      option.labelParams?.count === 4 || JSON.stringify(option).includes('4'),
    )
    expect(four).toBeDefined()
    response = session.resolveChoice(0, four!.value)
    expect(response.state.players[0]!.resources.wood).toBe(4)
    expect(response.state.players[0]!.cardStates.C075_Firewood?.counters?.wood).toBe(1)
  })

  it('C075 S3: building a non-cooking major does not remove stored wood', () => {
    const session = setupMinor({
      cardId: 'C075_Firewood', resources: { wood: 1, stone: 3 }, played: true,
    })
    session.state.players[0]!.cardStates.C075_Firewood = { counters: { wood: 2 } }
    session.state.availableMajorImprovements = ['Major_Well']
    session.loadState(session.state)
    const response = session.takeAction(0, 'major-improvement')
    expect(response.state.players[0]!.cardStates.C075_Firewood?.counters?.wood).toBe(2)
  })
})

describe('C066 Eternal Rye Cultivation parity', () => {
  const harvest = (startingGrain: number) => {
    const session = setupMinor({
      cardId: 'C066_EternalRyeCultivation', resources: { grain: startingGrain, food: 20 },
      played: true, round: 4,
    })
    const player = session.state.players[0]!
    player.fields = [{ row: 0, col: 1, stacks: [{ kind: 'grain', remaining: 1 }] }]
    prepareRoundEnd(session)
    return session.performRoundEnd()
  }

  it('C066 S1: ending harvest with exactly two grain gains one food', () => {
    const response = harvest(1)
    expect(response.state.players[0]!.resources).toMatchObject({ grain: 2, food: 17 })
  })

  it('C066 S2: ending harvest with at least three grain gains one additional grain', () => {
    const response = harvest(2)
    expect(response.state.players[0]!.resources).toMatchObject({ grain: 4, food: 16 })
  })

  it('C066 S3: no grain field keeps Eternal Rye Cultivation unavailable', () => {
    expect(cardIsOffered(setupMinor({ cardId: 'C066_EternalRyeCultivation' }), 'C066_EternalRyeCultivation')).toBe(false)
  })
})

describe('C010 Bunk Beds parity', () => {
  const withMajors = (count: number) => {
    const session = setupMinor({ cardId: 'C010_BunkBeds', resources: { wood: 1 } })
    session.state.players[0]!.improvements = ['Major_Fireplace1', 'Major_Well'].slice(0, count)
    session.loadState(session.state)
    return session
  }

  it('C010 S1: two major improvements allow play for one wood', () => {
    const response = playMinor(withMajors(2), 'C010_BunkBeds')
    expect(response.state.players[0]!.minorPlayed).toContain('C010_BunkBeds')
    expect(response.state.players[0]!.resources.wood).toBe(0)
  })

  it('C010 S2: fewer than two major improvements keeps Bunk Beds unavailable', () => {
    expect(cardIsOffered(withMajors(1), 'C010_BunkBeds')).toBe(false)
  })

  it('C010 S3: four rooms with Bunk Beds permit a fifth family member', () => {
    const session = setupMinor({ cardId: 'C010_BunkBeds', played: true, round: 14 })
    const player = session.state.players[0]!
    player.rooms = 4
    player.roomTiles = Array.from({ length: 4 }, (_, index) => ({ row: index, col: 0 }))
    setActiveWorkerCount(player, 4)
    setWorkersAtHome(session.state, player, 4)
    session.loadState(session.state)
    const response = session.takeAction(0, 'urgent-wish-children')
    expect(response.ok, response.error).toBe(true)
    expect(familySize(response.state.players[0]!)).toBe(5)
  })
})

describe('C043 Farm Building parity', () => {
  it('C043 S1: building a major improvement schedules food for the next three rounds', () => {
    const session = setupMinor({ cardId: 'C043_FarmBuilding', resources: { clay: 2 }, played: true, round: 5 })
    session.state.availableMajorImprovements = ['Major_Fireplace1']
    session.loadState(session.state)
    const response = resolveTriggerIfPresent(session, session.takeAction(0, 'major-improvement'), 'C043_FarmBuilding')
    expect(futureRounds(response.state, 'C043_FarmBuilding', 'food')).toEqual([6, 7, 8])
  })

  it('C043 S2: playing a minor improvement schedules no Farm Building food', () => {
    const session = setupMinor({ cardId: 'C043_FarmBuilding', resources: { wood: 1 }, played: true, round: 5 })
    session.state.players[0]!.minorHand = ['A074_StableTree']
    session.loadState(session.state)
    const response = playMinor(session, 'A074_StableTree')
    expect(futureRounds(response.state, 'C043_FarmBuilding', 'food')).toEqual([])
  })
})

describe('C041 Farm Store parity', () => {
  const harvest = (food: number) => {
    const session = setupMinor({ cardId: 'C041_FarmStore', resources: { food }, played: true, round: 4 })
    prepareRoundEnd(session)
    session.state.players[0]!.resources.food = food
    session.loadState(session.state)
    return { session, response: session.performRoundEnd() }
  }

  it('C041 S1: after feeding may pay one remaining food for one vegetable', () => {
    const { session, response } = harvest(5)
    const triggered = resolveTriggerIfPresent(session, response, 'C041_FarmStore')
    const chosen = chooseByPreview(session, triggered, 'vegetable')
    expect(chosen.state.players[0]!.resources).toMatchObject({ food: 0, vegetable: 1 })
  })

  it('C041 S2: after feeding may pay one remaining food for two different building resources', () => {
    const { session, response } = harvest(5)
    const triggered = resolveTriggerIfPresent(session, response, 'C041_FarmStore')
    expect(triggered.interaction.stateId).toBe('wait')
    if (triggered.interaction.stateId !== 'wait') return
    const choice = triggered.interaction.request.options?.find((option) =>
      option.effectPreview?.resourcesGained?.wood === 1 && option.effectPreview.resourcesGained.clay === 1,
    )
    expect(choice).toBeDefined()
    const chosen = session.resolveChoice(0, choice!.value)
    expect(chosen.state.players[0]!.resources).toMatchObject({ food: 0, wood: 1, clay: 1 })
  })

  it('C041 S3: OA skips Farm Store when no food remains after feeding', () => {
    const { response } = harvest(4)
    expect(response.interaction.stateId === 'wait' ? response.interaction.sourceCard : undefined).not.toBe('C041_FarmStore')
    expect(response.state.players[0]!.resources).toMatchObject({ food: 0, vegetable: 0 })
  })
})

describe('C009 Automatic Water Trough parity', () => {
  const trough = (capacity: boolean) => {
    const session = setupMinor({ cardId: 'C009_AutomaticWaterTrough', resources: { wood: 1, food: 2 } })
    const player = session.state.players[0]!
    player.houseAnimals = Object.fromEntries(player.roomTiles.slice(0, capacity ? 0 : 1).map(tile => [`${tile.row}-${tile.col}`, capacity ? null : 'sheep']));
    player.resources.sheep = capacity ? 0 : 1
    session.loadState(session.state)
    return session
  }

  const chooseAnimal = (animal: 'sheep' | 'boar') => {
    const session = trough(true)
    let response = playMinor(session, 'C009_AutomaticWaterTrough')
    expect(response.interaction.stateId).toBe('wait')
    if (response.interaction.stateId !== 'wait') throw new Error('expected animal choice')
    const option = response.interaction.request.options?.find((candidate) =>
      candidate.effectPreview?.resourcesGained?.[animal] === 1,
    )
    expect(option).toBeDefined()
    response = session.resolveChoice(0, option!.value)
    if (response.interaction.stateId === 'wait' && response.interaction.request.kind === 'animal-reorg') {
      const house = response.interaction.request.zones.find((zone) => zone.zoneType === 'house')
      response = session.resolveChoice(0, 'confirm', {
        zones: [{ ...house!, animalType: animal, animalCount: 1 }],
      })
    }
    return response
  }

  it('C009 S1: may take one sheep for free and passes', () => {
    const response = chooseAnimal('sheep')
    expect(response.state.players[0]!.resources).toMatchObject({ food: 2, sheep: 1 })
    expect(response.state.players[1]!.minorHand).toContain('C009_AutomaticWaterTrough')
  })

  it('C009 S2: may pay one food for one pig', () => {
    const response = chooseAnimal('boar')
    expect(response.state.players[0]!.resources).toMatchObject({ food: 1, boar: 1 })
  })

  it('C009 S3: with no animal capacity passes without offering an animal', () => {
    const response = playMinor(trough(false), 'C009_AutomaticWaterTrough')
    expect(response.interaction.stateId === 'wait' ? response.interaction.sourceCard : undefined).not.toBe('C009_AutomaticWaterTrough')
    expect(response.state.players[1]!.minorHand).toContain('C009_AutomaticWaterTrough')
  })
})

describe('C029 Beer Table parity', () => {
  const beer = (played: boolean, grain: number) => {
    const session = setupMinor({
      cardId: 'C029_BeerTable', resources: { wood: 2, grain, food: 20 }, played, round: 4,
    })
    session.state.players[0]!.fields = [{ row: 0, col: 1, stacks: [{ kind: 'grain', remaining: 1 }] }]
    session.loadState(session.state)
    return session
  }

  it('C029 S1: no grain in supply allows play for two wood', () => {
    const response = playMinor(beer(false, 0), 'C029_BeerTable')
    expect(response.state.players[0]!.minorPlayed).toContain('C029_BeerTable')
    expect(response.state.players[0]!.resources.wood).toBe(0)
  })

  it('C029 S2: grain already in supply keeps Beer Table unavailable', () => {
    const session = beer(false, 1)
    expect(cardIsOffered(session, 'C029_BeerTable')).toBe(false)
    const response = playMinor(beer(false, 1), 'C029_BeerTable')
    expect(response.state.players[0]!.minorPlayed).not.toContain('C029_BeerTable')
    expect(response.state.players[0]!.resources).toMatchObject({ wood: 2, grain: 1 })
  })

  it('C029 S3: after reaping grain may pay it for two bonus points and one food per opponent', () => {
    const session = beer(true, 0)
    prepareRoundEnd(session)
    let response = session.performRoundEnd()
    response = resolveTriggerIfPresent(session, response, 'C029_BeerTable')
    response = chooseNonSkip(session, response)
    expect(response.state.players[0]!.resources.grain).toBe(0)
    expect(cardBonusScore(response, 'C029_BeerTable')).toBe(2)
    expect(response.state.players[1]!.resources.food).toBe(17)
  })
})
