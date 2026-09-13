import { describe, expect, it } from 'vitest'
import { setupMoorAudit, playMoorAuditMinor, acceptMoorAuditChoice, advanceMoorAuditToRound } from './_helpers/moor-rules-audit'
import { getAllTilePositions, positionKey } from '../../shared/domain/farm'

const ROOMS = [{ row: 1, col: 1 }, { row: 0, col: 1 }]

describe('Moor room and future terrain clause audit', () => {
  it('M039 restores ordinary fencing adjacency after the free disconnected pasture', () => {
    const session = setupMoorAudit()
    const player = session.state.players[0]!
    const edges = (row: number, col: number) => [`H-${row}-${col}`, `H-${row + 1}-${col}`, `V-${row}-${col}`, `V-${row}-${col + 1}`]
    player.pastures = [{ id: 'old', size: 1, tiles: [{ row: 0, col: 2 }], stables: 0, animalType: null, animalCount: 0 }]
    player.fenceSegments = edges(0, 2).map((edge) => ({ edge, type: 'fence', source: { kind: 'own', ownerPlayerId: player.id } }))
    player.minorHand = ['M039_SpecialPasture']
    session.loadState(session.state)
    expect(session.takeAction(0, 'major-improvement').ok).toBe(true)
    let response = session.resolveChoice(0, 'M039_SpecialPasture')
    expect(response.ok, response.error).toBe(true)
    response = session.commitSelectionChoice(0, { edges: edges(2, 4), extraWood: 0 })
    expect(response.ok, response.error).toBe(true)
    expect(response.state.players[0]!.pastures).toHaveLength(2)
    expect(response.state.players[0]!.resources.wood).toBe(18)
    expect(session.resolveChoice(0, 'confirm').ok).toBe(true)
    expect(session.takeAction(1, 'day-laborer').ok).toBe(true)
    expect(session.resolveChoice(1, 'confirm').ok).toBe(true)
    response = session.takeAction(0, 'fencing')
    expect(response.ok, response.error).toBe(true)
    const before = JSON.stringify(response.state)
    response = session.commitSelectionChoice(0, { edges: edges(2, 1), extraWood: 0 })
    expect(response.ok).toBe(false)
    expect(JSON.stringify(response.state)).toBe(before)
    response = session.commitSelectionChoice(0, { edges: edges(1, 4).filter((edge) => edge !== 'H-2-4'), extraWood: 0 })
    expect(response.ok, response.error).toBe(true)
    expect(response.state.players[0]!.pastures).toHaveLength(3)
    expect(response.state.players[0]!.resources.wood).toBe(15)
  })

  it.each([0, 1, 2, 3, 5])('M066 publicly adds its printed bonus and ordinary unused-space penalty for %i spaces', (unused) => {
    const session = setupMoorAudit()
    const player = session.state.players[0]!
    player.minorPlayed = ['M066_LandParcel']
    const rooms = new Set(player.roomTiles.map(positionKey))
    player.farmTerrain = getAllTilePositions().filter((tile) => !rooms.has(positionKey(tile))).slice(unused).map((tile) => ({ ...tile, kind: 'forest' }))
    session.loadState(session.state)
    const response = session.takeAction(0, 'day-laborer')
    expect(response.ok, response.error).toBe(true)
    expect(response.scores![0]!.categories.find((category) => category.key === 'cardBonusVp')?.total ?? 0).toBe(unused === 0 ? 0 : unused === 1 ? 2 : unused === 2 ? -1 : -3)
    expect(response.scores![0]!.categories.find((category) => category.key === 'empty')?.total).toBe(unused === 0 ? 0 : -unused)
  })

  it.each(['M064_FamilyBurialPlot', 'M070_MoorArchaeology'] as const)('%s blocks later native placement and removes the unused-space penalty', (cardId) => {
    const session = setupMoorAudit()
    const player = session.state.players[0]!
    player.houseType = cardId === 'M064_FamilyBurialPlot' ? 'stone' : 'clay'
    const tile = { row: 0, col: 2 }
    let response
    if (cardId === 'M064_FamilyBurialPlot') {
      player.minorHand = [cardId]
      session.loadState(session.state)
      expect(session.takeAction(0, 'major-improvement').ok).toBe(true)
      response = acceptMoorAuditChoice(session, session.resolveChoice(0, cardId))
      const before = JSON.stringify(response.state)
      response = session.commitSelectionChoice(0, { positions: [player.roomTiles[0]!] })
      expect(response.ok).toBe(false)
      expect(JSON.stringify(response.state)).toBe(before)
      response = session.commitSelectionChoice(0, { positions: [tile] })
      expect(response.state.players[0]!.resources.stone).toBe(19)
    } else {
      player.minorPlayed = [cardId]
      player.farmTerrain = [{ ...tile, kind: 'moor' }]
      session.loadState(session.state)
      const special = session.state.farmersOfTheMoor!.specialActionCards.find((entry) => entry.actions.includes('cut-peat'))!
      response = acceptMoorAuditChoice(session, session.takeSpecialAction(0, special.id, 'cut-peat', { tile }))
      expect(response.state.players[0]!.supplyTokensConsumed?.fence).toBe(1)
    }
    expect(response.ok, response.error).toBe(true)
    expect(response.scores![0]!.categories.find((category) => category.key === 'cardBonusVp')?.total).toBe(1)
    expect(response.scores![0]!.categories.find((category) => category.key === 'empty')?.total).toBe(-12)
    expect(session.resolveChoice(0, 'confirm').ok).toBe(true)
    expect(session.takeAction(1, 'day-laborer').ok).toBe(true)
    expect(session.resolveChoice(1, 'confirm').ok).toBe(true)
    response = session.takeAction(0, 'farmland')
    expect(response.ok, response.error).toBe(true)
    const before = JSON.stringify(response.state)
    response = session.commitSelectionChoice(0, { tile })
    expect(response.ok).toBe(false)
    expect(JSON.stringify(response.state)).toBe(before)
    response = session.commitSelectionChoice(0, { tile: { row: 0, col: 3 } })
    expect(response.ok, response.error).toBe(true)
    expect(response.state.players[0]!.fields).toEqual([{ row: 0, col: 3, stacks: [] }])
  })

  it.each(['wood', 'clay', 'stone'] as const)('M036 applies its per-room discount only to wooden rooms in a %s house', (houseType) => {
    const session = setupMoorAudit()
    const player = session.state.players[0]!
    player.houseType = houseType
    player.minorPlayed = ['M036_PeatMoss']
    session.loadState(session.state)
    let response = session.takeAction(0, 'farm-expansion')
    expect(response.ok, response.error).toBe(true)
    const construct = response.interaction.request.options.find((option) => option.labelKey === 'actions.construct.name')!
    response = session.resolveChoice(0, construct.value)
    expect(response.ok, response.error).toBe(true)
    response = session.commitSelectionChoice(0, { rooms: ROOMS })
    expect(response.ok, response.error).toBe(true)
    expect(response.state.players[0]!.rooms).toBe(4)
    expect(response.state.players[0]!.resources[houseType]).toBe(houseType === 'wood' ? 14 : 10)
    expect(response.state.players[0]!.resources.reed).toBe(houseType === 'wood' ? 18 : 16)
  })

  it.each([[1, false], [2, false], [2, true]] as const)('M037 follows %i rooms with optional free stables, accepted: %s', (rooms, accept) => {
    const session = setupMoorAudit()
    session.state.players[0]!.minorPlayed = ['M037_BuildingPlan']
    session.state.players[0]!.resources.wood = rooms * 5
    session.loadState(session.state)
    let response = session.takeAction(0, 'farm-expansion')
    expect(response.ok, response.error).toBe(true)
    const construct = response.interaction.request.options.find((option) => option.labelKey === 'actions.construct.name')!
    response = session.resolveChoice(0, construct.value)
    expect(response.ok, response.error).toBe(true)
    response = session.commitSelectionChoice(0, { rooms: ROOMS.slice(0, rooms) })
    expect(response.ok, response.error).toBe(true)
    if (rooms === 2) {
      expect(response.interaction.sourceCard).toBe('M037_BuildingPlan')
      if (accept) {
        response = acceptMoorAuditChoice(session, response)
        expect(response.interaction.request.farm.maxSelections).toBe(2)
        const before = JSON.stringify(response.state)
        response = session.commitSelectionChoice(0, { stables: [{ row: 2, col: 2 }, { row: 2, col: 3 }, { row: 2, col: 4 }] })
        expect(response.ok).toBe(false)
        expect(JSON.stringify(response.state)).toBe(before)
        response = session.commitSelectionChoice(0, { stables: [{ row: 2, col: 2 }, { row: 2, col: 3 }] })
      } else response = session.resolveChoice(0, '__skip__')
    } else expect(response.interaction.sourceCard).not.toBe('M037_BuildingPlan')
    expect(response.ok, response.error).toBe(true)
    expect(response.state.players[0]!.rooms).toBe(2 + rooms)
    expect(response.state.players[0]!.stableTiles).toHaveLength(accept ? 2 : 0)
    expect(response.state.players[0]!.resources.wood).toBe(0)
  })

  it.each([
    ['M044_Swamp', 4, [[12, 'moor']]],
    ['M045_TreeNursery', 1, [[12, 'forest'], [13, 'forest']]],
    ['M049_SurveyorsMap', 2, [[11, 'field'], [12, 'moor'], [13, 'forest']]],
  ] as const)('%s delivers every actually scheduled tile on its printed round', (cardId, purchaseRound, entries) => {
    for (const accept of [false, true]) {
      const session = setupMoorAudit(2, purchaseRound)
      session.state.players[0]!.resources.vegetable = 2
      let response = playMoorAuditMinor(session, cardId)
      expect(response.state.futureMeeples.filter((entry) => entry.cardId === cardId).map((entry) => entry.round)).toEqual(entries.map(([round]) => round))
      for (const [index, [round, kind]] of entries.entries()) {
        response = advanceMoorAuditToRound(session, round)
        expect(response.interaction.sourceCard).toBe(cardId)
        if (accept) {
          response = acceptMoorAuditChoice(session, response)
          const target = { row: 2, col: index + 2 }
          if (kind === 'field') response = session.commitSelectionChoice(0, { tile: target })
          else {
            const before = JSON.stringify(response.state)
            response = session.commitSelectionChoice(0, { positions: [response.state.players[0]!.roomTiles[0]!] })
            expect(response.ok).toBe(false)
            expect(JSON.stringify(response.state)).toBe(before)
            response = session.commitSelectionChoice(0, { positions: [target] })
          }
          expect(response.ok, response.error).toBe(true)
          if (kind === 'field') expect(response.state.players[0]!.fields).toContainEqual({ ...target, stacks: [] })
          else expect(response.state.players[0]!.farmTerrain).toContainEqual({ ...target, kind })
        } else {
          response = session.resolveChoice(0, '__skip__')
          expect(response.ok, response.error).toBe(true)
          expect(response.state.players[0]!.farmTerrain).toEqual([])
          expect(response.state.players[0]!.fields).toEqual([])
        }
        expect(response.state.futureMeeples.some((entry) => entry.cardId === cardId && entry.round === round)).toBe(false)
      }
      expect(response.state.futureMeeples.filter((entry) => entry.cardId === cardId)).toEqual([])
    }
  })
  it.each(['M050_FarmExtension', 'M051_MoorEnclosures'] as const)('%s accepts each of the four board sides after rejecting a disjoint extension', (cardId) => {
    for (const tiles of [
      [{ row: -1, col: 2 }, { row: -1, col: 3 }], [{ row: 3, col: 2 }, { row: 3, col: 3 }],
      [{ row: 0, col: -1 }, { row: 1, col: -1 }], [{ row: 0, col: 5 }, { row: 1, col: 5 }],
    ]) {
      const session = setupMoorAudit()
      session.state.players[0]!.houseType = 'clay'
      session.state.players[0]!.minorHand = [cardId]
      expect(session.takeAction(0, 'major-improvement').ok).toBe(true)
      let response = session.resolveChoice(0, cardId)
      expect(response.ok, response.error).toBe(true)
      const before = JSON.stringify(response.state)
      response = session.commitSelectionChoice(0, { positions: [{ row: -1, col: 2 }, { row: -1, col: 4 }] })
      expect(response.ok).toBe(false)
      expect(JSON.stringify(response.state)).toBe(before)
      response = session.commitSelectionChoice(0, { positions: tiles })
      expect(response.ok, response.error).toBe(true)
      expect(response.state.players[0]!.farmyardExtensions?.[0]?.tiles).toEqual(tiles)
      const resource = cardId === 'M050_FarmExtension' ? 'clay' : 'stone'
      expect(response.state.players[0]!.resources[resource]).toBe(19)
      expect(response.scores![0]!.categories.find((category) => category.key === 'cards')?.entries).toContainEqual(expect.objectContaining({ cardId, score: 1 }))
      expect(response.state.players[0]!.farmTerrain).toEqual(cardId === 'M051_MoorEnclosures' ? tiles.map((tile) => ({ ...tile, kind: 'moor' })) : [])
    }
  })

  it.each([0, 1, 2])('M040 only offers a legal conversion with exactly one moor, remaining: %i', (count) => {
    const session = setupMoorAudit()
    session.state.players[0]!.minorPlayed = ['M040_MoorFire']
    session.state.players[0]!.farmTerrain = [2, 3].slice(0, count).map((col) => ({ row: 1, col, kind: 'moor' }))
    session.loadState(session.state)
    let response = session.takeAction(0, 'farmland')
    expect(response.ok, response.error).toBe(true)
    expect(response.interaction.anytimeActions.some((entry) => entry.id === 'M040-moor-fire-anytime')).toBe(count === 1)
    const before = JSON.stringify(response.state)
    response = session.takeAnytimeAction(0, 'M040-moor-fire-anytime')
    expect(response.ok).toBe(count === 1)
    if (count !== 1) expect(JSON.stringify(response.state)).toBe(before)
    else {
      response = session.commitSelectionChoice(0, { positions: [{ row: 1, col: 2 }] })
      expect(response.ok, response.error).toBe(true)
      expect(response.state.players[0]!.fields).toContainEqual({ row: 1, col: 2, stacks: [] })
      expect(response.state.players[0]!.farmTerrain).toEqual([])
    }
  })

  it.each(['farmland', 'cultivation'] as const)('M042 can convert an adjacent moor after %s and may decline', (spaceId) => {
    for (const accept of [false, true]) {
      const session = setupMoorAudit(2, 14)
      session.state.players[0]!.minorPlayed = ['M042_DeepPlow']
      session.state.players[0]!.farmTerrain = [{ row: 1, col: 2, kind: 'moor' }]
      session.loadState(session.state)
      let response = session.takeAction(0, spaceId)
      expect(response.ok, response.error).toBe(true)
      if (response.interaction.request.kind !== 'farm-select') acceptMoorAuditChoice(session, response)
      response = session.commitSelectionChoice(0, { tile: { row: 0, col: 2 } })
      expect(response.ok, response.error).toBe(true)
      expect(response.interaction.sourceCard).toBe('M042_DeepPlow')
      if (accept) {
        acceptMoorAuditChoice(session, response)
        response = session.commitSelectionChoice(0, { positions: [{ row: 1, col: 2 }] })
      } else response = session.resolveChoice(0, '__skip__')
      expect(response.ok, response.error).toBe(true)
      expect(response.state.players[0]!.fields).toHaveLength(accept ? 2 : 1)
      expect(response.state.players[0]!.farmTerrain).toHaveLength(accept ? 0 : 1)
    }
  })

  it.each(['M046_Thicket', 'M047_BogForest'] as const)('%s prevents using covered terrain until an actual Fell Trees action reveals it', (cardId) => {
    const session = setupMoorAudit()
    const covered = cardId === 'M046_Thicket' ? 'forest' : 'moor'
    const player = session.state.players[0]!
    player.minorHand = [cardId]
    player.improvements = ['Major_Well', 'Major_ClayOven', 'Major_StoneOven']
    player.resources.vegetable = 1
    player.farmTerrain = [1, 2, 3, 4].map((col) => ({ row: 0, col, kind: covered }))
    session.loadState(session.state)
    expect(session.takeAction(0, 'major-improvement').ok).toBe(true)
    let response = session.resolveChoice(0, cardId)
    expect(response.ok, response.error).toBe(true)
    response = session.commitSelectionChoice(0, { positions: [{ row: 0, col: 2 }] })
    expect(response.ok, response.error).toBe(true)
    expect(response.state.players[0]!.farmTerrain).toContainEqual({ row: 0, col: 2, kind: 'forest', covered })
    response = advanceMoorAuditToRound(session, 6)
    const special = response.state.farmersOfTheMoor!.specialActionCards.find((entry) => entry.actions.includes('fell-trees'))!
    for (const action of ['slash-and-burn', 'cut-peat'] as const) {
      const before = JSON.stringify(response.state)
      response = session.takeSpecialAction(0, special.id, action, { tile: { row: 0, col: 2 } })
      expect(response.ok).toBe(false)
      expect(JSON.stringify(response.state)).toBe(before)
    }
    response = session.takeSpecialAction(0, special.id, 'fell-trees', { tile: { row: 0, col: 2 } })
    expect(response.ok, response.error).toBe(true)
    expect(response.state.players[0]!.farmTerrain).toContainEqual({ row: 0, col: 2, kind: covered })
    advanceMoorAuditToRound(session, 7)
    response = session.takeSpecialAction(0, special.id, covered === 'forest' ? 'slash-and-burn' : 'cut-peat', { tile: { row: 0, col: 2 } })
    expect(response.ok, response.error).toBe(true)
    expect(response.state.players[0]!.farmTerrain?.some((tile) => tile.row === 0 && tile.col === 2)).toBe(false)
    if (covered === 'forest') expect(response.state.players[0]!.fields).toContainEqual({ row: 0, col: 2, stacks: [] })
    else expect(response.state.players[0]!.resources.fuel).toBe(23)
  })

  it.each([0, 1])('M043 can decline after %i new fields and later obeys ordinary adjacency', (count) => {
    const session = setupMoorAudit()
    session.state.players[0]!.fields = [{ row: 0, col: 2, stacks: [] }, { row: 0, col: 3, stacks: [] }]
    session.state.players[0]!.minorHand = ['M043_WildFields']
    session.state.players[0]!.resources.vegetable = 2
    session.loadState(session.state)
    expect(session.takeAction(0, 'major-improvement').ok).toBe(true)
    let response = session.resolveChoice(0, 'M043_WildFields')
    expect(response.ok, response.error).toBe(true)
    if (count === 1) {
      acceptMoorAuditChoice(session, response)
      response = session.commitSelectionChoice(0, { tile: { row: 2, col: 2 } })
      expect(response.ok, response.error).toBe(true)
    } else {
      response = session.resolveChoice(0, '__skip__')
      expect(response.ok, response.error).toBe(true)
    }
    response = session.resolveChoice(0, '__skip__')
    expect(response.ok, response.error).toBe(true)
    expect(response.state.players[0]!.fields).toHaveLength(2 + count)
    expect(response.state.players[0]!.resources.vegetable).toBe(0)
    expect(session.resolveChoice(0, 'confirm').ok).toBe(true)
    expect(session.takeAction(1, 'day-laborer').ok).toBe(true)
    expect(session.resolveChoice(1, 'confirm').ok).toBe(true)
    response = session.takeAction(0, 'farmland')
    expect(response.ok, response.error).toBe(true)
    const before = JSON.stringify(response.state)
    response = session.commitSelectionChoice(0, { tile: { row: 2, col: 4 } })
    expect(response.ok).toBe(false)
    expect(JSON.stringify(response.state)).toBe(before)
    response = session.commitSelectionChoice(0, { tile: { row: 1, col: 2 } })
    expect(response.ok, response.error).toBe(true)
    expect(response.state.players[0]!.fields).toHaveLength(3 + count)
  })

})
