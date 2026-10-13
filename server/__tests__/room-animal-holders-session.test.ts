import { afterEach, describe, expect, it } from 'vitest'
import { createWorkSession } from './_helpers/session-fixtures'
import { GameSession } from '../game/authoritative-session'
import { serializeSessionSnapshot, rehydrateState } from '../../shared/session/serialization'
import { getAssignedAnimalsByType } from '../../shared/domain/animals'

const sessions: GameSession[] = []
afterEach(() => sessions.splice(0).forEach(session => session.dispose()))

function setup(tamer = true, moor = false) {
  const session = createWorkSession({ seed: 42, options: { playerCount: 2, enableFarmersOfTheMoor: moor }, configure(state) {
    state.round = 8
    const player = state.players[0]!
    player.roomTiles = [{ row: 0, col: 0 }, { row: 1, col: 0 }]
    player.rooms = 2
    player.occupationPlayed = tamer ? ['A086_AnimalTamer'] : []
    player.resources.sheep = 1
    player.resources.food = 20
    player.houseAnimals = { '0-0': 'sheep' }
    player.farmTerrain = []
    state.actionSpaces.find(space => space.id === 'pig-market')!.resources.boar = 1
  } })
  sessions.push(session)
  return session
}

const mixedRooms = [
  { id: 'house:0-0', zoneType: 'house' as const, animalType: 'sheep' as const, animalCount: 1 },
  { id: 'house:1-0', zoneType: 'house' as const, animalType: 'boar' as const, animalCount: 1 },
]

describe('Room Animal Holders', () => {
  it('keeps sheep and boar in distinct real rooms through collection and snapshot restoration', () => {
    const session = setup()
    const collected = session.takeAction(0, 'pig-market')
    expect(collected.ok).toBe(true)
    expect(collected.interaction.stateId).toBe('wait')
    if (collected.interaction.stateId !== 'wait' || collected.interaction.request.kind !== 'animal-reorg') throw new Error('expected animal reorganization')
    expect(collected.interaction.request.zones.filter(zone => zone.zoneType === 'house')).toMatchObject([
      { id: 'house:0-0', capacity: 1, farmPosition: { row: 0, col: 0 } },
      { id: 'house:1-0', capacity: 1, farmPosition: { row: 1, col: 0 } },
    ])
    const response = session.resolveChoice(0, 'confirm', { zones: mixedRooms })
    expect(response.ok).toBe(true)
    expect(response.state.players[0]!.houseAnimals).toEqual({ '0-0': 'sheep', '1-0': 'boar' })
    expect(response.state.players[0]!.resources).toMatchObject({ sheep: 1, boar: 1 })
    expect(response.state.events.filter(event => event.type === 'farm.animalDiscarded')).toEqual([])
    session.loadState(JSON.parse(JSON.stringify(response.state)))
    expect(session.getState().state.players[0]!.houseAnimals).toEqual({ '0-0': 'sheep', '1-0': 'boar' })
  })

  it.each([
    { zones: [{ ...mixedRooms[0], animalCount: 2 }] },
    { zones: [mixedRooms[0], mixedRooms[0]] },
    { zones: [{ ...mixedRooms[1], id: 'house:9-9' }] },
  ])('rejects an invalid room assignment atomically and permits a corrected retry', ({ zones }) => {
    const session = setup()
    const before = session.takeAction(0, 'pig-market')
    const rejected = session.resolveChoice(0, 'confirm', { zones })
    expect(rejected.ok).toBe(false)
    expect(rejected.state).toEqual(before.state)
    expect(rejected.interaction).toEqual(before.interaction)
    expect(session.resolveChoice(0, 'confirm', { zones: mixedRooms }).ok).toBe(true)
  })

  it('keeps the ordinary whole-house one-pet limit across distinct rooms', () => {
    const session = setup(false)
    const before = session.takeAction(0, 'pig-market')
    expect(before.interaction.stateId).toBe('wait')
    const rejected = session.resolveChoice(0, 'confirm', { zones: mixedRooms })
    expect(rejected.ok).toBe(false)
    expect(rejected.state).toEqual(before.state)
    expect(rejected.interaction).toEqual(before.interaction)
    const accepted = session.resolveChoice(0, 'confirm', { zones: [mixedRooms[0]] })
    expect(accepted.ok).toBe(true)
    expect(accepted.state.players[0]!.houseAnimals).toEqual({ '0-0': 'sheep' })
    expect(accepted.state.players[0]!.resources).toMatchObject({ sheep: 1, boar: 0 })
  })

  it('restores pending room identities, cooks only the selected species, and undoes the action', () => {
    const session = setup()
    session.state.players[0]!.improvements.push('Major_Fireplace1')
    session.loadState(session.state)
    const initial = structuredClone(session.state.players[0]!)
    session.takeAction(0, 'pig-market')
    const restored = new GameSession(rehydrateState(JSON.parse(JSON.stringify(serializeSessionSnapshot(session.state, session)))))
    sessions.push(restored)
    expect(restored.resolveChoice(0, 'confirm', { zones: mixedRooms }).ok).toBe(true)
    const undo = restored.undoAction()
    expect(undo.ok).toBe(true)
    expect(undo.state.players[0]!.houseAnimals).toEqual(initial.houseAnimals)
    expect(undo.state.players[0]!.resources).toEqual(initial.resources)
    restored.takeAction(0, 'pig-market')
    const cooking = restored.takeAnytimeAction(0, 'exchange')
    if (cooking.interaction.stateId !== 'wait' || cooking.interaction.request.kind !== 'choice') throw new Error('expected exchange choices')
    const recipe = cooking.interaction.request.options.find(option =>
      option.effectPreview?.kind === 'resourceExchange' && option.effectPreview.resourcesPaid?.sheep === 1)
    expect(recipe).toBeDefined()
    const cooked = restored.resolveChoice(0, `bulk:${recipe!.value.split(':')[1]}=1`)
    expect(cooked.ok).toBe(true)
    expect(cooked.state.players[0]!.houseAnimals).toEqual({})
    expect(cooked.state.players[0]!.resources).toMatchObject({ sheep: 0, boar: 1, food: 22 })
    const settled = restored.resolveChoice(0, 'confirm', { zones: [mixedRooms[1]] })
    expect(settled.ok).toBe(true)
    expect(settled.state.players[0]!.houseAnimals).toEqual({ '1-0': 'boar' })
  })

  it('adds a holder through real construction while preserving existing room assignment', () => {
    const session = setup()
    Object.assign(session.state.players[0]!.resources, { wood: 5, reed: 2 })
    session.loadState(session.state)
    let response = session.takeAction(0, 'farm-expansion')
    if (response.interaction.stateId === 'wait' && response.interaction.request.kind === 'choice') {
      const option = response.interaction.request.options.find(option => option.labelKey === 'actions.construct.name')
      expect(option).toBeDefined()
      response = session.resolveChoice(0, option!.value)
    }
    expect(response.ok).toBe(true)
    response = session.commitSelectionChoice(0, { rooms: [{ row: 2, col: 0 }] })
    expect(response.ok).toBe(true)
    expect(response.state.players[0]!.houseAnimals).toEqual({ '0-0': 'sheep' })
    expect(response.state.players[0]!.roomTiles).toEqual([{ row: 0, col: 0 }, { row: 1, col: 0 }, { row: 2, col: 0 }])
    expect(serializeSessionSnapshot(session.state, session).frame.players[0]!.roomAnimalZones.map(zone => zone.id)).toEqual(['house:0-0', 'house:1-0', 'house:2-0'])
    expect(response.state.players[0]!.resources).toMatchObject({ wood: 0, reed: 0 })
  })

  it('renovates the house without changing holder identities or assignments', () => {
    const session = setup()
    Object.assign(session.state.players[0]!.resources, { clay: 2, reed: 1 })
    session.state.actionSpaces.find(space => space.id === 'house-redevelopment')!.roundAvailable = 1
    session.loadState(session.state)
    let response = session.takeAction(0, 'house-redevelopment')
    if (response.interaction.stateId === 'wait' && response.interaction.promptKey === 'ui.interactionChooseRenovationTarget') {
      response = session.resolveChoice(0, 'clay')
    }
    expect(response.ok).toBe(true)
    expect(response.state.players[0]!.houseType).toBe('clay')
    expect(response.state.players[0]!.houseAnimals).toEqual({ '0-0': 'sheep' })
    expect(serializeSessionSnapshot(session.state, session).frame.players[0]!.roomAnimalZones.map(zone => zone.id)).toEqual(['house:0-0', 'house:1-0'])
  })

  it('keeps house-edge and hosted card animals independent of the room group and owner', () => {
    const session = setup(false)
    const owner = session.state.players[0]!
    owner.occupationPlayed.push('D148_DomesticianExpert')
    session.state.players[1]!.minorPlayed.push('M033_NightPasture')
    session.state.players[1]!.cardStates.M033_NightPasture = { extraData: { animalCountsByZone: {
      'card:M033_NightPasture:owner:p2:animalOwner:p1': { animalCounts: { cattle: 1 }, animalOwnerPlayerId: 'p1' },
    } } }
    owner.resources.cattle = 1
    session.state.actionSpaces.find(space => space.id === 'sheep-market')!.resources.sheep = 2
    session.loadState(session.state)
    session.takeAction(0, 'sheep-market')
    const response = session.resolveChoice(0, 'confirm', { zones: [
      mixedRooms[0],
      { id: 'card:D148_DomesticianExpert', zoneType: 'card', animalType: 'sheep', animalCount: 2 },
      { id: 'card:M033_NightPasture:owner:p2:animalOwner:p1', zoneType: 'card', animalType: 'cattle', animalCount: 1 },
    ] })
    expect(response.ok).toBe(true)
    expect(response.state.players[0]!.resources).toMatchObject({ sheep: 3, cattle: 1 })
    expect(getAssignedAnimalsByType(response.state.players[0]!, response.state)).toMatchObject({ sheep: 3, cattle: 1 })
    expect(getAssignedAnimalsByType(response.state.players[1]!, response.state)).toMatchObject({ sheep: 0, cattle: 0 })
  })

  it.each([true, false])('accepts horse room assignments only with Farmers of the Moor enabled (%s)', moor => {
    const session = setup(true, moor)
    if (moor) {
      session.state.players[0]!.resources.horse = 1
      session.loadState(session.state)
    }
    const before = session.takeAction(0, 'pig-market')
    const response = session.resolveChoice(0, 'confirm', { zones: [
      { ...mixedRooms[0], animalType: 'horse' }, mixedRooms[1],
    ] })
    expect(response.ok).toBe(moor)
    if (moor) {
      expect(response.state.players[0]!.houseAnimals).toEqual({ '0-0': 'horse', '1-0': 'boar' })
      expect(response.state.players[0]!.resources).toMatchObject({ horse: 1, boar: 1, sheep: 0 })
    } else {
      expect(response.state).toEqual(before.state)
      expect(response.interaction).toEqual(before.interaction)
    }
  })
})
