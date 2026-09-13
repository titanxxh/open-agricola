import { describe, expect, it } from 'vitest'
import { setupMoorAudit, playMoorAuditMinor } from './_helpers/moor-rules-audit'
import { markAllWorkersUsed, familySize } from '../../shared/domain/player'
import { countUnusedFarmyardSpaces } from '../../shared/domain/farmyard-usage'

const NIGHT = 'M033_NightPasture'
const HOME = 'M034_HomeWood'
const TROUGH = 'M035_HorseTrough'

describe('Moor animal housing clause audit', () => {
  it.each([0, 1])('M033 enforces the capacity belonging to animal owner %i and accepts a legal retry', (animalOwner) => {
    const session = setupMoorAudit()
    session.state.players[0]!.minorPlayed = [NIGHT]
    session.state.currentPlayerIndex = animalOwner
    const capacity = animalOwner === 0 ? 3 : 1
    session.state.actionSpaces.find((space) => space.id === 'sheep-market')!.resources.sheep = capacity + 1
    session.loadState(session.state)
    let response = session.takeAction(animalOwner, 'sheep-market')
    expect(response.ok, response.error).toBe(true)
    expect(response.interaction.request.kind).toBe('animal-reorg')
    const zone = response.interaction.request.zones.find((entry) => entry.cardId === NIGHT)!
    expect(zone.capacity).toBe(capacity)
    const assignment = { id: zone.id, zoneType: 'card', cardId: NIGHT, animalType: 'sheep', animalCount: capacity + 1 }
    const before = JSON.stringify(response.state)
    response = session.resolveChoice(animalOwner, 'confirm', { zones: [assignment] })
    expect(response.ok).toBe(false)
    expect(JSON.stringify(response.state)).toBe(before)
    response = session.resolveChoice(animalOwner, 'confirm', { zones: [{ ...assignment, animalCount: capacity }, { id: 'house', zoneType: 'house', animalType: 'sheep', animalCount: 1 }] })
    expect(response.ok, response.error).toBe(true)
    expect(response.state.players[animalOwner]!.resources.sheep).toBe(capacity + 1)
    expect(response.state.players[1 - animalOwner]!.resources.sheep).toBe(0)
    expect(response.interaction.request.kind).toBe('confirm-next-player')
  })

  it('M033 holds three different animal types together', () => {
    const session = setupMoorAudit()
    const player = session.state.players[0]!
    player.minorPlayed = [NIGHT]
    player.resources.horse = 1
    player.houseAnimalType = 'horse'
    player.houseAnimalCount = 1
    player.resources.cattle = 1
    player.stableTiles = [{ row: 1, col: 2 }]
    player.stableAnimals = { '1-2': 'cattle' }
    session.state.actionSpaces.find((space) => space.id === 'pig-market')!.resources.boar = 1
    session.loadState(session.state)
    let response = session.takeAction(0, 'pig-market')
    expect(response.ok, response.error).toBe(true)
    const zone = response.interaction.request.zones.find((entry) => entry.cardId === NIGHT)!
    response = session.resolveChoice(0, 'confirm', { zones: [{ id: zone.id, zoneType: 'card', cardId: NIGHT, animalType: null, animalCount: 3, animalCounts: { horse: 1, cattle: 1, boar: 1 } }] })
    expect(response.ok, response.error).toBe(true)
    expect(response.state.players[0]!.resources).toMatchObject({ horse: 1, cattle: 1, boar: 1 })
    expect(response.state.players[0]!.houseAnimalCount).toBe(0)
    expect(response.state.players[0]!.stableAnimals['1-2'] ?? null).toBeNull()
    expect(response.interaction.request.kind).toBe('confirm-next-player')
  })

  it.each(['boar', 'cattle', 'horse'] as const)('M034 accepts one %s per forest and rejects two on the same forest', (animal) => {
    const session = setupMoorAudit()
    const player = session.state.players[0]!
    player.minorPlayed = [HOME]
    player.farmTerrain = [{ row: 0, col: 2, kind: 'forest' }, { row: 1, col: 2, kind: 'forest', covered: 'moor' }]
    player.resources[animal] = 2
    player.pastures = [{ id: 'p', size: 1, tiles: [{ row: 2, col: 2 }], stables: 0, animalType: animal, animalCount: 2 }]
    session.state.actionSpaces.find((space) => space.id === 'sheep-market')!.resources.sheep = 1
    session.loadState(session.state)
    let response = session.takeAction(0, 'sheep-market')
    expect(response.ok, response.error).toBe(true)
    const zones = response.interaction.request.zones.filter((entry) => entry.cardId === HOME)
    expect(zones).toHaveLength(2)
    const before = JSON.stringify(response.state)
    response = session.resolveChoice(0, 'confirm', { zones: [{ id: zones[0]!.id, zoneType: 'card', cardId: HOME, animalType: animal, animalCount: 2 }] })
    expect(response.ok).toBe(false)
    expect(JSON.stringify(response.state)).toBe(before)
    response = session.resolveChoice(0, 'confirm', { zones: [...zones.map((zone) => ({ id: zone.id, zoneType: 'card', cardId: HOME, animalType: animal, animalCount: 1 })), { id: 'house', zoneType: 'house', animalType: 'sheep', animalCount: 1 }] })
    expect(response.ok, response.error).toBe(true)
    expect(response.state.players[0]!.resources[animal]).toBe(2)
    expect(response.state.players[0]!.pastures[0]!.animalCount).toBe(0)
  })

  it('M035 rejects splitting horses between two spaces and moving three horses into one space', () => {
    const session = setupMoorAudit()
    const player = session.state.players[0]!
    player.minorPlayed = [TROUGH]
    player.resources.horse = 2
    player.pastures = [{ id: 'p', size: 1, tiles: [{ row: 2, col: 2 }], stables: 0, animalType: 'horse', animalCount: 2 }]
    const unused = countUnusedFarmyardSpaces(player)
    const card = session.state.farmersOfTheMoor!.specialActionCards.find((entry) => entry.actions.includes('horse-market'))!
    session.loadState(session.state)
    let response = session.takeSpecialAction(0, card.id, 'horse-market')
    expect(response.ok, response.error).toBe(true)
    const zones = response.interaction.request.zones.filter((entry) => entry.cardId === TROUGH)
    expect(zones.length).toBeGreaterThanOrEqual(2)
    const assignment = (id: string, count: number) => ({ id, zoneType: 'card', cardId: TROUGH, animalType: 'horse', animalCount: count })
    const before = JSON.stringify(response.state)
    for (const invalid of [[assignment(zones[0]!.id, 3)], [assignment(zones[0]!.id, 1), assignment(zones[1]!.id, 1)]]) {
      response = session.resolveChoice(0, 'confirm', { zones: invalid })
      expect(response.ok).toBe(false)
      expect(JSON.stringify(response.state)).toBe(before)
    }
    response = session.resolveChoice(0, 'confirm', { zones: [assignment(zones[1]!.id, 2), { id: 'house', zoneType: 'house', animalType: 'horse', animalCount: 1 }] })
    expect(response.ok, response.error).toBe(true)
    expect(response.state.players[0]!.resources.horse).toBe(3)
    expect(countUnusedFarmyardSpaces(response.state.players[0]!)).toBe(unused)
    expect(session.resolveChoice(0, 'confirm').ok).toBe(true)
    expect(session.takeAction(1, 'day-laborer').ok).toBe(true)
    expect(session.resolveChoice(1, 'confirm').ok).toBe(true)
    session.state.actionSpaces.find((space) => space.id === 'sheep-market')!.resources.sheep = 1
    response = session.takeAction(0, 'sheep-market')
    expect(response.ok, response.error).toBe(true)
    expect(response.interaction.request.zones.find((zone) => zone.id === zones[1]!.id)?.animalCount).toBe(2)
    response = session.resolveChoice(0, 'confirm', { zones: [assignment(zones[0]!.id, 2),
      { id: 'house', zoneType: 'house', animalType: 'horse', animalCount: 1 },
      { id: 'p', zoneType: 'pasture', animalType: 'sheep', animalCount: 1 },
    ] })
    expect(response.ok, response.error).toBe(true)
    expect(response.state.players[0]!.resources).toMatchObject({ horse: 3, sheep: 1 })
    const stored = response.state.players[0]!.cardStates[TROUGH]!.extraData!.animalCountsByZone as Record<string, unknown>
    expect(stored[zones[0]!.id]).toMatchObject({ animalCounts: { horse: 2 } })
    expect(stored[zones[1]!.id]).toBeUndefined()
    expect(countUnusedFarmyardSpaces(response.state.players[0]!)).toBe(unused)
  })
  it.each(['sheep', 'boar', 'cattle', 'horse'] as const)('M033 lends a hosted %s to its card owner only for actual harvest breeding', (animal) => {
    const session = setupMoorAudit(2, 4)
    const [owner, guest] = session.state.players
    owner!.minorPlayed = [NIGHT]
    owner!.resources[animal] = 1
    owner!.houseAnimalType = animal
    owner!.houseAnimalCount = 1
    guest!.resources[animal] = 2
    guest!.houseAnimalType = animal
    guest!.houseAnimalCount = 1
    const zoneId = `card:${NIGHT}:owner:${owner!.id}:animalOwner:${guest!.id}`
    owner!.cardStates[NIGHT] = { extraData: { animalCountsByZone: { [zoneId]: {
      animalCounts: { [animal]: 1 }, ownerPlayerId: owner!.id, animalOwnerPlayerId: guest!.id,
      cardId: NIGHT, capacity: 1, allowedAnimalType: null,
    } } } }
    session.state.players.forEach((player) => markAllWorkersUsed(session.state, player))
    session.loadState(session.state)
    let response = session.performRoundEnd()
    let bred = false
    for (let step = 0; step < 24 && response.state.round === 4; step++) {
      expect(response.ok, response.error).toBe(true)
      const request = response.interaction.request
      const index = response.interaction.playerIndex
      if (request.kind === 'animal-reorg') {
        expect(index).toBe(0)
        expect(bred).toBe(false)
        bred = true
        const zone = request.zones.find((entry) => entry.cardId === NIGHT)!
        response = session.resolveChoice(index, 'confirm', { zones: [{ id: zone.id, zoneType: 'card', cardId: NIGHT, animalType: animal, animalCount: 2 }] })
      } else if (request.kind === 'heating') {
        response = session.resolveChoice(index, 'confirm', { fuelUsed: request.required, woodToFuel: 0 })
      } else if (request.kind === 'feed') {
        response = session.resolveChoice(index, 'confirm', { selections: [] })
      } else if (request.kind === 'confirm-player-switch' || request.kind === 'confirm-next-player') {
        response = session.resolveChoice(index, 'confirm')
      } else if (request.kind === 'choice') {
        expect(request.options.map((option) => option.value)).toContain('__skip__')
        response = session.resolveChoice(index, '__skip__')
      } else {
        expect(response.interaction.stateId, JSON.stringify(request)).not.toBe('wait')
        response = session.performRoundEnd()
      }
    }
    expect(response.ok, response.error).toBe(true)
    expect(bred).toBe(true)
    expect(response.state.round).toBe(5)
    expect(response.state.players[0]!.resources[animal]).toBe(2)
    expect(response.state.players[1]!.resources[animal]).toBe(2)
  })

  it('M032 pays its printed cost and provides exactly one extra family-growth room', () => {
    const session = setupMoorAudit(2, 8)
    let response = playMoorAuditMinor(session, 'M032_PeatHut')
    expect(response.state.players[0]!.resources).toMatchObject({ fuel: 15, reed: 18 })
    expect(response.scores![0]!.categories.find((category) => category.key === 'cards')?.entries).toContainEqual(expect.objectContaining({ cardId: 'M032_PeatHut', score: 1 }))
    expect(session.resolveChoice(0, 'confirm').ok).toBe(true)
    expect(session.takeAction(1, 'day-laborer').ok).toBe(true)
    expect(session.resolveChoice(1, 'confirm').ok).toBe(true)
    response = session.takeAction(0, 'wish-children')
    expect(response.ok, response.error).toBe(true)
    expect(familySize(response.state.players[0]!)).toBe(3)
    expect(response.state.players[0]!.rooms).toBe(2)
    const full = setupMoorAudit(2, 8)
    const before = JSON.stringify(full.state)
    response = full.takeAction(0, 'wish-children')
    expect(response.ok).toBe(false)
    expect(JSON.stringify(response.state)).toBe(before)
  })

})
