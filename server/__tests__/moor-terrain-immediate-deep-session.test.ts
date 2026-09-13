import { describe, expect, it } from 'vitest'
import { setupMoorAudit, playMoorAuditMinor, acceptMoorAuditChoice } from './_helpers/moor-rules-audit'
import { setActiveWorkerCount, familySize } from '../../shared/domain/player'
import type { GameSession } from '../game/authoritative-session'

const FOREST = { row: 0, col: 2, kind: 'forest' as const }
const MOOR = { row: 1, col: 2, kind: 'moor' as const }

const begin = (session: GameSession, cardId: string) => {
  session.state.players[0]!.minorHand = [cardId]
  let response = session.takeAction(0, 'major-improvement')
  expect(response.ok, response.error).toBe(true)
  expect(response.interaction.request.options.map((option) => option.value)).toContain(cardId)
  response = session.resolveChoice(0, cardId)
  expect(response.ok, response.error).toBe(true)
  return response
}

const passed = (session: GameSession, cardId: string) => {
  const response = session.getState()
  expect(response.state.players[0]!.minorPlayed).not.toContain(cardId)
  expect(response.state.players[1]!.minorHand).toContain(cardId)
  expect(response.state.log.some((entry) => JSON.stringify(entry.params).includes(cardId))).toBe(true)
}

describe('Moor immediate and terrain clause audit', () => {
  it.each(['decline', 'absent', 'non-adjacent'] as const)('M015 still grants fuel and passes when terrain conversion is %s', (mode) => {
    const session = setupMoorAudit()
    const player = session.state.players[0]!
    player.farmTerrain = mode === 'absent' ? [] : [{ ...MOOR }]
    if (mode === 'non-adjacent') player.fields = [{ row: 2, col: 4, stacks: [] }]
    session.loadState(session.state)
    let response = begin(session, 'M015_PeatBurnOff')
    if (mode === 'decline') {
      expect(response.interaction.sourceCard).toBe('M015_PeatBurnOff')
      response = session.resolveChoice(0, '__skip__')
    }
    expect(response.ok, response.error).toBe(true)
    expect(response.state.players[0]!.resources.fuel).toBe(21)
    expect(response.state.players[0]!.fields).toHaveLength(mode === 'non-adjacent' ? 1 : 0)
    expect(response.state.players[0]!.farmTerrain).toHaveLength(mode === 'absent' ? 0 : 1)
    passed(session, 'M015_PeatBurnOff')
  })

  it('M015 rejects a non-adjacent moor before retrying an adjacent one', () => {
    const session = setupMoorAudit()
    const player = session.state.players[0]!
    player.fields = [{ row: 0, col: 2, stacks: [] }]
    player.farmTerrain = [{ ...MOOR }, { row: 2, col: 4, kind: 'moor' }]
    session.loadState(session.state)
    let response = acceptMoorAuditChoice(session, begin(session, 'M015_PeatBurnOff'))
    const before = JSON.stringify(response.state)
    response = session.commitSelectionChoice(0, { positions: [{ row: 2, col: 4 }] })
    expect(response.ok).toBe(false)
    expect(JSON.stringify(response.state)).toBe(before)
    response = session.commitSelectionChoice(0, { positions: [MOOR] })
    expect(response.ok, response.error).toBe(true)
    expect(response.state.players[0]!.fields).toContainEqual({ row: 1, col: 2, stacks: [] })
    passed(session, 'M015_PeatBurnOff')
  })

  it.each([0, 1, 2])('M016 permits selecting %i single forests and rejects more than two', (count) => {
    const session = setupMoorAudit()
    const forests = [FOREST, { row: 1, col: 2, kind: 'forest' as const }, { row: 2, col: 2, kind: 'forest' as const }]
    session.state.players[0]!.farmTerrain = structuredClone(forests)
    let response = begin(session, 'M016_ClearFelling')
    const before = JSON.stringify(response.state)
    response = session.commitSelectionChoice(0, { positions: forests })
    expect(response.ok).toBe(false)
    expect(JSON.stringify(response.state)).toBe(before)
    response = session.commitSelectionChoice(0, { positions: forests.slice(0, count) })
    expect(response.ok, response.error).toBe(true)
    expect(response.state.players[0]!.resources.wood).toBe(22)
    expect(response.state.players[0]!.farmTerrain?.filter((tile) => tile.kind === 'moor')).toHaveLength(count)
    passed(session, 'M016_ClearFelling')
  })

  it.each(['forest', 'moor'] as const)('M016 rejects a forest covering another %s and permits a single-layer retry', (covered) => {
    const session = setupMoorAudit()
    const single = { row: 1, col: 2, kind: 'forest' as const }
    session.state.players[0]!.farmTerrain = [{ ...FOREST, covered }, single]
    let response = begin(session, 'M016_ClearFelling')
    expect(response.interaction.request.selection?.kind).toBe('farm-position')
    const before = structuredClone(response.state.players)
    response = session.commitSelectionChoice(0, { positions: [FOREST] })
    expect(response.ok).toBe(false)
    expect(response.state.players).toEqual(before)
    expect(response.interaction.request.selection?.kind).toBe('farm-position')
    response = session.commitSelectionChoice(0, { positions: [single] })
    expect(response.ok, response.error).toBe(true)
    expect(response.state.players[0]!.farmTerrain).toEqual([{ ...FOREST, covered }, { ...single, kind: 'moor' }])
    expect(response.state.players[0]!.resources.wood).toBe(22)
    passed(session, 'M016_ClearFelling')
  })

  it('M017 requires an unused target and allows retry after choosing an occupied one', () => {
    const session = setupMoorAudit()
    session.state.players[0]!.improvements = ['Major_Well', 'Major_ClayOven', 'Major_StoneOven']
    session.state.players[0]!.farmTerrain = [{ ...MOOR }]
    session.loadState(session.state)
    let response = begin(session, 'M017_Reforestation')
    const before = JSON.stringify(response.state)
    response = session.commitSelectionChoice(0, { positions: [MOOR] })
    expect(response.ok).toBe(false)
    expect(JSON.stringify(response.state)).toBe(before)
    response = session.commitSelectionChoice(0, { positions: [FOREST] })
    expect(response.ok, response.error).toBe(true)
    expect(response.state.players[0]!.farmTerrain).toContainEqual(FOREST)
    passed(session, 'M017_Reforestation')
  })

  it.each([0, 1, 3])('M020 counts %i visible moors and excludes a covered moor', (count) => {
    const session = setupMoorAudit()
    session.state.players[0]!.improvements = ['Major_Well']
    session.state.players[0]!.farmTerrain = [
      ...[2, 3, 4].slice(0, count).map((col) => ({ row: 1, col, kind: 'moor' as const })),
      { ...FOREST, covered: 'moor' },
    ]
    const response = playMoorAuditMinor(session, 'M020_PeatPellets')
    expect(response.state.players[0]!.resources.fuel).toBe(20 + count)
    expect(response.state.players[1]!.resources.fuel).toBe(20)
    passed(session, 'M020_PeatPellets')
  })

  it.each(['sheep', 'boar', 'cattle', 'horse'] as const)('M022 rewards a unique %s with exactly two food', (animal) => {
    const session = setupMoorAudit()
    const player = session.state.players[0]!
    player.resources[animal] = 1
    player.houseAnimalType = animal
    player.houseAnimalCount = 1
    const response = playMoorAuditMinor(session, 'M022_EcologicalNiche')
    expect(response.state.players[0]!.resources.food).toBe(22)
    passed(session, 'M022_EcologicalNiche')
  })

  it('M022 grants two food for several unique animal types and ignores crops merely in supply', () => {
    const session = setupMoorAudit()
    const player = session.state.players[0]!
    player.resources.sheep = 1
    player.resources.horse = 1
    player.resources.grain = 4
    player.resources.vegetable = 4
    player.houseAnimalType = 'sheep'
    player.houseAnimalCount = 1
    player.stableTiles = [{ row: 1, col: 2 }]
    player.stableAnimals = { '1-2': 'horse' }
    session.loadState(session.state)
    const response = playMoorAuditMinor(session, 'M022_EcologicalNiche')
    expect(response.state.players[0]!.resources).toMatchObject({ food: 22, fuel: 20 })
  })

  it.each(['field', 'moor'] as const)('M023 counts the unfenced space between a forest and a %s', (neighbor) => {
    const session = setupMoorAudit()
    const player = session.state.players[0]!
    player.improvements = ['Major_Well', 'Major_ClayOven', 'Major_StoneOven']
    player.farmTerrain = [{ ...FOREST }, ...(neighbor === 'moor' ? [{ ...MOOR }] : [])]
    if (neighbor === 'field') player.fields = [{ row: 1, col: 2, stacks: [] }]
    expect(player.fenceSegments).toEqual([])
    const response = playMoorAuditMinor(session, 'M023_EdgeOfTheForest')
    expect(response.state.players[0]!.resources).toMatchObject({ food: neighbor === 'field' ? 21 : 20, fuel: neighbor === 'moor' ? 21 : 20 })
    expect(response.state.players[0]!.fenceSegments).toEqual([])
    passed(session, 'M023_EdgeOfTheForest')
  })

  it.each(['none', 'field', 'pasture', 'stable'] as const)('M025 actual purchase accepts the %s farm-shape prerequisite', (shape) => {
    const session = setupMoorAudit()
    const player = session.state.players[0]!
    player.minorHand = ['M025_HouseholdInventory']
    if (shape === 'field') player.fields = [{ row: 1, col: 2, stacks: [] }]
    if (shape === 'stable') player.stableTiles = [{ row: 1, col: 2 }]
    if (shape === 'pasture') player.pastures = [{ id: 'pasture', size: 1, tiles: [{ row: 1, col: 2 }], stables: 0, animalType: null, animalCount: 0 }]
    session.loadState(session.state)
    const offered = session.takeAction(0, 'major-improvement')
    expect(offered.ok, offered.error).toBe(true)
    expect(offered.interaction.request.options.some((option) => option.value === 'M025_HouseholdInventory')).toBe(shape !== 'none')
    const before = JSON.stringify(offered.state)
    const response = session.resolveChoice(0, 'M025_HouseholdInventory')
    expect(response.ok).toBe(shape !== 'none')
    if (shape === 'none') expect(JSON.stringify(response.state)).toBe(before)
    else {
      expect(response.state.players[0]!.resources.food).toBe(19)
      passed(session, 'M025_HouseholdInventory')
    }
  })
  it.each([4, 5])('M031 checks total animals including %i horses through actual purchase', (count) => {
    const session = setupMoorAudit()
    session.state.players[0]!.resources.horse = count
    session.state.players[0]!.pastures = [{ id: 'horses', size: 2, tiles: [{ row: 2, col: 2 }, { row: 2, col: 3 }], stables: 0, animalType: 'horse', animalCount: Math.min(4, count) }]
    session.state.players[0]!.houseAnimalType = count === 5 ? 'horse' : null
    session.state.players[0]!.houseAnimalCount = count === 5 ? 1 : 0
    session.state.players[0]!.minorHand = ['M031_LivestockMarket']
    const offered = session.takeAction(0, 'major-improvement')
    expect(offered.ok, offered.error).toBe(true)
    const before = JSON.stringify(offered.state)
    const response = session.resolveChoice(0, 'M031_LivestockMarket')
    expect(response.ok).toBe(count === 5)
    if (count === 4) expect(JSON.stringify(response.state)).toBe(before)
    else {
      expect(response.state.players[0]!.resources.horse).toBe(5)
      expect(response.interaction.request.kind).toBe('confirm-next-player')
      passed(session, 'M031_LivestockMarket')
    }
  })

  it.each([false, true])('M031 exchanges three animals simultaneously and allows declining: %s', (accept) => {
    const session = setupMoorAudit()
    const player = session.state.players[0]!
    player.resources = { ...player.resources, sheep: 2, boar: 1, cattle: 2 }
    const animals = ['sheep', 'boar', 'cattle', 'horse'] as const
    player.pastures = animals.map((animal, col) => ({ id: animal, size: 1, tiles: [{ row: 2, col: col + 1 }], stables: 0, animalType: animal === 'horse' ? null : animal, animalCount: player.resources[animal] }))
    session.loadState(session.state)
    let response = begin(session, 'M031_LivestockMarket')
    const choices = response.interaction.request.options.filter((option) => option.effectPreview?.kind === 'resourceExchange')
    expect(choices.length).toBeGreaterThan(1)
    for (const option of choices) {
      const preview = option.effectPreview!
      if (preview.kind !== 'resourceExchange') throw new Error('expected exchange')
      expect(Object.values(preview.resourcesPaid ?? {}).reduce((a, b) => a + b, 0)).toBeLessThanOrEqual(3)
    }
    const three = choices.find((option) => {
      const preview = option.effectPreview
      return preview?.kind === 'resourceExchange' && preview.resourcesPaid?.sheep === 1 && preview.resourcesPaid.boar === 1 && preview.resourcesPaid.cattle === 1
    })!
    expect(three).toBeDefined()
    response = session.resolveChoice(0, accept ? three.value : '__skip__')
    expect(response.ok, response.error).toBe(true)
    if (accept) {
      expect(response.interaction.request.kind).toBe('animal-reorg')
      response = session.resolveChoice(0, 'confirm', { zones: animals.map((animal) => ({ id: animal, zoneType: 'pasture', animalType: animal, animalCount: animal === 'cattle' ? 2 : 1 })) })
      expect(response.ok, response.error).toBe(true)
    }
    expect(response.state.players[0]!.resources).toMatchObject(accept ? { sheep: 1, boar: 1, cattle: 2, horse: 1 } : { sheep: 2, boar: 1, cattle: 2, horse: 0 })
    passed(session, 'M031_LivestockMarket')
  })

  it.each(['three-horses', 'decline', 'no-supply'] as const)('M052 checks growth prerequisites and optionality: %s', (mode) => {
    const session = setupMoorAudit()
    const player = session.state.players[0]!
    player.resources.horse = mode === 'three-horses' ? 3 : 4
    player.minorHand = ['M052_WeddingCoach']
    if (mode === 'no-supply') setActiveWorkerCount(player, 5)
    session.loadState(session.state)
    const offered = session.takeAction(0, 'major-improvement')
    expect(offered.ok, offered.error).toBe(true)
    const before = JSON.stringify(offered.state)
    let response = session.resolveChoice(0, 'M052_WeddingCoach')
    expect(response.ok).toBe(mode !== 'three-horses')
    if (mode === 'three-horses') expect(JSON.stringify(response.state)).toBe(before)
    else {
      if (mode === 'decline') response = session.resolveChoice(0, '__skip__')
      expect(response.ok, response.error).toBe(true)
      expect(response.state.players[0]!.resources).toMatchObject({ wood: 18, food: 19, horse: 4 })
      expect(familySize(response.state.players[0]!)).toBe(mode === 'decline' ? 2 : 5)
    }
  })

  it.each([0, 1])('M059 permits only its new field after initially submitting row %i', (row) => {
    const session = setupMoorAudit()
    session.state.players[0]!.minorPlayed = ['M059_NaturesFertilizer']
    session.state.players[0]!.farmTerrain = [MOOR]
    session.state.players[0]!.fields = [{ row: 0, col: 2, stacks: [] }]
    session.state.players[0]!.resources.grain = 2
    session.loadState(session.state)
    acceptMoorAuditChoice(session, begin(session, 'M015_PeatBurnOff'))
    let response = session.commitSelectionChoice(0, { positions: [MOOR] })
    expect(response.ok, response.error).toBe(true)
    expect(response.interaction.sourceCard).toBe('M059_NaturesFertilizer')
    response = acceptMoorAuditChoice(session, response)
    expect(response.interaction.request.farm.selectableFields.map((field) => field.tile)).toEqual([{ row: 1, col: 2 }])
    const before = structuredClone(response.state.players)
    response = session.commitSelectionChoice(0, { crops: [{ row, col: 2, crop: 'grain' }] })
    if (row === 0) {
      expect(response.ok).toBe(false)
      expect(response.state.players).toEqual(before)
      expect(response.interaction.request.kind).toBe('farm-select')
      response = session.commitSelectionChoice(0, { crops: [{ row: 1, col: 2, crop: 'grain' }] })
    }
    expect(response.ok, response.error).toBe(true)
    expect(response.state.players[0]!.resources.grain).toBe(1)
    expect(response.state.players[0]!.fields[1]!.stacks).toEqual([{ kind: 'grain', remaining: 3 }])
    expect(response.state.players[0]!.fields[0]!.stacks).toEqual([])
    expect(response.interaction.request.kind).toBe('confirm-next-player')
    passed(session, 'M015_PeatBurnOff')
  })
})
