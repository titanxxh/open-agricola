import { afterEach, describe, expect, it } from 'vitest'
import type { GameSession, SessionResponse } from '../game/authoritative-session'
import { createWorkSession } from './_helpers/session-fixtures'
import { buildFarmBoardProjection } from '../../client/app/farm-board-projection'
import { rehydrateStateForClient } from '../../client/services/rehydrate'

const FIELD = 'B113_PatchCaregiver'
const BONUS = 'B115_TinsmithMaster'
const ANIMAL_CARD = 'C011_WildlifeReserve'
const sessions: GameSession[] = []
afterEach(() => sessions.splice(0).forEach(session => session.dispose()))

// #1372 uses existing rules. Seeded two-player work fixtures fix placeholder
// hands before load. Public commands prove mixed farm/card targets, confirmation,
// events, scores and undo; projections consume the resulting owner snapshot.
const sowSession = () => {
  const session = createWorkSession({ seed: 1372, configure: state => {
    state.round = 5
    state.roundActionOrder = state.roundActionOrder.map(() => null)
    state.roundActionOrder[0] = 'grain-utilization'
    for (const player of state.players) player.resources.food = 20
    const player = state.players[0]!
    player.occupationPlayed = [FIELD, BONUS]
    player.fields = [{ row: 0, col: 2, stacks: [] }]
    player.resources.grain = 2
    player.cardStates[FIELD] = { extraData: { cardFieldStacks: [null] } }
  } })
  sessions.push(session)
  return session
}

const animalSession = () => {
  const session = createWorkSession({ seed: 1372, configure: state => {
    state.round = 5
    for (const player of state.players) player.resources.food = 20
    const player = state.players[0]!
    player.minorPlayed = [ANIMAL_CARD]
    player.resources.sheep = 1
    player.resources.boar = 1
    player.resources.cattle = 1
    player.houseAnimals = { '2-0': 'cattle' }
    player.pastures = [{
      id: 'mixed-farm-pasture', size: 1, tiles: [{ row: 0, col: 2 }],
      stables: 0, animalType: 'sheep', animalCount: 1,
    }]
    player.cardStates[ANIMAL_CARD] = { extraData: { animalCounts: { boar: 1 } } }
    state.actionSpaces.find(space => space.id === 'sheep-market')!.resources.sheep = 2
  } })
  sessions.push(session)
  return session
}

const project = (session: GameSession, response: SessionResponse, displayIndex = 0) => {
  const payload = session.buildSyncPayload(response, 'p1', 'viewer', undefined, true)
  const state = rehydrateStateForClient(payload.state)
  const request = payload.interaction.stateId === 'wait' ? payload.interaction.request : null
  return buildFarmBoardProjection({
    displayPlayer: state.players[displayIndex],
    interaction: payload.interaction,
    farmInteraction: request?.kind === 'farm-select' ? request.farm : null,
    selectionInteraction: request?.kind === 'selection' ? request.selection : null,
    players: state.players,
    state,
  })
}

describe('Farm-side Card Field and animal-slot interactions', () => {
  it('sows an ordinary field and a Card Field, offers their bonus targets nearby, and undoes the whole action', () => {
    const session = sowSession()
    const before = session.getState()
    const originalScores = structuredClone(before.scores)
    const started = session.takeAction(0, 'grain-utilization')
    expect(started.ok, started.error).toBe(true)
    expect(started.state.players).toHaveLength(2)
    expect(started.interaction).toMatchObject({ stateId: 'wait', playerIndex: 0, request: {
      kind: 'farm-select', farm: { farmType: 'sow', selectableFields: [
        { tile: { row: 0, col: 2 }, allowedCrops: ['grain'] },
        { tile: { row: -1, col: 2113 }, sourceCard: FIELD, allowedCrops: ['grain'] },
      ] },
    } })
    expect(project(session, started).extraSowTargets).toEqual([{
      key: '-1-2113', tile: { row: -1, col: 2113 },
      sourceCard: FIELD, groupKey: undefined, allowedCrops: ['grain'],
    }])
    expect(started.state.players[0]!.resources.grain).toBe(2)
    expect(started.state.players[0]!.fields[0]!.stacks).toEqual([])
    expect(started.state.players[0]!.cardStates[FIELD]?.extraData?.cardFieldStacks).toEqual([null])
    expect(session.getState().interaction).toEqual(started.interaction)

    let response = session.commitSelectionChoice(0, { crops: [
      { row: 0, col: 2, crop: 'grain' },
      { row: -1, col: 2113, crop: 'grain' },
    ] })
    expect(response.ok, response.error).toBe(true)
    expect(response.state.players[0]!.resources.grain).toBe(0)
    expect(response.state.players[0]!.fields[0]!.stacks).toEqual([{ kind: 'grain', remaining: 3 }])
    expect(response.state.players[0]!.cardStates[FIELD]?.extraData?.cardFieldStacks)
      .toEqual([{ crop: 'grain', remaining: 3 }])
    if (response.interaction.stateId !== 'wait') throw new Error('Expected the optional crop bonus')
    const accept = response.interaction.request.options?.filter(option => option.value !== '__skip__')
    expect(accept).toHaveLength(1)
    response = session.resolveChoice(0, accept![0]!.value)
    expect(response.ok, response.error).toBe(true)
    expect(response.interaction).toMatchObject({ stateId: 'wait', playerIndex: 0, request: {
      kind: 'selection', selection: { kind: 'farm-position', selectablePositions: [
        { row: 0, col: 2 },
        { row: -1, col: 2113, sourceCard: FIELD, groupKey: FIELD, cardFieldSlot: 0 },
      ] },
    } })
    expect(project(session, response).cardFieldTargets).toEqual([{
      tile: { row: -1, col: 2113, sourceCard: FIELD, groupKey: FIELD, cardFieldSlot: 0 },
      stacks: [{ kind: 'grain', remaining: 3 }],
    }])
    expect(project(session, response, 1).cardFieldTargets).toEqual([])

    const confirmed = session.commitSelectionChoice(0, { positions: [
      { row: 0, col: 2 }, { row: -1, col: 2113 },
    ] })
    expect(confirmed.ok, confirmed.error).toBe(true)
    expect(confirmed.interaction).toMatchObject({ stateId: 'wait', request: { kind: 'confirm-next-player' } })
    expect(confirmed.state.players[0]!.fields[0]!.stacks).toEqual([{ kind: 'grain', remaining: 4 }])
    expect(confirmed.state.players[0]!.cardStates[FIELD]?.extraData?.cardFieldStacks)
      .toEqual([{ crop: 'grain', remaining: 4 }])
    expect(confirmed.state.events.filter(event => event.type === 'farm.sown')).toHaveLength(1)
    expect(confirmed.state.events).toContainEqual(expect.objectContaining({
      type: 'farm.sown', sows: [
        { location: { kind: 'field', playerId: 'p1', row: 0, col: 2 }, crop: 'grain', added: 3 },
        { location: { kind: 'field', playerId: 'p1', row: -1, col: 2113 }, crop: 'grain', added: 3 },
      ],
    }))
    expect(confirmed.state.log).toContainEqual(expect.objectContaining({ key: 'log.actionDetail' }))
    expect(confirmed.scores).toHaveLength(2)
    expect(project(session, confirmed).cardFieldTargets).toEqual([])

    const undone = session.undoAction()
    expect(undone.ok, undone.error).toBe(true)
    expect(undone.interaction.stateId).toBe('idle')
    expect(undone.state.players[0]!.resources.grain).toBe(2)
    expect(undone.state.players[0]!.fields[0]!.stacks).toEqual([])
    expect(undone.state.players[0]!.cardStates[FIELD]?.extraData?.cardFieldStacks).toEqual([null])
    expect(undone.state.events.some(event => event.type === 'farm.sown')).toBe(false)
    expect(undone.scores).toEqual(originalScores)
    expect(project(session, undone).cardFieldTargets).toEqual([])
  })

  it('confirms one mixed pasture, house and card-animal layout without moving animals before confirmation, then undoes it', () => {
    const session = animalSession()
    const originalScores = structuredClone(session.getState().scores)
    const pending = session.takeAction(0, 'sheep-market')
    expect(pending.ok, pending.error).toBe(true)
    expect(pending.state.players).toHaveLength(2)
    expect(pending.interaction).toMatchObject({ stateId: 'wait', playerIndex: 0, request: { kind: 'animal-reorg' } })
    if (pending.interaction.stateId !== 'wait' || pending.interaction.request.kind !== 'animal-reorg') {
      throw new Error('Expected mixed animal holders')
    }
    const zones = pending.interaction.request.zones
    expect(zones).toEqual(expect.arrayContaining([
      expect.objectContaining({ id: 'mixed-farm-pasture', zoneType: 'pasture', capacity: 2 }),
      expect.objectContaining({ id: 'house:2-0', zoneType: 'house', capacity: 1 }),
      expect.objectContaining({
        id: `card:${ANIMAL_CARD}`, cardId: ANIMAL_CARD, zoneType: 'card',
        capacity: 3, allowedAnimalTypes: ['sheep', 'boar', 'cattle'],
      }),
    ]))
    expect(pending.state.players[0]!.resources).toMatchObject({ sheep: 3, boar: 1, cattle: 1 })
    expect(pending.state.players[0]!.pastures[0]).toMatchObject({ animalType: 'sheep', animalCount: 1 })
    expect(pending.state.players[0]!.houseAnimals).toEqual({ '2-0': 'cattle' })
    expect(pending.state.players[0]!.cardStates[ANIMAL_CARD]?.extraData?.animalCounts).toEqual({ boar: 1 })
    expect(pending.state.events.some(event => event.type === 'farm.animalMoved')).toBe(false)
    const repeated = session.getState()
    expect(repeated.interaction).toEqual(pending.interaction)
    expect(repeated.scores).toEqual(pending.scores)

    const confirmed = session.resolveChoice(0, 'confirm', { zones: [
      { id: 'mixed-farm-pasture', zoneType: 'pasture', animalType: 'sheep', animalCount: 2 },
      { id: 'house:2-0', zoneType: 'house', animalType: 'cattle', animalCount: 1 },
      { id: `card:${ANIMAL_CARD}`, zoneType: 'card', cardId: ANIMAL_CARD,
        animalType: null, animalCount: 2, animalCounts: { sheep: 1, boar: 1 } },
    ] })
    expect(confirmed.ok, confirmed.error).toBe(true)
    expect(confirmed.interaction).toMatchObject({ stateId: 'wait', request: { kind: 'confirm-next-player' } })
    expect(confirmed.state.players[0]!.resources).toMatchObject({ sheep: 3, boar: 1, cattle: 1 })
    expect(confirmed.state.players[0]!.pastures[0]).toMatchObject({ animalType: 'sheep', animalCount: 2 })
    expect(confirmed.state.players[0]!.houseAnimals).toEqual({ '2-0': 'cattle' })
    expect(confirmed.state.players[0]!.cardStates[ANIMAL_CARD]?.extraData?.animalCounts)
      .toEqual({ sheep: 1, boar: 1 })
    const savedAnimalView = session.buildSyncPayload(confirmed, 'p1').state.players[0]!
    expect(savedAnimalView.playedCardAnimalZones).toContainEqual(expect.objectContaining({
      id: `card:${ANIMAL_CARD}`, cardId: ANIMAL_CARD,
      animalCount: 2, animalCounts: { sheep: 1, boar: 1 },
    }))
    expect(savedAnimalView.roomAnimalZones).toContainEqual(expect.objectContaining({
      id: 'house:2-0', animalType: 'cattle', animalCount: 1,
    }))
    expect(confirmed.state.events.filter(event => event.type === 'farm.animalMoved')).toEqual([
      expect.objectContaining({ type: 'farm.animalMoved', animals: { sheep: 3, boar: 1, cattle: 1 } }),
    ])
    expect(confirmed.state.events.some(event => event.type === 'farm.animalDiscarded')).toBe(false)
    expect(confirmed.state.log.some(entry => entry.key === 'log.reorganizeDiscard')).toBe(false)
    expect(confirmed.state.log).toContainEqual(expect.objectContaining({ key: 'log.actionDetail' }))
    expect(confirmed.scores).toHaveLength(2)
    expect(confirmed.scores?.[0]?.categories.find(category => category.key === 'sheeps'))
      .toMatchObject({ quantity: 3, total: 1 })

    const undone = session.undoAction()
    expect(undone.ok, undone.error).toBe(true)
    expect(undone.interaction.stateId).toBe('idle')
    expect(undone.state.players[0]!.resources).toMatchObject({ sheep: 1, boar: 1, cattle: 1 })
    expect(undone.state.players[0]!.pastures[0]).toMatchObject({ animalType: 'sheep', animalCount: 1 })
    expect(undone.state.players[0]!.houseAnimals).toEqual({ '2-0': 'cattle' })
    expect(undone.state.players[0]!.cardStates[ANIMAL_CARD]?.extraData?.animalCounts).toEqual({ boar: 1 })
    expect(undone.state.actionSpaces.find(space => space.id === 'sheep-market')?.resources.sheep).toBe(2)
    expect(undone.state.events.some(event => event.type === 'farm.animalMoved')).toBe(false)
    expect(undone.scores).toEqual(originalScores)
  })
})
