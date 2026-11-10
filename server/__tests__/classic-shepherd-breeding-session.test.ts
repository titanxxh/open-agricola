import { afterEach, describe, expect, it } from 'vitest'
import type { GameState, PlayerState } from '../../shared/contract/types'
import { markAllWorkersUsed } from '../../shared/domain/player'
import { rehydrateState, serializeSessionSnapshot } from '../../shared/session/serialization'
import { GameSession, type SessionResponse } from '../game/authoritative-session'
import { createWorkSession } from './_helpers/session-fixtures'

const SHEPHERD = 'OLD_E203_Shepherd'
const FODDER_PLANTER = 'D115_FodderPlanter'
const NIGHT_PASTURE = 'M033_NightPasture'
const sessions: GameSession[] = []
afterEach(() => sessions.splice(0).forEach(session => session.dispose()))

function sheepPasture(player: PlayerState, sheep: number) {
  player.resources.sheep = sheep
  player.pastures = [{
    id: 'sheep', animalType: 'sheep', animalCount: sheep,
    tiles: [{ row: 1, col: 1 }, { row: 1, col: 2 }],
  }]
  player.stableTiles = [{ row: 1, col: 1 }]
  player.fenceSegments = ['H-1-1', 'H-1-2', 'H-2-1', 'H-2-2', 'V-1-1', 'V-1-3'].map(edge => ({
    edge, type: 'fence', source: { kind: 'own', ownerPlayerId: player.id },
  }))
}

function setup(configure?: (state: GameState) => void, moor = false) {
  const session = createWorkSession({ seed: 203, options: { playerCount: 4, enableFarmersOfTheMoor: moor }, configure(state) {
    state.round = 4
    for (const player of state.players) {
      Object.assign(player.resources, { food: 40, fuel: 40 })
      player.farmTerrain = []
      markAllWorkersUsed(state, player)
    }
    const owner = state.players[0]!
    owner.occupationPlayed = [SHEPHERD, FODDER_PLANTER]
    owner.resources.grain = 2
    owner.fields = [{ row: 0, col: 1, stacks: [] }, { row: 0, col: 2, stacks: [] }]
    sheepPasture(owner, 4)
    configure?.(state)
  } })
  sessions.push(session)
  return session
}

function advanceToHousing(session: GameSession) {
  let response = session.performRoundEnd()
  for (let step = 0; step < 24; step++) {
    expect(response.ok, response.error).toBe(true)
    if (response.interaction.stateId !== 'wait') throw new Error('Expected a pending harvest interaction')
    const { request, playerIndex } = response.interaction
    if (request.kind === 'animal-reorg') return response
    if (request.kind === 'heating') {
      response = session.resolveChoice(playerIndex, 'confirm', { fuelUsed: request.required, woodToFuel: 0 })
    } else if (request.kind === 'feed') {
      response = session.resolveChoice(playerIndex, 'confirm', { selections: [] })
    } else if (request.kind === 'confirm-next-player' || request.kind === 'confirm-player-switch') {
      response = session.resolveChoice(playerIndex, 'confirm')
    } else if (request.kind === 'choice') {
      expect(request.options.map(option => option.value)).toContain('__skip__')
      response = session.resolveChoice(playerIndex, '__skip__')
    } else throw new Error(`Unexpected pre-breeding interaction: ${JSON.stringify(response.interaction)}`)
  }
  throw new Error('Breeding housing was not reached')
}

function restore(session: GameSession) {
  const restored = new GameSession(rehydrateState(JSON.parse(JSON.stringify(serializeSessionSnapshot(session.state, session)))))
  sessions.push(restored)
  return restored
}

function houseSheep(session: GameSession, count: number, playerIndex = 0): SessionResponse {
  const response = session.getState()
  expect(response.interaction).toMatchObject({ stateId: 'wait', playerIndex, request: { kind: 'animal-reorg' } })
  const housed = session.resolveChoice(playerIndex, 'confirm', { zones: [{
    id: 'sheep', zoneType: 'pasture', animalType: 'sheep', animalCount: count,
  }] })
  expect(housed.ok, housed.error).toBe(true)
  return housed
}

describe('classic Shepherd breeding at the authoritative boundary', () => {
  it('retains one of two newborns and grants exactly one Fodder Planter sowing', () => {
    const session = setup()
    const pending = advanceToHousing(session)
    expect(pending.state.players[0]!.resources.sheep).toBe(6)
    const birth = structuredClone(pending.state.events.find(event => event.type === 'farm.animalBred')!)
    let response = houseSheep(session, 3)
    const owner = response.state.players[0]!
    expect(response.state.events.filter(event => event.type === 'farm.animalBred' && event.actorPlayerId === owner.id))
      .toEqual([{ ...birth, animals: { sheep: 1 } }])
    expect(response.state.harvestBreedSummary?.[owner.id]).toEqual({ resources: { sheep: 1 }, animalTypes: 1, animalCount: 1 })
    expect(response.interaction).toMatchObject({ stateId: 'wait', promptKey: 'ui.interactionFodderPlanterSow' })
    if (response.interaction.stateId !== 'wait' || response.interaction.request.kind !== 'choice') throw new Error('Expected the Fodder Planter sowing choice')
    const option = response.interaction.request.options.find(candidate => candidate.value !== '__skip__')!
    expect(option).toBeDefined()
    response = session.resolveChoice(0, option.value)
    expect(response.interaction).toMatchObject({ stateId: 'wait', request: { farm: { farmType: 'sow', maxSelections: 1 } } })
    response = session.commitSelectionChoice(0, { crops: [
      { row: 0, col: 1, crop: 'grain' }, { row: 0, col: 2, crop: 'grain' },
    ] })
    expect(response.ok).toBe(false)
    expect(response.state.players[0]!.resources.grain).toBe(2)
    expect(response.state.players[0]!.fields.every(field => field.stacks.length === 0)).toBe(true)
    expect(response.state.events.filter(event => event.type === 'farm.sown')).toEqual([])
    response = session.commitSelectionChoice(0, { crops: [{ row: 0, col: 1, crop: 'grain' }] })
    expect(response.ok, response.error).toBe(true)
    expect(response.state.players[0]!.resources).toMatchObject({ sheep: 3, grain: 1 })
    expect(response.state.players[0]!.fields.map(field => field.stacks)).toEqual([[{ kind: 'grain', remaining: 3 }], []])
    expect(response.state.log).toContainEqual(expect.objectContaining({ key: 'log.sow', playerId: owner.id }))
    expect(response.scores).toHaveLength(4)
    expect(response.scores![0]!.categories.find(category => category.key === 'sheeps')).toMatchObject({ quantity: 3, total: 1 })
  })

  it('counts only housed newborns after Sheep Walker exchanges all four parents', () => {
    const session = setup(state => { state.players[0]!.occupationPlayed.push('B104_SheepWalker') })
    advanceToHousing(session)
    let response = session.takeAnytimeAction(0, 'exchange')
    expect(response.ok, response.error).toBe(true)
    if (response.interaction.stateId !== 'wait' || response.interaction.request.kind !== 'choice') throw new Error('Expected exchange choices')
    const option = response.interaction.request.options.find(candidate =>
      candidate.sourceCard === 'B104_SheepWalker'
      && candidate.effectPreview?.kind === 'resourceExchange'
      && (candidate.effectPreview.resourcesGained?.stone ?? 0) > 0,
    )!
    expect(option).toBeDefined()
    response = session.resolveChoice(0, `bulk:${option.value.split(':')[1]}=4`)
    expect(response.ok, response.error).toBe(true)
    expect(response.state.players[0]!.resources).toMatchObject({ sheep: 2, stone: 4 })
    response = houseSheep(session, 1)
    const owner = response.state.players[0]!
    expect(response.state.harvestBreedSummary?.[owner.id]).toEqual({ resources: { sheep: 1 }, animalTypes: 1, animalCount: 1 })
    expect(response.state.events.filter(event => event.type === 'farm.animalBred'))
      .toEqual([expect.objectContaining({ animals: { sheep: 1 } })])
    if (response.interaction.stateId !== 'wait' || response.interaction.request.kind !== 'choice') throw new Error('Expected the Fodder Planter sowing choice')
    const sow = response.interaction.request.options.find(candidate => candidate.value !== '__skip__')!
    response = session.resolveChoice(0, sow.value)
    expect(response.interaction).toMatchObject({ stateId: 'wait', request: { farm: { farmType: 'sow', maxSelections: 1 } } })
  })

  it.each([{ kept: 2, newborns: 0 }, { kept: 4, newborns: 2 }])('retains $newborns newborns when $kept sheep are housed', ({ kept, newborns }) => {
    const session = setup(state => { state.players[0]!.occupationPlayed = [SHEPHERD] })
    const pending = advanceToHousing(session)
    const birth = structuredClone(pending.state.events.find(event => event.type === 'farm.animalBred')!)
    const response = houseSheep(session, kept)
    expect(response.state.players[0]!.resources.sheep).toBe(kept)
    expect(response.state.events.filter(event => event.type === 'farm.animalBred'))
      .toEqual([{ ...birth, animals: newborns ? { sheep: newborns } : {} }])
    expect(response.state.round).toBe(5)
    expect(response.interaction.stateId).toBe('idle')
  })

  it.each(['before-confirm', 'after-undo'] as const)('recovers partial offspring settlement and retries after undo: %s', recoverAt => {
    let session = setup()
    const pending = advanceToHousing(session)
    const placements = structuredClone(pending.state.harvestBreedPlacement)
    const summary = structuredClone(pending.state.harvestBreedSummary)
    const birth = structuredClone(pending.state.events.find(event => event.type === 'farm.animalBred')!)
    if (recoverAt === 'before-confirm') session = restore(session)
    let response = houseSheep(session, 3)
    expect(response.state.harvestBreedSummary?.[response.state.players[0]!.id].resources).toEqual({ sheep: 1 })
    response = session.undoStep()
    expect(response.ok, response.error).toBe(true)
    expect(response.state.harvestBreedPlacement).toEqual(placements)
    expect(response.state.harvestBreedSummary).toEqual(summary)
    expect(response.interaction).toMatchObject({ stateId: 'wait', request: { kind: 'animal-reorg' } })
    if (recoverAt === 'after-undo') session = restore(session)
    response = houseSheep(session, 3)
    expect(response.state.harvestBreedSummary?.[response.state.players[0]!.id].resources).toEqual({ sheep: 1 })
    expect(response.state.events.filter(event => event.type === 'farm.animalBred')).toEqual([{ ...birth, animals: { sheep: 1 } }])
    response = session.undoStep()
    expect(response.ok, response.error).toBe(true)
    response = houseSheep(session, 2)
    expect(response.state.events.filter(event => event.type === 'farm.animalBred')).toEqual([{ ...birth, animals: {} }])
    expect(response.state.players[0]!.fields.every(field => field.stacks.length === 0)).toBe(true)
    expect(response.state.players[0]!.resources.grain).toBe(2)
    expect(response.state.round).toBe(5)
    expect(response.interaction.stateId).toBe('idle')
  })

  it('preserves earlier owner and opponent birth events when a later saved harvest keeps only one newborn', () => {
    let session = setup(state => {
      state.players[0]!.occupationPlayed = [SHEPHERD]
      sheepPasture(state.players[1]!, 2)
    })
    advanceToHousing(session)
    houseSheep(session, 6)
    let response = houseSheep(session, 3, 1)
    expect(response.state.round).toBe(5)
    const previousBirths = structuredClone(response.state.events.filter(event => event.type === 'farm.animalBred'))
    expect(previousBirths.map(event => event.animals)).toEqual([{ sheep: 2 }, { sheep: 1 }])
    session.state.round = 7
    session.state.players.forEach(player => markAllWorkersUsed(session.state, player))
    session.loadState(session.state)
    const pending = advanceToHousing(session)
    const ownerBirth = structuredClone(pending.state.events.find(event => event.type === 'farm.animalBred' && event.round === 7)!)
    expect(ownerBirth).toMatchObject({ animals: { sheep: 2 } })
    session = restore(session)
    response = houseSheep(session, 3)
    expect(response.interaction).toMatchObject({ stateId: 'wait', playerIndex: 1, request: { kind: 'animal-reorg' } })
    expect(response.state.events.filter(event => event.type === 'farm.animalBred' && event.round === 4)).toEqual(previousBirths)
    expect(response.state.events.find(event => event.id === ownerBirth.id)).toEqual({ ...ownerBirth, animals: { sheep: 1 } })
    expect(response.state.harvestBreedSummary?.[response.state.players[0]!.id].resources).toEqual({ sheep: 1 })
    response = houseSheep(session, 4, 1)
    expect(response.state.events.filter(event => event.type === 'farm.animalBred' && event.round === 4)).toEqual(previousBirths)
    expect(response.state.players.slice(0, 2).map(player => player.resources.sheep)).toEqual([3, 4])
    expect(response.state.round).toBe(8)
    expect(response.interaction.stateId).toBe('idle')
  })

  it('counts two guests on Night Pasture for its owner only', () => {
    const session = setup(state => {
      const [owner, firstGuest, secondGuest] = state.players
      owner!.occupationPlayed = [SHEPHERD]
      owner!.minorPlayed = [NIGHT_PASTURE]
      sheepPasture(owner!, 2)
      const hosted = Object.fromEntries([firstGuest!, secondGuest!].map(guest => {
        guest.resources.sheep = 1
        const id = `card:${NIGHT_PASTURE}:owner:${owner!.id}:animalOwner:${guest.id}`
        return [id, { animalCounts: { sheep: 1 }, ownerPlayerId: owner!.id, animalOwnerPlayerId: guest.id,
          cardId: NIGHT_PASTURE, capacity: 1, allowedAnimalType: null }]
      }))
      owner!.cardStates[NIGHT_PASTURE] = { extraData: { animalCountsByZone: hosted } }
    }, true)
    const pending = advanceToHousing(session)
    expect(pending.interaction).toMatchObject({ stateId: 'wait', playerIndex: 0 })
    expect(pending.state.players.map(player => player.resources.sheep)).toEqual([4, 1, 1, 0])
    const birth = pending.state.events.filter(event => event.type === 'farm.animalBred')
    expect(birth).toEqual([expect.objectContaining({ actorPlayerId: pending.state.players[0]!.id, animals: { sheep: 2 } })])
    const hosted = structuredClone(pending.state.players[0]!.cardStates[NIGHT_PASTURE])
    const response = houseSheep(session, 4)
    expect(response.state.players.map(player => player.resources.sheep)).toEqual([4, 1, 1, 0])
    expect(response.state.players[0]!.cardStates[NIGHT_PASTURE]).toEqual(hosted)
    expect(response.state.round).toBe(5)
    expect(response.interaction.stateId).toBe('idle')
  })

  it('does not count a hosted sheep twice when the guest also has Shepherd', () => {
    const session = setup(state => {
      const [owner, guest] = state.players
      owner!.occupationPlayed = []
      owner!.minorPlayed = [NIGHT_PASTURE]
      sheepPasture(owner!, 1)
      guest!.occupationPlayed = [SHEPHERD]
      sheepPasture(guest!, 3)
      guest!.resources.sheep = 4
      const id = `card:${NIGHT_PASTURE}:owner:${owner!.id}:animalOwner:${guest!.id}`
      owner!.cardStates[NIGHT_PASTURE] = { extraData: { animalCountsByZone: { [id]: {
        animalCounts: { sheep: 1 }, ownerPlayerId: owner!.id, animalOwnerPlayerId: guest!.id,
        cardId: NIGHT_PASTURE, capacity: 1, allowedAnimalType: null,
      } } } }
    }, true)
    let response = advanceToHousing(session)
    const ownerId = response.state.players[0]!.id
    const guestId = response.state.players[1]!.id
    expect(response.interaction).toMatchObject({ stateId: 'wait', playerIndex: 1 })
    expect(response.state.players.map(player => player.resources.sheep)).toEqual([1, 5, 0, 0])
    expect(response.state.events.filter(event => event.type === 'farm.animalBred'))
      .toEqual([expect.objectContaining({ actorPlayerId: guestId, animals: { sheep: 1 } })])
    if (response.interaction.stateId !== 'wait' || response.interaction.request.kind !== 'animal-reorg') throw new Error('Expected guest animal housing')
    const hostedZone = response.interaction.request.zones.find(zone => zone.cardId === NIGHT_PASTURE)!
    expect(hostedZone).toMatchObject({ animalOwnerPlayerId: guestId, ownerPlayerId: ownerId, animalCount: 1 })
    response = session.resolveChoice(1, 'confirm', { zones: [
      { id: 'sheep', zoneType: 'pasture', animalType: 'sheep', animalCount: 4 },
      { id: hostedZone.id, zoneType: 'card', cardId: NIGHT_PASTURE, animalType: 'sheep', animalCount: 1 },
    ] })
    expect(response.ok, response.error).toBe(true)
    expect(response.interaction).toMatchObject({ stateId: 'wait', playerIndex: 0, request: { kind: 'animal-reorg' } })
    response = houseSheep(session, 2)
    expect(response.state.players.map(player => player.resources.sheep)).toEqual([2, 5, 0, 0])
    expect(response.state.events.filter(event => event.type === 'farm.animalBred')).toEqual([
      expect.objectContaining({ actorPlayerId: guestId, animals: { sheep: 1 } }),
      expect.objectContaining({ actorPlayerId: ownerId, animals: { sheep: 1 } }),
    ])
    expect(response.state.round).toBe(5)
    expect(response.interaction.stateId).toBe('idle')
  })
})
