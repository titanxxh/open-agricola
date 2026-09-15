import { describe, expect, it } from 'vitest'
import { GameSession, type SessionResponse } from '../game/authoritative-session'
import { storePendingFenceBonus } from '../../shared/cards/helpers/pending-fence-bonus'
import {
  markAllWorkersUsed,
  setActiveWorkerCount,
  setWorkersAtHome,
} from '../../shared/domain/player'
import { createInitialState, emptyResources } from '../../shared/session/state-bootstrap'
import { rehydrateState, serializeSessionSnapshot } from '../../shared/session/serialization'
import { getAvailableStableSupplyCount } from '../../shared/domain/supply-tokens'
import type { FatherParentCardId, MotherParentCardId } from '../../shared/parents/types'
import '../../shared/cards/M/M037_BuildingPlan'
import type { ActionChoiceOption, GameState, PlayerState } from '../../shared/contract/types'
import { sixPlayerDuplicateMajorImprovementIds, takeMajorImprovementFromSupply } from '../../shared/cards/major/supply'
import { getAllTilePositions, positionKey } from '../../shared/domain/farm'

type SeasonId = 'winter' | 'spring' | 'summer' | 'autumn'

const oneCellFences = (row: number, col: number) => [
  `H-${row}-${col}`,
  `H-${row + 1}-${col}`,
  `V-${row}-${col}`,
  `V-${row}-${col + 1}`,
]

const firstEmptyFarmyardTile = (player: PlayerState) => {
  const occupied = new Set<string>()
  player.roomTiles.forEach((tile) => occupied.add(positionKey(tile)))
  player.farmTerrain?.forEach((tile) => occupied.add(positionKey(tile)))
  player.fields.forEach((field) => occupied.add(positionKey(field)))
  player.stableTiles.forEach((tile) => occupied.add(positionKey(tile)))
  player.pastures.forEach((pasture) => pasture.tiles.forEach((tile) => occupied.add(positionKey(tile))))
  const tile = getAllTilePositions().find((tile) => !occupied.has(positionKey(tile)))
  expect(tile).toBeDefined()
  return tile!
}

const prepareHands = (session: GameSession) => {
  for (const player of session.state.players) {
    player.minorHand = ['__test_placeholder__']
    player.occupationHand = ['__test_placeholder__']
  }
}

const setupFarmersOfTheMoorSeason = (season: SeasonId) => {
  const session = new GameSession(365, undefined, {
    playerCount: 2,
    enableFarmersOfTheMoor: true,
    allowIncompleteFarmersOfTheMoorMinorDeal: true,
    enableThroughTheSeasons: true,
  })
  session.state.currentPlayerIndex = 0
  session.state.round = 1
  session.state.roundPhase = 'work'
  if (season === 'spring') session.state.roundActionOrder[0] = 'fencing'
  session.state.throughTheSeasons = { startSeason: season, currentSeason: season }
  prepareHands(session)
  const player = session.state.players[0]!
  setActiveWorkerCount(player, 2)
  setWorkersAtHome(session.state, player, 2)
  session.loadState(session.state)
  return session
}

const availableIds = (session: GameSession, playerIndex = 0) =>
  session.getAvailableActions(playerIndex).map((action) => action.spaceId)

const findSpecialCard = (session: GameSession, actionId: string) => {
  const card = session.state.farmersOfTheMoor!.specialActionCards.find((candidate) =>
    candidate.actions.includes(actionId as never),
  )
  expect(card).toBeDefined()
  return card!
}

const hasPaidResources = (
  option: { labelParams?: Record<string, unknown> },
  expected: Record<string, number>,
) => {
  const actual = (option.labelParams?.resourcesPaid ?? {}) as Record<string, number>
  const keys = new Set([...Object.keys(actual), ...Object.keys(expected)])
  return [...keys].every((key) => (actual[key] ?? 0) === (expected[key] ?? 0))
}

const choosePaymentByResources = (
  session: GameSession,
  resp: SessionResponse,
  expected: Record<string, number>,
) => {
  expect(resp.interaction.promptKey).toBe('prompt.selectPayment')
  const option = resp.interaction.request.options?.find((candidate) =>
    hasPaidResources(candidate, expected),
  )
  expect(option).toBeDefined()
  return session.resolveChoice(resp.interaction.playerIndex, option!.value)
}

const readMajorSupply = (state: GameState) => state.majorImprovementSupply ?? []

const auditClone = <T>(value: T): T => JSON.parse(JSON.stringify(value))
const auditSeasons = ['winter', 'spring', 'summer', 'autumn'] as const
const auditMothers = ['PR01', 'PR02', 'PR03', 'PR04', 'PR05', 'PR06', 'PR07', 'PR08', 'PR09', 'PR10', 'PR11', 'PR12'] as const
const auditFathers = ['PS01', 'PS02', 'PS03', 'PS04', 'PS05', 'PS06', 'PS07', 'PS08', 'PS09', 'PS10', 'PS11', 'PS12'] as const
const auditSetup = (options: { mother?: MotherParentCardId; father?: FatherParentCardId; otherMother?: MotherParentCardId; season?: SeasonId; moor?: boolean } = {}) => {
  const { mother, father = 'PS01', otherMother = mother === 'PR10' ? 'PR12' : 'PR10', season, moor = false } = options
  const seed = season ? { winter: 2, spring: 9, summer: 1, autumn: 3 }[season] : 56126
  const session = new GameSession(seed, undefined, {
    playerCount: 2, enableParentCards: mother !== undefined, parentSelectionSeed: 9004,
    enableFarmersOfTheMoor: moor, allowIncompleteFarmersOfTheMoorMinorDeal: true,
    enableThroughTheSeasons: season !== undefined,
  })
  for (const player of session.state.players) {
    player.minorHand = ['__test_placeholder__']
    player.occupationHand = ['__test_placeholder__']
    player.resources = { ...emptyResources, food: 50, ...(moor ? { fuel: 0, horse: 0 } : {}) }
    expect(player.rooms).toBe(2)
    expect(player.cardStates).toEqual({})
  }
  if (season) session.state.throughTheSeasons = { startSeason: season, currentSeason: season }
  if (mother) {
    const mothers = auditMothers.filter((id) => id !== mother && id !== otherMother)
    const fathers = auditFathers.filter((id) => id !== father)
    session.state.parentSelection!.candidates = {
      p1: { mother: [mother, mothers[0]!], father: [father, fathers[0]!] },
      p2: { mother: [otherMother, mothers[1]!], father: [fathers[1]!, fathers[2]!] },
    }
    expect(session.loadState(session.state).ok).toBe(true)
    const before = auditClone(session.state.players.map((player) => player.resources))
    const selected = session.submitParentSelection(0, { mother, father })
    expect(selected.ok, selected.error).toBe(true)
    expect(selected.state.phase).toBe('parent-selection')
    expect(selected.state.futureMeeples).toEqual([])
    expect(selected.state.players.map((player) => player.resources)).toEqual(before)
    const response = session.submitParentSelection(1, { mother: otherMother, father: fathers[1]! })
    expect(response.ok, response.error).toBe(true)
    expect(response.state.phase).toBe('playing')
    expect(response.state.players[0]!.parentCards).toEqual({ mother, father })
  } else expect(session.loadState(session.state).ok).toBe(true)
  return session
}
const auditRestore = (session: GameSession) => {
  const restored = new GameSession(56126, undefined, { playerCount: 2 })
  const response = restored.loadState(rehydrateState(auditClone(serializeSessionSnapshot(session.state, session))))
  expect(response.ok, response.error).toBe(true)
  expect(response.interaction).toEqual(session.getState().interaction)
  expect(response.state.futureMeeples).toEqual(session.state.futureMeeples)
  expect(response.state.throughTheSeasons).toEqual(session.state.throughTheSeasons)
  expect(response.state.players.map((player) => player.resources)).toEqual(session.state.players.map((player) => player.resources))
  return restored
}
const auditChoose = (session: GameSession, label: string) => {
  const response = session.getState()
  expect(response.interaction.request.kind).toBe('choice')
  const option = response.interaction.request.options.find((entry) => entry.labelKey === label || entry.value === label)
  expect(option, JSON.stringify(response.interaction)).toBeDefined()
  const chosen = session.resolveChoice(response.interaction.playerIndex, option!.value)
  expect(chosen.ok, chosen.error).toBe(true)
  return chosen
}
const auditSettle = (session: GameSession) => {
  let response = session.getState()
  for (let step = 0; step < 30 && response.interaction.stateId === 'wait'; step++) {
    const request = response.interaction.request
    const index = response.interaction.playerIndex
    if (request.kind === 'feed') response = session.resolveChoice(index, 'confirm', { selections: [] })
    else if (request.kind === 'heating') response = session.resolveChoice(index, 'confirm', { fuelUsed: Math.min(request.required, session.state.players[index]!.resources.fuel ?? 0), woodToFuel: 0 })
    else if (request.kind === 'confirm-next-player' || request.kind === 'confirm-player-switch') response = session.resolveChoice(index, 'confirm')
    else if (request.kind === 'choice' && request.options.some((entry) => entry.value === '__skip__' || entry.value === '__done__')) response = session.resolveChoice(index, request.options.find((entry) => entry.value === '__skip__' || entry.value === '__done__')!.value)
    else throw new Error(JSON.stringify(response.interaction))
    expect(response.ok, response.error).toBe(true)
  }
  return response
}
const auditEnterRound = (session: GameSession, round: number, season?: SeasonId) => {
  session.state.round = round - 1
  if (season) session.state.throughTheSeasons!.currentSeason = auditSeasons[(auditSeasons.indexOf(season) + 3) % 4]!
  session.state.players.forEach((player) => markAllWorkersUsed(session.state, player))
  expect(session.loadState(session.state).ok).toBe(true)
  let response = session.performRoundEnd()
  for (let step = 0; response.state.round < round && !response.state.gameOver && step < 30; step++) {
    expect(response.ok, response.error).toBe(true)
    const request = response.interaction.request
    const index = response.interaction.playerIndex
    if (request.kind === 'animal-reorg') response = auditAnimals(session)
    else if (request.kind === 'feed') response = session.resolveChoice(index, 'confirm', { selections: [] })
    else if (request.kind === 'heating') response = session.resolveChoice(index, 'confirm', { fuelUsed: Math.min(request.required, session.state.players[index]!.resources.fuel ?? 0), woodToFuel: 0 })
    else if (request.kind === 'choice' && request.options.some((entry) => entry.value === '__skip__')) response = session.resolveChoice(index, '__skip__')
    else throw new Error(JSON.stringify(response.interaction))
  }
  expect(response.ok, response.error).toBe(true)
  expect(response.state.round).toBe(round)
  if (season) expect(response.state.throughTheSeasons!.currentSeason).toBe(season)
  return response
}
const auditAcceptFarm = (session: GameSession) => {
  const response = session.getState()
  expect(response.interaction.request.kind).toBe('choice')
  const option = response.interaction.request.options.find((entry) => entry.value !== '__skip__')
  expect(option).toBeDefined()
  const accepted = session.resolveChoice(response.interaction.playerIndex, option!.value)
  expect(accepted.ok, accepted.error).toBe(true)
  expect(accepted.interaction.request.kind).toBe('farm-select')
  return accepted
}
const auditClaim = (session: GameSession, father: FatherParentCardId, tier: number) => {
  let response = session.takeAnytimeAction(0, 'complete-parent-father')
  expect(response.ok, response.error).toBe(true)
  const choice = `${father}:${tier}${father === 'PS04' ? `:${['wood', 'clay', 'reed'].slice(0, tier).join(',')}` : ''}`
  if (response.interaction.stateId === 'wait' && response.interaction.request.kind === 'choice') response = session.resolveChoice(0, choice)
  expect(response.ok, response.error).toBe(true)
  return response
}
const auditStableTotal = (session: GameSession) => {
  const player = session.state.players[0]!
  const reserved = session.state.futureMeeples.filter((entry) => entry.playerId === player.id).reduce((sum, entry) => sum + (entry.resources.stable ?? 0), 0)
  return getAvailableStableSupplyCount(session.state, player) + player.stableTiles.length + reserved + (player.supplyTokensConsumed?.stable ?? 0)
}

const auditPastures = (player: PlayerState, entries: Array<{ col: number; size?: number; animal: 'sheep' | 'boar' | 'cattle' | 'horse'; count: number }>) => {
  player.pastures = []
  player.fenceSegments = []
  for (const entry of entries) {
    const size = entry.size ?? 1
    const tiles = Array.from({ length: size }, (_, offset) => ({ row: 0, col: entry.col + offset }))
    player.farmTerrain = player.farmTerrain?.filter((terrain) => !tiles.some((tile) => positionKey(tile) === positionKey(terrain)))
    player.pastures.push({ id: `pen-${entry.col}`, size, tiles, stables: 0, animalType: entry.animal, animalCount: entry.count })
    player.resources[entry.animal] = (player.resources[entry.animal] ?? 0) + entry.count
    const edges = [...tiles.flatMap((tile) => [`H-0-${tile.col}`, `H-1-${tile.col}`]), `V-0-${entry.col}`, `V-0-${entry.col + size}`]
    for (const edge of edges) if (!player.fenceSegments.some((segment) => segment.edge === edge)) player.fenceSegments.push({ edge, type: 'fence', source: { kind: 'own', ownerPlayerId: player.id } })
  }
}
const auditAnimals = (session: GameSession, counts?: Record<string, number>) => {
  const response = session.getState()
  if (response.interaction.request.kind !== 'animal-reorg') return response
  const index = response.interaction.playerIndex
  const player = session.state.players[index]!
  const zones = response.interaction.request.zones.map((zone) => {
    const pen = player.pastures.find((entry) => entry.id === zone.id)
    return { id: zone.id, zoneType: zone.zoneType, animalType: pen?.animalType ?? zone.animalType, animalCount: counts?.[zone.id] ?? pen?.animalCount ?? zone.animalCount }
  })
  const before = auditClone(session.state)
  expect(session.resolveChoice(1 - index, 'confirm', { zones }).ok).toBe(false)
  expect(auditClone(session.state)).toEqual(before)
  const done = session.resolveChoice(index, 'confirm', { zones })
  expect(done.ok, done.error).toBe(true)
  return done
}
const auditBackToFirst = (session: GameSession) => {
  auditSettle(session)
  expect(session.state.currentPlayerIndex).toBe(1)
  expect(session.takeAction(1, 'grain-seeds').ok).toBe(true)
  auditSettle(session)
  expect(session.state.currentPlayerIndex).toBe(0)
}

describe('Cross expansions batch 4 Parents and Seasons audit', () => {
  it.each(['winter', 'summer'] as const)('PR02 in %s resolves the round-12 field with the seasonal plow cost', (season) => {
    let session = auditSetup({ mother: 'PR02', season })
    session.state.players[0]!.resources.food = 5
    auditEnterRound(session, 12, season)
    expect(session.state.players[0]!.resources.food).toBe(1)
    session = auditRestore(session)
    auditAcceptFarm(session)
    session = auditRestore(session)
    const before = auditClone(session.state)
    expect(session.commitSelectionChoice(1, { tile: { row: 0, col: 0 } }).ok).toBe(false)
    expect(session.commitSelectionChoice(0, { tile: session.state.players[0]!.roomTiles[0]! }).ok).toBe(false)
    expect(auditClone(session.state)).toEqual(before)
    const done = session.commitSelectionChoice(0, { tile: { row: 0, col: 0 } })
    expect(done.ok, done.error).toBe(true)
    expect(done.state.players[0]!.resources.food).toBe(season === 'winter' ? 0 : 1)
    expect(done.state.players[0]!.fields).toEqual([{ row: 0, col: 0, stacks: [] }])
    expect(done.state.players[0]!.workers).toEqual(before.players[0]!.workers)
    expect(done.state.players[1]).toEqual(before.players[1])
    expect(done.state.futureMeeples.some((entry) => entry.cardId === 'PR02')).toBe(false)
    expect(done.state.events.filter((event) => event.type === 'farm.fieldPlowed')).toHaveLength(1)
    session = auditRestore(session)
    expect(session.getState().interaction.stateId).toBe('idle')
  })

  it('PR02 with no food in winter can decline without blocking the round', () => {
    const session = auditSetup({ mother: 'PR02', season: 'winter' })
    session.state.players[0]!.resources.food = 4
    auditEnterRound(session, 12, 'winter')
    expect(session.state.players[0]!.resources.food).toBe(0)
    if (session.getState().interaction.stateId === 'wait') expect(session.resolveChoice(0, '__skip__').ok).toBe(true)
    expect(session.getState().interaction.stateId).toBe('idle')
    expect(session.state.players[0]!.fields).toEqual([])
    expect(session.state.futureMeeples.some((entry) => entry.cardId === 'PR02')).toBe(false)
  })
})

describe('Cross expansions batch 4 parent reward sequencing audit', () => {
  it.each(['accept', 'skip'] as const)('PR01 reserve survives summer room stables then %s at round two', (mode) => {
    let session = auditSetup({ mother: 'PR01', season: 'summer' })
    session.state.players[0]!.stableTiles = [{ row: 0, col: 0 }, { row: 0, col: 1 }]
    Object.assign(session.state.players[0]!.resources, { wood: 10, reed: 4 })
    expect(getAvailableStableSupplyCount(session.state, session.state.players[0]!)).toBe(1)
    expect(auditStableTotal(session)).toBe(4)
    expect(session.takeAction(0, 'farm-expansion').ok).toBe(true)
    if (session.getState().interaction.request.kind === 'choice') auditChoose(session, 'actions.construct.name')
    expect(session.commitSelectionChoice(0, { rooms: [{ row: 1, col: 1 }, { row: 2, col: 1 }] }).ok).toBe(true)
    session = auditRestore(session)
    auditAcceptFarm(session)
    const waiting = auditClone(session.state)
    const selectable = session.getState().interaction.request.farm.selectableTiles
    expect(session.commitSelectionChoice(0, { stables: selectable.slice(0, 2) }).ok).toBe(false)
    expect(auditClone(session.state)).toEqual(waiting)
    expect(session.commitSelectionChoice(0, { stables: [selectable[0]!] }).ok).toBe(true)
    auditSettle(session)
    expect(session.state.players[0]!.stableTiles).toHaveLength(3)
    expect(getAvailableStableSupplyCount(session.state, session.state.players[0]!)).toBe(0)
    expect(auditStableTotal(session)).toBe(4)
    expect(session.state.futureMeeples.filter((entry) => entry.cardId === 'PR01')).toHaveLength(1)
    auditEnterRound(session, 2, 'autumn')
    session = auditRestore(session)
    if (mode === 'skip') expect(session.resolveChoice(0, '__skip__').ok).toBe(true)
    else {
      const prompt = auditAcceptFarm(session)
      expect(session.commitSelectionChoice(0, { stables: [prompt.interaction.request.farm.selectableTiles[0]!] }).ok).toBe(true)
    }
    expect(session.state.players[0]!.stableTiles).toHaveLength(mode === 'accept' ? 4 : 3)
    expect(session.state.players[0]!.resources.wood).toBe(0)
    expect(session.state.players[0]!.resources.reed).toBe(0)
    expect(session.state.futureMeeples.some((entry) => entry.cardId === 'PR01')).toBe(false)
    expect(auditStableTotal(session)).toBe(4)
    session = auditRestore(session)
    expect(session.getState().interaction.stateId).toBe('idle')
  })

  it.each([
    { mother: 'PR08' as const, round: 3, season: 'summer' as const, resource: 'stone' as const, space: 'western-quarry', accumulation: 0 },
    { mother: 'PR09' as const, round: 5, season: 'winter' as const, resource: 'reed' as const, space: 'reed-bank', accumulation: 0 },
    { mother: 'PR10' as const, round: 1, season: 'spring' as const, resource: 'wood' as const, space: 'forest', accumulation: 2 },
    { mother: 'PR12' as const, round: 1, season: 'winter' as const, resource: 'clay' as const, space: 'clay-pit', accumulation: 0 },
  ].flatMap((row) => (row.round === 1 ? [0] : [0, 4]).map((leftover) => ({ ...row, leftover }))))(
    '$mother keeps its $resource despite $season accumulation with $leftover leftover', ({ mother, round, season, resource, space, accumulation, leftover }) => {
      let session = auditSetup({ mother, season })
      if (round > 1) {
        session.state.actionSpaces.find((entry) => entry.id === space)!.resources[resource] = leftover
        auditEnterRound(session, round, season)
        expect(session.state.actionSpaces.find((entry) => entry.id === space)!.resources[resource]).toBe(leftover + accumulation)
      } else {
        expect(session.state.actionSpaces.find((entry) => entry.id === space)!.resources[resource]).toBe(accumulation)
        session.state.actionSpaces.find((entry) => entry.id === space)!.resources[resource] += leftover
      }
      expect(session.state.players[0]!.resources[resource]).toBe(1)
      expect(session.state.players[1]!.resources[resource]).toBe(0)
      const received = session.state.events.filter((event) => event.type === 'resource.moved' && event.sourceCardId === mother && event.reason === 'receive')
      expect(received).toEqual([expect.objectContaining({ resources: { [resource]: 1 }, actorPlayerId: 'p1' })])
      session = auditRestore(session)
      for (const viewer of ['p1', 'p2', null]) expect(session.buildSyncPayload(session.getState(), viewer).state.players[0]!.resources[resource]).toBe(1)
      expect(session.state.futureMeeples.some((entry) => entry.cardId === mother)).toBe(false)
    },
  )

  it('PR05 sheep arrival in spring does not breed until Animal and Fruit is taken', () => {
    let session = auditSetup({ mother: 'PR05', season: 'spring' })
    auditPastures(session.state.players[0]!, [{ col: 0, size: 2, animal: 'sheep', count: 2 }])
    auditPastures(session.state.players[1]!, [{ col: 0, size: 2, animal: 'sheep', count: 2 }])
    auditEnterRound(session, 4, 'spring')
    session = auditRestore(session)
    auditAnimals(session, { 'pen-0': 3 })
    expect(session.state.players[0]!.resources.sheep).toBe(3)
    expect(session.state.players[1]!.resources.sheep).toBe(2)
    expect(session.state.events.filter((event) => event.type === 'farm.animalBred')).toHaveLength(0)
    expect(session.takeAction(0, 'season-spring-animal-and-fruit').ok).toBe(true)
    auditAnimals(session, { 'pen-0': 4 })
    expect(session.state.players[0]!.resources.sheep).toBe(4)
    expect(session.state.players[1]!.resources.sheep).toBe(2)
    expect(session.state.events.filter((event) => event.type === 'farm.animalBred')).toHaveLength(1)
  })

  it.each([
    { father: 'PS04' as const, season: 'spring' as const, action: 'season-spring-animal-and-fruit', resource: 'sheep' as const, amount: 3 },
    { father: 'PS11' as const, season: 'summer' as const, action: 'day-laborer', resource: 'grain' as const, amount: 3 },
    { father: 'PS12' as const, season: 'autumn' as const, action: 'season-autumn-thanksgiving', resource: 'vegetable' as const, amount: 2 },
  ])('$father becomes claimable after $season action without consuming the condition resource', ({ father, season, action, resource, amount }) => {
    let session = auditSetup({ mother: 'PR08', father, season })
    session.state.players[0]!.resources[resource] = amount - 1
    if (resource === 'sheep') {
      session.state.players[0]!.resources.sheep = 0
      auditPastures(session.state.players[0]!, [{ col: 0, size: 2, animal: 'sheep', count: 2 }])
    }
    const before = auditClone(session.state)
    expect(session.takeAnytimeAction(0, 'complete-parent-father').ok).toBe(false)
    expect(auditClone(session.state)).toEqual(before)
    expect(session.takeAction(0, action).ok).toBe(true)
    if (resource === 'sheep') auditAnimals(session, { 'pen-0': 3 })
    auditBackToFirst(session)
    expect(session.state.players[0]!.resources[resource]).toBe(amount)
    expect(session.state.players[0]!.cardStates[father]?.extraData?.fatherCompletedTier).toBeUndefined()
    session = auditRestore(session)
    const rewardBefore = auditClone(session.state.players[0]!.resources)
    const other = auditClone(session.state.players[1])
    auditClaim(session, father, 1)
    expect(session.state.players[0]!.resources).toEqual({ ...rewardBefore, ...(father === 'PS04' ? { wood: rewardBefore.wood + 1 } : father === 'PS11' ? { clay: rewardBefore.clay + 1 } : { food: rewardBefore.food + 2 }) })
    expect(session.state.players[1]).toEqual(other)
    expect(session.state.players[0]!.cardStates[father]?.extraData?.fatherCompletedTier).toBe(1)
    session = auditRestore(session)
    const completed = auditClone(session.state)
    expect(session.takeAnytimeAction(0, 'complete-parent-father').ok).toBe(false)
    expect(auditClone(session.state)).toEqual(completed)
  })

  it('PS07 spring sow reward does not execute private breeding or swallow the later spring action', () => {
    let session = auditSetup({ mother: 'PR08', father: 'PS07', season: 'spring' })
    const player = session.state.players[0]!
    player.occupationPlayed = ['A100_Curator', 'A101_CookeryOutfitter', 'A102_Grocer']
    session.state.ordinaryCardDecks.occupation = session.state.ordinaryCardDecks.occupation.filter((id) => !player.occupationPlayed.includes(id))
    player.fields = [{ row: 1, col: 1, stacks: [] }, { row: 1, col: 2, stacks: [] }]
    player.resources.grain = 2
    auditPastures(player, [{ col: 0, size: 2, animal: 'sheep', count: 2 }])
    auditClaim(session, 'PS07', 2)
    session = auditRestore(session)
    expect(session.commitSelectionChoice(0, { crops: [{ row: 1, col: 1, crop: 'grain' }] }).ok).toBe(true)
    expect(session.state.players[0]!.resources.sheep).toBe(2)
    expect(session.state.events.some((event) => event.type === 'farm.animalBred')).toBe(false)
    expect(session.takeAction(0, 'season-spring-animal-and-fruit').ok).toBe(true)
    auditChoose(session, 'actions.season-spring-animal-and-fruit.option-breed-sow')
    auditAnimals(session, { 'pen-0': 3 })
    expect(session.commitSelectionChoice(0, { crops: [{ row: 1, col: 2, crop: 'grain' }] }).ok).toBe(true)
    expect(session.state.players[0]!.resources.sheep).toBe(3)
    expect(session.state.players[0]!.resources.grain).toBe(0)
    expect(session.state.events.filter((event) => event.type === 'farm.sown')).toHaveLength(2)
    expect(session.state.events.filter((event) => event.type === 'farm.animalBred')).toHaveLength(1)
    expect(session.state.players[0]!.cardStates.PS07?.extraData?.fatherCompletedTier).toBe(2)
  })
})

describe('Cross expansions batch 4 Parents and Moor audit', () => {
  it.each([1, 2, 3])('PS03 counts horses toward tier %i and keeps each ordinary draw private after restore', (tier) => {
    let session = auditSetup({ mother: 'PR08', father: 'PS03', moor: true })
    const animals = ['horse', 'sheep', 'boar'] as const
    auditPastures(session.state.players[0]!, animals.slice(0, tier).map((animal, col) => ({ col, animal, count: 1 })))
    session.state.ordinaryCardDecks = { minor: ['A001_Shelter', 'A002_ShiftingCultivation', 'A003_PaperKnife', 'A004_Baseboards'], occupation: ['A100_Curator', 'A101_CookeryOutfitter', 'A102_Grocer', 'A103_Portmonger'] }
    const before = auditClone(session.state.players)
    auditClaim(session, 'PS03', tier)
    session = auditRestore(session)
    const choices = Object.values(session.state.ordinaryCardDrawChoices)
    expect(choices.map((choice) => choice.cardType).sort()).toEqual(tier === 3 ? ['minor', 'occupation'] : [tier === 1 ? 'minor' : 'occupation'])
    for (const choice of choices) {
      expect(choice.candidates).toHaveLength(3)
      const waiting = auditClone(session.state)
      for (const viewer of ['p2', null]) {
        const payload = JSON.stringify(session.buildSyncPayload(session.getState(), viewer))
        for (const id of choice.candidates) expect(payload).not.toContain(id)
      }
      expect(session.resolveOrdinaryCardDrawChoice(1, choice.id, choice.candidates[1]!).ok).toBe(false)
      expect(session.resolveOrdinaryCardDrawChoice(0, choice.id, '__invalid__').ok).toBe(false)
      expect(auditClone(session.state)).toEqual(waiting)
      expect(session.resolveOrdinaryCardDrawChoice(0, choice.id, choice.candidates[1]!).ok).toBe(true)
      session = auditRestore(session)
    }
    expect(session.state.players[0]!.resources).toEqual(before[0]!.resources)
    expect(session.state.players[0]!.pastures).toEqual(before[0]!.pastures)
    expect(session.state.players[1]).toEqual(before[1])
    expect(session.state.players[0]!.cardStates.PS03?.extraData?.fatherCompletedTier).toBe(tier)
    expect(session.takeAnytimeAction(0, 'complete-parent-father').ok).toBe(false)
  })

  it.each([{ tier: 1, horses: 3 }, { tier: 2, horses: 4 }, { tier: 3, horses: 6 }])('PS04 counts $horses horses for tier $tier without spending them', ({ tier, horses }) => {
    let session = auditSetup({ mother: 'PR08', father: 'PS04', moor: true })
    auditPastures(session.state.players[0]!, [{ col: 0, size: 3, animal: 'horse', count: horses }])
    const before = auditClone(session.state.players)
    auditClaim(session, 'PS04', tier)
    expect(session.state.players[0]!.resources).toEqual({ ...before[0]!.resources, wood: 1, clay: tier >= 2 ? 1 : 0, reed: tier === 3 ? 1 : 0 })
    expect(session.state.players[0]!.pastures).toEqual(before[0]!.pastures)
    expect(session.state.players[1]).toEqual(before[1])
    session = auditRestore(session)
    expect(session.state.players[0]!.cardStates.PS04?.extraData?.fatherCompletedTier).toBe(tier)
    expect(session.takeAnytimeAction(0, 'complete-parent-father').ok).toBe(false)
  })

  it.each([8, 7, 5, 3])('PS08 counts visible forest and moor as used with %i unused tiles', (unused) => {
    let session = auditSetup({ mother: 'PR08', father: 'PS08', moor: true })
    const player = session.state.players[0]!
    player.farmTerrain = [{ row: 0, col: 3, kind: 'forest' }, { row: 0, col: 4, kind: 'moor' }]
    player.fields = getAllTilePositions().filter((tile) => ![...player.roomTiles, ...player.farmTerrain!].some((entry) => positionKey(entry) === positionKey(tile))).slice(0, 11 - unused).map((tile) => ({ ...tile, stacks: [] }))
    const before = auditClone(session.state)
    if (unused === 8) {
      expect(session.takeAnytimeAction(0, 'complete-parent-father').ok).toBe(false)
      expect(auditClone(session.state)).toEqual(before)
      return
    }
    const tier = unused === 7 ? 1 : unused === 5 ? 2 : 3
    auditClaim(session, 'PS08', tier)
    expect(session.state.players[0]!.resources).toEqual({ ...before.players[0]!.resources, grain: tier === 2 ? 0 : 1, vegetable: tier === 1 ? 0 : 1 })
    expect(session.state.players[0]!.farmTerrain).toEqual(before.players[0]!.farmTerrain)
    expect(session.state.players[0]!.fields).toEqual(before.players[0]!.fields)
    session = auditRestore(session)
    expect(session.state.players[0]!.cardStates.PS08?.extraData?.fatherCompletedTier).toBe(tier)
  })

  it.each(['PR01', 'PR02'] as const)('%s cannot cover Moor terrain and permits a legal retry', (mother) => {
    let session = auditSetup({ mother, moor: true })
    session.state.players.forEach((player) => { player.resources.fuel = 4 })
    auditEnterRound(session, mother === 'PR01' ? 2 : 12)
    session = auditRestore(session)
    const prompt = auditAcceptFarm(session)
    const before = auditClone(session.state)
    for (const kind of ['forest', 'moor']) {
      const tile = session.state.players[0]!.farmTerrain!.find((entry) => entry.kind === kind)!
      expect(session.commitSelectionChoice(0, mother === 'PR01' ? { stables: [tile] } : { tile }).ok).toBe(false)
      expect(auditClone(session.state)).toEqual(before)
    }
    const tile = prompt.interaction.request.farm.selectableTiles[0]!
    expect(session.commitSelectionChoice(0, mother === 'PR01' ? { stables: [tile] } : { tile }).ok).toBe(true)
    expect(session.state.players[0]!.farmTerrain).toEqual(before.players[0]!.farmTerrain)
    expect(session.state.players[0]!.resources).toEqual(before.players[0]!.resources)
    expect(session.state.players[1]).toEqual(before.players[1])
    expect(session.state.futureMeeples.some((entry) => entry.cardId === mother)).toBe(false)
  })

  it.each(['PS05', 'PS06'] as const)('%s counts an owned Moor major but not the covered supply', (father) => {
    const session = auditSetup({ mother: 'PR08', father, moor: true })
    const player = session.state.players[0]!
    if (father === 'PS06') {
      player.occupationPlayed = ['A100_Curator', 'A101_CookeryOutfitter', 'A102_Grocer']
      session.state.ordinaryCardDecks.occupation = session.state.ordinaryCardDecks.occupation.filter((id) => !player.occupationPlayed.includes(id))
    }
    expect(session.takeAnytimeAction(0, 'complete-parent-father').ok).toBe(false)
    player.improvements = ['Major_Moor_PeatCharcoalKiln']
    takeMajorImprovementFromSupply(session.state, 'Major_Moor_PeatCharcoalKiln')
    const before = auditClone(session.state)
    auditClaim(session, father, 1)
    expect(session.state.players[0]!.resources).toEqual({ ...before.players[0]!.resources, ...(father === 'PS05' ? { wood: 1 } : { food: 51 }) })
    expect(session.state.players[0]!.improvements).toEqual(['Major_Moor_PeatCharcoalKiln'])
    expect(session.state.majorImprovementSupply).toEqual(before.majorImprovementSupply)
    expect(session.state.players[0]!.cardStates[father]?.extraData?.fatherCompletedTier).toBe(1)
  })

  it('CHARACTERIZATION: PS06 does not count a held Moor special action card toward six cards', () => {
    const session = auditSetup({ mother: 'PR08', father: 'PS06', moor: true })
    session.state.players[0]!.occupationPlayed = ['A100_Curator', 'A101_CookeryOutfitter', 'A102_Grocer']
    session.state.ordinaryCardDecks.occupation = session.state.ordinaryCardDecks.occupation.filter((id) => !session.state.players[0]!.occupationPlayed.includes(id))
    const card = findSpecialCard(session, 'hiring-fair')
    expect(session.takeSpecialAction(0, card.id, 'hiring-fair').ok).toBe(true)
    auditBackToFirst(session)
    expect(session.state.farmersOfTheMoor!.specialActionCards.find((entry) => entry.id === card.id)!.location).toEqual({ kind: 'playerFaceUp', playerId: 'p1' })
    const before = auditClone(session.state)
    expect(session.takeAnytimeAction(0, 'complete-parent-father').ok).toBe(false)
    expect(auditClone(session.state)).toEqual(before)
  })

  it('father completion leaves the Moor special-action turn and worker untouched', () => {
    let session = auditSetup({ mother: 'PR08', father: 'PS11', moor: true })
    session.state.players[0]!.resources.grain = 3
    const before = auditClone(session.state)
    auditClaim(session, 'PS11', 1)
    expect(session.state.currentPlayerIndex).toBe(0)
    expect(session.state.players[0]!.workers).toEqual(before.players[0]!.workers)
    expect(session.state.farmersOfTheMoor).toEqual(before.farmersOfTheMoor)
    expect(session.state.actionSpaces.map((space) => space.takenBy)).toEqual(before.actionSpaces.map((space) => space.takenBy))
    session = auditRestore(session)
    const card = findSpecialCard(session, 'hiring-fair')
    expect(session.takeSpecialAction(0, card.id, 'hiring-fair').ok).toBe(true)
    auditSettle(session)
    expect(session.state.currentPlayerIndex).toBe(1)
    expect(session.state.players[0]!.workers).toEqual(before.players[0]!.workers)
    expect(session.state.players[0]!.resources).toEqual({ ...before.players[0]!.resources, clay: 1, food: 51 })
    expect(session.state.farmersOfTheMoor!.specialActionCards.find((entry) => entry.id === card.id)!.location).toEqual({ kind: 'playerFaceUp', playerId: 'p1' })
  })

  it('a pending PS03 private draw rejects Moor special actions without stealing the turn', () => {
    const session = auditSetup({ mother: 'PR08', father: 'PS03', moor: true })
    auditPastures(session.state.players[0]!, [{ col: 0, animal: 'horse', count: 1 }])
    session.state.ordinaryCardDecks.minor = ['A001_Shelter', 'A002_ShiftingCultivation', 'A003_PaperKnife']
    auditClaim(session, 'PS03', 1)
    const before = auditClone(session.state)
    const card = findSpecialCard(session, 'hiring-fair')
    expect(session.takeSpecialAction(0, card.id, 'hiring-fair').ok).toBe(false)
    expect(session.takeSpecialAction(1, card.id, 'hiring-fair').ok).toBe(false)
    expect(auditClone(session.state)).toEqual(before)
    const choice = Object.values(session.state.ordinaryCardDrawChoices)[0]!
    expect(session.resolveOrdinaryCardDrawChoice(0, choice.id, choice.candidates[1]!).ok).toBe(true)
    expect(session.state.currentPlayerIndex).toBe(0)
    expect(session.takeSpecialAction(0, card.id, 'hiring-fair').ok).toBe(true)
  })
})

const auditOwnMajor = (session: GameSession, id: string) => {
  const stack = session.state.majorImprovementSupply?.find((entry) => entry.cardIds.includes(id))
  for (const coveredBy of stack?.cardIds.slice(0, stack.cardIds.indexOf(id)) ?? []) {
    session.state.players[1]!.improvements.push(coveredBy)
    session.state.players[1]!.playedCards.push(`major:${coveredBy}`)
    takeMajorImprovementFromSupply(session.state, coveredBy)
  }
  session.state.players[0]!.playedCards.push(`major:${id}`)
  session.state.players[0]!.improvements.push(id)
  takeMajorImprovementFromSupply(session.state, id)
}
const auditCook = (session: GameSession, animal: 'sheep' | 'boar' | 'cattle' | 'horse') => {
  const response = session.takeAnytimeAction(0, 'exchange')
  expect(response.ok, response.error).toBe(true)
  const option = response.interaction.request.options.find((entry) => JSON.stringify(entry).includes(animal))
  expect(option).toBeDefined()
  const traded = session.resolveChoice(0, `bulk:${option!.value.split(':')[1]}=1`)
  expect(traded.ok, traded.error).toBe(true)
  return traded
}

describe('Cross expansions batch 4 Seasons and Moor harvest audit', () => {
  it.each(auditSeasons.flatMap((season) => (['wood', 'clay', 'stone'] as const).flatMap((houseType) => [0, 2].map((fuel) => ({ season, houseType, fuel })))))(
    '$season harvest heats a $houseType house with $fuel fuel only when required', ({ season, houseType, fuel }) => {
      let session = auditSetup({ season, moor: true })
      session.state.round = 4
      for (const player of session.state.players) {
        player.houseType = houseType
        player.resources.fuel = fuel
        player.farmTerrain = player.farmTerrain!.filter((tile) => tile.row !== 0 || tile.col > 2)
        player.fields = [{ row: 0, col: 0, stacks: [{ kind: 'grain', remaining: 2 }] }]
        auditPastures(player, [{ col: 1, size: 2, animal: 'sheep', count: 2 }])
        markAllWorkersUsed(session.state, player)
      }
      expect(session.loadState(session.state).ok).toBe(true)
      expect(session.performRoundEnd().ok).toBe(true)
      const required = season === 'summer' ? 0 : houseType === 'wood' ? 2 : houseType === 'clay' ? 1 : 0
      const heatingPlayers: number[] = []
      for (let step = 0; session.state.round === 4 && step < 30; step++) {
        session = auditRestore(session)
        const response = session.getState()
        const request = response.interaction.request
        const index = response.interaction.playerIndex
        expect(session.state.throughTheSeasons!.currentSeason).toBe(season)
        if (request.kind === 'animal-reorg') auditAnimals(session, { 'pen-1': 3 })
        else if (request.kind === 'feed') expect(session.resolveChoice(index, 'confirm', { selections: [] }).ok).toBe(true)
        else if (request.kind === 'heating') {
          heatingPlayers.push(index)
          expect(request.required).toBe(required)
          const before = auditClone(session.state)
          expect(session.resolveChoice(1 - index, 'confirm', { fuelUsed: Math.min(fuel, required), woodToFuel: 0 }).ok).toBe(false)
          expect(auditClone(session.state)).toEqual(before)
          expect(session.resolveChoice(index, 'confirm', { fuelUsed: Math.min(fuel, required), woodToFuel: 0 }).ok).toBe(true)
        } else throw new Error(JSON.stringify(response.interaction))
      }
      expect(session.state.round).toBe(5)
      expect(heatingPlayers).toEqual(required > 0 ? [0, 1] : [])
      for (const player of session.state.players) {
        expect(player.resources).toEqual({ ...emptyResources, food: 46, grain: 1, sheep: 3, horse: 0, fuel: fuel - Math.min(fuel, required) })
        expect(player.sickWorkerIds).toHaveLength(Math.max(0, required - fuel))
      }
      expect(session.state.throughTheSeasons!.currentSeason).toBe(auditSeasons[(auditSeasons.indexOf(season) + 1) % 4])
      expect(session.state.events.filter((event) => event.type === 'farm.animalBred')).toHaveLength(2)
      session = auditRestore(session)
      expect(session.state.players.map((player) => player.resources.food)).toEqual([46, 46])
    },
  )

  it('summer round-14 harvest needs no heating and publishes healthy farmer scores', () => {
    const session = auditSetup({ season: 'summer', moor: true })
    session.state.round = 14
    session.state.players.forEach((player) => markAllWorkersUsed(session.state, player))
    expect(session.loadState(session.state).ok).toBe(true)
    expect(session.performRoundEnd().ok).toBe(true)
    const final = auditSettle(session)
    expect(final.state.gameOver).toBe(true)
    expect(final.state.players.map((player) => player.resources.food)).toEqual([46, 46])
    expect(final.state.players.map((player) => player.sickWorkerIds)).toEqual([[], []])
    for (const score of final.scores!) expect(score.categories.find((category) => category.key === 'farmers')!.total).toBe(6)
    for (const viewer of ['p1', 'p2', null]) expect(session.buildSyncPayload(final, viewer).scores).toEqual(final.scores)
  })

  it.each(['house', 'release', 'cook'] as const)('spring private horse breeding can %s the newborn without harvesting the opponent', (mode) => {
    let session = auditSetup({ season: 'spring', moor: true })
    auditPastures(session.state.players[0]!, [{ col: 0, size: 2, animal: 'horse', count: mode === 'house' ? 2 : 4 }])
    auditPastures(session.state.players[1]!, [{ col: 0, size: 2, animal: 'horse', count: 2 }])
    session.state.players[0]!.resources.cattle = 1
    session.state.players[0]!.houseAnimalType = 'cattle'
    session.state.players[0]!.houseAnimalCount = 1
    if (mode === 'cook') auditOwnMajor(session, 'Major_Moor_Cookhouse1')
    const before = auditClone(session.state.players)
    expect(session.takeAction(0, 'season-spring-animal-and-fruit').ok).toBe(true)
    session = auditRestore(session)
    if (mode === 'cook') auditCook(session, 'horse')
    auditAnimals(session, { 'pen-0': mode === 'house' ? 3 : 4 })
    expect(session.state.players[0]!.resources).toEqual({ ...before[0]!.resources, horse: mode === 'house' ? 3 : 4, food: mode === 'cook' ? 52 : 50 })
    expect(session.state.players[1]).toEqual(before[1])
    expect(session.state.harvestBreedSummary).toBeUndefined()
    expect(session.state.events.filter((event) => event.type === 'farm.animalBred')).toEqual([expect.objectContaining({ actorPlayerId: 'p1', animals: { horse: 1 } })])
  })
})

describe('Cross expansions batch 4 animal and terrain boundaries', () => {
  it.each([
    { mother: 'PR03' as const, round: 8, animal: 'cattle' as const, food: 3 },
    { mother: 'PR04' as const, round: 7, animal: 'boar' as const, food: 2 },
    { mother: 'PR05' as const, round: 4, animal: 'sheep' as const, food: 2 },
  ].flatMap((row) => (['house', 'cook', 'release'] as const).map((mode) => ({ ...row, mode }))))(
    '$mother can $mode its reward beside a full horse pasture without cooking horses', ({ mother, round, animal, food, mode }) => {
      let session = auditSetup({ mother, moor: true })
      const player = session.state.players[0]!
      auditPastures(player, [{ col: 0, size: 2, animal: 'horse', count: 4 }, ...(mode === 'house' ? [{ col: 2, animal, count: 1 }] : [])])
      const resident = animal === 'sheep' ? 'cattle' : 'sheep'
      player.houseAnimalType = resident
      player.houseAnimalCount = 1
      player.resources[resident] = 1
      session.state.players.forEach((entry) => { entry.resources.fuel = 4 })
      auditOwnMajor(session, 'Major_Fireplace1')
      auditEnterRound(session, round)
      session = auditRestore(session)
      expect(session.getState().interaction).toMatchObject({ playerIndex: 0, request: { kind: 'animal-reorg' } })
      const before = auditClone(session.state)
      const exchange = session.takeAnytimeAction(0, 'exchange')
      expect(exchange.ok, exchange.error).toBe(true)
      expect(exchange.interaction.request.options.some((option) => JSON.stringify(option).includes('horse'))).toBe(false)
      if (mode === 'cook') {
        const option = exchange.interaction.request.options.find((entry) => JSON.stringify(entry).includes(animal))!
        expect(option).toBeDefined()
        expect(session.resolveChoice(0, `bulk:${option.value.split(':')[1]}=1`).ok).toBe(true)
      } else expect(session.resolveChoice(0, 'cancel').ok).toBe(true)
      auditAnimals(session, mode === 'house' ? { 'pen-0': 4, 'pen-2': 2 } : { 'pen-0': 4 })
      expect(session.state.players[0]!.resources.horse).toBe(4)
      expect(session.state.players[0]!.resources[animal]).toBe(mode === 'house' ? 2 : 0)
      expect(session.state.players[0]!.resources.food).toBe(before.players[0]!.resources.food + (mode === 'cook' ? food : 0))
      expect(session.state.players[1]).toEqual(before.players[1])
      expect(session.state.events.filter((event) => event.type === 'farm.animalBred')).toEqual(before.events.filter((event) => event.type === 'farm.animalBred'))
      expect(session.state.futureMeeples.some((entry) => entry.cardId === mother)).toBe(false)
      session = auditRestore(session)
      expect(session.getState().interaction.stateId).toBe('idle')
    },
  )

  it('PR03 spring arrival after the round-seven harvest is not another breeding phase', () => {
    let session = auditSetup({ mother: 'PR03', season: 'spring' })
    auditPastures(session.state.players[0]!, [{ col: 0, size: 3, animal: 'cattle', count: 2 }])
    auditEnterRound(session, 8, 'spring')
    session = auditRestore(session)
    expect(session.state.players[0]!.resources.cattle).toBe(3)
    auditAnimals(session, { 'pen-0': 3 })
    expect(session.state.events.filter((event) => event.type === 'farm.animalBred')).toHaveLength(1)
    const before = auditClone(session.state.players[1])
    expect(session.takeAction(0, 'season-spring-animal-and-fruit').ok).toBe(true)
    auditAnimals(session, { 'pen-0': 4 })
    expect(session.state.players[0]!.resources.cattle).toBe(4)
    expect(session.state.players[1]).toEqual(before)
    expect(session.state.events.filter((event) => event.type === 'farm.animalBred')).toHaveLength(2)
  })

  it('spring private horse breeding does not replace the later normal harvest for either player', () => {
    let session = auditSetup({ season: 'spring', moor: true })
    for (const player of session.state.players) {
      auditPastures(player, [{ col: 0, size: 2, animal: 'horse', count: 2 }])
      player.resources.fuel = 2
    }
    expect(session.takeAction(0, 'season-spring-animal-and-fruit').ok).toBe(true)
    auditAnimals(session, { 'pen-0': 3 })
    auditSettle(session)
    expect(session.state.players.map((player) => player.resources.horse)).toEqual([3, 2])
    session.state.round = 4
    session.state.players.forEach((player) => markAllWorkersUsed(session.state, player))
    expect(session.loadState(session.state).ok).toBe(true)
    expect(session.performRoundEnd().ok).toBe(true)
    for (let step = 0; session.state.round === 4 && step < 20; step++) {
      session = auditRestore(session)
      const response = session.getState()
      if (response.interaction.request.kind === 'animal-reorg') auditAnimals(session, { 'pen-0': response.interaction.playerIndex === 0 ? 4 : 3 })
      else {
        const index = response.interaction.playerIndex
        expect(session.resolveChoice(index, 'confirm', response.interaction.request.kind === 'feed' ? { selections: [] } : { fuelUsed: 2, woodToFuel: 0 }).ok).toBe(true)
      }
    }
    expect(session.state.round).toBe(5)
    expect(session.state.players.map((player) => player.resources.horse)).toEqual([4, 3])
    expect(session.state.players.map((player) => player.resources.food)).toEqual([46, 46])
    expect(session.state.players.map((player) => player.resources.fuel)).toEqual([0, 0])
    expect(session.state.events.filter((event) => event.type === 'farm.animalBred')).toHaveLength(3)
  })

  it('parent selection blocks both players from taking Moor special actions until both submit', () => {
    const session = new GameSession(56126, undefined, { playerCount: 2, enableParentCards: true, parentSelectionSeed: 9004, enableFarmersOfTheMoor: true, allowIncompleteFarmersOfTheMoorMinorDeal: true })
    prepareHands(session)
    session.state.players.forEach((player) => { player.resources = { ...emptyResources, food: 50, horse: 0, fuel: 0 } })
    const card = findSpecialCard(session, 'hiring-fair')
    const candidates = auditClone(session.state.parentSelection!.candidates)
    for (const index of [0, 1]) {
      const before = auditClone(session.state)
      expect(session.takeSpecialAction(index, card.id, 'hiring-fair').ok).toBe(false)
      expect(auditClone(session.state)).toEqual(before)
      const own = candidates[session.state.players[index]!.id]!
      expect(session.submitParentSelection(index, { mother: own.mother[0], father: own.father[0] }).ok).toBe(true)
    }
    expect(session.state.phase).toBe('playing')
    expect(session.takeSpecialAction(0, card.id, 'hiring-fair').ok).toBe(true)
  })

  it('winter Slash and Burn rejects nonforest and distant tiles then creates a PS01 field without food or worker', () => {
    let session = auditSetup({ mother: 'PR08', father: 'PS01', season: 'winter', moor: true })
    const player = session.state.players[0]!
    player.resources.food = 0
    player.fields = [{ row: 0, col: 0, stacks: [] }]
    player.farmTerrain = [{ row: 0, col: 1, kind: 'forest' }, { row: 0, col: 4, kind: 'forest' }, { row: 1, col: 4, kind: 'moor' }]
    expect(session.loadState(session.state).ok).toBe(true)
    const before = auditClone(session.state)
    const card = findSpecialCard(session, 'slash-and-burn')
    for (const tile of [{ row: 1, col: 4 }, { row: 0, col: 4 }, { row: 0, col: 2 }]) {
      expect(session.takeSpecialAction(0, card.id, 'slash-and-burn', { tile }).ok).toBe(false)
      expect(auditClone(session.state)).toEqual(before)
    }
    expect(session.takeSpecialAction(0, card.id, 'slash-and-burn', { tile: { row: 0, col: 1 } }).ok).toBe(true)
    expect(session.state.players[0]!.resources.food).toBe(0)
    expect(session.state.players[0]!.workers).toEqual(before.players[0]!.workers)
    expect(session.state.players[0]!.fields).toHaveLength(2)
    expect(session.state.players[0]!.farmTerrain).toHaveLength(2)
    expect(session.state.events.filter((event) => event.type === 'farm.fieldPlowed')).toEqual([expect.objectContaining({ sourceActionId: 'slash-and-burn' })])
    auditBackToFirst(session)
    session = auditRestore(session)
    auditClaim(session, 'PS01', 1)
    expect(session.state.players[0]!.cardStates.PS01?.extraData?.fatherCompletedTier).toBe(1)
  })

  it.each([0, 1])('winter ordinary plowing in Moor still requires one food with %i available', (food) => {
    const session = auditSetup({ season: 'winter', moor: true })
    session.state.players[0]!.resources.food = food
    const before = auditClone(session.state)
    const response = session.takeAction(0, 'farmland')
    expect(response.ok).toBe(food === 1)
    if (food === 0) { expect(auditClone(session.state)).toEqual(before); return }
    const tile = response.interaction.request.farm.selectableTiles[0]!
    expect(session.commitSelectionChoice(0, { tile }).ok).toBe(true)
    expect(session.state.players[0]!.resources.food).toBe(0)
    expect(session.state.players[0]!.fields).toEqual([{ ...tile, stacks: [] }])
    expect(session.state.players[0]!.farmTerrain).toEqual(before.players[0]!.farmTerrain)
    expect(session.state.actionSpaces.find((space) => space.id === 'farmland')!.takenBy).toHaveLength(1)
  })
})

const auditBuildRooms = (session: GameSession, count: number) => {
  expect(session.takeAction(0, 'farm-expansion').ok).toBe(true)
  if (session.getState().interaction.request.kind === 'choice') auditChoose(session, 'actions.construct.name')
  const response = session.commitSelectionChoice(0, { rooms: [{ row: 1, col: 1 }, { row: 2, col: 1 }].slice(0, count) })
  expect(response.ok, response.error).toBe(true)
  return response
}
const auditBuildingFarm = (session: GameSession, rooms: number, built: number, m037 = false) => {
  const player = session.state.players[0]!
  player.farmTerrain = [{ row: 0, col: 4, kind: 'forest' }, { row: 1, col: 4, kind: 'moor' }]
  player.stableTiles = Array.from({ length: built }, (_, col) => ({ row: 0, col }))
  Object.assign(player.resources, { wood: 5 * rooms, reed: 2 * rooms })
  if (m037) {
    player.minorPlayed = ['M037_BuildingPlan']
    session.state.ordinaryCardDecks.minor = session.state.ordinaryCardDecks.minor.filter((id) => id !== 'M037_BuildingPlan')
  }
  expect(session.loadState(session.state).ok).toBe(true)
}

describe('Cross expansions batch 4 summer construction audit', () => {
  it.each([1, 2].flatMap((rooms) => [0, 1, 4].map((supply) => ({ rooms, supply }))))(
    'Moor summer builds $rooms rooms with $supply stables left and rejects terrain before retry', ({ rooms, supply }) => {
      let session = auditSetup({ season: 'summer', moor: true })
      auditBuildingFarm(session, rooms, 4 - supply)
      const before = auditClone(session.state.players)
      auditBuildRooms(session, rooms)
      session = auditRestore(session)
      if (supply > 0) {
        const prompt = auditAcceptFarm(session)
        const waiting = auditClone(session.state)
        for (const tile of [...session.state.players[0]!.farmTerrain!, session.state.players[0]!.roomTiles[0]!]) {
          expect(session.commitSelectionChoice(0, { stables: [tile] }).ok).toBe(false)
          expect(auditClone(session.state)).toEqual(waiting)
        }
        const stables = prompt.interaction.request.farm.selectableTiles.slice(0, Math.min(rooms, supply))
        expect(session.commitSelectionChoice(1, { stables }).ok).toBe(false)
        expect(auditClone(session.state)).toEqual(waiting)
        expect(session.commitSelectionChoice(0, { stables }).ok).toBe(true)
      }
      auditSettle(session)
      expect(session.state.players[0]!.rooms).toBe(2 + rooms)
      expect(session.state.players[0]!.stableTiles).toHaveLength(4 - supply + Math.min(rooms, supply))
      expect(session.state.players[0]!.resources).toEqual({ ...before[0]!.resources, wood: 0, reed: 0 })
      expect(session.state.players[0]!.farmTerrain).toEqual(before[0]!.farmTerrain)
      expect(session.state.players[1]).toEqual(before[1])
      expect(auditStableTotal(session)).toBe(4)
      expect(session.state.actionSpaces.find((space) => space.id === 'farm-expansion')!.takenBy).toHaveLength(1)
    },
  )

  it('Moor summer building the only empty tile does not block on impossible free stables', () => {
    const session = auditSetup({ season: 'summer', moor: true })
    auditBuildingFarm(session, 1, 0)
    const player = session.state.players[0]!
    const occupied = [...player.farmTerrain!, ...player.roomTiles, { row: 1, col: 1 }]
    player.fields = getAllTilePositions().filter((tile) => !occupied.some((entry) => positionKey(entry) === positionKey(tile))).map((tile) => ({ ...tile, stacks: [] }))
    auditBuildRooms(session, 1)
    const done = auditSettle(session)
    expect(done.interaction.stateId).toBe('idle')
    expect(done.state.players[0]!.stableTiles).toEqual([])
    expect(done.state.players[0]!.rooms).toBe(3)
    expect(auditStableTotal(session)).toBe(4)
  })

  it.each([
    { season: 'summer' as const, rooms: 2, supply: 4, skip: -1, expected: 4 },
    { season: 'summer' as const, rooms: 2, supply: 2, skip: -1, expected: 2 },
    { season: 'summer' as const, rooms: 2, supply: 4, skip: 0, expected: 2 },
    { season: 'summer' as const, rooms: 2, supply: 4, skip: 1, expected: 2 },
    { season: 'winter' as const, rooms: 2, supply: 4, skip: -1, expected: 2 },
    { season: 'summer' as const, rooms: 1, supply: 4, skip: -1, expected: 1 },
    { season: 'winter' as const, rooms: 1, supply: 4, skip: -1, expected: 0 },
  ])('M037 $season rooms=$rooms supply=$supply skip=$skip adds $expected stables across independent prompts', ({ season, rooms, supply, skip, expected }) => {
    let session = auditSetup({ season, moor: true })
    auditBuildingFarm(session, rooms, 4 - supply, true)
    const before = auditClone(session.state.players)
    auditBuildRooms(session, rooms)
    const sources: Array<string | undefined> = []
    for (let step = 0; step < 3 && session.getState().interaction.request.kind === 'choice'; step++) {
      session = auditRestore(session)
      sources.push(session.getState().interaction.sourceCard)
      if (step === skip) expect(session.resolveChoice(0, '__skip__').ok).toBe(true)
      else {
        const prompt = auditAcceptFarm(session)
        session = auditRestore(session)
        const stables = prompt.interaction.request.farm.selectableTiles.slice(0, prompt.interaction.request.farm.maxSelections)
        expect(session.commitSelectionChoice(0, { stables }).ok).toBe(true)
      }
    }
    auditSettle(session)
    expect(session.state.players[0]!.stableTiles).toHaveLength(4 - supply + expected)
    expect(session.state.players[0]!.resources).toEqual({ ...before[0]!.resources, wood: 0, reed: 0 })
    expect(session.state.players[1]).toEqual(before[1])
    expect(auditStableTotal(session)).toBe(4)
    if (rooms === 2 && supply === 4) expect(sources.filter((source) => source === 'M037_BuildingPlan')).toHaveLength(1)
    session = auditRestore(session)
    expect(session.getState().interaction.stateId).toBe('idle')
  })

  it('summer renovation with M037 triggers neither room-based stable source', () => {
    const session = auditSetup({ season: 'summer', moor: true })
    auditBuildingFarm(session, 0, 0, true)
    session.state.round = 14
    Object.assign(session.state.players[0]!.resources, { clay: 2, reed: 1 })
    expect(session.takeAction(0, 'house-redevelopment').ok).toBe(true)
    const done = auditSettle(session)
    expect(done.state.players[0]!.houseType).toBe('clay')
    expect(done.state.players[0]!.stableTiles).toEqual([])
    expect(done.state.players[0]!.resources.clay).toBe(0)
    expect(done.state.players[0]!.resources.reed).toBe(0)
  })
})

const auditBuyMajor = (session: GameSession, id: string, cost: Record<string, number>) => {
  let response = session.resolveChoice(0, id)
  expect(response.ok, response.error).toBe(true)
  if (response.interaction.promptKey === 'prompt.selectPayment') response = choosePaymentByResources(session, response, cost)
  expect(response.ok, response.error).toBe(true)
  return response
}

describe('Cross expansions batch 4 autumn supply audit', () => {
  it.each(['major-improvement', 'illicit-work'] as const)('autumn %s discounts an exposed Cookhouse but preserves extra food and fuel fees', (action) => {
    let session = auditSetup({ season: 'autumn', moor: true })
    auditOwnMajor(session, 'Major_CookingHearth1')
    Object.assign(session.state.players[0]!.resources, { clay: 5, fuel: 1 })
    const before = auditClone(session.state.players)
    const response = action === 'illicit-work'
      ? session.takeSpecialAction(0, findSpecialCard(session, action).id, action)
      : session.takeAction(0, action)
    expect(response.ok, response.error).toBe(true)
    session = auditRestore(session)
    expect(session.state.availableMajorImprovements).toContain('Major_Moor_Cookhouse1')
    const waiting = auditClone(session.state)
    expect(session.resolveChoice(0, 'Major_Moor_Cookhouse2').ok).toBe(false)
    expect(session.resolveChoice(1, 'Major_Moor_Cookhouse1').ok).toBe(false)
    expect(auditClone(session.state)).toEqual(waiting)
    auditBuyMajor(session, 'Major_Moor_Cookhouse1', { clay: 5 })
    auditSettle(session)
    expect(session.state.players[0]!.resources).toEqual({ ...before[0]!.resources, clay: 0, food: action === 'illicit-work' ? 49 : 50, fuel: action === 'illicit-work' ? 0 : 1 })
    expect(session.state.players[0]!.improvements).toEqual(['Major_CookingHearth1', 'Major_Moor_Cookhouse1'])
    expect(session.state.majorImprovementSupply!.flatMap((stack) => stack.cardIds)).not.toContain('Major_Moor_Cookhouse1')
    expect(session.state.players[1]).toEqual(before[1])
    expect(session.state.actionSpaces.find((space) => space.id === 'major-improvement')!.takenBy).toHaveLength(action === 'illicit-work' ? 0 : 1)
    expect(session.state.events.some((event) => event.type === 'resource.paid' && event.resources.clay === 5)).toBe(true)
    session = auditRestore(session)
    expect(session.state.players[0]!.resources.clay).toBe(0)
  })

  it('autumn rejects an underfunded exposed Cookhouse without changing its purchase prompt', () => {
    const session = auditSetup({ season: 'autumn', moor: true })
    session.state.players[1]!.improvements = ['Major_CookingHearth1']
    session.state.players[1]!.playedCards = ['major:Major_CookingHearth1']
    takeMajorImprovementFromSupply(session.state, 'Major_CookingHearth1')
    session.state.players[0]!.resources.clay = 4
    expect(session.takeAction(0, 'major-improvement').ok).toBe(true)
    const before = auditClone(session.state)
    expect(session.resolveChoice(0, 'Major_Moor_Cookhouse1').ok).toBe(false)
    expect(auditClone(session.state)).toEqual(before)
    auditBuyMajor(session, 'Major_Fireplace1', { clay: 1 })
    expect(session.state.players[0]!.resources.clay).toBe(3)
  })

  it.each(['food', 'fuel'] as const)('Illicit Work cannot use autumn to waive its missing %s fee', (missing) => {
    const session = auditSetup({ season: 'autumn', moor: true })
    Object.assign(session.state.players[0]!.resources, { food: 1, fuel: 1, clay: 5, [missing]: 0 })
    const before = auditClone(session.state)
    expect(session.takeSpecialAction(0, findSpecialCard(session, 'illicit-work').id, 'illicit-work').ok).toBe(false)
    expect(auditClone(session.state)).toEqual(before)
  })

  it.each(['major-improvement', 'illicit-work'] as const)('autumn %s returns a Fireplace to its stack when upgrading without a resource refund', (action) => {
    let session = auditSetup({ season: 'autumn', moor: true })
    auditOwnMajor(session, 'Major_Fireplace1')
    session.state.players[0]!.resources.fuel = 1
    const before = auditClone(session.state.players)
    expect(session.state.availableMajorImprovements).toContain('Major_Moor_HorseSlaughterhouse1')
    const response = action === 'illicit-work' ? session.takeSpecialAction(0, findSpecialCard(session, action).id, action) : session.takeAction(0, action)
    expect(response.ok, response.error).toBe(true)
    session = auditRestore(session)
    auditBuyMajor(session, 'Major_CookingHearth1', {})
    auditSettle(session)
    expect(session.state.players[0]!.improvements).toEqual(['Major_CookingHearth1'])
    expect(session.state.players[0]!.resources).toEqual({ ...before[0]!.resources, food: action === 'illicit-work' ? 49 : 50, fuel: action === 'illicit-work' ? 0 : 1 })
    expect(session.state.majorImprovementSupply!.find((stack) => stack.cardIds.includes('Major_Fireplace1'))!.cardIds).toEqual(['Major_Fireplace1', 'Major_Moor_HorseSlaughterhouse1'])
    expect(session.state.availableMajorImprovements).toContain('Major_Fireplace1')
    expect(session.state.availableMajorImprovements).not.toContain('Major_Moor_HorseSlaughterhouse1')
    expect(session.state.availableMajorImprovements).toContain('Major_Moor_Cookhouse1')
  })

  it('autumn Black Market pays full Corn Scoop wood plus fuel without a major discount', () => {
    let session = auditSetup({ season: 'autumn', moor: true })
    session.state.players[0]!.minorHand = ['A067_CornScoop']
    session.state.ordinaryCardDecks.minor = session.state.ordinaryCardDecks.minor.filter((id) => id !== 'A067_CornScoop')
    Object.assign(session.state.players[0]!.resources, { wood: 1, fuel: 1 })
    const before = auditClone(session.state.players)
    expect(session.takeSpecialAction(0, findSpecialCard(session, 'black-market').id, 'black-market').ok).toBe(true)
    if (!session.state.players[0]!.minorPlayed.includes('A067_CornScoop')) expect(session.resolveChoice(0, 'A067_CornScoop').ok).toBe(true)
    auditSettle(session)
    expect(session.state.players[0]!.minorPlayed).toContain('A067_CornScoop')
    expect(session.state.players[0]!.resources).toEqual({ ...before[0]!.resources, wood: 0, fuel: 0 })
    expect(session.state.players[1]).toEqual(before[1])
    expect(session.state.players[0]!.workers).toEqual(before[0]!.workers)
    session = auditRestore(session)
    expect(session.state.players[0]!.resources.wood).toBe(0)
  })
})

describe('Cross expansions batch 4 triple-expansion restoration audit', () => {
  it.each(['house', 'release'] as const)('PR04 pending %s preserves PR06 and summer state then publishes winter endgame scores', (mode) => {
    let session = auditSetup({ mother: 'PR04', otherMother: 'PR06', season: 'summer', moor: true })
    auditPastures(session.state.players[0]!, [{ col: 0, animal: 'horse', count: 1 }])
    if (mode === 'release') {
      session.state.players[0]!.houseAnimalType = 'sheep'
      session.state.players[0]!.houseAnimalCount = 1
      session.state.players[0]!.resources.sheep = 1
    }
    auditEnterRound(session, 7, 'summer')
    session = auditRestore(session)
    expect(session.getState().interaction).toMatchObject({ playerIndex: 0, request: { kind: 'animal-reorg' } })
    expect(session.state.players[0]!.resources.boar).toBe(1)
    expect(session.state.players[1]!.resources.vegetable).toBe(0)
    const before = auditClone(session.state)
    const zones = [
      { id: 'pen-0', zoneType: 'pasture', animalType: 'horse', animalCount: 1 },
      { id: 'house', zoneType: 'house', animalType: mode === 'house' ? 'boar' : 'sheep', animalCount: 1 },
    ]
    expect(session.resolveChoice(1, 'confirm', { zones }).ok).toBe(false)
    expect(auditClone(session.state)).toEqual(before)
    expect(session.resolveChoice(0, 'confirm', { zones }).ok).toBe(true)
    expect(session.state.players[1]!.resources.vegetable).toBe(1)
    expect(session.state.players[0]!.resources.boar).toBe(mode === 'house' ? 1 : 0)
    expect(session.state.futureMeeples).toEqual([])
    expect(session.state.players.map((player) => player.farmTerrain)).toEqual(before.players.map((player) => player.farmTerrain))
    session = auditRestore(session)
    expect(session.state.players[1]!.resources.vegetable).toBe(1)
    session.state.round = 14
    session.state.throughTheSeasons!.currentSeason = 'winter'
    session.state.players[1]!.resources.fuel = 2
    session.state.players.forEach((player) => markAllWorkersUsed(session.state, player))
    expect(session.loadState(session.state).ok).toBe(true)
    expect(session.performRoundEnd().ok).toBe(true)
    const final = auditSettle(session)
    expect(final.state.gameOver).toBe(true)
    expect(final.interaction.stateId).toBe('gameover')
    expect(final.state.players.map((player) => player.sickWorkerIds!.length)).toEqual([2, 0])
    expect(final.state.players.map((player) => player.resources.food)).toEqual([46, 46])
    expect(final.state.players[1]!.resources.vegetable).toBe(1)
    for (const [index, score] of final.scores!.entries()) {
      expect(score.categories.find((category) => category.key === 'parentCards')!.total).toBe(index === 0 ? 0.1 : 0.3)
      expect(score.categories.find((category) => category.key === 'farmers')!.total).toBe(index === 0 ? 2 : 6)
      expect(score.categories.find((category) => category.key === 'horses')!.total).toBe(index === 0 ? 1 : -1)
      expect(score.total).toBeCloseTo(score.categories.reduce((total, category) => total + category.total, 0))
    }
    for (const viewer of ['p1', 'p2', null]) expect(session.buildSyncPayload(final, viewer).scores).toEqual(final.scores)
    expect(final.state.events.filter((event) => event.type === 'resource.moved' && event.sourceCardId === 'PR06' && event.reason === 'receive')).toHaveLength(1)
    session = auditRestore(session)
    expect(session.getState().scores).toEqual(final.scores)
  })
})

describe('Farmers of the Moor compatibility regressions', () => {
  it.each([2, 3, 4, 5, 6])('keeps Farmers of the Moor disabled setup unchanged for %i players', (playerCount) => {
    const state = createInitialState(3650 + playerCount, {
      playerCount,
      enableThroughTheSeasons: true,
      enableCommunityDeck: true,
      deckIds: ['A', 'B', 'C', 'D', 'E'],
    })

    expect(state.enableFarmersOfTheMoor).toBe(false)
    expect(state.farmersOfTheMoor).toBeNull()
    expect(state.actionSpaces.map((space) => space.id)).not.toEqual(
      expect.arrayContaining(['moor-infirmary', 'moor-resource-market-12']),
    )
    for (const player of state.players) {
      expect(player.minorHand).toHaveLength(7)
      expect(player.occupationHand).toHaveLength(7)
      expect(player.farmTerrain).toBeUndefined()
      expect(player.sickWorkerIds).toBeUndefined()
      expect(player.resources.fuel).toBeUndefined()
      expect(player.resources.horse).toBeUndefined()
    }
  })

  it('keeps Through the Seasons summer harvest from requesting Farmers of the Moor heating', () => {
    const session = setupFarmersOfTheMoorSeason('summer')
    for (const player of session.state.players) {
      markAllWorkersUsed(session.state, player)
      player.resources.food = 10
      player.resources.fuel = 0
    }

    const resp = session.performRoundEnd()

    expect(resp.ok).toBe(true)
    expect(resp.interaction.stateId === 'wait' && (resp.interaction.request as { kind: string }).kind === 'heating').toBe(false)
    expect(session.state.players[0]!.sickWorkerIds).toEqual([])
    expect(session.state.players[1]!.sickWorkerIds).toEqual([])
  })

  it('keeps the Autumn major discount mandatory on the Farmers of the Moor major supply', () => {
    const session = setupFarmersOfTheMoorSeason('autumn')
    const player = session.state.players[0]!
    player.resources = {
      ...player.resources,
      wood: 2,
      stone: 2,
      clay: 0,
      reed: 0,
      food: 0,
    }

    let resp = session.takeAction(0, 'major-improvement')

    expect(resp.ok).toBe(true)
    expect(resp.interaction.stateId).toBe('wait')
    if (resp.interaction.stateId !== 'wait') throw new Error('expected major choice')
    expect(resp.interaction.request.options?.map((option: ActionChoiceOption) => option.value)).toContain('Major_Joinery')

    resp = session.resolveChoice(0, 'Major_Joinery')

    expect(resp.ok).toBe(true)
    expect(resp.interaction.promptKey).toBe('prompt.selectPayment')
    if (resp.interaction.stateId !== 'wait') throw new Error('expected payment choice')
    expect(resp.interaction.request.options?.some((option) => hasPaidResources(option, { wood: 2, stone: 2 }))).toBe(false)
    expect(resp.interaction.request.options?.some((option) => hasPaidResources(option, { wood: 1, stone: 2 }))).toBe(true)

    resp = choosePaymentByResources(session, resp, { wood: 1, stone: 2 })

    expect(resp.ok).toBe(true)
    expect(resp.state.players[0]!.improvements).toContain('Major_Joinery')
  })

  it('lets Winter Slash and Burn use a Farmers of the Moor forest without paying the Winter plowing surcharge', () => {
    const session = setupFarmersOfTheMoorSeason('winter')
    const player = session.state.players[0]!
    player.resources.food = 0
    const forest = player.farmTerrain!.find((tile) => tile.kind === 'forest')!
    const card = findSpecialCard(session, 'slash-and-burn')

    const resp = session.takeSpecialAction(0, card.id, 'slash-and-burn', { tile: forest })

    expect(resp.ok).toBe(true)
    expect(resp.state.players[0]!.resources.food).toBe(0)
    expect(resp.state.players[0]!.fields).toContainEqual({
      row: forest.row,
      col: forest.col,
      stacks: [],
    })
    expect(resp.state.players[0]!.farmTerrain).not.toContainEqual(forest)
  })

  it('keeps Spring fence discount ordering with Farmers of the Moor enabled', () => {
    const session = setupFarmersOfTheMoorSeason('spring')
    const player = session.state.players[0]!
    player.resources.wood = 1
    storePendingFenceBonus(player, {
      sourceCard: 'TestFenceBonus',
      counterKey: 'fences',
      freeFences: 3,
    })

    expect(availableIds(session)).toContain('fencing')
    let resp = session.takeAction(0, 'fencing')
    expect(resp.ok).toBe(true)
    const tile = firstEmptyFarmyardTile(player)
    resp = session.commitSelectionChoice(0, {
      edges: oneCellFences(tile.row, tile.col),
      extraWood: 0,
    })

    expect(resp.ok).toBe(true)
    expect(resp.state.players[0]!.resources.wood).toBe(0)
    expect(resp.state.players[0]!.fenceSegments).toHaveLength(4)
  })

  it('runs Parent Cards selection after Farmers of the Moor setup and leaves the variant state active', () => {
    const session = new GameSession(366, undefined, {
      playerCount: 2,
      enableParentCards: true,
      enableFarmersOfTheMoor: true,
      allowIncompleteFarmersOfTheMoorMinorDeal: true,
      parentSelectionSeed: 9001,
    })
    const originalFarmersOfTheMoor = structuredClone(session.state.farmersOfTheMoor)

    expect(session.state.phase).toBe('parent-selection')
    expect(session.state.parentSelection).not.toBeNull()
    expect(session.state.players[0]!.minorHand).toHaveLength(7)
    expect(session.state.players[0]!.minorHand.filter((id) => id.startsWith('M'))).toHaveLength(4)
    expect(session.state.players[0]!.farmTerrain).toHaveLength(8)

    const p1Candidates = session.state.parentSelection!.candidates.p1
    const p2Candidates = session.state.parentSelection!.candidates.p2
    expect(session.submitParentSelection(0, {
      mother: p1Candidates.mother[0],
      father: p1Candidates.father[0],
    }).ok).toBe(true)
    const resp = session.submitParentSelection(1, {
      mother: p2Candidates.mother[0],
      father: p2Candidates.father[0],
    })

    expect(resp.ok).toBe(true)
    expect(resp.state.phase).toBe('playing')
    expect(resp.state.farmersOfTheMoor).toEqual(originalFarmersOfTheMoor)
    expect(resp.state.players[0]!.farmTerrain).toHaveLength(8)
    expect(resp.state.players[0]!.parentCards.mother).toBe(p1Candidates.mother[0])
  })

  it.each([5, 6])('uses Farmers of the Moor action spaces and major supply for %i players', (playerCount) => {
    const state = createInitialState(3670 + playerCount, {
      playerCount,
      enableFarmersOfTheMoor: true,
      allowIncompleteFarmersOfTheMoorMinorDeal: true,
    })
    const actionIds = state.actionSpaces.map((space) => space.id)
    const infirmary = state.actionSpaces.find((space) => space.id === 'moor-infirmary')
    const majorSupplyIds = readMajorSupply(state).flatMap((stack) => stack.cardIds)

    expect(actionIds).toContain('moor-infirmary')
    expect(actionIds).not.toContain('moor-resource-market-12')
    expect(infirmary?.maxOccupancy).toBeNull()
    expect(readMajorSupply(state)).toHaveLength(12)
    expect(sixPlayerDuplicateMajorImprovementIds.some((id) => majorSupplyIds.includes(id))).toBe(false)
  })
})
