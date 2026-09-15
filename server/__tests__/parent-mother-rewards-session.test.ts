import { describe, expect, it } from 'vitest'
import { GameSession } from '../game/authoritative-session'
import { markAllWorkersUsed } from '../../shared/domain/player'
import { getAllTilePositions } from '../../shared/domain/farm'
import { getAvailableStableSupplyCount } from '../../shared/domain/supply-tokens'
import { emptyResources } from '../../shared/session/state-bootstrap'
import { rehydrateState, serializeSessionSnapshot } from '../../shared/session/serialization'
import type { MotherParentCardId } from '../../shared/parents/types'

const snapshot = <T>(value: T): T => JSON.parse(JSON.stringify(value))

const printedMothers = [
  ['PR01', 2, 'stable', -0.75], ['PR02', 12, 'field', -0.25],
  ['PR03', 8, 'cattle', 0], ['PR04', 7, 'boar', 0.1], ['PR05', 4, 'sheep', 0.2],
  ['PR06', 7, 'vegetable', 0.3], ['PR07', 4, 'grain', 0.4], ['PR08', 3, 'stone', 0.5],
  ['PR09', 5, 'reed', 0.6], ['PR10', 1, 'wood', 0.7], ['PR11', 1, 'food', 0.8], ['PR12', 1, 'clay', 0.9],
] as const

const setup = (mother: MotherParentCardId, other: MotherParentCardId = mother === 'PR10' ? 'PR12' : 'PR10') => {
  const session = new GameSession(56124, undefined, {
    playerCount: 2, enableParentCards: true, parentSelectionSeed: 9001,
    enableThroughTheSeasons: false, enableFarmersOfTheMoor: false,
  })
  for (const player of session.state.players) {
    player.minorHand = ['__test_placeholder__']
    player.occupationHand = ['__test_placeholder__']
    player.resources = { ...emptyResources, food: 50 }
  }
  const discarded = printedMothers.map(([id]) => id).filter((id) => id !== mother && id !== other)
  session.state.parentSelection!.candidates = {
    p1: { mother: [mother, discarded[0]!], father: ['PS01', 'PS03'] },
    p2: { mother: [other, discarded[1]!], father: ['PS02', 'PS04'] },
  }
  expect(session.loadState(session.state).ok).toBe(true)
  const first = session.submitParentSelection(0, { mother, father: 'PS01' })
  expect(first.ok, first.error).toBe(true)
  expect(first.state.phase).toBe('parent-selection')
  expect(first.state.futureMeeples).toEqual([])
  expect(first.state.players.map((player) => player.resources)).toEqual([
    { ...emptyResources, food: 50 }, { ...emptyResources, food: 50 },
  ])
  const response = session.submitParentSelection(1, { mother: other, father: 'PS02' })
  expect(response.ok, response.error).toBe(true)
  expect(response.state.phase).toBe('playing')
  expect(response.state.players.map((player) => player.parentCards)).toEqual([
    { mother, father: 'PS01' }, { mother: other, father: 'PS02' },
  ])
  return session
}

const settleRoundEnd = (session: GameSession, resolveAnimals?: () => ReturnType<GameSession['getState']>) => {
  const before = session.state.round
  for (const player of session.state.players) markAllWorkersUsed(session.state, player)
  expect(session.loadState(session.state).ok).toBe(true)
  let response = session.performRoundEnd()
  for (let step = 0; step < 30 && response.state.round === before && !response.state.gameOver; step++) {
    expect(response.ok, response.error).toBe(true)
    const request = response.interaction.request
    if (request.kind === 'animal-reorg' && resolveAnimals) {
      response = resolveAnimals()
    } else if (request.kind === 'feed') {
      response = session.resolveChoice(response.interaction.playerIndex, 'confirm', { selections: [] })
    } else if (request.kind === 'choice') {
      expect(request.options.map((option) => option.value)).toContain('__skip__')
      response = session.resolveChoice(response.interaction.playerIndex, '__skip__')
    } else if (request.kind === 'confirm-next-player' || request.kind === 'confirm-player-switch') {
      response = session.resolveChoice(response.interaction.playerIndex, 'confirm')
    } else {
      throw new Error(`unexpected round-end interaction: ${JSON.stringify(response.interaction)}`)
    }
  }
  expect(response.ok, response.error).toBe(true)
  expect(response.state.gameOver || response.state.round === before + 1).toBe(true)
  return response
}

const enterRound = (session: GameSession, round: number) => {
  session.state.round = round - 1
  return settleRoundEnd(session)
}

const accept = (session: GameSession) => {
  const prompt = session.getState()
  expect(prompt.interaction).toMatchObject({ stateId: 'wait', playerIndex: 0, request: { kind: 'choice' } })
  const option = prompt.interaction.request.options.find((entry) => entry.value !== '__skip__')!
  expect(option).toBeDefined()
  const response = session.resolveChoice(0, option.value)
  expect(response.ok, response.error).toBe(true)
  expect(response.interaction.request.kind).toBe('farm-select')
  return response
}

const restore = (session: GameSession) => {
  const saved = JSON.parse(JSON.stringify(serializeSessionSnapshot(session.state, session)))
  const restored = new GameSession(56124, undefined, { playerCount: 2 })
  const response = restored.loadState(rehydrateState(saved))
  expect(response.ok, response.error).toBe(true)
  expect(response.interaction).toEqual(session.getState().interaction)
  expect(response.state.futureMeeples).toEqual(session.state.futureMeeples)
  return restored
}

const house = (session: GameSession, animal: 'sheep' | 'boar' | 'cattle') => {
  expect(session.getState().interaction).toMatchObject({ stateId: 'wait', playerIndex: 0, request: { kind: 'animal-reorg' } })
  const response = session.resolveChoice(0, 'confirm', { zones: [
    { id: 'house', zoneType: 'house', animalType: animal, animalCount: 1 },
  ] })
  expect(response.ok, response.error).toBe(true)
  expect(response.state.players[0]).toMatchObject({ houseAnimalType: animal, houseAnimalCount: 1 })
  return response
}

const finish = (session: GameSession) => {
  session.state.round = 14
  const response = settleRoundEnd(session)
  expect(response.state.gameOver).toBe(true)
  expect(response.interaction.stateId).toBe('gameover')
  expect(response.scores).toHaveLength(2)
  expect(response.state.events.some((event) => event.type.startsWith('harvest.'))).toBe(true)
  return response
}

const scheduled = (session: GameSession, cardId: MotherParentCardId) =>
  session.state.events.filter((event) => event.type === 'parent.motherScheduled' && event.cardId === cardId)

const stableTotal = (session: GameSession) => {
  const player = session.state.players[0]!
  const reserved = session.state.futureMeeples.filter((entry) => entry.playerId === player.id)
    .reduce((count, entry) => count + (entry.resources.stable ?? 0), 0)
  return getAvailableStableSupplyCount(session.state, player) + player.stableTiles.length + reserved + (player.supplyTokensConsumed?.stable ?? 0)
}

describe('Parents batch 1 mother printed-rule audit', () => {
  it.each(printedMothers)('%s schedules round %i %s for its owner and resolves once across real round boundaries', (cardId, round, reward) => {
    const session = setup(cardId)
    const player = session.state.players[0]!
    expect(scheduled(session, cardId)).toEqual([expect.objectContaining({ playerId: 'p1', targetRound: round, reward })])
    expect(session.state.log).toContainEqual(expect.objectContaining({ key: 'log.parentMotherScheduled', params: {
      player: player.name, cardId, round, reward,
    } }))
    if (round > 1) {
      expect(session.state.futureMeeples.filter((entry) => entry.cardId === cardId)).toEqual([
        expect.objectContaining({ playerId: 'p1', round, resources: { [reward]: 1 } }),
      ])
      if (round > 2) enterRound(session, round - 1)
      expect(session.getState().interaction.stateId).toBe('idle')
      expect(session.state.players[0]!.stableTiles).toEqual([])
      expect(session.state.players[0]!.fields).toEqual([])
      if (reward !== 'stable' && reward !== 'field') expect(session.state.players[0]!.resources[reward]).toBe(0)
      enterRound(session, round)
    }
    const otherBefore = structuredClone(session.state.players[1])
    expect(otherBefore!.resources).toMatchObject({
      wood: cardId === 'PR10' ? 0 : 1, clay: cardId === 'PR10' ? 1 : 0,
      reed: 0, stone: 0, grain: 0, vegetable: 0, sheep: 0, boar: 0, cattle: 0,
    })
    if (cardId === 'PR11') expect(otherBefore!.resources.food).toBe(50)
    if (reward === 'stable' || reward === 'field') {
      const prompt = accept(session)
      const tile = prompt.interaction.request.farm.selectableTiles[0]!
      const placed = session.commitSelectionChoice(0, reward === 'stable' ? { stables: [tile] } : { tile })
      expect(placed.ok, placed.error).toBe(true)
      expect(reward === 'stable' ? placed.state.players[0]!.stableTiles : placed.state.players[0]!.fields).toContainEqual(expect.objectContaining(tile))
    } else {
      expect(session.state.players[0]!.resources[reward]).toBe(reward === 'food' ? 51 : 1)
      if (reward === 'sheep' || reward === 'boar' || reward === 'cattle') house(session, reward)
    }
    expect(session.state.players[1]).toEqual(otherBefore)
    expect(session.state.futureMeeples.filter((entry) => entry.cardId === cardId)).toEqual([])
    expect(session.getState().interaction.stateId).toBe('idle')
    const before = structuredClone(session.state.players[0])
    const receivedEvents = session.state.events.filter((event) => event.type === 'resource.moved' && event.reason === 'receive' && event.sourceCardId === cardId)
    expect(receivedEvents).toHaveLength(reward === 'stable' || reward === 'field' ? 0 : 1)
    if (reward !== 'stable' && reward !== 'field') expect(receivedEvents[0]).toMatchObject({
      resources: { [reward]: 1 }, from: { kind: 'roundCard', round }, to: { kind: 'player', playerId: 'p1' },
    })
    expect(session.takeAction(0, 'day-laborer').ok).toBe(true)
    const confirm = session.getState().interaction
    if (confirm.request.kind === 'confirm-next-player') expect(session.resolveChoice(confirm.playerIndex, 'confirm').ok).toBe(true)
    enterRound(session, round + 1)
    expect(session.state.players[0]!.stableTiles).toEqual(before.stableTiles)
    expect(session.state.players[0]!.fields).toEqual(before.fields)
    if (reward !== 'stable' && reward !== 'field' && reward !== 'food') expect(session.state.players[0]!.resources[reward]).toBe(before.resources[reward])
    if (reward === 'food') expect(session.state.players[0]!.resources.food).toBe(53)
    expect(session.state.events.filter((event) => event.type === 'resource.moved' && event.reason === 'receive' && event.sourceCardId === cardId)).toEqual(receivedEvents)
    expect(scheduled(session, cardId)).toHaveLength(1)
  })

  it.each([['PR01', 2, 'stable'], ['PR02', 12, 'plow']] as const)(
    '%s rejects occupied placement without spending workers or resources and permits retry', (cardId, round, farmType) => {
      const session = setup(cardId)
      if (cardId === 'PR01') {
        expect(getAvailableStableSupplyCount(session.state, session.state.players[0]!)).toBe(3)
        expect(stableTotal(session)).toBe(4)
      }
      enterRound(session, round)
      const prompt = accept(session)
      expect(prompt.interaction.request.farm.farmType).toBe(farmType)
      const before = snapshot(prompt.state)
      const occupied = before.players[0]!.roomTiles[0]!
      const invalid = session.commitSelectionChoice(0, farmType === 'stable' ? { stables: [occupied] } : { tile: occupied })
      expect(invalid.ok).toBe(false)
      expect(snapshot(invalid.state)).toEqual(before)
      expect(invalid.interaction.request).toEqual(prompt.interaction.request)
      const tile = prompt.interaction.request.farm.selectableTiles[0]!
      const placed = session.commitSelectionChoice(0, farmType === 'stable' ? { stables: [tile] } : { tile })
      expect(placed.ok, placed.error).toBe(true)
      expect(placed.state.players[0]!.resources).toEqual(before.players[0]!.resources)
      expect(placed.state.players[0]!.workers).toEqual(before.players[0]!.workers)
      expect(snapshot(placed.state.actionSpaces)).toEqual(before.actionSpaces)
      expect(placed.state.players[1]).toEqual(before.players[1])
      expect(placed.state.log.length).toBeGreaterThan(before.log.length)
      if (cardId === 'PR01') expect(stableTotal(session)).toBe(4)
    },
  )

  it('PR02 rejects nonadjacent plowing and permits an adjacent retry', () => {
    const session = setup('PR02')
    session.state.players[0]!.fields = [{ row: 0, col: 0, stacks: [] }]
    enterRound(session, 12)
    const prompt = accept(session)
    const before = snapshot(prompt.state)
    const invalid = session.commitSelectionChoice(0, { tile: { row: 2, col: 4 } })
    expect(invalid.ok).toBe(false)
    expect(snapshot(invalid.state)).toEqual(before)
    expect(invalid.interaction.request).toEqual(prompt.interaction.request)
    const placed = session.commitSelectionChoice(0, { tile: { row: 0, col: 1 } })
    expect(placed.ok, placed.error).toBe(true)
    expect(placed.state.players[0]!.fields).toEqual([
      { row: 0, col: 0, stacks: [] }, { row: 0, col: 1, stacks: [] },
    ])
  })

  it.each([['PR01', 2], ['PR02', 12]] as const)('%s can decline without spending or reoffering its reward', (cardId, round) => {
    const session = setup(cardId)
    enterRound(session, round)
    const before = structuredClone(session.state.players)
    const response = session.resolveChoice(0, '__skip__')
    expect(response.ok, response.error).toBe(true)
    expect(response.interaction.stateId).toBe('idle')
    for (const [index, player] of response.state.players.entries()) {
      expect(player.resources).toEqual(before[index]!.resources)
      expect(player.workers).toEqual(before[index]!.workers)
      expect(player.stableTiles).toEqual(before[index]!.stableTiles)
      expect(player.fields).toEqual(before[index]!.fields)
    }
    expect(response.state.futureMeeples.some((entry) => entry.cardId === cardId)).toBe(false)
    if (cardId === 'PR01') {
      expect(getAvailableStableSupplyCount(session.state, session.state.players[0]!)).toBe(4)
      expect(stableTotal(session)).toBe(4)
    }
    enterRound(session, round + 1)
    expect(session.getState().interaction.stateId).toBe('idle')
    expect(session.state.players[0]!.stableTiles).toEqual([])
    expect(session.state.players[0]!.fields).toEqual([])
  })

  it.each([['PR01', 2], ['PR02', 12]] as const)('%s with no eligible farm tile consumes the schedule without a stuck choice', (cardId, round) => {
    const session = setup(cardId)
    const player = session.state.players[0]!
    player.fields = getAllTilePositions().filter((tile) => !player.roomTiles.some((room) => room.row === tile.row && room.col === tile.col))
      .map((tile) => ({ ...tile, stacks: [] }))
    const farm = structuredClone(player.fields)
    const response = enterRound(session, round)
    expect(response.interaction.stateId).toBe('idle')
    expect(response.state.players[0]!.fields).toEqual(farm)
    expect(response.state.players[0]!.stableTiles).toEqual([])
    expect(response.state.players[0]!.resources.wood).toBe(0)
    expect(response.state.futureMeeples.some((entry) => entry.cardId === cardId)).toBe(false)
    if (cardId === 'PR01') expect(stableTotal(session)).toBe(4)
  })

  it('PR01 reserves the fourth stable while the other three are already built', () => {
    const session = setup('PR01')
    session.state.players[0]!.stableTiles = [{ row: 0, col: 0 }, { row: 0, col: 1 }, { row: 0, col: 2 }]
    expect(getAvailableStableSupplyCount(session.state, session.state.players[0]!)).toBe(0)
    expect(stableTotal(session)).toBe(4)
    enterRound(session, 2)
    const prompt = accept(session)
    const response = session.commitSelectionChoice(0, { stables: [prompt.interaction.request.farm.selectableTiles[0]!] })
    expect(response.ok, response.error).toBe(true)
    expect(response.state.players[0]!.stableTiles).toHaveLength(4)
    expect(stableTotal(session)).toBe(4)
  })

  it.each([['PR03', 8, 'cattle'], ['PR04', 7, 'boar'], ['PR05', 4, 'sheep']] as const)(
    '%s houses its animal alongside a pair without breeding or harvesting crops', (cardId, round, animal) => {
      const session = setup(cardId)
      const player = session.state.players[0]!
      player.resources[animal] = 2
      player.pastures = [{ id: 'pen', size: 2, tiles: [{ row: 0, col: 0 }, { row: 0, col: 1 }], stables: 0, animalType: animal, animalCount: 2 }]
      player.fenceSegments = ['H-0-0', 'H-0-1', 'H-1-0', 'H-1-1', 'V-0-0', 'V-0-2'].map((edge) => ({ edge, type: 'fence', source: { kind: 'own', ownerPlayerId: player.id } }))
      player.fields = [{ row: 0, col: 2, stacks: [{ kind: 'grain', remaining: 3 }] }]
      session.state.round = round - 1
      const prompt = settleRoundEnd(session, () => {
        expect(session.state.round).toBe(7)
        expect(session.state.players[0]!.resources.cattle).toBe(3)
        return session.resolveChoice(0, 'confirm', { zones: [
          { id: 'pen', zoneType: 'pasture', animalType: 'cattle', animalCount: 3 },
        ] })
      })
      expect(prompt.interaction).toMatchObject({ playerIndex: 0, request: { kind: 'animal-reorg' } })
      const count = cardId === 'PR03' ? 4 : 3
      expect(prompt.state.players[0]!.resources[animal]).toBe(count)
      const before = snapshot(prompt.state)
      const response = session.resolveChoice(0, 'confirm', { zones: [
        { id: 'pen', zoneType: 'pasture', animalType: animal, animalCount: count },
      ] })
      expect(response.ok, response.error).toBe(true)
      expect(response.interaction.stateId).toBe('idle')
      expect(response.state.roundPhase).toBe('work')
      expect(response.state.players[0]!.pastures[0]!.animalCount).toBe(count)
      expect(response.state.players[0]!.resources).toEqual({ ...emptyResources, food: cardId === 'PR03' ? 46 : 50, grain: cardId === 'PR03' ? 1 : 0, [animal]: count })
      expect(response.state.players[0]!.fields).toEqual([{ row: 0, col: 2, stacks: [{ kind: 'grain', remaining: cardId === 'PR03' ? 2 : 3 }] }])
      expect(response.state.players[1]).toEqual(before.players[1])
      expect(response.state.harvestBreedSummary).toEqual(before.harvestBreedSummary)
      expect(response.state.events.filter((event) => event.type.startsWith('harvest.')))
        .toEqual(before.events.filter((event) => event.type.startsWith('harvest.')))
      expect(response.state.log.length).toBeGreaterThan(before.log.length)
    },
  )

  it.each([['PR03', 8, 'cattle', 3], ['PR04', 7, 'boar', 2], ['PR05', 4, 'sheep', 2]] as const)(
    '%s allows its animal to be cooked with an existing Fireplace instead of housing it', (cardId, round, animal, food) => {
      const session = setup(cardId)
      session.state.players[0]!.improvements = ['Major_Fireplace1']
      session.state.availableMajorImprovements = session.state.availableMajorImprovements.filter((id) => id !== 'Major_Fireplace1')
      enterRound(session, round)
      expect(session.getState().interaction).toMatchObject({ playerIndex: 0, request: { kind: 'animal-reorg' } })
      const before = snapshot(session.state)
      const exchange = session.takeAnytimeAction(0, 'exchange')
      expect(exchange.ok, exchange.error).toBe(true)
      const option = exchange.interaction.request.options.find((entry) => entry.labelParams?.resource === animal || JSON.stringify(entry).includes(animal))!
      expect(option).toBeDefined()
      const cooked = session.resolveChoice(0, `bulk:${option.value.split(':')[1]}=1`)
      expect(cooked.ok, cooked.error).toBe(true)
      expect(cooked.state.players[0]!.resources[animal]).toBe(0)
      expect(cooked.state.players[0]!.resources.food).toBe(before.players[0]!.resources.food + food)
      if (cooked.interaction.request.kind === 'animal-reorg') expect(session.resolveChoice(0, 'confirm', { zones: [] }).ok).toBe(true)
      expect(session.getState().interaction.stateId).toBe('idle')
      expect(session.state.players[1]).toEqual(before.players[1])
      expect(session.state.harvestBreedSummary).toEqual(before.harvestBreedSummary)
      expect(session.state.round).toBe(round)
      expect(session.state.log.length).toBeGreaterThan(before.log.length)
    },
  )

  it.each([['PR03', 8, 'cattle'], ['PR04', 7, 'boar'], ['PR05', 4, 'sheep']] as const)(
    '%s lets an unhouseable animal go without food or breeding and rejects the other responder', (cardId, round, animal) => {
      const session = setup(cardId)
      const resident = animal === 'sheep' ? 'cattle' : 'sheep'
      session.state.players[0]!.houseAnimalType = resident
      session.state.players[0]!.houseAnimalCount = 1
      session.state.players[0]!.resources[resident] = 1
      const prompt = enterRound(session, round)
      expect(prompt.interaction).toMatchObject({ playerIndex: 0, request: { kind: 'animal-reorg' } })
      const before = snapshot(prompt.state)
      const zones = [{ id: 'house', zoneType: 'house', animalType: resident, animalCount: 1 }]
      expect(session.resolveChoice(1, 'confirm', { zones }).ok).toBe(false)
      expect(snapshot(session.state)).toEqual(before)
      const response = session.resolveChoice(0, 'confirm', { zones })
      expect(response.ok, response.error).toBe(true)
      expect(response.interaction.stateId).toBe('idle')
      expect(response.state.players[0]!.resources).toEqual({ ...before.players[0]!.resources, [animal]: 0 })
      expect(response.state.players[0]!.houseAnimalCount).toBe(1)
      expect(response.state.players[1]).toEqual(before.players[1])
      expect(response.state.harvestBreedSummary).toEqual(before.harvestBreedSummary)
      expect(response.state.round).toBe(round)
      expect(response.state.log.length).toBeGreaterThan(before.log.length)
      const final = finish(session)
      expect(final.scores![0]!.categories.find((category) => category.key === 'parentCards')?.total ?? 0)
        .toBe(cardId === 'PR03' ? 0 : cardId === 'PR04' ? 0.1 : 0.2)
    },
  )

  it.each([false, true])('same-round PR04 and PR06 settle once despite animal pending (restore=%s)', (reload) => {
    let session = setup('PR04', 'PR06')
    const prompt = enterRound(session, 7)
    expect(prompt.interaction).toMatchObject({ playerIndex: 0, request: { kind: 'animal-reorg' } })
    expect(prompt.state.players[0]!.resources.boar).toBe(1)
    expect(prompt.state.players[1]!.resources.vegetable).toBe(0)
    if (reload) session = restore(session)
    const response = house(session, 'boar')
    expect(response.state.players[1]!.resources.vegetable).toBe(1)
    expect(response.state.players[0]!.resources.vegetable).toBe(0)
    expect(response.state.players[1]!.resources.boar).toBe(0)
    expect(response.state.futureMeeples).toEqual([])
    enterRound(session, 8)
    expect(session.state.players[0]!.resources.boar).toBe(1)
    expect(session.state.players[1]!.resources.vegetable).toBe(1)
    expect(scheduled(session, 'PR04')).toHaveLength(1)
    expect(scheduled(session, 'PR06')).toHaveLength(1)
  })

  it.each([['PR01', 2], ['PR02', 12]] as const)('%s restores both scheduled and pending farm rewards without duplication', (cardId, round) => {
    let session = restore(setup(cardId))
    enterRound(session, round)
    session = restore(session)
    const prompt = accept(session)
    session = restore(session)
    const tile = prompt.interaction.request.farm.selectableTiles[0]!
    const response = session.commitSelectionChoice(0, cardId === 'PR01' ? { stables: [tile] } : { tile })
    expect(response.ok, response.error).toBe(true)
    expect(cardId === 'PR01' ? response.state.players[0]!.stableTiles : response.state.players[0]!.fields).toHaveLength(1)
    session = restore(session)
    enterRound(session, round + 1)
    expect(session.getState().interaction.stateId).toBe('idle')
    expect(session.state.futureMeeples.some((entry) => entry.cardId === cardId)).toBe(false)
    expect(scheduled(session, cardId)).toHaveLength(1)
  })

  it('PR09 restores an unclaimed resource schedule and does not reissue the collected reward', () => {
    let session = restore(setup('PR09'))
    expect(session.state.players[0]!.resources.reed).toBe(0)
    enterRound(session, 5)
    expect(session.state.players[0]!.resources.reed).toBe(1)
    session = restore(session)
    expect(session.state.players[0]!.resources.reed).toBe(1)
    enterRound(session, 6)
    expect(session.state.players[0]!.resources.reed).toBe(1)
    expect(session.state.futureMeeples.some((entry) => entry.cardId === 'PR09')).toBe(false)
    expect(session.state.events.filter((event) => event.type === 'resource.moved' && event.reason === 'receive' && event.sourceCardId === 'PR09')).toHaveLength(1)
  })

  it.each(printedMothers)('%s contributes its printed fraction only once to final round-14 scores', (cardId, _round, _reward, score) => {
    const session = setup(cardId)
    for (const player of session.state.players) player.resources = { ...emptyResources, food: 50 }
    const response = finish(session)
    const own = response.scores![0]!
    const parent = own.categories.find((category) => category.key === 'parentCards')
    expect(parent?.total ?? 0).toBe(score)
    if (score !== 0) expect(parent?.entries).toEqual([{ type: 'parentCard', cardId, score }])
    const base = own.categories.filter((category) => category.key !== 'parentCards').reduce((sum, category) => sum + category.total, 0)
    expect(own.total).toBeCloseTo(base + score)
    const opponentScore = cardId === 'PR10' ? 0.9 : 0.7
    expect(response.scores![1]!.total).toBeCloseTo(base + opponentScore)
    expect(response.interaction.winners).toEqual([score > opponentScore ? 'p1' : 'p2'])
    expect(session.getState().scores).toEqual(response.scores)
    expect(session.buildSyncPayload(response, null).scores).toEqual(response.scores)
  })

  it.each([['PR01', 2, -0.75], ['PR02', 12, -0.25]] as const)('%s keeps its printed end score even after declining its reward', (cardId, round, score) => {
    const session = setup(cardId)
    enterRound(session, round)
    expect(session.resolveChoice(0, '__skip__').ok).toBe(true)
    const response = finish(session)
    expect(response.scores![0]!.categories.find((category) => category.key === 'parentCards')?.total).toBe(score)
  })
})
