import { describe, expect, it } from 'vitest'
import { GameSession, type SessionResponse } from '../game/authoritative-session'
import {
  markAllWorkersUsed,
  setActiveWorkerCount,
  setNewbornCount,
  setWorkersAtHome,
} from '../../shared/domain/player'
import { stabilizeRandomHands } from './_helpers/stabilize-random-hands'
import { autoAdvanceRoundEnd } from '../../tests/llm-card-gen/session-helpers'
import { readCardExtraData } from '../../shared/cards/helpers/card-state'

import '../../shared/cards/E/E030_ChildsToy'
import '../../shared/cards/E/E036_HerbalGarden'
import '../../shared/cards/E/E074_AshTrees'
import '../../shared/cards/E/E080_RockGarden'

type CardId = 'E030_ChildsToy' | 'E036_HerbalGarden' | 'E074_AshTrees' | 'E080_RockGarden'

const setupMinor = (cardId: CardId, {
  played = false,
  resources = {},
}: {
  played?: boolean
  resources?: { wood?: number; clay?: number; grain?: number; stone?: number; food?: number }
} = {}) => {
  const session = new GameSession(36, undefined, { playerCount: 2 })
  stabilizeRandomHands(session.state.players)
  const state = session.getState().state
  state.currentPlayerIndex = 0
  state.round = 5
  state.roundPhase = 'work'
  state.players.forEach((player) => {
    player.minorHand = ['__test_placeholder__']
    player.occupationHand = ['__test_placeholder__']
  })
  const player = state.players[0]!
  setWorkersAtHome(state, player, 2)
  player.minorHand = played ? ['__test_placeholder__'] : [cardId]
  player.minorPlayed = played ? [cardId] : []
  player.resources = {
    ...player.resources,
    wood: 0,
    clay: 0,
    grain: 0,
    stone: 0,
    food: 0,
    ...resources,
  }
  session.loadState(state)
  return session
}

const enterImprovementChoice = (session: GameSession) => {
  let response = session.takeAction(0, 'major-improvement')
  if (response.interaction.stateId !== 'wait') return response
  const option = response.interaction.request.options?.find((candidate) => {
    return candidate.value.startsWith('action-improvement-')
  })
  if (option) response = session.resolveChoice(0, option.value)
  return response
}

const playMinor = (session: GameSession, cardId: CardId): SessionResponse => {
  let response = enterImprovementChoice(session)
  if (!response.state.players[0]!.minorHand.includes(cardId)) return response
  if (response.interaction.stateId !== 'wait') return response
  const option = response.interaction.request.options?.find((candidate) => candidate.value === cardId)
  expect(option).toBeDefined()
  if (option) response = session.resolveChoice(0, option.value)
  return response
}

const cardIsOffered = (session: GameSession, cardId: CardId) => {
  const response = enterImprovementChoice(session)
  return response.interaction.stateId === 'wait' &&
    (response.interaction.request.options?.some((candidate) => candidate.value === cardId) ?? false)
}

const pasture = (
  id: string,
  tiles: { row: number; col: number }[],
  animalCount = 0,
) => ({
  id,
  tiles,
  size: tiles.length,
  stables: 0,
  animalType: animalCount > 0 ? 'sheep' as const : null,
  animalCount,
})

describe('E036 Herbal Garden parity', () => {
  it('E036 S1: Herbal Garden costs one wood, requires a pasture, and scores two points', () => {
    const session = setupMinor('E036_HerbalGarden', { resources: { wood: 1 } })
    session.state.players[0]!.pastures = [pasture('p1', [{ row: 1, col: 1 }])]

    const response = playMinor(session, 'E036_HerbalGarden')

    expect(response.ok, response.error).toBe(true)
    expect(response.state.players[0]!.resources.wood).toBe(0)
    expect(response.state.players[0]!.minorPlayed).toContain('E036_HerbalGarden')
    expect(response.scores[0]!.categories.find((category) => category.key === 'cards')?.entries)
      .toContainEqual(expect.objectContaining({ cardId: 'E036_HerbalGarden', score: 2 }))
  })

  it('E036 S2: Herbal Garden is unavailable without a pasture', () => {
    expect(cardIsOffered(
      setupMinor('E036_HerbalGarden', { resources: { wood: 1 } }),
      'E036_HerbalGarden',
    )).toBe(false)
  })

  it('E036 S3: playing Herbal Garden with animals in the only pasture forces reorganization', () => {
    const session = setupMinor('E036_HerbalGarden', { resources: { wood: 1 } })
    session.state.players[0]!.pastures = [pasture('p1', [{ row: 1, col: 1 }], 1)]

    const response = playMinor(session, 'E036_HerbalGarden')

    expect(response.ok, response.error).toBe(true)
    expect(response.interaction.stateId === 'wait' ? response.interaction.request.kind : undefined)
      .toBe('animal-reorg')
    expect(response.state.players[0]!.pastures[0]!.animalCount).toBe(1)
  })

  it('E036 S4: an already-empty second pasture satisfies Herbal Garden without reorganization', () => {
    const session = setupMinor('E036_HerbalGarden', { resources: { wood: 1 } })
    session.state.players[0]!.pastures = [
      pasture('p1', [{ row: 1, col: 1 }], 1),
      pasture('p2', [{ row: 1, col: 2 }]),
    ]

    const response = playMinor(session, 'E036_HerbalGarden')

    expect(response.ok, response.error).toBe(true)
    expect(response.interaction.stateId === 'wait' ? response.interaction.request.kind : undefined)
      .not.toBe('animal-reorg')
    expect(response.state.players[0]!.pastures[0]!.animalCount).toBe(1)
  })
})

const addPlantedFields = (session: GameSession, count: number) => {
  session.state.players[0]!.fields = Array.from({ length: count }, (_, index) => ({
    row: 0,
    col: index + 2,
    stacks: [{ kind: 'grain' as const, remaining: 1 }],
  }))
}

const edgesForTile = (row: number, col: number) => [
  `H-${row}-${col}`,
  `H-${row + 1}-${col}`,
  `V-${row}-${col}`,
  `V-${row}-${col + 1}`,
]

const ashTreesSession = (wood: number) => {
  const session = setupMinor('E074_AshTrees', { played: true, resources: { wood } })
  addPlantedFields(session, 2)
  session.state.players[0]!.cardStates = {
    ...session.state.players[0]!.cardStates,
    E074_AshTrees: { counters: { fences: 5 } },
  }
  session.loadState(session.state)
  return session
}

describe('E074 Ash Trees parity', () => {
  it('E074 S1: two planted fields let Ash Trees store five fences on play', () => {
    const session = setupMinor('E074_AshTrees')
    addPlantedFields(session, 2)

    const response = playMinor(session, 'E074_AshTrees')

    expect(response.ok, response.error).toBe(true)
    expect(response.state.players[0]!.minorPlayed).toContain('E074_AshTrees')
    expect(response.state.players[0]!.cardStates?.E074_AshTrees?.counters?.fences).toBe(5)
  })

  it('E074 S2: fewer than two planted fields keeps Ash Trees unavailable', () => {
    const session = setupMinor('E074_AshTrees')
    addPlantedFields(session, 1)

    expect(cardIsOffered(session, 'E074_AshTrees')).toBe(false)
  })

  it('E074 S3: four Ash Trees fences build a one-cell pasture for no wood', () => {
    const session = ashTreesSession(0)
    let response = session.takeAction(0, 'fencing')
    const useFour = response.interaction.stateId === 'wait'
      ? response.interaction.request.options?.find((option) => option.labelParams?.count === 4)
      : undefined
    expect(useFour).toBeDefined()
    response = session.resolveChoice(0, useFour!.value)
    response = session.commitSelectionChoice(0, { edges: edgesForTile(1, 2), extraWood: 0 })

    expect(response.ok, response.error).toBe(true)
    expect(response.state.players[0]!.resources.wood).toBe(0)
    expect(response.state.players[0]!.cardStates?.E074_AshTrees?.counters?.fences).toBe(1)
    expect(response.state.players[0]!.fenceSegments).toHaveLength(4)
  })

  it('E074 S4: declining Ash Trees spends four wood and preserves all stored fences', () => {
    const session = ashTreesSession(4)
    let response = session.takeAction(0, 'fencing')
    response = session.resolveChoice(0, '__skip__')
    response = session.commitSelectionChoice(0, { edges: edgesForTile(1, 2), extraWood: 0 })

    expect(response.ok, response.error).toBe(true)
    expect(response.state.players[0]!.resources.wood).toBe(0)
    expect(response.state.players[0]!.cardStates?.E074_AshTrees?.counters?.fences).toBe(5)
  })
})

describe('E030 Childs Toy parity', () => {
  it('E030 S1: exactly two adults can play Childs Toy for one wood and score two points', () => {
    const response = playMinor(
      setupMinor('E030_ChildsToy', { resources: { wood: 1 } }),
      'E030_ChildsToy',
    )

    expect(response.ok, response.error).toBe(true)
    expect(response.state.players[0]!.resources.wood).toBe(0)
    expect(response.state.players[0]!.minorPlayed).toContain('E030_ChildsToy')
    expect(response.scores[0]!.categories.find((category) => category.key === 'cards')?.entries)
      .toContainEqual(expect.objectContaining({ cardId: 'E030_ChildsToy', score: 2 }))
  })

  it('E030 S2: exactly two adults can alternatively pay one clay for Childs Toy', () => {
    const response = playMinor(
      setupMinor('E030_ChildsToy', { resources: { clay: 1 } }),
      'E030_ChildsToy',
    )

    expect(response.ok, response.error).toBe(true)
    expect(response.state.players[0]!.resources.clay).toBe(0)
  })

  it('E030 S3: three adults keep Childs Toy unavailable', () => {
    const session = setupMinor('E030_ChildsToy', { resources: { wood: 1 } })
    setActiveWorkerCount(session.state.players[0]!, 3)
    setNewbornCount(session.state.players[0]!, 0)

    expect(cardIsOffered(session, 'E030_ChildsToy')).toBe(false)
  })

  it('E030 S4: Childs Toy makes a newborn require two food during harvest', () => {
    const harvest = (played: boolean) => {
      const session = new GameSession(30, undefined, { playerCount: 2 })
      stabilizeRandomHands(session.state.players)
      const state = session.getState().state
      state.round = 4
      state.roundPhase = 'work'
      state.players.forEach((player, index) => {
        setActiveWorkerCount(player, index === 0 ? 3 : 2)
        setNewbornCount(player, index === 0 ? 1 : 0)
        markAllWorkersUsed(state, player)
        player.resources.food = index === 0 ? 5 : 10
      })
      if (played) state.players[0]!.minorPlayed = ['E030_ChildsToy']
      session.loadState(state)
      return autoAdvanceRoundEnd(session)
    }

    expect(harvest(true).state.players[0]!.resources).toMatchObject({ food: 0, begging: 1 })
    expect(harvest(false).state.players[0]!.resources).toMatchObject({ food: 0, begging: 0 })
  })
})

const rockGardenSession = (stone: number, grain = 0) => {
  const session = setupMinor('E080_RockGarden', { played: true, resources: { stone, grain, food: 8 } })
  session.state.roundActionOrder[session.state.round - 1] = 'grain-utilization'
  session.loadState(session.state)
  return session
}

const sowRockGarden = (session: GameSession) => {
  let response = session.takeAction(0, 'grain-utilization')
  expect(response.interaction.stateId).toBe('wait')
  if (response.interaction.stateId !== 'wait') throw new Error('expected sow interaction')
  const fields = response.interaction.request.farm.selectableFields
    .filter((field) => field.sourceCard === 'E080_RockGarden')
  response = session.commitSelectionChoice(0, {
    crops: fields.map((field) => ({ ...field.tile, crop: 'stone' as const })),
  })
  return response
}

describe('E080 Rock Garden parity', () => {
  it('E080 S1: Rock Garden is free to play and stays in play as a field card', () => {
    const response = playMinor(setupMinor('E080_RockGarden'), 'E080_RockGarden')

    expect(response.ok, response.error).toBe(true)
    expect(response.state.players[0]!.minorPlayed).toContain('E080_RockGarden')
  })

  it('E080 S2: Rock Garden sows three stones as three vegetable-like stacks', () => {
    const response = sowRockGarden(rockGardenSession(3))

    expect(response.ok, response.error).toBe(true)
    expect(response.state.players[0]!.resources.stone).toBe(0)
    expect(readCardExtraData(response.state.players[0]!, 'E080_RockGarden', 'cardFieldStacks'))
      .toEqual(Array.from({ length: 3 }, () => ({ crop: 'stone', remaining: 2 })))
  })

  it('E080 S3: Rock Garden rejects non-stone crops', () => {
    const session = rockGardenSession(1, 1)
    const selection = session.takeAction(0, 'grain-utilization')
    expect(selection.interaction.stateId).toBe('wait')
    if (selection.interaction.stateId !== 'wait') throw new Error('expected sow interaction')
    const field = selection.interaction.request.farm.selectableFields
      .find((candidate) => candidate.sourceCard === 'E080_RockGarden')!

    const response = session.commitSelectionChoice(0, { crops: [{ ...field.tile, crop: 'grain' }] })

    expect(response.ok).toBe(false)
    expect(response.state.players[0]!.resources).toMatchObject({ stone: 1, grain: 1 })
  })

  it('E080 S4: a full Rock Garden yields three stone at harvest but counts as one field', () => {
    const session = rockGardenSession(3)
    const sown = sowRockGarden(session)
    sown.state.round = 4
    sown.state.roundPhase = 'work'
    sown.state.players.forEach((player) => {
      markAllWorkersUsed(sown.state, player)
      player.resources.food = 8
    })
    session.loadState(sown.state)

    const response = autoAdvanceRoundEnd(session)

    expect(response.state.players[0]!.resources.stone).toBe(3)
    expect(readCardExtraData(response.state.players[0]!, 'E080_RockGarden', 'cardFieldStacks'))
      .toEqual(Array.from({ length: 3 }, () => ({ crop: 'stone', remaining: 1 })))
    expect(response.scores[0]!.categories.find((category) => category.key === 'fields')?.total).toBe(-1)
  })
})
