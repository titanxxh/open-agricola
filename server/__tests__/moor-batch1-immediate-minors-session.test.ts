import { describe, expect, it } from 'vitest'
import { GameSession } from '../game/authoritative-session'
import { meetsCardPrerequisites } from '../../shared/cards/helpers/prerequisites'
import { Scoring } from '../../shared/domain'
import { FARM_COLS, FARM_ROWS, positionKey } from '../../shared/domain/farm'
import type { Field, GameState, Pasture, PlayerState, Resource } from '../../shared/contract/types'
import type { FarmTerrainTile } from '../../shared/moor/types'
import { M019_LawnTurf } from '../../shared/cards/M/M019_LawnTurf'
import { M020_PeatPellets } from '../../shared/cards/M/M020_PeatPellets'
import { M025_HouseholdInventory } from '../../shared/cards/M/M025_HouseholdInventory'
import { M029_Tinker } from '../../shared/cards/M/M029_Tinker'
import { M065_FireBrigade } from '../../shared/cards/M/M065_FireBrigade'
import { M100_Pheromones } from '../../shared/cards/M/M100_Pheromones'

const PLACEHOLDER = '__test_placeholder__'
const CARD_EFFECT_LOG = 'log.cardEffectGain'

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
  begging: 0,
  fuel: 0,
  horse: 0,
})

const field = (row: number, col: number, kind?: 'grain' | 'vegetable'): Field => ({
  row,
  col,
  stacks: kind ? [{ kind, remaining: 1 }] : [],
})

const terrain = (row: number, col: number, kind: 'forest' | 'moor'): FarmTerrainTile => ({
  row,
  col,
  kind,
})

const pasture = (tiles: Pasture['tiles']): Pasture => ({
  id: `pasture-${tiles.map((tile) => `${tile.row}-${tile.col}`).join('-')}`,
  size: tiles.length,
  tiles,
  stables: 0,
  animalType: null,
  animalCount: 0,
})

const setup = () => {
  const session = new GameSession(373, undefined, {
    playerCount: 2,
    enableFarmersOfTheMoor: true,
    allowIncompleteFarmersOfTheMoorMinorDeal: true,
  })
  const state = session.getState().state
  state.players = state.players.slice(0, 2)
  state.currentPlayerIndex = 0
  for (const player of state.players) {
    player.resources = baseResources()
    player.minorHand = [PLACEHOLDER]
    player.occupationHand = [PLACEHOLDER]
    player.improvements = []
    player.minorPlayed = []
    player.occupationPlayed = []
    player.fields = []
    player.pastures = []
    player.stableTiles = []
    player.farmTerrain = []
  }
  session.loadState(state)
  return session
}

const fillToUnused = (player: PlayerState, unused: number) => {
  const used = new Set(player.roomTiles.map(positionKey))
  player.stableTiles.forEach((tile) => used.add(positionKey(tile)))
  player.farmTerrain?.forEach((tile) => used.add(positionKey(tile)))
  player.pastures.forEach((entry) => entry.tiles.forEach((tile) => used.add(positionKey(tile))))
  const fieldsNeeded = FARM_ROWS * FARM_COLS - unused - used.size
  const fields: Field[] = []
  for (let row = 0; row < FARM_ROWS && fields.length < fieldsNeeded; row += 1) {
    for (let col = 0; col < FARM_COLS && fields.length < fieldsNeeded; col += 1) {
      const key = positionKey({ row, col })
      if (!used.has(key)) fields.push(field(row, col))
    }
  }
  player.fields = fields
}

const playMinor = (session: GameSession, cardId: string, expectGain = true) => {
  let resp = session.takeAction(0, 'meeting-place')
  expect(resp.ok).toBe(true)
  expect(resp.interaction.stateId).toBe('wait')
  if (resp.interaction.stateId !== 'wait') return resp
  const option = resp.interaction.options?.find((entry) => entry.value !== '__skip__')
  expect(option).toBeDefined()
  resp = session.resolveChoice(0, option!.value)
  expect(resp.ok).toBe(true)
  expect(resp.state.log.some((entry) => entry.key === CARD_EFFECT_LOG && entry.params?.cardId === cardId)).toBe(expectGain)
  return resp
}

const bonusVp = (state: GameState, playerIndex = 0) =>
  Scoring.breakdown(state, playerIndex).categories.find((category) => category.key === 'cardBonusVp')?.total ?? 0

describe('Moor Batch 1 immediate resource minors', () => {
  it('M019 Lawn Turf gives fuel from unused spaces and requires 4 improvements', () => {
    const session = setup()
    const player = session.state.players[0]!
    player.minorHand = ['M019_LawnTurf']
    player.improvements = ['Major_Well', 'Major_Joinery']
    player.minorPlayed = ['A001_Shelter', 'A002_PieceOfLand']
    fillToUnused(player, 7)
    expect(meetsCardPrerequisites(player, M019_LawnTurf, session.state.round, session.state)).toBe(true)

    const resp = playMinor(session, 'M019_LawnTurf')

    expect(resp.state.players[0]!.resources.fuel).toBe(5)

    const blocked = setup()
    const blockedPlayer = blocked.state.players[0]!
    blockedPlayer.improvements = ['Major_Well']
    blockedPlayer.minorPlayed = ['A001_Shelter', 'A002_PieceOfLand']
    expect(meetsCardPrerequisites(blockedPlayer, M019_LawnTurf, blocked.state.round, blocked.state)).toBe(false)
  })

  it('M020 Peat Pellets gives one fuel per visible moor and requires a major', () => {
    const session = setup()
    const player = session.state.players[0]!
    player.minorHand = ['M020_PeatPellets']
    player.improvements = ['Major_Well']
    player.farmTerrain = [terrain(0, 0, 'moor'), terrain(0, 1, 'moor'), terrain(0, 2, 'forest')]

    const resp = playMinor(session, 'M020_PeatPellets')

    expect(resp.state.players[0]!.resources.fuel).toBe(2)

    const blocked = setup()
    blocked.state.players[0]!.minorHand = ['M020_PeatPellets']
    expect(meetsCardPrerequisites(blocked.state.players[0]!, M020_PeatPellets, blocked.state.round, blocked.state)).toBe(false)
  })

  it('M022 Ecological Niche rewards unique animals, crops, forests, and moors only without ties', () => {
    const session = setup()
    const player = session.state.players[0]!
    const other = session.state.players[1]!
    player.minorHand = ['M022_EcologicalNiche']
    player.resources.sheep = 1
    player.fields = [field(0, 0, 'grain'), field(0, 1, 'vegetable')]
    player.farmTerrain = [terrain(1, 0, 'forest'), terrain(1, 1, 'forest'), terrain(1, 2, 'moor')]
    other.resources.boar = 1
    other.farmTerrain = [terrain(2, 0, 'forest')]

    const resp = playMinor(session, 'M022_EcologicalNiche')

    expect(resp.state.players[0]!.resources.food).toBe(4)
    expect(resp.state.players[0]!.resources.fuel).toBe(2)

    const tied = setup()
    tied.state.players[0]!.minorHand = ['M022_EcologicalNiche']
    tied.state.players[0]!.resources.sheep = 1
    tied.state.players[1]!.resources.sheep = 1
    tied.state.players[0]!.fields = [field(0, 0, 'grain')]
    tied.state.players[1]!.fields = [field(0, 1, 'grain')]
    tied.state.players[0]!.farmTerrain = [terrain(1, 0, 'forest')]
    tied.state.players[1]!.farmTerrain = [terrain(1, 1, 'forest')]

    const noReward = playMinor(tied, 'M022_EcologicalNiche', false)

    expect(noReward.state.players[0]!.resources.food).toBe(0)
    expect(noReward.state.players[0]!.resources.fuel).toBe(0)
  })

  it('M022 Ecological Niche counts crops growing on card fields', () => {
    const session = setup()
    const player = session.state.players[0]!
    player.minorHand = ['M022_EcologicalNiche']
    player.minorPlayed = ['B068_Beanfield']
    player.cardStates = {
      B068_Beanfield: { extraData: { cardFieldStacks: [{ crop: 'grain', remaining: 1 }] } },
    }

    const resp = playMinor(session, 'M022_EcologicalNiche')

    expect(resp.state.players[0]!.resources.food).toBe(1)

    const tied = setup()
    tied.state.players[0]!.minorHand = ['M022_EcologicalNiche']
    tied.state.players[0]!.minorPlayed = ['B068_Beanfield']
    tied.state.players[0]!.cardStates = {
      B068_Beanfield: { extraData: { cardFieldStacks: [{ crop: 'grain', remaining: 1 }] } },
    }
    tied.state.players[1]!.minorPlayed = ['B068_Beanfield']
    tied.state.players[1]!.cardStates = {
      B068_Beanfield: { extraData: { cardFieldStacks: [{ crop: 'grain', remaining: 1 }] } },
    }

    const noReward = playMinor(tied, 'M022_EcologicalNiche', false)

    expect(noReward.state.players[0]!.resources.food).toBe(0)
  })

  it('M024 Basic Supplies tops missing printed goods up to one', () => {
    const session = setup()
    const player = session.state.players[0]!
    player.minorHand = ['M024_BasicSupplies']
    player.resources = { ...baseResources(), wood: 1, food: 2, clay: 3 }

    const resp = playMinor(session, 'M024_BasicSupplies')

    expect(resp.state.players[0]!.resources).toMatchObject({
      fuel: 1,
      food: 2,
      wood: 1,
      clay: 3,
      reed: 1,
      stone: 1,
      grain: 1,
    })
  })

  it('M025 Household Inventory gives ordered goods from unused spaces and uses field/pasture/stable OR prerequisite', () => {
    const session = setup()
    const player = session.state.players[0]!
    player.minorHand = ['M025_HouseholdInventory']
    player.resources.food = 1
    player.stableTiles = [{ row: 0, col: 0 }]
    fillToUnused(player, 10)
    expect(meetsCardPrerequisites(player, M025_HouseholdInventory, session.state.round, session.state)).toBe(true)

    const resp = playMinor(session, 'M025_HouseholdInventory')

    expect(resp.state.players[0]!.resources).toMatchObject({
      reed: 1,
      grain: 1,
      cattle: 1,
      stone: 1,
      vegetable: 1,
      horse: 1,
    })

    const blocked = setup()
    expect(meetsCardPrerequisites(blocked.state.players[0]!, M025_HouseholdInventory, blocked.state.round, blocked.state)).toBe(false)
  })

  it('M026 Chimney Hood gives the best one-grain bake yield without spending grain', () => {
    const session = setup()
    const player = session.state.players[0]!
    player.minorHand = ['M026_ChimneyHood']
    player.resources.clay = 1
    player.resources.grain = 1
    player.improvements = ['Major_Fireplace1', 'Major_ClayOven']

    const resp = playMinor(session, 'M026_ChimneyHood')

    expect(resp.state.players[0]!.resources.food).toBe(5)
    expect(resp.state.players[0]!.resources.grain).toBe(1)

    const noBaker = setup()
    noBaker.state.players[0]!.minorHand = ['M026_ChimneyHood']
    noBaker.state.players[0]!.resources.clay = 1
    const noReward = playMinor(noBaker, 'M026_ChimneyHood', false)
    expect(noReward.state.players[0]!.resources.food).toBe(0)
  })

  it('M028 Out on the Wallaby rewards each craft building and upgrade', () => {
    const session = setup()
    const player = session.state.players[0]!
    player.minorHand = ['M028_OutOnTheWallaby']
    player.improvements = ['Major_Joinery', 'Major_Moor_CeramicsStall', 'Major_Basket2']

    const resp = playMinor(session, 'M028_OutOnTheWallaby')

    expect(resp.state.players[0]!.resources).toMatchObject({
      wood: 3,
      clay: 3,
      reed: 2,
    })

    const noCraft = setup()
    noCraft.state.players[0]!.minorHand = ['M028_OutOnTheWallaby']
    const noReward = playMinor(noCraft, 'M028_OutOnTheWallaby', false)
    expect(noReward.state.players[0]!.resources.wood).toBe(0)
    expect(noReward.state.players[0]!.resources.clay).toBe(0)
    expect(noReward.state.players[0]!.resources.reed).toBe(0)
  })

  it('M029 Tinker requires 3 majors and only rewards craft building owners', () => {
    const session = setup()
    const player = session.state.players[0]!
    player.minorHand = ['M029_Tinker']
    player.resources.food = 1
    player.improvements = ['Major_Well', 'Major_ClayOven', 'Major_Pottery']
    expect(meetsCardPrerequisites(player, M029_Tinker, session.state.round, session.state)).toBe(true)

    const resp = playMinor(session, 'M029_Tinker')

    expect(resp.state.players[0]!.resources).toMatchObject({
      wood: 1,
      clay: 1,
      reed: 1,
      stone: 1,
    })

    const blocked = setup()
    blocked.state.players[0]!.improvements = ['Major_Well', 'Major_ClayOven', 'Major_StoneOven']
    blocked.state.players[0]!.minorHand = ['M029_Tinker']
    blocked.state.players[0]!.resources.food = 1
    expect(meetsCardPrerequisites(blocked.state.players[0]!, M029_Tinker, blocked.state.round, blocked.state)).toBe(true)

    const noReward = playMinor(blocked, 'M029_Tinker', false)
    expect(noReward.state.players[0]!.resources).toMatchObject({
      wood: 0,
      clay: 0,
      reed: 0,
      stone: 0,
    })
  })

  it('M065 Fire Brigade requires food and fuel, gives food and forest-threshold bonus VP', () => {
    const session = setup()
    const player = session.state.players[0]!
    player.minorHand = ['M065_FireBrigade']
    player.resources = { ...baseResources(), food: 4, fuel: 4, clay: 1, stone: 1 }
    player.farmTerrain = [
      terrain(0, 0, 'forest'),
      terrain(0, 1, 'forest'),
      terrain(0, 2, 'forest'),
      terrain(0, 3, 'forest'),
    ]
    expect(meetsCardPrerequisites(player, M065_FireBrigade, session.state.round, session.state)).toBe(true)

    const resp = playMinor(session, 'M065_FireBrigade')

    expect(resp.state.players[0]!.resources.food).toBe(6)
    expect(bonusVp(resp.state)).toBe(3)

    const blocked = setup()
    blocked.state.players[0]!.resources = { ...baseResources(), food: 4, fuel: 3 }
    expect(meetsCardPrerequisites(blocked.state.players[0]!, M065_FireBrigade, blocked.state.round, blocked.state)).toBe(false)
  })

  it('M080 Advance Payment gives all printed resources once', () => {
    const session = setup()
    session.state.players[0]!.minorHand = ['M080_AdvancePayment']

    const resp = playMinor(session, 'M080_AdvancePayment')

    expect(resp.state.players[0]!.resources).toMatchObject({
      fuel: 1,
      food: 1,
      wood: 1,
      clay: 1,
      reed: 1,
      stone: 1,
      sheep: 1,
      grain: 1,
    })
  })

  it('M100 Pheromones requires at most 2 improvements and rewards owner plus stable-or-pasture players', () => {
    const session = setup()
    const player = session.state.players[0]!
    const other = session.state.players[1]!
    player.minorHand = ['M100_Pheromones']
    player.improvements = ['Major_Well']
    player.minorPlayed = ['A001_Shelter']
    player.stableTiles = [{ row: 0, col: 0 }]
    other.pastures = [pasture([{ row: 0, col: 1 }])]
    expect(meetsCardPrerequisites(player, M100_Pheromones, session.state.round, session.state)).toBe(true)

    const resp = playMinor(session, 'M100_Pheromones')

    expect(resp.state.players[0]!.resources.food).toBe(3)
    expect(resp.state.players[1]!.resources.food).toBe(2)

    const blocked = setup()
    blocked.state.players[0]!.improvements = ['Major_Well', 'Major_Joinery']
    blocked.state.players[0]!.minorPlayed = ['A001_Shelter']
    expect(meetsCardPrerequisites(blocked.state.players[0]!, M100_Pheromones, blocked.state.round, blocked.state)).toBe(false)
  })
})
