import { describe, expect, it } from 'vitest'
import { acceptMoorAuditChoice, advanceMoorAuditToRound, setupMoorAudit } from './_helpers/moor-rules-audit'
import { markAllWorkersUsed, workersAvailable } from '../../shared/domain/player'
import { getUsedFarmyardTileKeys } from '../../shared/domain/farmyard-usage'
import type { GameSession } from '../game/authoritative-session'
import type { FarmTilePosition } from '../../shared/contract/types'
import type { MoorSpecialActionId } from '../../shared/moor/types'

const FOREST = { row: 0, col: 0, kind: 'forest' as const }
const MOOR = { row: 1, col: 0, kind: 'moor' as const }
const SECOND_FOREST = { row: 0, col: 1, kind: 'forest' as const }
const SECOND_MOOR = { row: 1, col: 1, kind: 'moor' as const }

const setup = (cards: string[] = [], round = 14, playerCount = 2) => {
  const session = setupMoorAudit(playerCount, round)
  const player = session.state.players[0]!
  player.minorPlayed = cards
  player.roomTiles = [{ row: 2, col: 3 }, { row: 2, col: 4 }]
  player.farmTerrain = [{ ...FOREST }, { ...MOOR }, { ...SECOND_FOREST }, { ...SECOND_MOOR }]
  session.loadState(session.state)
  return session
}

const buy = (session: GameSession, cardId: string) => {
  let response = session.takeAction(0, 'major-improvement')
  expect(response.ok, response.error).toBe(true)
  expect(response.interaction.request.options.map((option) => option.value)).toContain(cardId)
  response = session.resolveChoice(0, cardId)
  expect(response.ok, response.error).toBe(true)
  if (response.interaction.promptKey === 'prompt.selectPayment') response = acceptMoorAuditChoice(session, response)
  return response
}

const special = (session: GameSession, action: MoorSpecialActionId, tile: FarmTilePosition) => {
  const card = session.state.farmersOfTheMoor!.specialActionCards.find((entry) => entry.actions.includes(action) && entry.location.kind === 'market')!
  expect(card).toBeDefined()
  const response = session.takeSpecialAction(0, card.id, action, { tile })
  expect(response.ok, response.error).toBe(true)
  return response
}

const confirmTurn = (session: GameSession) => {
  const response = session.getState()
  if (response.interaction.request.kind === 'confirm-next-player') {
    expect(session.resolveChoice(response.interaction.playerIndex, 'confirm').ok).toBe(true)
  }
}

const returnToOwner = (session: GameSession) => {
  confirmTurn(session)
  expect(session.state.currentPlayerIndex).toBe(1)
  expect(session.takeAction(1, 'grain-seeds').ok).toBe(true)
  confirmTurn(session)
  expect(session.state.currentPlayerIndex).toBe(0)
}

describe('Moor clause-level native Session audit', () => {
  it.each([[0, 0], [1, 0], [2, 1], [3, 1], [4, 2], [5, 3], [6, 4], [7, 4]])(
    'M021 pays four food and grants %i horses exactly %i extra fuel even when no moor is removed', (horses, fuel) => {
      const session = setup()
      const player = session.state.players[0]!
      player.minorHand = ['M021_PeatCuttingExpedition']
      player.resources.horse = horses
      player.pastures = [{ id: 'horses', size: 4, tiles: [{ row: 0, col: 2 }, { row: 0, col: 3 }, { row: 0, col: 4 }, { row: 1, col: 4 }], animalType: 'horse', animalCount: horses, stables: 0 }]
      session.loadState(session.state)
      const opponent = structuredClone(session.state.players[1]!)
      let response = buy(session, 'M021_PeatCuttingExpedition')
      expect(response.interaction.request.selection?.kind).toBe('farm-position')
      response = session.commitSelectionChoice(0, { positions: [] })
      expect(response.ok, response.error).toBe(true)
      expect(response.state.players[0]!.resources).toMatchObject({ food: 16, fuel: 20 + fuel, horse: horses })
      expect(response.state.players[0]!.farmTerrain).toHaveLength(4)
      expect(response.scores![0]!.categories.find((category) => category.key === 'cardBonusVp')?.total ?? 0).toBe(0)
      expect(response.state.players[0]!.minorPlayed).not.toContain('M021_PeatCuttingExpedition')
      expect(response.state.players[1]!.minorHand).toContain('M021_PeatCuttingExpedition')
      expect(response.state.players[1]!.resources).toEqual(opponent.resources)
      expect(response.state.log.some((entry) => JSON.stringify(entry.params).includes('M021_PeatCuttingExpedition'))).toBe(true)
    },
  )

  it.each([1, 2])('M021 removes %i selected visible moors, preserves covered terrain, and rejects invalid selection before retry', (count) => {
    const session = setup()
    const player = session.state.players[0]!
    player.minorHand = ['M021_PeatCuttingExpedition']
    player.farmTerrain = [{ ...FOREST, covered: 'moor' }, { ...MOOR }, { ...SECOND_MOOR, covered: 'forest' }]
    session.loadState(session.state)
    let response = buy(session, 'M021_PeatCuttingExpedition')
    const before = JSON.stringify(response.state)
    response = session.commitSelectionChoice(0, { positions: [FOREST] })
    expect(response.ok).toBe(false)
    expect(JSON.stringify(response.state)).toBe(before)
    response = session.commitSelectionChoice(0, { positions: [MOOR, SECOND_MOOR].slice(0, count) })
    expect(response.ok, response.error).toBe(true)
    expect(response.state.players[0]!.resources).toMatchObject({ food: 16, fuel: 20 + 2 * count })
    expect(response.scores![0]!.categories.find((category) => category.key === 'cardBonusVp')?.total ?? 0).toBe(count)
    expect(response.state.players[0]!.farmTerrain).toContainEqual({ ...FOREST, covered: 'moor' })
    expect(response.state.players[0]!.farmTerrain).toContainEqual(count === 2 ? { ...SECOND_MOOR, kind: 'forest' } : { ...SECOND_MOOR, covered: 'forest' })
    expect(response.state.players[1]!.minorHand).toContain('M021_PeatCuttingExpedition')
  })

  it('M021 cannot be bought with three food and leaves a legal major purchase available', () => {
    const session = setup()
    session.state.players[0]!.minorHand = ['M021_PeatCuttingExpedition']
    session.state.players[0]!.resources.food = 3
    const offered = session.takeAction(0, 'major-improvement')
    expect(offered.ok).toBe(true)
    expect(offered.interaction.request.options.map((option) => option.value)).not.toContain('M021_PeatCuttingExpedition')
    const before = JSON.stringify(offered.state)
    const rejected = session.resolveChoice(0, 'M021_PeatCuttingExpedition')
    expect(rejected.ok).toBe(false)
    expect(JSON.stringify(rejected.state)).toBe(before)
    const retried = session.resolveChoice(0, 'Major_Fireplace1')
    expect(retried.ok, retried.error).toBe(true)
    expect(retried.state.players[0]!.improvements).toContain('Major_Fireplace1')
    expect(retried.state.players[0]!.resources.food).toBe(3)
  })

  it.each([
    ['M054_AgriculturalImplement', 0, true, 1, 0],
    ['M055_ToolShed', 1, false, 1, 1], ['M055_ToolShed', 2, true, 1, 1],
    ['M092_AridField', 2, false, 0, 0], ['M092_AridField', 3, true, 0, 0],
    ['M096_FallowLand', 1, false, 0, 0], ['M096_FallowLand', 2, true, 0, 0],
  ] as const)('%s checks %i prior improvements through actual purchase: %s', (cardId, count, allowed, wood, clay) => {
    const session = setup()
    const player = session.state.players[0]!
    player.minorHand = [cardId]
    player.minorPlayed = ['M035_HorseTrough', 'M072_OvenDamper'].slice(0, Math.max(0, count - 1))
    player.improvements = count > 0 ? ['Major_Well'] : []
    session.loadState(session.state)
    const offered = session.takeAction(0, 'major-improvement')
    expect(offered.ok, offered.error).toBe(true)
    expect(offered.interaction.request.options.map((option) => option.value).includes(cardId)).toBe(allowed)
    const before = JSON.stringify(offered.state)
    const resources = { ...offered.state.players[0]!.resources }
    const response = session.resolveChoice(0, cardId)
    expect(response.ok, response.error).toBe(allowed)
    if (allowed) {
      expect(response.state.players[0]!.minorPlayed).toContain(cardId)
      expect(response.state.players[0]!.resources).toEqual({ ...resources, wood: 20 - wood, clay: 20 - clay })
      expect(workersAvailable(response.state, response.state.players[0]!)).toBe(1)
      expect(response.state.log.some((entry) => JSON.stringify(entry.params).includes(cardId))).toBe(true)
      expect(response.scores![0]!.categories.find((category) => category.key === 'cards')!.entries).toContainEqual({ type: 'card', cardId, cardType: 'minor', score: cardId === 'M055_ToolShed' ? 1 : 0 })
    } else expect(JSON.stringify(response.state)).toBe(before)
  })

  it.each([
    ['M054_AgriculturalImplement', 0, 20],
    ['M055_ToolShed', 0, 1], ['M055_ToolShed', 1, 0],
    ['M074_Administration', 0, 2], ['M074_Administration', 1, 1],
  ] as const)('%s cannot be purchased with %i wood and %i clay despite meeting its prerequisite', (cardId, wood, clay) => {
    const session = setup(['M035_HorseTrough', 'M072_OvenDamper'])
    session.state.players[0]!.minorHand = [cardId]
    session.state.players[0]!.resources.wood = wood
    session.state.players[0]!.resources.clay = clay
    const offered = session.takeAction(0, 'major-improvement')
    expect(offered.ok, offered.error).toBe(true)
    expect(offered.interaction.request.options.map((option) => option.value)).not.toContain(cardId)
    const before = JSON.stringify(offered.state)
    const rejected = session.resolveChoice(0, cardId)
    expect(rejected.ok).toBe(false)
    expect(JSON.stringify(rejected.state)).toBe(before)
    const retry = offered.interaction.request.options.find((option) => option.value.startsWith('Major_'))!
    expect(retry).toBeDefined()
    const response = session.resolveChoice(0, retry.value)
    expect(response.ok, response.error).toBe(true)
    expect(response.state.players[0]!.improvements).toContain(retry.value)
    expect(response.state.players[0]!.minorHand).toContain(cardId)
  })

  it.each(['farmland', 'cultivation'])('M054 takes a card only after finishing %s, with free and paid acquisition or decline', (spaceId) => {
    for (const mode of ['market', 'borrow', 'decline'] as const) {
      const session = setup(['M054_AgriculturalImplement'])
      const player = session.state.players[0]!
      player.resources.food = mode === 'borrow' ? 2 : 0
      player.resources.grain = spaceId === 'cultivation' ? 1 : 0
      const card = session.state.farmersOfTheMoor!.specialActionCards[0]!
      if (mode === 'borrow') card.location = { kind: 'playerFaceUp', playerId: session.state.players[1]!.id }
      session.loadState(session.state)
      const originalLocation = structuredClone(card.location)
      const terrain = structuredClone(player.farmTerrain)
      let response = session.takeAction(0, spaceId)
      expect(response.ok, response.error).toBe(true)
      if (response.interaction.request.kind === 'choice') response = acceptMoorAuditChoice(session, response)
      expect(response.interaction.request.farm.farmType).toBe('plow')
      const tile = response.interaction.request.farm.selectableTiles[0]!
      response = session.commitSelectionChoice(0, { tile })
      expect(response.ok, response.error).toBe(true)
      if (spaceId === 'cultivation') {
        expect(response.interaction.sourceCard).not.toBe('M054_AgriculturalImplement')
        if (response.interaction.request.kind === 'choice') response = acceptMoorAuditChoice(session, response)
        expect(response.interaction.request.farm.farmType).toBe('sow')
        response = session.commitSelectionChoice(0, { crops: [{ ...tile, crop: 'grain' }] })
        expect(response.ok, response.error).toBe(true)
      }
      expect(response.interaction.sourceCard).toBe('M054_AgriculturalImplement')
      expect(response.state.farmersOfTheMoor!.specialActionCards.find((entry) => entry.id === card.id)!.location).toEqual(originalLocation)
      if (mode === 'decline') response = session.resolveChoice(0, '__skip__')
      else {
        response = acceptMoorAuditChoice(session, response)
        const before = JSON.stringify(response.state)
        expect(session.resolveChoice(1, `card:${card.id}`).ok).toBe(false)
        expect(JSON.stringify(session.getState().state)).toBe(before)
        response = session.resolveChoice(0, `card:${card.id}`)
      }
      expect(response.ok, response.error).toBe(true)
      expect(response.state.farmersOfTheMoor!.specialActionCards.find((entry) => entry.id === card.id)!.location).toEqual(
        mode === 'decline' ? originalLocation : { kind: mode === 'borrow' ? 'playerFaceDown' : 'playerFaceUp', playerId: player.id },
      )
      expect(response.state.players[0]!.resources.food).toBe(0)
      expect(response.state.players[0]!.farmTerrain).toEqual(terrain)
      expect(response.state.players[0]!.resources.fuel).toBe(20)
      expect(workersAvailable(response.state, response.state.players[0]!)).toBe(1)
      expect(response.interaction.sourceCard).not.toBe('M054_AgriculturalImplement')
    }
  })

  it.each(['poor', 'face-down', 'own'] as const)('M054 rejects an unavailable %s card and allows retry with the free market card', (mode) => {
    const session = setup(['M054_AgriculturalImplement'], 14, 4)
    const player = session.state.players[0]!
    player.resources.food = mode === 'poor' ? 1 : 2
    const [blocked, available] = session.state.farmersOfTheMoor!.specialActionCards
    blocked!.location = { kind: mode === 'face-down' ? 'playerFaceDown' : 'playerFaceUp', playerId: session.state.players[mode === 'own' ? 0 : 1]!.id }
    session.loadState(session.state)
    let response = session.takeAction(0, 'farmland')
    response = session.commitSelectionChoice(0, { tile: response.interaction.request.farm.selectableTiles[0]! })
    response = acceptMoorAuditChoice(session, response)
    expect(response.interaction.request.options.map((option) => option.value)).not.toContain(`card:${blocked!.id}`)
    const before = JSON.stringify(response.state)
    response = session.resolveChoice(0, `card:${blocked!.id}`)
    expect(response.ok).toBe(false)
    expect(JSON.stringify(response.state)).toBe(before)
    response = session.resolveChoice(0, `card:${available!.id}`)
    expect(response.ok, response.error).toBe(true)
    expect(response.state.players[0]!.resources.food).toBe(mode === 'poor' ? 1 : 2)
    expect(response.state.farmersOfTheMoor!.specialActionCards.find((entry) => entry.id === available!.id)!.location).toEqual({ kind: 'playerFaceUp', playerId: player.id })
  })

  it('M054 has no offer after an unrelated action or when every special card is unavailable', () => {
    const session = setup(['M054_AgriculturalImplement'])
    expect(session.takeAction(0, 'grain-seeds').interaction.sourceCard).not.toBe('M054_AgriculturalImplement')
    const unavailable = setup(['M054_AgriculturalImplement'])
    for (const card of unavailable.state.farmersOfTheMoor!.specialActionCards) card.location = { kind: 'playerFaceDown', playerId: unavailable.state.players[1]!.id }
    unavailable.loadState(unavailable.state)
    let response = unavailable.takeAction(0, 'farmland')
    response = unavailable.commitSelectionChoice(0, { tile: response.interaction.request.farm.selectableTiles[0]! })
    expect(response.ok, response.error).toBe(true)
    expect(response.interaction.sourceCard).not.toBe('M054_AgriculturalImplement')
    expect(response.state.players[0]!.resources.food).toBe(20)
  })

  it.each([
    ['cut-peat', 'before'], ['cut-peat', 'after'], ['slash-and-burn', 'before'], ['slash-and-burn', 'after'],
  ] as const)('M055 accepts the other action %s / %s with observable order and no extra card or worker', (action, timing) => {
    const session = setup(['M055_ToolShed'], 7)
    const originalTile = action === 'cut-peat' ? MOOR : FOREST
    let response = special(session, action, originalTile)
    expect(response.interaction.sourceCard).toBe('M055_ToolShed')
    expect(response.state.players[0]!.farmTerrain).toContainEqual(originalTile)
    if (timing === 'after') {
      response = session.resolveChoice(0, '__skip__')
      expect(response.ok, response.error).toBe(true)
      expect(response.interaction.sourceCard).toBe('M055_ToolShed')
      expect(response.state.players[0]!.farmTerrain).not.toContainEqual(originalTile)
      expect(response.state.players[0]!.resources.fuel).toBe(action === 'cut-peat' ? 23 : 20)
    }
    response = acceptMoorAuditChoice(session, response)
    const before = JSON.stringify(response.state)
    expect(session.resolveChoice(0, 'action:cut-peat:2:4').ok).toBe(false)
    expect(JSON.stringify(session.getState().state)).toBe(before)
    const other = action === 'cut-peat' ? 'slash-and-burn' : 'cut-peat'
    const tile = action === 'cut-peat' ? FOREST : MOOR
    response = session.resolveChoice(0, `action:${other}:${tile.row}:${tile.col}`)
    expect(response.ok, response.error).toBe(true)
    expect(response.state.players[0]!.fields).toContainEqual({ row: FOREST.row, col: FOREST.col, stacks: [] })
    expect(response.state.players[0]!.resources.fuel).toBe(23)
    expect(response.state.players[0]!.cardStates.M055_ToolShed?.counters?.usage).toBe(7)
    expect(response.state.farmersOfTheMoor!.specialActionCards.filter((card) => card.location.kind !== 'market')).toHaveLength(1)
    expect(workersAvailable(response.state, response.state.players[0]!)).toBe(2)
    expect(response.interaction.sourceCard).not.toBe('M055_ToolShed')
    const effects = response.state.events.filter((event) => event.type === 'farm.fieldPlowed' || (event.type === 'resource.moved' && event.resources.fuel === 3))
    expect(effects.map((event) => event.type)).toEqual((action === 'cut-peat') === (timing === 'after') ? ['resource.moved', 'farm.fieldPlowed'] : ['farm.fieldPlowed', 'resource.moved'])
  })

  it('M055 can decline both windows without using its round allowance and is available after the next round boundary', () => {
    const session = setup(['M055_ToolShed'], 7)
    let response = special(session, 'cut-peat', MOOR)
    expect(response.interaction.sourceCard).toBe('M055_ToolShed')
    response = session.resolveChoice(0, '__skip__')
    expect(response.interaction.sourceCard).toBe('M055_ToolShed')
    response = session.resolveChoice(0, '__skip__')
    expect(response.ok, response.error).toBe(true)
    expect(response.state.players[0]!.cardStates.M055_ToolShed?.counters?.usage).toBeUndefined()
    expect(response.state.players[0]!.fields).toHaveLength(0)
    response = advanceMoorAuditToRound(session, 8)
    expect(response.state.round).toBe(8)
    response = special(session, 'cut-peat', SECOND_MOOR)
    expect(response.interaction.sourceCard).toBe('M055_ToolShed')
    response = acceptMoorAuditChoice(session, response)
    expect(response.interaction.request.options.map((option) => option.value)).toContain('action:slash-and-burn:0:0')
    response = session.resolveChoice(0, 'action:slash-and-burn:0:0')
    expect(response.ok, response.error).toBe(true)
    expect(response.state.players[0]!.cardStates.M055_ToolShed?.counters?.usage).toBe(8)
  })

  it('M055 blocks a second independent special card in the same round and restores use after actual round end', () => {
    const session = setup(['M055_ToolShed'], 7, 6)
    for (const player of session.state.players.slice(1)) markAllWorkersUsed(session.state, player)
    session.state.players[0]!.farmTerrain!.push({ row: 0, col: 2, kind: 'forest' }, { row: 1, col: 2, kind: 'moor' })
    session.loadState(session.state)
    let response = special(session, 'cut-peat', MOOR)
    response = acceptMoorAuditChoice(session, response)
    expect(response.interaction.request.options.map((option) => option.value)).toContain('action:slash-and-burn:0:0')
    response = session.resolveChoice(0, 'action:slash-and-burn:0:0')
    expect(response.ok, response.error).toBe(true)
    confirmTurn(session)
    response = special(session, 'slash-and-burn', SECOND_FOREST)
    expect(response.interaction.sourceCard).not.toBe('M055_ToolShed')
    expect(response.state.players[0]!.farmTerrain).toContainEqual(SECOND_MOOR)
    expect(response.state.players[0]!.resources.fuel).toBe(23)
    advanceMoorAuditToRound(session, 8)
    response = special(session, 'cut-peat', SECOND_MOOR)
    expect(response.interaction.sourceCard).toBe('M055_ToolShed')
    response = acceptMoorAuditChoice(session, response)
    if (response.interaction.request.options?.some((option) => option.value === 'action:slash-and-burn:0:2')) response = session.resolveChoice(0, 'action:slash-and-burn:0:2')
    expect(response.ok, response.error).toBe(true)
    expect(response.state.players[0]!.cardStates.M055_ToolShed?.counters?.usage).toBe(8)
  })

  it('M055 declining both windows preserves the allowance for another special action in the same round', () => {
    const session = setup(['M055_ToolShed'], 7, 6)
    for (const player of session.state.players.slice(1)) markAllWorkersUsed(session.state, player)
    session.loadState(session.state)
    special(session, 'cut-peat', MOOR)
    expect(session.resolveChoice(0, '__skip__').ok).toBe(true)
    const declined = session.resolveChoice(0, '__skip__')
    expect(declined.ok, declined.error).toBe(true)
    expect(declined.state.players[0]!.cardStates.M055_ToolShed?.counters?.usage).toBeUndefined()
    confirmTurn(session)
    let response = special(session, 'slash-and-burn', FOREST)
    expect(response.interaction.sourceCard).toBe('M055_ToolShed')
    response = acceptMoorAuditChoice(session, response)
    expect(response.ok, response.error).toBe(true)
    expect(response.state.players[0]!.cardStates.M055_ToolShed?.counters?.usage).toBe(7)
    expect(response.state.players[0]!.resources.fuel).toBe(26)
    expect(response.state.players[0]!.farmTerrain).not.toContainEqual(SECOND_MOOR)
    expect(workersAvailable(response.state, response.state.players[0]!)).toBe(2)
    expect(response.interaction.sourceCard).not.toBe('M055_ToolShed')
  })

  it.each(['cut-peat', 'slash-and-burn'] as const)('M055 does not offer an impossible complementary action after %s', (action) => {
    const session = setup(['M055_ToolShed'])
    const tile = action === 'cut-peat' ? MOOR : FOREST
    session.state.players[0]!.farmTerrain = [{ ...tile }]
    session.loadState(session.state)
    const response = special(session, action, tile)
    expect(response.interaction.sourceCard).not.toBe('M055_ToolShed')
    expect(response.state.players[0]!.cardStates.M055_ToolShed?.counters?.usage).toBeUndefined()
  })

  it.each([3, 4, 5])('M074 counts itself in a %i-card hand when actually buying the card', (count) => {
    const session = setup()
    const hand = ['M074_Administration', 'M035_HorseTrough', 'M054_AgriculturalImplement', 'M072_OvenDamper', 'M032_PeatHut'].slice(0, count)
    session.state.players[0]!.minorHand = [...hand]
    const offered = session.takeAction(0, 'major-improvement')
    expect(offered.ok).toBe(true)
    expect(offered.interaction.request.options.map((option) => option.value).includes(hand[0]!)).toBe(count <= 4)
    const before = JSON.stringify(offered.state)
    const response = session.resolveChoice(0, hand[0]!)
    expect(response.ok).toBe(count <= 4)
    if (count <= 4) {
      expect(response.state.players[0]!.resources).toMatchObject({ wood: 19, clay: 18, food: 22 })
      expect(response.state.players[0]!.minorHand).toEqual(hand.slice(1))
      expect(response.state.players[0]!.minorPlayed).toContain(hand[0])
      expect(workersAvailable(response.state, response.state.players[0]!)).toBe(1)
    } else {
      expect(JSON.stringify(response.state)).toBe(before)
      expect(session.resolveChoice(0, 'Major_Fireplace1').ok).toBe(true)
    }
  })

  it.each([[0, 0, false], [2, 0, false], [1, 1, false], [1, 1, true], [2, 1, true], [1, 3, true]])(
    'M074 harvest with %i majors and %i food, accepting %s, respects the cap and optionality', (majors, food, accept) => {
      const session = setup(['M074_Administration'])
      const player = session.state.players[0]!
      player.improvements = ['Major_Well', 'Major_Fireplace1'].slice(0, majors)
      player.resources.food = food
      player.resources.grain = 1
      for (const entry of session.state.players) markAllWorkersUsed(session.state, entry)
      session.loadState(session.state)
      let response = session.performRoundEnd()
      for (let step = 0; step < 8 && response.state.roundPhase !== 'feeding'; step++) {
        expect(response.ok, response.error).toBe(true)
        expect(response.interaction.request.options.map((option) => option.value)).toContain('__skip__')
        response = session.resolveChoice(response.interaction.playerIndex, '__skip__')
      }
      expect(response.ok, response.error).toBe(true)
      expect(response.state.roundPhase).toBe('feeding')
      const limit = Math.min(majors, food)
      if (limit > 0) {
        expect(response.interaction.request.kind, JSON.stringify(response.interaction)).toBe('choice')
        const options = response.interaction.request.options.filter((option) => option.value !== '__skip__')
        expect(options).toHaveLength(limit)
        response = session.resolveChoice(0, accept ? options[limit - 1]!.value : '__skip__')
      } else expect(response.interaction.sourceCard).not.toBe('M074_Administration')
      expect(response.ok, response.error).toBe(true)
      expect(response.interaction.request.kind).toBe('feed')
      if (response.interaction.request.kind !== 'feed') throw new Error('expected feeding after the card exchange')
      expect(response.interaction.request.foodUsed).toBe(food - (accept ? limit : 0))
      expect(response.state.players[0]!.resources.food).toBe(0)
      expect(response.scores![0]!.categories.find((category) => category.key === 'cardBonusVp')?.total ?? 0).toBe(accept ? limit : 0)
      expect(response.interaction.sourceCard).not.toBe('M074_Administration')
    },
  )

  it.each([
    ['M092_AridField', 'cut-peat', 1], ['M096_FallowLand', 'cut-peat', 0], ['M096_FallowLand', 'fell-trees', 0],
  ] as const)('%s stores goods after %s and awards them once for room, stable, and pasture use', (cardId, action, fuel) => {
    for (const usage of ['room', 'stable', 'pasture'] as const) {
      const session = setup([cardId])
      const target = { row: 1, col: 3 }
      session.state.players[0]!.farmTerrain = [{ ...target, kind: action === 'fell-trees' ? 'forest' : 'moor' }]
      session.loadState(session.state)
      let response = special(session, action, target)
      const before = { ...response.state.players[0]!.resources }
      expect(before.food).toBe(20)
      expect(before.fuel).toBe(action === 'cut-peat' ? 23 : 20)
      expect(response.state.players[0]!.farmyardSpaceStates).toHaveLength(1)
      expect(getUsedFarmyardTileKeys(response.state.players[0]!)).not.toContain('1-3')
      returnToOwner(session)
      const opponent = structuredClone(session.state.players[1])
      response = session.takeAction(0, usage === 'pasture' ? 'fencing' : 'farm-expansion')
      expect(response.ok, response.error).toBe(true)
      if (response.interaction.request.kind === 'choice') {
        const label = usage === 'room' ? 'actions.construct.name' : 'actions.stables.name'
        const option = response.interaction.request.options.find((entry) => entry.labelKey === label)!
        expect(option).toBeDefined()
        response = session.resolveChoice(0, option.value)
      }
      expect(response.ok, response.error).toBe(true)
      response = session.commitSelectionChoice(0, usage === 'room' ? { rooms: [target] } : usage === 'stable' ? { stables: [target] } : { edges: ['H-1-3', 'H-2-3', 'V-1-3', 'V-1-4'], extraWood: 0 })
      expect(response.ok, response.error).toBe(true)
      if (response.interaction.request.kind === 'animal-reorg') response = session.resolveChoice(0, 'confirm', response.interaction.request.zones)
      expect(response.ok, response.error).toBe(true)
      if (response.interaction.request.kind === 'select-trigger') {
        expect(response.interaction.request.options.find((option) => option.value === '__pass__')?.disabled).toBe(true)
        const pending = JSON.stringify(response.state)
        expect(session.resolveChoice(1, cardId).ok).toBe(false)
        expect(JSON.stringify(session.getState().state)).toBe(pending)
        response = session.resolveChoice(0, cardId)
        expect(response.ok, response.error).toBe(true)
      }
      if (response.interaction.request.kind === 'choice') {
        expect(response.interaction.request.options.map((option) => option.value)).toContain('__done__')
        response = session.resolveChoice(0, '__done__')
        expect(response.ok, response.error).toBe(true)
      }
      expect(response.state.players[0]!.farmyardSpaceStates).toEqual([])
      expect(response.state.players[0]!.resources).toEqual({ ...before, food: before.food + 1, fuel: before.fuel + fuel, wood: before.wood - (usage === 'room' ? 5 : usage === 'stable' ? 2 : 4), reed: before.reed - (usage === 'room' ? 2 : 0) })
      expect(response.state.players[1]).toEqual(opponent)
      if (usage === 'room') expect(response.state.players[0]!.roomTiles).toContainEqual(target)
      if (usage === 'stable') expect(response.state.players[0]!.stableTiles).toContainEqual(target)
      if (usage === 'pasture') expect(response.state.players[0]!.pastures[0]!.tiles).toContainEqual(target)
      const saved = { food: response.state.players[0]!.resources.food, fuel: response.state.players[0]!.resources.fuel }
      confirmTurn(session)
      const later = session.takeAction(1, 'forest')
      expect(later.ok, later.error).toBe(true)
      expect(later.state.players[0]!.resources).toMatchObject(saved)
    }
  })

  it.each(['M092_AridField', 'M096_FallowLand'])('%s leaves goods stored when a different space is used', (cardId) => {
    const session = setup([cardId])
    special(session, 'cut-peat', MOOR)
    returnToOwner(session)
    let response = session.takeAction(0, 'farmland')
    expect(response.ok, response.error).toBe(true)
    expect(response.interaction.request.farm.farmType).toBe('plow')
    response = session.commitSelectionChoice(0, { tile: { row: 0, col: 2 } })
    expect(response.ok, response.error).toBe(true)
    expect(response.state.players[0]!.farmyardSpaceStates).toHaveLength(1)
    expect(response.state.players[0]!.resources).toMatchObject({ food: 20, fuel: 23 })
  })

  it.each([
    ['M092_AridField', 'fell-trees', false], ['M092_AridField', 'slash-and-burn', false],
    ['M096_FallowLand', 'slash-and-burn', false], ['M092_AridField', 'cut-peat', true],
    ['M096_FallowLand', 'cut-peat', true], ['M096_FallowLand', 'fell-trees', true],
  ] as const)('%s does not create goods for %s with covered terrain %s', (cardId, action, covered) => {
    const session = setup([cardId])
    const tile = action === 'cut-peat' ? MOOR : FOREST
    session.state.players[0]!.farmTerrain = [{ ...tile, ...(covered ? { covered: 'forest' as const } : {}) }]
    session.loadState(session.state)
    const response = special(session, action, tile)
    expect(response.state.players[0]!.farmyardSpaceStates ?? []).toEqual([])
    expect(response.state.players[0]!.resources.food).toBe(20)
    if (covered) expect(response.state.players[0]!.farmTerrain).toContainEqual({ ...tile, kind: 'forest' })
  })
})
