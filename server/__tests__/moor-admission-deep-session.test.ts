import { describe, expect, it } from 'vitest'
import { setupMoorAudit } from './_helpers/moor-rules-audit'

const MAJORS = ['Major_Well', 'Major_ClayOven', 'Major_StoneOven', 'Major_Fireplace1']

describe('Moor printed prerequisites through actual improvement actions', () => {
  it.each([2, 3])('M116 requires three rooms when actually paying two vegetables: %i rooms', (rooms) => {
    const session = setupMoorAudit()
    const player = session.state.players[0]!
    player.minorHand = ['M116_MoorBirchTrees']
    player.resources.vegetable = 2
    player.rooms = rooms
    if (rooms === 3) player.roomTiles.push({ row: 0, col: 0 })
    session.loadState(session.state)
    const offered = session.takeAction(0, 'major-improvement')
    expect(offered.ok, offered.error).toBe(true)
    const before = JSON.stringify(offered.state)
    const response = session.resolveChoice(0, 'M116_MoorBirchTrees')
    expect(response.ok).toBe(rooms === 3)
    if (rooms === 2) expect(JSON.stringify(response.state)).toBe(before)
    else expect(response.state.players[0]!.resources.vegetable).toBe(0)
  })

  it.each([1, 2])('M111 requires two fields at actual purchase: %i fields', (fields) => {
    const session = setupMoorAudit()
    session.state.players[0]!.minorHand = ['M111_NoTillFarming']
    session.state.players[0]!.fields = [1, 2].slice(0, fields).map((col) => ({ row: 0, col, stacks: [] }))
    const offered = session.takeAction(0, 'major-improvement')
    expect(offered.ok, offered.error).toBe(true)
    const before = JSON.stringify(offered.state)
    const response = session.resolveChoice(0, 'M111_NoTillFarming')
    expect(response.ok).toBe(fields === 2)
    if (fields === 1) expect(JSON.stringify(response.state)).toBe(before)
    else expect(response.state.players[0]!.minorPlayed).toContain('M111_NoTillFarming')
  })

  it.each([0, 1])('M071 requires at least one moor on actual purchase: %i moors', (moors) => {
    const session = setupMoorAudit()
    session.state.players[0]!.minorHand = ['M071_BogBody']
    session.state.players[0]!.farmTerrain = moors ? [{ row: 0, col: 2, kind: 'moor' }] : []
    const offered = session.takeAction(0, 'major-improvement')
    expect(offered.ok, offered.error).toBe(true)
    const before = JSON.stringify(offered.state)
    const response = session.resolveChoice(0, 'M071_BogBody')
    expect(response.ok).toBe(moors === 1)
    if (!moors) expect(JSON.stringify(response.state)).toBe(before)
  })

  it.each([0, 3, 4])('M103 enforces at most three forests on actual purchase: %i forests', (forests) => {
    const session = setupMoorAudit()
    session.state.players[0]!.minorHand = ['M103_ForestKindergarten']
    session.state.players[0]!.farmTerrain = [1, 2, 3, 4].slice(0, forests).map((col) => ({ row: 0, col, kind: 'forest' }))
    const offered = session.takeAction(0, 'major-improvement')
    expect(offered.ok, offered.error).toBe(true)
    const before = JSON.stringify(offered.state)
    const response = session.resolveChoice(0, 'M103_ForestKindergarten')
    expect(response.ok).toBe(forests <= 3)
    if (forests > 3) expect(JSON.stringify(response.state)).toBe(before)
    else expect(response.state.players[0]!.resources).toMatchObject({ wood: 19, stone: 18 })
  })

  it.each([4, 7, 9, 11, 13, 14])('M101 rejects actual purchase during forbidden round %i', (round) => {
    const session = setupMoorAudit(2, round)
    session.state.players[0]!.minorHand = ['M101_ButchersBlock']
    const offered = session.takeAction(0, 'major-improvement')
    expect(offered.ok, offered.error).toBe(true)
    const before = JSON.stringify(offered.state)
    const response = session.resolveChoice(0, 'M101_ButchersBlock')
    expect(response.ok).toBe(false)
    expect(JSON.stringify(response.state)).toBe(before)
  })

  it.each([
    ['M017_Reforestation', 3], ['M018_RegisterOfCraftsmen', 2], ['M020_PeatPellets', 1], ['M029_Tinker', 3],
    ['M059_NaturesFertilizer', 1], ['M063_PastoralLetter', 2], ['M082_Firewood', 1], ['M084_BogPony', 1],
    ['M114_RiversideWoods', 3], ['M115_OakBark', 2], ['M120_RiverClay', 1], ['M122_WillowBank', 1],
    ['M127_Wheelbarrow', 1], ['M129_PlowhorseMarket', 1], ['M130_Nosebag', 1],
  ] as const)('%s requires %i majors and does not substitute minors', (cardId, required) => {
    for (const count of [required - 1, required]) {
      const session = setupMoorAudit()
      const player = session.state.players[0]!
      player.minorHand = [cardId]
      player.resources.vegetable = 2
      if (cardId === 'M059_NaturesFertilizer') {
        player.resources.boar = 1
        player.houseAnimalType = 'boar'
        player.houseAnimalCount = 1
      }
      player.improvements = MAJORS.slice(0, count)
      player.minorPlayed = ['M035_HorseTrough']
      session.loadState(session.state)
      const offered = session.takeAction(0, 'major-improvement')
      expect(offered.ok, offered.error).toBe(true)
      expect(offered.interaction.request.options.some((option) => option.value === cardId)).toBe(count >= required)
      const before = JSON.stringify(offered.state)
      const response = session.resolveChoice(0, cardId)
      expect(response.ok, response.error).toBe(count >= required)
      if (count < required) expect(JSON.stringify(response.state)).toBe(before)
      else expect([...response.state.players[0]!.minorPlayed, ...response.state.players[1]!.minorHand]).toContain(cardId)
    }
  })

  it.each([['M019_LawnTurf', 4], ['M023_EdgeOfTheForest', 3]] as const)(
    '%s counts both majors and minors at the %i-improvement boundary', (cardId, required) => {
      for (const count of [required - 1, required]) {
        const session = setupMoorAudit()
        const player = session.state.players[0]!
        player.minorHand = [cardId]
        player.improvements = MAJORS.slice(0, Math.max(0, count - 1))
        player.minorPlayed = ['M035_HorseTrough']
        session.loadState(session.state)
        const offered = session.takeAction(0, 'major-improvement')
        expect(offered.ok, offered.error).toBe(true)
        expect(offered.interaction.request.options.some((option) => option.value === cardId)).toBe(count >= required)
        const before = JSON.stringify(offered.state)
        const response = session.resolveChoice(0, cardId)
        expect(response.ok, response.error).toBe(count >= required)
        if (count < required) expect(JSON.stringify(response.state)).toBe(before)
        else expect(response.state.players[1]!.minorHand).toContain(cardId)
      }
    },
  )

  it.each([0, 3, 4])('M016 actual purchase enforces at most three visible forests with %i forests', (count) => {
    const session = setupMoorAudit()
    session.state.players[0]!.minorHand = ['M016_ClearFelling']
    session.state.players[0]!.farmTerrain = [1, 2, 3, 4].slice(0, count).map((col) => ({ row: 0, col, kind: 'forest' }))
    const offered = session.takeAction(0, 'major-improvement')
    expect(offered.ok, offered.error).toBe(true)
    expect(offered.interaction.request.options.some((option) => option.value === 'M016_ClearFelling')).toBe(count <= 3)
    const before = JSON.stringify(offered.state)
    const response = session.resolveChoice(0, 'M016_ClearFelling')
    expect(response.ok).toBe(count <= 3)
    if (count > 3) expect(JSON.stringify(response.state)).toBe(before)
    else expect(response.state.players[0]!.resources.wood).toBe(22)
  })
  it.each([
    ['M034_HomeWood', 3], ['M042_DeepPlow', 2], ['M047_BogForest', 3],
    ['M057_Taps', 2], ['M078_Barge', 2], ['M119_AlderSwamp', 2], ['M121_Loam', 1], ['M125_HardwareStore', 2],
  ] as const)('%s actually enforces %i prior improvements including minors', (cardId, required) => {
    for (const count of [required - 1, required]) {
      const session = setupMoorAudit()
      const player = session.state.players[0]!
      player.minorHand = [cardId]
      player.resources.vegetable = 2
      player.improvements = MAJORS.slice(0, Math.max(0, count - 1))
      player.minorPlayed = count > 0 ? ['M035_HorseTrough'] : []
      const offered = session.takeAction(0, 'major-improvement')
      expect(offered.ok, offered.error).toBe(true)
      const before = JSON.stringify(offered.state)
      const response = session.resolveChoice(0, cardId)
      expect(response.ok).toBe(count >= required)
      if (count < required) expect(JSON.stringify(response.state)).toBe(before)
      else expect(response.state.players[0]!.minorPlayed).toContain(cardId)
    }
  })

  it.each([['M066_LandParcel', 2], ['M100_Pheromones', 2], ['M128_Workbench', 4], ['M091_RoutineWork', 0]] as const)(
    '%s enforces at most %i prior improvements on actual purchase', (cardId, maximum) => {
      for (const count of [maximum, maximum + 1]) {
        const session = setupMoorAudit()
        const player = session.state.players[0]!
        player.resources.vegetable = 1
        player.minorHand = [cardId]
        player.improvements = MAJORS.slice(0, Math.max(0, count - 1))
        player.minorPlayed = count ? ['M035_HorseTrough'] : []
        const offered = session.takeAction(0, 'major-improvement')
        expect(offered.ok, offered.error).toBe(true)
        const before = JSON.stringify(offered.state)
        const response = session.resolveChoice(0, cardId)
        expect(response.ok).toBe(count <= maximum)
        if (count > maximum) expect(JSON.stringify(response.state)).toBe(before)
        else expect(response.state.players[0]!.minorPlayed).toContain(cardId)
      }
    },
  )

  it.each([
    ['M056_PeatCuttingRights', 'horse', 1], ['M060_SowingMachine', 'horse', 1], ['M061_HayWagon', 'horse', 2],
    ['M069_LeatherSaddle', 'horse', 2], ['M107_PotRoastRecipe', 'horse', 2], ['M110_FarmCart', 'horse', 2], ['M086_SpinningMill', 'sheep', 1],
  ] as const)('%s requires %s count %i through actual purchase', (cardId, animal, required) => {
    for (const count of [required - 1, required]) {
      const session = setupMoorAudit()
      const player = session.state.players[0]!
      player.minorHand = [cardId]
      player.resources.vegetable = 1
      player.resources[animal] = count
      player.pastures = [{ id: 'animals', size: 1, tiles: [{ row: 0, col: 2 }], stables: 0, animalType: count ? animal : null, animalCount: count }]
      session.loadState(session.state)
      const offered = session.takeAction(0, 'major-improvement')
      expect(offered.ok, offered.error).toBe(true)
      const before = JSON.stringify(offered.state)
      const response = session.resolveChoice(0, cardId)
      expect(response.ok).toBe(count >= required)
      if (count < required) expect(JSON.stringify(response.state)).toBe(before)
      else expect(response.state.players[0]!.minorPlayed).toContain(cardId)
    }
  })

  it.each(['wood', 'clay', 'stone'] as const)('M064 requires a stone house on actual purchase: %s', (houseType) => {
    const session = setupMoorAudit()
    session.state.players[0]!.minorHand = ['M064_FamilyBurialPlot']
    session.state.players[0]!.houseType = houseType
    const offered = session.takeAction(0, 'major-improvement')
    expect(offered.ok, offered.error).toBe(true)
    const before = JSON.stringify(offered.state)
    const response = session.resolveChoice(0, 'M064_FamilyBurialPlot')
    expect(response.ok).toBe(houseType === 'stone')
    if (houseType !== 'stone') expect(JSON.stringify(response.state)).toBe(before)
  })

  it.each([
    ['M027_GardenPath', 'forest', 0, false], ['M027_GardenPath', 'forest', 1, true],
    ['M036_PeatMoss', 'moor', 0, true], ['M036_PeatMoss', 'moor', 1, false],
    ['M040_MoorFire', 'moor', 1, false], ['M040_MoorFire', 'moor', 2, true],
    ['M046_Thicket', 'forest', 3, false], ['M046_Thicket', 'forest', 4, true],
  ] as const)('%s actually checks %s count %i before purchase', (cardId, kind, count, allowed) => {
    const session = setupMoorAudit()
    const player = session.state.players[0]!
    player.minorHand = [cardId]
    player.farmTerrain = [1, 2, 3, 4].slice(0, count).map((col) => ({ row: 1, col, kind }))
    const offered = session.takeAction(0, 'major-improvement')
    expect(offered.ok, offered.error).toBe(true)
    const before = JSON.stringify(offered.state)
    const response = session.resolveChoice(0, cardId)
    expect(response.ok).toBe(allowed)
    if (!allowed) expect(JSON.stringify(response.state)).toBe(before)
    else if (cardId === 'M027_GardenPath') {
      expect(response.state.players[0]!.resources).toMatchObject({ clay: 19, wood: 23 })
      expect(response.state.players[1]!.minorHand).toContain(cardId)
      expect(response.scores![1]!.categories.find((category) => category.key === 'cardBonusVp')?.total).toBe(-1)
    } else expect(response.state.players[0]!.minorPlayed).toContain(cardId)
  })

  it.each(['none', 'major', 'minor'] as const)('M045 permits actual purchase with %s previous improvements', (previous) => {
    const session = setupMoorAudit(2, 1)
    const player = session.state.players[0]!
    player.minorHand = ['M045_TreeNursery']
    if (previous === 'major') player.improvements = ['Major_Well']
    if (previous === 'minor') player.minorPlayed = ['M035_HorseTrough']
    const offered = session.takeAction(0, 'major-improvement')
    expect(offered.ok, offered.error).toBe(true)
    const before = JSON.stringify(offered.state)
    const response = session.resolveChoice(0, 'M045_TreeNursery')
    expect(response.ok).toBe(previous === 'none')
    if (previous !== 'none') expect(JSON.stringify(response.state)).toBe(before)
    else {
      expect(response.state.players[0]!.resources.wood).toBe(19)
      expect(response.state.futureMeeples.filter((entry) => entry.cardId === 'M045_TreeNursery').map((entry) => entry.round)).toEqual([12, 13])
    }
  })

  it.each([[1, false, false], [2, false, true], [0, true, false], [1, true, true]] as const)(
    'M058_PeatFertilizer counts %i farm fields and card field %s on actual purchase', (fields, cardField, allowed) => {
      const session = setupMoorAudit()
      const player = session.state.players[0]!
      player.minorHand = ['M058_PeatFertilizer']
      player.fields = [2, 3].slice(0, fields).map((col) => ({ row: 0, col, stacks: [] }))
      if (cardField) player.minorPlayed = ['B068_Beanfield']
      session.loadState(session.state)
      const offered = session.takeAction(0, 'major-improvement')
      expect(offered.ok, offered.error).toBe(true)
      const before = JSON.stringify(offered.state)
      const response = session.resolveChoice(0, 'M058_PeatFertilizer')
      expect(response.ok, response.error).toBe(allowed)
      if (!allowed) expect(JSON.stringify(response.state)).toBe(before)
      else expect(response.state.players[0]!.minorPlayed).toContain('M058_PeatFertilizer')
    },
  )

})
