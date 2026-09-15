import { describe, expect, it } from 'vitest'
import { GameSession, type SessionResponse } from '../game/authoritative-session'
import { storePendingFenceBonus } from '../../shared/cards/helpers/pending-fence-bonus'
import { markAllWorkersUsed, setActiveWorkerCount, setWorkersAtHome } from '../../shared/domain/player'
import { emptyResources } from '../../shared/session/state-bootstrap'
import { serializeSessionSnapshot, rehydrateState } from '../../shared/session/serialization'
import type { PlayerState } from '../../shared/contract/types'
import '../../shared/cards/A/A065_SeedPellets'
import '../../shared/cards/B/B094_StockProtector'

type SeasonId = 'winter' | 'spring' | 'summer' | 'autumn'
type SeasonsState = {
  enableThroughTheSeasons?: boolean
  throughTheSeasons?: {
    startSeason: SeasonId
    currentSeason: SeasonId
  } | null
}

const springActionId = 'season-spring-animal-and-fruit'

const oneCellFences = (row: number, col: number) => [
  `H-${row}-${col}`,
  `H-${row + 1}-${col}`,
  `V-${row}-${col}`,
  `V-${row}-${col + 1}`,
]

const springPalisadeFenceEdges = ['H-1-0', 'V-0-1']
const springPalisadeEdges = ['H-0-0', 'V-0-0']

const seasonsOf = (session: GameSession) => session.state as typeof session.state & SeasonsState

const setupSpring = () => {
  const session = new GameSession(351, undefined, {
    playerCount: 2,
    enableThroughTheSeasons: true,
  } as never)
  const state = seasonsOf(session)
  state.currentPlayerIndex = 0
  state.round = 1
  state.roundPhase = 'work'
  state.roundActionOrder[0] = 'fencing'
  state.throughTheSeasons = { startSeason: 'spring', currentSeason: 'spring' }
  state.players.forEach((player) => {
    player.minorHand = ['__test_placeholder__']
    player.occupationHand = ['__test_placeholder__']
  })
  const player = state.players[0]!
  setActiveWorkerCount(player, 2)
  setWorkersAtHome(state, player, 2)
  session.loadState(state)
  return session
}

const availableIds = (session: GameSession, playerIndex = 0) =>
  session.getAvailableActions(playerIndex).map((action) => action.spaceId)

const chooseByLabel = (
  session: GameSession,
  resp: SessionResponse,
  labelKey: string,
) => {
  expect(resp.interaction.stateId).toBe('wait')
  if (resp.interaction.stateId !== 'wait') throw new Error('expected choice prompt')
  const option = resp.interaction.request.options?.find((entry) => entry.labelKey === labelKey)
  expect(option).toBeDefined()
  return session.resolveChoice(resp.interaction.playerIndex, option!.value)
}

const auditClone = <T>(value: T): T => JSON.parse(JSON.stringify(value))
const auditSpring = () => {
  const session = setupSpring()
  for (const player of session.state.players) player.resources = { ...emptyResources, food: 50 }
  return session
}
const auditRestore = (session: GameSession) => {
  const restored = new GameSession(351, undefined, { playerCount: 2 })
  const response = restored.loadState(rehydrateState(auditClone(serializeSessionSnapshot(session.state, session))))
  expect(response.ok, response.error).toBe(true)
  expect(response.interaction).toEqual(session.getState().interaction)
  return restored
}
const auditPen = (player: PlayerState, count: number, animal: 'sheep' | 'boar' | 'cattle' = 'sheep') => {
  player.resources[animal] = count
  player.pastures = [{ id: 'pen', size: 2, tiles: [{ row: 0, col: 0 }, { row: 0, col: 1 }], stables: 0, animalType: count > 0 ? animal : null, animalCount: count }]
  player.fenceSegments = ['H-0-0', 'H-0-1', 'H-1-0', 'H-1-1', 'V-0-0', 'V-0-2'].map((edge) => ({ edge, type: 'fence', source: { kind: 'own', ownerPlayerId: player.id } }))
}
const auditAnimals = (session: GameSession) => {
  const response = session.getState()
  if (response.interaction.stateId !== 'wait' || response.interaction.request.kind !== 'animal-reorg') return response
  const player = session.state.players[response.interaction.playerIndex]!
  const before = auditClone(session.state)
  const zones = response.interaction.request.zones.map((zone) => ({ id: zone.id, zoneType: zone.zoneType, animalType: zone.id === 'pen' ? 'sheep' : zone.animalType, animalCount: zone.id === 'pen' ? player.resources.sheep : zone.animalCount }))
  expect(session.resolveChoice(1, 'confirm', { zones }).ok).toBe(false)
  expect(auditClone(session.state)).toEqual(before)
  const done = session.resolveChoice(0, 'confirm', { zones })
  expect(done.ok, done.error).toBe(true)
  return done
}

describe('Seasons batch 3 spring audit', () => {
  it.each([0, 1, 2, 3])('spring breeding with %i sheep uses current pairs and never harvests the other player', (count) => {
    let session = auditSpring()
    auditPen(session.state.players[0]!, count)
    auditPen(session.state.players[1]!, 2)
    session.state.players[0]!.fields = [{ row: 1, col: 1, stacks: [{ kind: 'grain', remaining: 3 }] }]
    const before = auditClone(session.state)
    const response = session.takeAction(0, springActionId)
    expect(response.ok).toBe(count >= 2)
    if (count < 2) { expect(auditClone(session.state)).toEqual(before); return }
    session = auditRestore(session)
    auditAnimals(session)
    expect(session.state.players[0]!.resources).toEqual({ ...before.players[0]!.resources, sheep: count + 1 })
    expect(session.state.players[0]!.fields).toEqual(before.players[0]!.fields)
    expect(session.state.players[1]).toEqual(before.players[1])
    expect(session.state.harvestBreedSummary).toBeUndefined()
    expect(session.state.events.filter((event) => event.type === 'farm.animalBred')).toEqual([expect.objectContaining({ actorPlayerId: 'p1', animals: { sheep: 1 } })])
    expect(session.state.log.length).toBeGreaterThan(before.log.length)
  })

  it.each(['breed', 'sow', 'breed-sow', 'sow-breed'] as const)('Animal and Fruit %s completes only the selected branches in order after restore', (order) => {
    let session = auditSpring()
    auditPen(session.state.players[0]!, 2)
    auditPen(session.state.players[1]!, 2)
    session.state.players[0]!.fields = [{ row: 1, col: 1, stacks: [] }, { row: 1, col: 2, stacks: [] }]
    session.state.players[0]!.resources.grain = 1
    session.state.players[0]!.resources.vegetable = 1
    const other = auditClone(session.state.players[1])
    let response = session.takeAction(0, springActionId)
    expect(response.ok, response.error).toBe(true)
    const label = order.includes('-') ? `actions.season-spring-animal-and-fruit.option-${order}` : `actions.${order}.name`
    response = chooseByLabel(session, response, label)
    expect(response.ok, response.error).toBe(true)
    session = auditRestore(session)
    for (const action of order.split('-')) {
      if (action === 'breed') auditAnimals(session)
      else {
        const before = auditClone(session.state)
        const crops = [{ row: 1, col: 1, crop: 'grain' as const }, { row: 1, col: 2, crop: 'vegetable' as const }]
        expect(session.commitSelectionChoice(1, { crops }).ok).toBe(false)
        expect(session.commitSelectionChoice(0, { crops: [{ ...session.state.players[0]!.roomTiles[0]!, crop: 'grain' }] }).ok).toBe(false)
        expect(auditClone(session.state)).toEqual(before)
        const done = session.commitSelectionChoice(0, { crops })
        expect(done.ok, done.error).toBe(true)
      }
    }
    auditAnimals(session)
    expect(session.state.players[0]!.resources.sheep).toBe(order.includes('breed') ? 3 : 2)
    expect(session.state.players[0]!.resources.grain).toBe(order.includes('sow') ? 0 : 1)
    expect(session.state.players[0]!.resources.vegetable).toBe(order.includes('sow') ? 0 : 1)
    expect(session.state.players[1]).toEqual(other)
    expect(session.state.harvestBreedSummary).toBeUndefined()
    const eventOrder = session.state.events.filter((event) => event.type === 'farm.animalBred' || event.type === 'farm.sown').map((event) => event.type)
    expect(eventOrder).toEqual(order.split('-').map((action) => action === 'breed' ? 'farm.animalBred' : 'farm.sown'))
  })

  it.each(['release', 'cook'] as const)('spring newborns can be handled by %s without another breeding or field phase', (mode) => {
    let session = auditSpring()
    auditPen(session.state.players[0]!, 4)
    session.state.players[0]!.houseAnimalType = 'cattle'
    session.state.players[0]!.houseAnimalCount = session.state.players[0]!.resources.cattle = 1
    if (mode === 'cook') {
      session.state.players[0]!.improvements = ['Major_Fireplace1']
      session.state.availableMajorImprovements = session.state.availableMajorImprovements.filter((id) => id !== 'Major_Fireplace1')
    }
    const before = auditClone(session.state)
    expect(session.takeAction(0, springActionId).ok).toBe(true)
    session = auditRestore(session)
    if (mode === 'cook') {
      const exchange = session.takeAnytimeAction(0, 'exchange')
      expect(exchange.ok, exchange.error).toBe(true)
      const option = exchange.interaction.request.options.find((entry) => JSON.stringify(entry).includes('sheep'))!
      expect(option).toBeDefined()
      expect(session.resolveChoice(0, `bulk:${option.value.split(':')[1]}=1`).ok).toBe(true)
    }
    const response = session.getState()
    if (response.interaction.stateId === 'wait' && response.interaction.request.kind === 'animal-reorg') {
      expect(session.resolveChoice(0, 'confirm', { zones: [
        { id: 'pen', zoneType: 'pasture', animalType: 'sheep', animalCount: 4 },
        { id: 'house', zoneType: 'house', animalType: 'cattle', animalCount: 1 },
      ] }).ok).toBe(true)
    }
    expect(session.state.players[0]!.resources).toEqual({ ...before.players[0]!.resources, food: mode === 'cook' ? 52 : 50 })
    expect(session.state.players[1]).toEqual(before.players[1])
    expect(session.state.events.filter((event) => event.type === 'farm.animalBred')).toHaveLength(1)
    expect(session.state.harvestBreedSummary).toBeUndefined()
  })

  it.each([4, 6])('spring %i-fence enclosure pays two fewer wood and rejects invalid choices after restore', (count) => {
    let session = auditSpring()
    session.state.players[0]!.resources.wood = count - 2
    expect(session.takeAction(0, 'fencing').ok).toBe(true)
    session = auditRestore(session)
    const before = auditClone(session.state)
    expect(session.commitSelectionChoice(0, { edges: ['H-0-0'], extraWood: 0 }).ok).toBe(false)
    expect(auditClone(session.state)).toEqual(before)
    const edges = count === 4 ? oneCellFences(0, 0) : ['H-0-0', 'H-0-1', 'H-1-0', 'H-1-1', 'V-0-0', 'V-0-2']
    expect(session.commitSelectionChoice(1, { edges, extraWood: 0 }).ok).toBe(false)
    expect(auditClone(session.state)).toEqual(before)
    const done = session.commitSelectionChoice(0, { edges, extraWood: 0 })
    expect(done.ok, done.error).toBe(true)
    expect(done.state.players[0]!.resources.wood).toBe(0)
    expect(done.state.players[0]!.fenceSegments).toHaveLength(count)
    expect(new Set(done.state.players[0]!.fenceSegments.map((edge) => edge.edge)).size).toBe(count)
    expect(done.state.players[1]).toEqual(before.players[1])
    expect(done.state.events.filter((event) => event.type === 'farm.fenceBuilt')).toHaveLength(1)
  })

  it('spring fencing is unavailable with no payable wood', () => {
    const session = auditSpring()
    const before = auditClone(session.state)
    expect(session.takeAction(0, 'fencing').ok).toBe(false)
    expect(auditClone(session.state)).toEqual(before)
  })

  it('spring fencing with one wood rejects an unfulfillable enclosure before placing a worker', () => {
    const session = auditSpring()
    session.state.players[0]!.resources.wood = 1
    const before = auditClone(session.state)
    const response = session.takeAction(0, 'fencing')
    expect(response.ok).toBe(false)
    expect(auditClone(response.state)).toEqual(before)
    expect(response.interaction.stateId).toBe('idle')
    const alternative = session.takeAction(0, 'grain-seeds')
    expect(alternative.ok, alternative.error).toBe(true)
    expect(alternative.state.players[0]!.resources.grain).toBe(1)
    expect(alternative.state.players[0]!.resources.wood).toBe(1)
    expect(alternative.state.players[1]).toEqual(before.players[1])
    expect(alternative.state.events.filter((event) => event.type === 'farm.fenceBuilt')).toHaveLength(0)
  })

  it('spring breeding produces one of each paired species rather than one per pair', () => {
    const session = auditSpring()
    const player = session.state.players[0]!
    player.pastures = (['sheep', 'boar', 'cattle'] as const).map((animal, col) => ({ id: `pen-${col}`, size: 1, tiles: [{ row: 0, col }], stables: 1, animalType: animal, animalCount: 2 }))
    player.stableTiles = [0, 1, 2].map((col) => ({ row: 0, col }))
    player.fenceSegments = [...new Set([0, 1, 2].flatMap((col) => oneCellFences(0, col)))].map((edge) => ({ edge, type: 'fence', source: { kind: 'own', ownerPlayerId: player.id } }))
    Object.assign(player.resources, { sheep: 2, boar: 2, cattle: 2 })
    expect(session.takeAction(0, springActionId).ok).toBe(true)
    const response = session.getState()
    if (response.interaction.request.kind === 'animal-reorg') expect(session.resolveChoice(0, 'confirm', { zones: player.pastures.map((pen) => ({ id: pen.id, zoneType: 'pasture', animalType: pen.animalType, animalCount: 3 })) }).ok).toBe(true)
    expect(session.state.players[0]!.resources).toEqual({ ...emptyResources, food: 50, sheep: 3, boar: 3, cattle: 3 })
    expect(session.state.events.filter((event) => event.type === 'farm.animalBred')).toEqual([expect.objectContaining({ animals: { sheep: 1, boar: 1, cattle: 1 } })])
  })

  it('spring sow-only branch rejects empty selection and unowned seed then permits retry', () => {
    const session = auditSpring()
    session.state.players[0]!.fields = [{ row: 0, col: 0, stacks: [] }]
    session.state.players[0]!.resources.grain = 1
    expect(session.takeAction(0, springActionId).ok).toBe(true)
    const before = auditClone(session.state)
    expect(session.commitSelectionChoice(0, { crops: [{ row: 0, col: 0, crop: 'vegetable' }] }).ok).toBe(false)
    expect(auditClone(session.state)).toEqual(before)
    expect(session.commitSelectionChoice(0, { crops: [] })).toMatchObject({ ok: false, error: 'NO_SELECTION' })
    expect(auditClone(session.state)).toEqual(before)
    const response = session.commitSelectionChoice(0, { crops: [{ row: 0, col: 0, crop: 'grain' }] })
    expect(response.ok, response.error).toBe(true)
    expect(response.state.players[0]!.resources.grain).toBe(0)
    expect(response.state.players[0]!.fields[0]!.stacks).toEqual([{ kind: 'grain', remaining: 3 }])
  })

  it.each(['fencing', 'farm-redevelopment'])('spring %s can add an adjacent pasture with three fences for the minimum one wood', (action) => {
    let session = auditSpring()
    session.state.round = 14
    auditPen(session.state.players[0]!, 0)
    Object.assign(session.state.players[0]!.resources, { wood: 1, clay: 2, reed: 1 })
    const response = session.takeAction(0, action)
    expect(response.ok, response.error).toBe(true)
    if (response.interaction.request.kind === 'choice') expect(chooseByLabel(session, response, 'actions.fencing.name').ok).toBe(true)
    session = auditRestore(session)
    const response2 = session.commitSelectionChoice(0, { edges: ['H-0-2', 'H-1-2', 'V-0-3'], extraWood: 0 })
    expect(response2.ok, response2.error).toBe(true)
    expect(response2.state.players[0]!.resources.wood).toBe(0)
    expect(response2.state.players[0]!.fenceSegments).toHaveLength(9)
    expect(response2.state.players[0]!.houseType).toBe(action === 'farm-redevelopment' ? 'clay' : 'wood')
  })

  it('spring private breeding does not replace the later normal harvest breeding', () => {
    const session = auditSpring()
    auditPen(session.state.players[0]!, 2)
    auditPen(session.state.players[1]!, 2)
    expect(session.takeAction(0, springActionId).ok).toBe(true)
    auditAnimals(session)
    session.state.round = 4
    session.state.players.forEach((player) => markAllWorkersUsed(session.state, player))
    expect(session.loadState(session.state).ok).toBe(true)
    let response = session.performRoundEnd()
    for (let step = 0; response.state.round === 4 && step < 20; step++) {
      expect(response.ok, response.error).toBe(true)
      const request = response.interaction.request
      if (request.kind === 'feed') response = session.resolveChoice(response.interaction.playerIndex, 'confirm', { selections: [] })
      else if (request.kind === 'animal-reorg') response = session.resolveChoice(response.interaction.playerIndex, 'confirm', { zones: request.zones.map((zone) => ({ id: zone.id, zoneType: zone.zoneType, animalType: zone.id === 'pen' ? 'sheep' : null, animalCount: zone.id === 'pen' ? session.state.players[response.interaction.playerIndex]!.resources.sheep : 0 })) })
      else throw new Error(JSON.stringify(response.interaction))
    }
    expect(response.state.round).toBe(5)
    expect(response.state.players.map((player) => player.resources.sheep)).toEqual([4, 3])
    expect(response.state.players.map((player) => player.resources.food)).toEqual([46, 46])
  })
})

describe('Through the Seasons Spring rules', () => {
  it('offers Animal and Fruit choices for breeding, sowing, and both orders', () => {
    const session = setupSpring()
    const player = session.state.players[0]!
    player.resources.grain = 1
    player.fields = [{ row: 0, col: 0, stacks: [] }]
    player.resources.sheep = 2
    player.pastures = [{
      id: 'pasture-1',
      size: 3,
      tiles: [{ row: 0, col: 1 }, { row: 0, col: 2 }, { row: 0, col: 3 }],
      stables: 0,
      animalType: 'sheep',
      animalCount: 2,
    }]

    const resp = session.takeAction(0, springActionId)

    expect(resp.ok).toBe(true)
    expect(resp.interaction.stateId).toBe('wait')
    if (resp.interaction.stateId !== 'wait') throw new Error('expected choice prompt')
    expect(resp.interaction.request.options?.map((option) => option.labelKey)).toEqual(
      expect.arrayContaining([
        'actions.breed.name',
        'actions.sow.name',
        'actions.season-spring-animal-and-fruit.option-breed-sow',
        'actions.season-spring-animal-and-fruit.option-sow-breed',
      ]),
    )
  })

  it('keeps Animal and Fruit unavailable when neither breeding nor sowing can happen', () => {
    const session = setupSpring()

    expect(availableIds(session)).not.toContain(springActionId)
    expect(session.takeAction(0, springActionId)).toMatchObject({
      ok: false,
      error: 'space unavailable',
    })
  })

  it('runs private breeding only for the acting player without harvest summary', () => {
    const session = setupSpring()
    const player = session.state.players[0]!
    const opponent = session.state.players[1]!
    player.resources.grain = 1
    player.fields = [{ row: 0, col: 0, stacks: [] }]
    player.resources.sheep = 2
    opponent.resources.sheep = 2
    player.pastures = [{
      id: 'pasture-1',
      size: 3,
      tiles: [{ row: 0, col: 1 }, { row: 0, col: 2 }, { row: 0, col: 3 }],
      stables: 0,
      animalType: 'sheep',
      animalCount: 2,
    }]
    opponent.pastures = [{
      id: 'pasture-2',
      size: 3,
      tiles: [{ row: 0, col: 1 }, { row: 0, col: 2 }, { row: 0, col: 3 }],
      stables: 0,
      animalType: 'sheep',
      animalCount: 2,
    }]

    const resp = chooseByLabel(
      session,
      session.takeAction(0, springActionId),
      'actions.breed.name',
    )

    expect(resp.ok).toBe(true)
    expect(resp.state.players[0]!.resources.sheep).toBe(3)
    expect(resp.state.players[1]!.resources.sheep).toBe(2)
    expect(resp.state.harvestBreedSummary).toBeUndefined()
  })

  it('runs Spring sowing through the ordinary sow farm selection', () => {
    const session = setupSpring()
    const player = session.state.players[0]!
    player.resources.grain = 1
    player.fields = [{ row: 0, col: 0, stacks: [] }]

    let resp = session.takeAction(0, springActionId)

    expect(resp.interaction.stateId).toBe('wait')
    if (resp.interaction.stateId !== 'wait') throw new Error('expected sow prompt')
    expect(resp.interaction.promptKey).toBe('ui.interactionSowSelect')
    expect(resp.interaction.request.farm.farmType).toBe('sow')

    resp = session.commitSelectionChoice(0, {
      crops: [{ row: 0, col: 0, crop: 'grain' }],
    })

    expect(resp.ok).toBe(true)
    expect(resp.state.players[0]!.resources.grain).toBe(0)
    expect(resp.state.players[0]!.fields).toContainEqual({
      row: 0,
      col: 0,
      stacks: [{ kind: 'grain', remaining: 3 }],
    })
  })

  it('uses hook-dispatched sow doability when building Animal and Fruit branches', () => {
    const session = setupSpring()
    const player = session.state.players[0]!
    player.minorPlayed.push('A065_SeedPellets')
    player.resources.grain = 0
    player.fields = [{ row: 0, col: 0, stacks: [] }]

    expect(availableIds(session)).toContain(springActionId)
    let resp = session.takeAction(0, springActionId)

    expect(resp.interaction.stateId).toBe('wait')
    if (resp.interaction.stateId !== 'wait') throw new Error('expected sow prompt')
    expect(resp.interaction.promptKey).toBe('ui.interactionSowSelect')

    resp = session.commitSelectionChoice(0, {
      crops: [{ row: 0, col: 0, crop: 'grain' }],
    })

    expect(resp.ok).toBe(true)
    expect(resp.state.players[0]!.resources.grain).toBe(0)
    expect(resp.state.players[0]!.fields).toContainEqual({
      row: 0,
      col: 0,
      stacks: [{ kind: 'grain', remaining: 3 }],
    })
  })

  it('can resolve Sow then Breeding in the chosen order', () => {
    const session = setupSpring()
    const player = session.state.players[0]!
    player.resources.grain = 1
    player.fields = [{ row: 0, col: 0, stacks: [] }]
    player.resources.sheep = 2
    player.pastures = [{
      id: 'pasture-1',
      size: 3,
      tiles: [{ row: 0, col: 1 }, { row: 0, col: 2 }, { row: 0, col: 3 }],
      stables: 0,
      animalType: 'sheep',
      animalCount: 2,
    }]

    let resp = chooseByLabel(
      session,
      session.takeAction(0, springActionId),
      'actions.season-spring-animal-and-fruit.option-sow-breed',
    )
    expect(resp.interaction.stateId).toBe('wait')
    if (resp.interaction.stateId !== 'wait') throw new Error('expected sow prompt')
    expect(resp.interaction.promptKey).toBe('ui.interactionSowSelect')

    resp = session.commitSelectionChoice(0, {
      crops: [{ row: 0, col: 0, crop: 'grain' }],
    })

    expect(resp.ok).toBe(true)
    expect(resp.state.players[0]!.resources.grain).toBe(0)
    expect(resp.state.players[0]!.resources.sheep).toBe(3)
  })

  it('lets Spring fencing build 4 ordinary fences for 2 wood in one payment', () => {
    const session = setupSpring()
    const player = session.state.players[0]!
    player.resources.wood = 2

    expect(availableIds(session)).toContain('fencing')
    let resp = session.takeAction(0, 'fencing')
    expect(resp.ok).toBe(true)
    resp = session.commitSelectionChoice(0, {
      edges: oneCellFences(0, 0),
      extraWood: 0,
    })

    expect(resp.ok).toBe(true)
    expect(resp.state.players[0]!.resources.wood).toBe(0)
    expect(resp.state.players[0]!.fenceSegments).toHaveLength(4)
  })

  it('does not let Spring free fences reduce an ordinary fence payment below 1 wood', () => {
    const session = setupSpring()
    const player = session.state.players[0]!
    player.resources.wood = 1
    storePendingFenceBonus(player, {
      sourceCard: 'TestFenceBonus',
      counterKey: 'fences',
      freeFences: 3,
    })

    let resp = session.takeAction(0, 'fencing')
    expect(resp.ok).toBe(true)
    resp = session.commitSelectionChoice(0, {
      edges: oneCellFences(0, 0),
      extraWood: 0,
    })

    expect(resp.ok).toBe(true)
    expect(resp.state.players[0]!.resources.wood).toBe(0)
  })

  it('keeps Spring fencing unavailable without one payable wood', () => {
    const session = setupSpring()
    const player = session.state.players[0]!
    player.resources.wood = 0

    expect(availableIds(session)).not.toContain('fencing')
    expect(session.takeAction(0, 'fencing')).toMatchObject({
      ok: false,
      error: 'space unavailable',
    })
    expect(session.state.actionSpaces.find((space) => space.id === 'fencing')?.takenBy).toEqual([])
  })

  it('does not veto card-provided free fencing in Spring', () => {
    const session = setupSpring()
    const player = session.state.players[0]!
    player.occupationPlayed.push('B094_StockProtector')
    player.resources.wood = 0

    expect(availableIds(session)).toContain('fencing')
    const resp = session.takeAction(0, 'fencing')

    expect(resp.ok).toBe(true)
    expect(resp.interaction.stateId).toBe('wait')
    if (resp.interaction.stateId !== 'wait') throw new Error('expected fence prompt')
    expect(resp.interaction.promptKey).toBe('ui.interactionFenceSelect')
  })

  it('does not apply Spring free fences to palisades', () => {
    const session = setupSpring()
    const player = session.state.players[0]!
    player.resources.wood = 4
    player.minorPlayed.push('B030_WoodPalisades')

    let resp = session.takeAction(0, 'fencing')
    expect(resp.ok).toBe(true)
    resp = session.commitSelectionChoice(0, {
      edges: springPalisadeFenceEdges,
      palisadeEdges: springPalisadeEdges,
      extraWood: 0,
    })

    expect(resp.ok).toBe(false)
    expect(resp.state.players[0]!.resources.wood).toBe(4)
    expect(resp.state.players[0]!.fenceSegments).toHaveLength(0)
  })
})
