import { describe, expect, it } from 'vitest'

import { GameSession } from '../game/authoritative-session'
import { meetsCardPrerequisites } from '../../shared/cards/helpers/prerequisites'
import { M041_CattleCollar } from '../../shared/cards/M/M041_CattleCollar'
import { M054_AgriculturalImplement } from '../../shared/cards/M/M054_AgriculturalImplement'
import { M055_ToolShed } from '../../shared/cards/M/M055_ToolShed'
import { M058_PeatFertilizer } from '../../shared/cards/M/M058_PeatFertilizer'
import { M060_SowingMachine } from '../../shared/cards/M/M060_SowingMachine'
import { setActiveWorkerCount, setWorkersAtHome } from '../../shared/domain/player'
import type { FarmTilePosition, PlayerState, Resource } from '../../shared/contract/types'
import type { MoorSpecialActionId } from '../../shared/moor/types'
import '../../shared/cards/B/B068_Beanfield'

const FILLER = '__test_placeholder__'
const FOREST_A = { row: 0, col: 0, kind: 'forest' as const }
const FOREST_B = { row: 1, col: 0, kind: 'forest' as const }
const MOOR_A = { row: 2, col: 0, kind: 'moor' as const }
const MOOR_B = { row: 2, col: 1, kind: 'moor' as const }

const baseResources = (): Resource => ({
  wood: 0,
  clay: 0,
  reed: 0,
  stone: 0,
  food: 0,
  grain: 0,
  vegetable: 0,
  sheep: 0,
  boar: 0,
  cattle: 0,
  horse: 0,
  fuel: 0,
  begging: 0,
})

const setup = (cards: string[] = [], round = 8) => {
  const session = new GameSession(381, undefined, {
    playerCount: 2,
    enableFarmersOfTheMoor: true,
    allowIncompleteFarmersOfTheMoorMinorDeal: true,
  })
  const state = session.state
  state.currentPlayerIndex = 0
  state.round = round
  state.roundPhase = 'work'
  state.players.forEach((player, index) => {
    player.resources = baseResources()
    player.minorHand = [FILLER]
    player.occupationHand = [FILLER]
    player.improvements = []
    player.minorPlayed = []
    player.occupationPlayed = []
    player.fields = []
    player.pastures = []
    player.stableTiles = []
    player.rooms = 2
    player.roomTiles = [{ row: 2, col: 3 }, { row: 2, col: 4 }]
    player.farmTerrain = [{ ...FOREST_A }, { ...FOREST_B }, { ...MOOR_A }, { ...MOOR_B }]
    setActiveWorkerCount(player, index === 0 ? 3 : 0)
    setWorkersAtHome(state, player, index === 0 ? 3 : 0)
  })
  state.players[0]!.minorPlayed.push(...cards)
  session.loadState(state)
  return { session, state: session.state, player: session.state.players[0]! }
}

const findSpecialCard = (
  session: GameSession,
  actionId: MoorSpecialActionId,
) => session.state.farmersOfTheMoor!.specialActionCards.find((card) =>
  card.actions.includes(actionId),
)!

const takeSpecial = (
  session: GameSession,
  actionId: MoorSpecialActionId,
  tile?: FarmTilePosition,
) => session.takeSpecialAction(
  0,
  findSpecialCard(session, actionId).id,
  actionId,
  tile ? { tile } : undefined,
)

const acceptOptional = (
  session: GameSession,
  resp: ReturnType<GameSession['takeAction']> | ReturnType<GameSession['takeSpecialAction']> | ReturnType<GameSession['resolveChoice']>,
) => {
  expect(resp.interaction.stateId).toBe('wait')
  if (resp.interaction.stateId !== 'wait') throw new Error('expected wait')
  if (resp.interaction.request.kind === 'animal-reorg') {
    return session.resolveChoice(resp.interaction.playerIndex ?? 0, 'confirm', resp.interaction.request.zones)
  }
  const option = resp.interaction.request.options?.find((entry) => entry.value !== '__skip__')
  expect(option).toBeDefined()
  return session.resolveChoice(resp.interaction.playerIndex ?? 0, option!.value)
}

const plowFirstTile = (
  session: GameSession,
  resp: ReturnType<GameSession['takeAction']> | ReturnType<GameSession['resolveChoice']>,
) => {
  expect(resp.interaction.stateId).toBe('wait')
  if (resp.interaction.stateId !== 'wait') throw new Error('expected wait')
  expect(resp.interaction.promptKey).toBe('ui.interactionPlowSelect')
  const tile = resp.interaction.request.farm?.selectableTiles[0]
  expect(tile).toBeDefined()
  return session.commitSelectionChoice(resp.interaction.playerIndex ?? 0, { tile })
}

const sowFirstField = (
  session: GameSession,
  resp: ReturnType<GameSession['resolveChoice']> | ReturnType<GameSession['takeSpecialAction']>,
  crop: 'grain' | 'vegetable' = 'grain',
) => {
  expect(resp.interaction.stateId).toBe('wait')
  if (resp.interaction.stateId !== 'wait') throw new Error('expected wait')
  expect(resp.interaction.promptKey).toBe('ui.interactionSowSelect')
  const field = resp.interaction.request.farm?.selectableFields[0]
  expect(field).toBeDefined()
  return session.commitSelectionChoice(resp.interaction.playerIndex ?? 0, {
    crops: [{ row: field!.tile.row, col: field!.tile.col, crop }],
  })
}

const usedRound = (player: PlayerState, cardId: string) =>
  player.cardStates?.[cardId]?.counters?.usage

describe('Moor complex special-action minors', () => {
  it('M041 Cattle Collar gates on round 8 and cattle before offering extra plow', () => {
    const prereq = setup([], 7)
    expect(meetsCardPrerequisites(prereq.player, M041_CattleCollar, 7, prereq.state)).toBe(false)
    prereq.state.round = 8
    expect(meetsCardPrerequisites(prereq.player, M041_CattleCollar, 8, prereq.state)).toBe(true)

    const { session, player } = setup(['M041_CattleCollar'], 8)
    player.resources.cattle = 1
    player.fields = [{ row: 0, col: 1, stacks: [] }]
    session.loadState(session.state)

    let resp = takeSpecial(session, 'slash-and-burn', { row: FOREST_A.row, col: FOREST_A.col })
    expect(resp.interaction.stateId === 'wait' ? resp.interaction.sourceCard : undefined).toBe('M041_CattleCollar')

    resp = acceptOptional(session, resp)
    resp = plowFirstTile(session, resp)
    expect(resp.state.players[0]!.fields).toHaveLength(3)

    const noCattle = setup(['M041_CattleCollar'], 8)
    noCattle.player.fields = [{ row: 0, col: 1, stacks: [] }]
    noCattle.session.loadState(noCattle.state)
    const hidden = takeSpecial(noCattle.session, 'slash-and-burn', { row: FOREST_A.row, col: FOREST_A.col })
    expect(hidden.interaction.stateId === 'wait' ? hidden.interaction.sourceCard : undefined)
      .not.toBe('M041_CattleCollar')
  })

  it('M054 Agricultural Implement takes market cards for free and opponent face-up cards for 2 food', () => {
    const free = setup(['M054_AgriculturalImplement'])
    let resp = free.session.takeAction(0, 'farmland')
    resp = plowFirstTile(free.session, resp)
    expect(resp.interaction.stateId === 'wait' ? resp.interaction.sourceCard : undefined)
      .toBe('M054_AgriculturalImplement')

    resp = acceptOptional(free.session, resp)
    expect(resp.interaction.stateId).toBe('wait')
    if (resp.interaction.stateId !== 'wait') throw new Error('expected special card choice')
    const marketCard = findSpecialCard(free.session, 'cut-peat')
    const marketOption = resp.interaction.request.options?.find((option) => option.value === `card:${marketCard.id}`)
    expect(marketOption).toBeDefined()
    resp = free.session.resolveChoice(0, marketOption!.value)
    expect(marketCard.location).toEqual({ kind: 'playerFaceUp', playerId: free.player.id })
    expect(resp.state.players[0]!.resources.food).toBe(0)

    const paid = setup(['M054_AgriculturalImplement'])
    const p2 = paid.state.players[1]!
    const borrowed = findSpecialCard(paid.session, 'cut-peat')
    borrowed.location = { kind: 'playerFaceUp', playerId: p2.id }
    paid.player.resources.food = 2
    paid.session.loadState(paid.state)
    resp = paid.session.takeAction(0, 'farmland')
    resp = plowFirstTile(paid.session, resp)
    resp = acceptOptional(paid.session, resp)
    expect(resp.interaction.stateId).toBe('wait')
    if (resp.interaction.stateId !== 'wait') throw new Error('expected special card choice')
    const borrowedOption = resp.interaction.request.options?.find((option) => option.value === `card:${borrowed.id}`)
    expect(borrowedOption).toBeDefined()
    resp = paid.session.resolveChoice(0, borrowedOption!.value)
    const updatedBorrowed = paid.session.state.farmersOfTheMoor!.specialActionCards.find((card) => card.id === borrowed.id)!
    expect(updatedBorrowed.location).toEqual({ kind: 'playerFaceDown', playerId: paid.player.id })
    expect(resp.state.players[0]!.resources.food).toBe(0)
  })

  it('M055 Tool Shed chains the other special action once per round without moving another card or worker', () => {
    const { session, player } = setup(['M055_ToolShed'], 6)
    const terrainCard = findSpecialCard(session, 'cut-peat')
    const workersBefore = player.workersAvailable

    let resp = takeSpecial(session, 'cut-peat', { row: MOOR_A.row, col: MOOR_A.col })
    expect(resp.interaction.stateId === 'wait' ? resp.interaction.sourceCard : undefined).toBe('M055_ToolShed')

    resp = acceptOptional(session, resp)
    expect(resp.interaction.stateId).toBe('wait')
    if (resp.interaction.stateId !== 'wait') throw new Error('expected Tool Shed choice')
    const slashOption = resp.interaction.request.options?.find((option) => option.value.includes('slash-and-burn'))
    expect(slashOption).toBeDefined()
    resp = session.resolveChoice(0, slashOption!.value)

    const after = resp.state.players[0]!
    expect(after.resources.fuel).toBe(3)
    expect(after.fields).toContainEqual({ row: FOREST_A.row, col: FOREST_A.col, stacks: [] })
    expect(after.farmTerrain).not.toContainEqual(MOOR_A)
    expect(after.farmTerrain).not.toContainEqual(FOREST_A)
    expect(terrainCard.location).toEqual({ kind: 'playerFaceUp', playerId: player.id })
    expect(after.workersAvailable).toBe(workersBefore)
    expect(usedRound(after, 'M055_ToolShed')).toBe(6)
    expect(resp.interaction.stateId === 'wait' ? resp.interaction.sourceCard : undefined).not.toBe('M055_ToolShed')
  })

  it('M058 Peat Fertilizer checks two fields only when played', () => {
    expect(meetsCardPrerequisites(setup([], 8).player, M058_PeatFertilizer, 8, setup([], 8).state)).toBe(false)

    const { session, player } = setup(['M058_PeatFertilizer'])
    player.fields = [{ row: 0, col: 1, stacks: [] }, { row: 0, col: 2, stacks: [] }]
    player.resources.grain = 2
    session.loadState(session.state)

    let resp = takeSpecial(session, 'cut-peat', { row: MOOR_A.row, col: MOOR_A.col })
    expect(resp.interaction.stateId === 'wait' ? resp.interaction.sourceCard : undefined).toBe('M058_PeatFertilizer')
    resp = acceptOptional(session, resp)
    expect(resp.interaction.stateId === 'wait' ? resp.interaction.request.farm?.selectableFields : undefined)
      .toHaveLength(2)
    resp = sowFirstField(session, resp)
    expect(resp.state.players[0]!.resources.grain).toBe(1)

    const noFields = setup(['M058_PeatFertilizer'])
    noFields.player.fields = [{ row: 0, col: 1, stacks: [] }]
    noFields.player.resources.grain = 1
    noFields.session.loadState(noFields.state)
    const hidden = takeSpecial(noFields.session, 'cut-peat', { row: MOOR_A.row, col: MOOR_A.col })
    expect(hidden.interaction.stateId === 'wait' ? hidden.interaction.sourceCard : undefined)
      .toBe('M058_PeatFertilizer')
  })

  it('M059 Nature\'s Fertilizer sows only the field created by Slash and Burn', () => {
    const { session, player } = setup(['M059_NaturesFertilizer', 'B068_Beanfield'])
    player.fields = [{ row: 0, col: 1, stacks: [] }]
    player.resources.grain = 1
    player.resources.vegetable = 1
    session.loadState(session.state)

    let resp = takeSpecial(session, 'slash-and-burn', { row: FOREST_A.row, col: FOREST_A.col })
    expect(resp.interaction.stateId === 'wait' ? resp.interaction.sourceCard : undefined).toBe('M059_NaturesFertilizer')
    resp = acceptOptional(session, resp)
    expect(resp.interaction.promptKey).toBe('ui.interactionSowSelect')
    expect(resp.interaction.request.farm?.selectableFields.map((field) => field.tile)).toEqual([
      { row: FOREST_A.row, col: FOREST_A.col },
    ])

    const sown = sowFirstField(session, resp)
    expect(sown.state.players[0]!.fields.find((field) => field.row === FOREST_A.row && field.col === FOREST_A.col)?.stacks)
      .toEqual([{ kind: 'grain', remaining: 3 }])
  })

  it('M059 Nature\'s Fertilizer can skip the new-field sow', () => {
    const { session, player } = setup(['M059_NaturesFertilizer'])
    player.resources.grain = 1
    session.loadState(session.state)

    const resp = takeSpecial(session, 'slash-and-burn', { row: FOREST_A.row, col: FOREST_A.col })
    expect(resp.interaction.stateId === 'wait' ? resp.interaction.sourceCard : undefined).toBe('M059_NaturesFertilizer')
    const skipped = session.resolveChoice(0, '__skip__')

    expect(skipped.state.players[0]!.fields.find((field) => field.row === FOREST_A.row && field.col === FOREST_A.col)?.stacks)
      .toEqual([])
    expect(skipped.state.players[0]!.resources.grain).toBe(1)
  })

  it('M060 Sowing Machine offers Sow after any special action only with 2 horses after resolution', () => {
    const prereq = setup([], 8)
    expect(meetsCardPrerequisites(prereq.player, M060_SowingMachine, 8, prereq.state)).toBe(false)
    prereq.player.resources.horse = 1
    expect(meetsCardPrerequisites(prereq.player, M060_SowingMachine, 8, prereq.state)).toBe(true)

    const { session, player } = setup(['M060_SowingMachine'])
    player.resources.horse = 2
    player.resources.grain = 1
    player.fields = [{ row: 0, col: 1, stacks: [] }]
    session.loadState(session.state)

    let resp = takeSpecial(session, 'fell-trees', { row: FOREST_A.row, col: FOREST_A.col })
    expect(resp.interaction.stateId === 'wait' ? resp.interaction.sourceCard : undefined).toBe('M060_SowingMachine')
    resp = acceptOptional(session, resp)
    resp = sowFirstField(session, resp)
    expect(resp.state.players[0]!.resources.grain).toBe(0)

    const noHorse = setup(['M060_SowingMachine'])
    noHorse.player.resources.horse = 1
    noHorse.player.resources.grain = 1
    noHorse.player.fields = [{ row: 0, col: 1, stacks: [] }]
    noHorse.session.loadState(noHorse.state)
    const hidden = takeSpecial(noHorse.session, 'fell-trees', { row: FOREST_A.row, col: FOREST_A.col })
    expect(hidden.interaction.stateId === 'wait' ? hidden.interaction.sourceCard : undefined)
      .not.toBe('M060_SowingMachine')

    const dropped = setup(['M060_SowingMachine'])
    dropped.player.resources.food = 1
    dropped.player.resources.horse = 1
    dropped.player.resources.grain = 1
    dropped.player.houseAnimalType = 'horse'
    dropped.player.houseAnimalCount = 1
    dropped.player.fields = [{ row: 0, col: 1, stacks: [] }]
    dropped.session.loadState(dropped.state)
    let horseMarket = takeSpecial(dropped.session, 'horse-market')
    expect(horseMarket.interaction.stateId).toBe('wait')
    if (horseMarket.interaction.stateId !== 'wait') throw new Error('expected horse reorg')
    expect(horseMarket.interaction.request.kind).toBe('animal-reorg')
    horseMarket = dropped.session.resolveChoice(0, 'confirm', {
      zones: [{ id: 'house', zoneType: 'house', animalType: 'horse', animalCount: 1 }],
    })
    expect(horseMarket.state.players[0]!.resources.horse).toBe(1)
    expect(horseMarket.interaction.stateId === 'wait' ? horseMarket.interaction.sourceCard : undefined)
      .not.toBe('M060_SowingMachine')

    const retained = setup(['M060_SowingMachine'])
    retained.player.resources.food = 1
    retained.player.resources.horse = 1
    retained.player.resources.grain = 1
    retained.player.fields = [{ row: 0, col: 1, stacks: [] }]
    retained.player.pastures = [{
      id: 'horse-pasture',
      size: 2,
      tiles: [{ row: 1, col: 3 }, { row: 1, col: 4 }],
      stables: 0,
      animalType: 'horse',
      animalCount: 1,
    }]
    retained.session.loadState(retained.state)
    horseMarket = takeSpecial(retained.session, 'horse-market')
    expect(horseMarket.interaction.stateId).toBe('wait')
    if (horseMarket.interaction.stateId !== 'wait') throw new Error('expected horse reorg')
    horseMarket = retained.session.resolveChoice(0, 'confirm', {
      zones: [{ id: 'horse-pasture', zoneType: 'pasture', animalType: 'horse', animalCount: 2 }],
    })
    expect(horseMarket.state.players[0]!.resources.horse).toBe(2)
    expect(horseMarket.interaction.stateId === 'wait' ? horseMarket.interaction.sourceCard : undefined)
      .toBe('M060_SowingMachine')
    horseMarket = acceptOptional(retained.session, horseMarket)
    horseMarket = sowFirstField(retained.session, horseMarket)
    expect(horseMarket.state.players[0]!.resources.grain).toBe(0)
  })

  it('M060 Sowing Machine checks sowability after Black Market minor follow-up resolves', () => {
    const { session, player } = setup(['M060_SowingMachine'])
    player.resources.fuel = 1
    player.resources.horse = 2
    player.resources.grain = 1
    player.fields = []
    player.minorHand = ['M015_PeatBurnOff']
    session.state.players[1]!.minorHand = [FILLER]
    session.loadState(session.state)

    let resp = takeSpecial(session, 'black-market')
    expect(resp.interaction.stateId === 'wait' ? resp.interaction.sourceCard : undefined).toBe('M015_PeatBurnOff')
    resp = acceptOptional(session, resp)
    resp = session.commitSelectionChoice(0, { positions: [{ row: MOOR_A.row, col: MOOR_A.col }] })
    expect(resp.interaction.stateId === 'wait' ? resp.interaction.sourceCard : undefined).toBe('M060_SowingMachine')
    resp = acceptOptional(session, resp)
    resp = sowFirstField(session, resp)

    expect(resp.state.players[0]!.resources.grain).toBe(0)
  })

  it('M060 Sowing Machine bought by Black Market does not trigger retroactively', () => {
    const { session, player } = setup()
    player.resources.fuel = 1
    player.resources.wood = 3
    player.resources.horse = 2
    player.resources.grain = 1
    player.fields = [{ row: 0, col: 1, stacks: [] }]
    player.minorHand = ['M060_SowingMachine']
    session.state.players[1]!.minorHand = [FILLER]
    session.loadState(session.state)

    let resp = takeSpecial(session, 'black-market')
    if (resp.interaction.stateId === 'wait') {
      resp = acceptOptional(session, resp)
    }

    expect(resp.state.players[0]!.minorPlayed).toContain('M060_SowingMachine')
    expect(resp.interaction.stateId === 'wait' ? resp.interaction.sourceCard : undefined)
      .not.toBe('M060_SowingMachine')
    expect(resp.state.players[0]!.resources.grain).toBe(1)
  })

  it('M109 Malthouse optionally pays exactly 1 grain for 4 food after Cut Peat', () => {
    const { session, player } = setup(['M109_Malthouse'])
    player.resources.grain = 1
    session.loadState(session.state)

    let resp = takeSpecial(session, 'cut-peat', { row: MOOR_A.row, col: MOOR_A.col })
    expect(resp.interaction.stateId === 'wait' ? resp.interaction.sourceCard : undefined).toBe('M109_Malthouse')
    resp = acceptOptional(session, resp)
    expect(resp.state.players[0]!.resources.grain).toBe(0)
    expect(resp.state.players[0]!.resources.food).toBe(4)

    const noGrain = setup(['M109_Malthouse'])
    const hidden = takeSpecial(noGrain.session, 'cut-peat', { row: MOOR_A.row, col: MOOR_A.col })
    expect(hidden.interaction.stateId === 'wait' ? hidden.interaction.sourceCard : undefined)
      .not.toBe('M109_Malthouse')
  })
})
