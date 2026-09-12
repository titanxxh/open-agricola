import { describe, expect, it } from 'vitest'
import { playMoorAuditMinor, setupMoorAudit, acceptMoorAuditChoice } from './_helpers/moor-rules-audit'
import { getAllTilePositions } from '../../shared/domain/farm'

describe('Moor prerequisite printed-rule audit', () => {
  it.each([2, 3, 4, 5, 6, 7, 8])('M019 grants its exact printed fuel reward for %i unused spaces and passes left', (unused) => {
    const session = setupMoorAudit()
    const player = session.state.players[0]!
    player.improvements = ['Major_Fireplace1', 'Major_Fireplace2', 'Major_CookingHearth1', 'Major_CookingHearth2']
    player.fields = getAllTilePositions().filter((tile) => !player.roomTiles.some((room) => room.row === tile.row && room.col === tile.col))
      .slice(0, 13 - unused).map((tile) => ({ ...tile, stacks: [] }))
    const response = playMoorAuditMinor(session, 'M019_LawnTurf')
    expect(response.state.players[0]!.resources.fuel).toBe(20 + (unused >= 3 && unused <= 7 ? unused - 2 : 0))
    expect(response.state.players[0]!.minorPlayed).not.toContain('M019_LawnTurf')
    expect(response.state.players[1]!.minorHand).toContain('M019_LawnTurf')
    expect(response.state.players[1]!.resources.fuel).toBe(20)
  })

  it.each([4, 5, 6, 7, 8, 9, 10, 11])('M025 pays one food and grants only the printed ordered goods for %i unused spaces', (unused) => {
    const session = setupMoorAudit()
    const player = session.state.players[0]!
    const empty = getAllTilePositions().filter((tile) => !player.roomTiles.some((room) => room.row === tile.row && room.col === tile.col))
    player.stableTiles = [empty[0]!]
    player.fields = empty.slice(1, 13 - unused).map((tile) => ({ ...tile, stacks: [] }))
    let response = playMoorAuditMinor(session, 'M025_HouseholdInventory')
    const count = unused >= 5 && unused <= 10 ? unused - 4 : 0
    expect(response.state.players[0]!.resources).toMatchObject({
      food: 19, reed: 20 + (count >= 1 ? 1 : 0), grain: count >= 2 ? 1 : 0,
      cattle: count >= 3 ? 1 : 0, stone: 20 + (count >= 4 ? 1 : 0), vegetable: count >= 5 ? 1 : 0, horse: count >= 6 ? 1 : 0,
    })
    if (count >= 3) {
      expect(response.interaction.request.kind).toBe('animal-reorg')
      const stable = response.interaction.request.zones.find((zone) => zone.zoneType === 'stable')!
      expect(stable).toBeDefined()
      response = session.resolveChoice(0, 'confirm', { zones: [
        { id: 'house', zoneType: 'house', animalType: 'cattle', animalCount: 1 },
        { id: stable.id, zoneType: 'stable', animalType: count >= 6 ? 'horse' : null, animalCount: count >= 6 ? 1 : 0 },
      ] })
      expect(response.ok, response.error).toBe(true)
      expect(response.state.players[0]!.resources.cattle).toBe(1)
      expect(response.state.players[0]!.resources.horse).toBe(count >= 6 ? 1 : 0)
    }
    expect(response.state.players[0]!.minorPlayed).not.toContain('M025_HouseholdInventory')
    expect(response.state.players[1]!.minorHand).toContain('M025_HouseholdInventory')
    expect(response.state.players[1]!.resources.cattle).toBe(0)
  })

  it.each(['M051_MoorEnclosures', 'M070_MoorArchaeology', 'M113_LivingHistoryMuseum'])(
    '%s currently permits a clay house but rejects the higher stone house', (cardId) => {
      for (const house of ['wood', 'clay', 'stone'] as const) {
        const session = setupMoorAudit()
        session.state.players[0]!.houseType = house
        session.state.players[0]!.minorHand = [cardId]
        if (cardId === 'M113_LivingHistoryMuseum') session.state.players[0]!.improvements = ['Major_Moor_MuseumOfTheMoors']
        const offered = session.takeAction(0, 'major-improvement')
        expect(offered.ok, offered.error).toBe(true)
        const values = offered.interaction.request.options.map((option) => option.value)
        if (house === 'clay') {
          expect(values).toContain(cardId)
          const bought = session.resolveChoice(0, cardId)
          expect(bought.ok, bought.error).toBe(true)
          expect(bought.state.players[0]!.minorPlayed).toContain(cardId)
        } else {
          expect(values).not.toContain(cardId)
          const before = structuredClone(offered.state.players)
          const rejected = session.resolveChoice(0, cardId)
          expect(rejected.ok).toBe(false)
          expect(rejected.state.players).toEqual(before)
          expect(rejected.interaction.request.options.map((option) => option.value)).toEqual(values)
          const retry = session.resolveChoice(0, 'Major_Well')
          expect(retry.ok, retry.error).toBe(true)
          expect(retry.state.players[0]!.improvements).toContain('Major_Well')
        }
      }
    },
  )

  it.each([1, 2])('M058 currently rechecks its two-field play prerequisite after play with %i remaining fields', (fields) => {
    const session = setupMoorAudit()
    const player = session.state.players[0]!
    player.minorPlayed = ['M058_PeatFertilizer']
    player.fields = Array.from({ length: fields }, (_, col) => ({ row: 0, col, stacks: [] }))
    player.resources.grain = 1
    player.farmTerrain = [{ row: 2, col: 3, kind: 'moor' }]
    const card = session.state.farmersOfTheMoor!.specialActionCards.find((entry) => entry.actions.includes('cut-peat'))!
    let response = session.takeSpecialAction(0, card.id, 'cut-peat', { tile: { row: 2, col: 3 } })
    expect(response.ok, response.error).toBe(true)
    expect(response.state.players[0]!.resources.fuel).toBe(23)
    if (fields === 1) {
      expect(response.interaction.sourceCard).not.toBe('M058_PeatFertilizer')
      expect(response.state.players[0]!.resources.grain).toBe(1)
      expect(response.state.players[0]!.fields[0]!.stacks).toEqual([])
    } else {
      expect(response.interaction.sourceCard).toBe('M058_PeatFertilizer')
      response = acceptMoorAuditChoice(session, response)
      response = session.commitSelectionChoice(0, { crops: [{ row: 0, col: 0, crop: 'grain' }] })
      expect(response.ok, response.error).toBe(true)
      expect(response.state.players[0]!.resources.grain).toBe(0)
      expect(response.state.players[0]!.fields[0]!.stacks).toEqual([{ kind: 'grain', remaining: 3 }])
    }
  })

  it.each([['M044_Swamp', 4], ['M049_SurveyorsMap', 2], ['M041_CattleCollar', 8]] as const)(
    '%s enforces its printed round boundary %i on real purchases', (cardId, boundary) => {
      for (const round of [boundary - 1, boundary, boundary + 1]) {
        const session = setupMoorAudit(2, round)
        session.state.players[0]!.resources.vegetable = 2
        session.state.players[0]!.minorHand = [cardId]
        const response = session.takeAction(0, 'major-improvement')
        expect(response.ok, response.error).toBe(true)
        const available = response.interaction.request.options.some((option) => option.value === cardId)
        expect(available).toBe(cardId === 'M041_CattleCollar' ? round >= boundary : round <= boundary)
      }
    },
  )

  it('M024 pays its wood before topping up only the missing goods and passing left', () => {
    const session = setupMoorAudit()
    session.state.players[0]!.resources = { ...session.state.players[0]!.resources, wood: 1, clay: 0, grain: 0, food: 3, fuel: 0 }
    const response = playMoorAuditMinor(session, 'M024_BasicSupplies')
    expect(response.state.players[0]!.resources).toMatchObject({ wood: 1, clay: 1, reed: 20, stone: 20, food: 3, fuel: 1, grain: 1 })
    expect(response.state.players[0]!.minorPlayed).not.toContain('M024_BasicSupplies')
    expect(response.state.players[1]!.minorHand).toContain('M024_BasicSupplies')
  })
})
