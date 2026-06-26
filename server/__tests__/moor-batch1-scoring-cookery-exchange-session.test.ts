import { describe, expect, it } from 'vitest'
import { GameSession } from '../game/authoritative-session'
import { executeCardListener } from '../../shared/cards/card-listeners'
import { getActiveCardRegistry } from '../../shared/cards/active-registry'
import { getCardEffect } from '../../shared/cards/card-effects'
import { meetsCardPrerequisites } from '../../shared/cards/helpers/prerequisites'
import { getExchangesInWindow } from '../../shared/actions/effects/exchange'
import { Scoring } from '../../shared/domain'
import type { ActionFlow, GameState, PlayerState, Resource } from '../../shared/contract/types'
import type { DraftGameEvent } from '../../shared/contract/events'
import type { FarmTerrainTile } from '../../shared/moor/types'
import { markAllWorkersUsed, setActiveWorkerCount } from '../../shared/domain/player'
import { M030_FarmAnimalMarket } from '../../shared/cards/M/M030_FarmAnimalMarket'
import { M074_Administration } from '../../shared/cards/M/M074_Administration'
import { M107_PotRoastRecipe } from '../../shared/cards/M/M107_PotRoastRecipe'

const PLACEHOLDER = '__test_placeholder__'

const fullResources = (overrides: Partial<Resource> = {}): Resource => ({
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
  ...overrides,
})

const setup = (playerCount = 2) => {
  const session = new GameSession(375, undefined, {
    playerCount,
    enableFarmersOfTheMoor: true,
    allowIncompleteFarmersOfTheMoorMinorDeal: true,
  })
  const state = session.getState().state
  state.players = state.players.slice(0, playerCount)
  state.currentPlayerIndex = 0
  for (const player of state.players) {
    player.resources = fullResources()
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

const playMinor = (session: GameSession, cardId: string) => {
  let resp = session.takeAction(0, 'meeting-place')
  expect(resp.ok).toBe(true)
  expect(resp.interaction.stateId).toBe('wait')
  if (resp.interaction.stateId !== 'wait') return resp
  const option = resp.interaction.options?.find((entry) => entry.value !== '__skip__')
  expect(option).toBeDefined()
  resp = session.resolveChoice(0, option!.value)
  expect(resp.ok).toBe(true)
  return resp
}

const terrain = (row: number, col: number, kind: 'forest' | 'moor'): FarmTerrainTile => ({
  row,
  col,
  kind,
})

const bonusVp = (state: GameState, playerIndex = 0) =>
  Scoring.breakdown(state, playerIndex).categories.find((category) => category.key === 'cardBonusVp')?.total ?? 0

const effect = (cardId: string) => {
  const found = getCardEffect(cardId)
  expect(found).toBeDefined()
  return found!
}

const listener = (id: string) => {
  const found = getActiveCardRegistry()?.getAllListeners().find((entry) => entry.id === id)
  expect(found).toBeDefined()
  return found!
}

const exchangeEvent = (
  paid: Partial<Resource>,
  gained: Partial<Resource> = { food: 1 },
  exchangeSource = 'Major_Fireplace1',
): DraftGameEvent<'resource.exchanged'> => ({
  type: 'resource.exchanged',
  paid,
  gained,
  paidFrom: { kind: 'player', playerId: 'p1' },
  paidTo: { kind: 'supply' },
  gainedFrom: { kind: 'supply' },
  gainedTo: { kind: 'player', playerId: 'p1' },
  exchangeSource,
} as DraftGameEvent<'resource.exchanged'>)

const movedEvent = (resources: Partial<Resource>, spaceId = 'forest'): DraftGameEvent<'resource.moved'> => ({
  type: 'resource.moved',
  resources,
  from: { kind: 'actionSpace', spaceId },
  to: { kind: 'player', playerId: 'p1' },
  reason: 'collect',
} as DraftGameEvent<'resource.moved'>)

const directContext = (
  cardId: string,
  actionId: string,
  events: DraftGameEvent[],
  playerOverrides: Partial<PlayerState> = {},
) => {
  const session = setup()
  const state = session.state
  const player = state.players[0]!
  player.id = 'p1'
  player.minorPlayed = [cardId]
  Object.assign(player, playerOverrides)
  return {
    state,
    player,
    space: state.actionSpaces.find((space) => space.id === 'forest')!,
    actionId,
    phase: 'after',
    transactionEvents: events,
    actionEvents: events,
    result: { type: 'ok' },
  } as never
}

const actionIds = (flow: ActionFlow | null | undefined): string[] => {
  if (!flow) return []
  if (flow.type === 'leaf') return [flow.actionId]
  if ('children' in flow) return flow.children.flatMap(actionIds)
  return []
}

describe('Moor Batch 1 scoring, cookery, and exchange minors', () => {
  it('M030 can optionally exchange exactly 2 sheep for 1 cattle and 1 horse when played', () => {
    const session = setup()
    const player = session.state.players[0]!
    player.minorHand = ['M030_FarmAnimalMarket']
    player.resources = fullResources({ food: 1, sheep: 2 })

    let resp = playMinor(session, 'M030_FarmAnimalMarket')
    expect(resp.interaction.stateId).toBe('wait')
    if (resp.interaction.stateId !== 'wait') return
    const accept = resp.interaction.options?.find((option) => option.value !== '__skip__')
    expect(accept).toBeDefined()

    resp = session.resolveChoice(0, accept!.value)
    expect(resp.ok).toBe(true)
    expect(resp.state.players[0]!.resources).toMatchObject({ sheep: 0, cattle: 1, horse: 1 })

    const blocked = setup()
    blocked.state.players[0]!.minorHand = ['M030_FarmAnimalMarket']
    blocked.state.players[0]!.resources = fullResources({ food: 1, sheep: 1 })
    resp = playMinor(blocked, 'M030_FarmAnimalMarket')
    expect(resp.state.players[0]!.resources).toMatchObject({ sheep: 1, cattle: 0, horse: 0 })
  })

  it('M067 scores craft buildings and accepted FoM craft upgrades', () => {
    const session = setup()
    const player = session.state.players[0]!
    player.minorHand = ['M067_ChamberOfCommerce']
    player.resources = fullResources({ clay: 2, stone: 1 })
    player.improvements = ['Major_Joinery', 'Major_Moor_CeramicsStall', 'Major_Basket2']

    const resp = playMinor(session, 'M067_ChamberOfCommerce')

    expect(resp.state.players[0]!.resources).toMatchObject({ wood: 1, reed: 1 })
    expect(bonusVp(resp.state)).toBe(3)

    const noCraft = setup()
    noCraft.state.players[0]!.minorPlayed = ['M067_ChamberOfCommerce']
    expect(bonusVp(noCraft.state)).toBe(0)
  })

  it('M069 awards bonus VP for cattle converted while the owner has at least 3 horses', () => {
    setup()
    const reg = listener('M069-leather-saddle-after-exchange')
    const ctx = directContext('M069_LeatherSaddle', 'exchange', [exchangeEvent({ cattle: 2 })], {
      resources: fullResources({ horse: 3 }),
    })

    const result = executeCardListener(reg, ctx)

    expect(actionIds(result?.flow)).toEqual(['bonus-vp', 'bonus-vp'])

    const noHorses = executeCardListener(reg, directContext('M069_LeatherSaddle', 'exchange', [exchangeEvent({ cattle: 1 })], {
      resources: fullResources({ horse: 2 }),
    }))
    expect(noHorses).toBeUndefined()

    const nonCattle = executeCardListener(reg, directContext('M069_LeatherSaddle', 'exchange', [exchangeEvent({ sheep: 1 })], {
      resources: fullResources({ horse: 3 }),
    }))
    expect(nonCattle).toBeUndefined()
  })

  it('M071 gives Museum of the Moors and Living History Museum owners one shared post-score point each', () => {
    const session = setup(3)
    session.state.players[0]!.minorPlayed = ['M071_BogBody']
    session.state.players[1]!.improvements = ['Major_Moor_MuseumOfTheMoors']
    session.state.players[2]!.minorPlayed = ['M113_LivingHistoryMuseum']

    expect(bonusVp(session.state, 0)).toBe(0)
    expect(bonusVp(session.state, 1)).toBe(1)
    expect(bonusVp(session.state, 2)).toBe(1)

    session.state.players[1]!.minorPlayed = ['M113_LivingHistoryMuseum']
    expect(bonusVp(session.state, 1)).toBe(1)
  })

  it('M072 gives 3 fuel and scores the four target ovens plus Oven Installation', () => {
    const session = setup()
    const player = session.state.players[0]!
    player.minorHand = ['M072_OvenDamper']
    player.resources = fullResources({ stone: 2 })
    player.improvements = ['Major_ClayOven', 'Major_StoneOven', 'Major_Moor_HeatingOven', 'Major_Moor_TiledOven']
    player.minorPlayed = ['M085_OvenInstallation']

    const resp = playMinor(session, 'M072_OvenDamper')

    expect(resp.state.players[0]!.resources.fuel).toBe(3)
    expect(bonusVp(resp.state)).toBe(5)

    const noOvens = setup()
    noOvens.state.players[0]!.minorPlayed = ['M072_OvenDamper']
    expect(bonusVp(noOvens.state)).toBe(0)
  })

  it('M073 scores the minimum complete animal set times other players', () => {
    const session = setup(3)
    const player = session.state.players[0]!
    player.minorPlayed = ['M073_StockBreedingPrize']
    player.resources = fullResources({ sheep: 2, boar: 3, cattle: 2, horse: 4 })
    expect(bonusVp(session.state)).toBe(4)

    player.resources.cattle = 0
    expect(bonusVp(session.state)).toBe(0)
  })

  it('M074 requires at most 4 minor improvements in hand, gives food, and offers round-14 major-count VP exchange', () => {
    const session = setup()
    const player = session.state.players[0]!
    player.minorHand = ['M074_Administration']
    player.resources = fullResources({ wood: 1, clay: 2 })
    expect(meetsCardPrerequisites(player, M074_Administration, session.state.round, session.state)).toBe(true)
    player.minorHand = ['M074_Administration', 'M030_FarmAnimalMarket', 'M067_ChamberOfCommerce', 'M069_LeatherSaddle', 'M071_BogBody']
    expect(meetsCardPrerequisites(player, M074_Administration, session.state.round, session.state)).toBe(false)

    player.minorHand = ['M074_Administration']
    const resp = playMinor(session, 'M074_Administration')
    expect(resp.state.players[0]!.resources.food).toBe(2)

    const harvest = setup()
    const harvestPlayer = harvest.state.players[0]!
    harvest.state.round = 14
    harvestPlayer.minorPlayed = ['M074_Administration']
    harvestPlayer.improvements = ['Major_Well', 'Major_Joinery']
    harvestPlayer.resources = fullResources({ food: 3 })
    const flow = effect('M074_Administration').onHarvestFeedingPhase!(harvest.state, harvestPlayer)
    expect(flow).toMatchObject({ type: 'xor', optional: true })
    expect(actionIds(flow)).toEqual(['pay', 'bonus-vp', 'pay', 'bonus-vp', 'bonus-vp'])

    harvest.state.round = 13
    expect(effect('M074_Administration').onHarvestFeedingPhase!(harvest.state, harvestPlayer)).toBeUndefined()
  })

  it('M081 exposes only exact fuel exchanges, with building resources gained in pairs', () => {
    const session = setup()
    const player = session.state.players[0]!
    player.minorPlayed = ['M081_PeatBoat']
    player.resources = fullResources({ fuel: 20 })

    const trades = getExchangesInWindow(player, 'anytime', session.state)
      .filter((trade) => trade.sourceId === 'M081_PeatBoat')

    expect(trades.map((trade) => ({ from: trade.from, to: trade.to }))).toEqual([
      { from: { fuel: 3 }, to: { wood: 2 } },
      { from: { fuel: 3 }, to: { clay: 2 } },
      { from: { fuel: 4 }, to: { reed: 2 } },
      { from: { fuel: 4 }, to: { stone: 2 } },
      { from: { fuel: 2 }, to: { sheep: 1 } },
      { from: { fuel: 3 }, to: { food: 1 } },
    ])
    expect(getExchangesInWindow(player, 'harvest', session.state).some((trade) => trade.sourceId === 'M081_PeatBoat')).toBe(false)
  })

  it('M104 gives food on play and at harvest start when the drawn start card number is within forest count', () => {
    const session = setup()
    const player = session.state.players[0]!
    player.minorHand = ['M104_WildHarvest']

    const resp = playMinor(session, 'M104_WildHarvest')
    expect(resp.state.players[0]!.resources.food).toBe(1)

    const harvest = setup()
    harvest.state.players[0]!.minorPlayed = ['M104_WildHarvest']
    harvest.state.players[0]!.farmTerrain = Array.from({ length: 9 }, (_, index) => terrain(0, index, 'forest'))
    const flow = effect('M104_WildHarvest').onStartHarvest!(harvest.state, harvest.state.players[0]!)
    expect(actionIds(flow)).toEqual(['gain'])

    harvest.state.players[0]!.farmTerrain = []
    expect(effect('M104_WildHarvest').onStartHarvest!(harvest.state, harvest.state.players[0]!)).toBeUndefined()
  })

  it('M105 is a cookery with vegetable and animal anytime exchanges plus grain bake exchange', () => {
    const session = setup()
    const player = session.state.players[0]!
    player.minorPlayed = ['M105_OpenGrill']
    player.resources = fullResources({ vegetable: 1, sheep: 1, boar: 1, cattle: 1, horse: 1, grain: 1 })

    const anytime = getExchangesInWindow(player, 'anytime', session.state).filter((trade) => trade.sourceId === 'M105_OpenGrill')
    expect(anytime.map((trade) => ({ from: trade.from, to: trade.to }))).toEqual([
      { from: { vegetable: 1 }, to: { food: 2 } },
      { from: { sheep: 1 }, to: { food: 2 } },
      { from: { boar: 1 }, to: { food: 3 } },
      { from: { cattle: 1 }, to: { food: 3 } },
      { from: { horse: 1 }, to: { food: 2 } },
    ])

    const bake = getExchangesInWindow(player, 'bake-bread', session.state).find((trade) => trade.sourceId === 'M105_OpenGrill')
    expect(bake).toMatchObject({ from: { grain: 1 }, to: { food: 2 } })
  })

  it('M107 requires 2 horses and exposes horse cooking only with Fireplace or Cooking Hearth family', () => {
    const session = setup()
    const player = session.state.players[0]!
    player.minorHand = ['M107_PotRoastRecipe']
    player.resources = fullResources({ horse: 2 })
    expect(meetsCardPrerequisites(player, M107_PotRoastRecipe, session.state.round, session.state)).toBe(true)
    player.resources.horse = 1
    expect(meetsCardPrerequisites(player, M107_PotRoastRecipe, session.state.round, session.state)).toBe(false)

    player.resources.horse = 2
    player.minorPlayed = ['M107_PotRoastRecipe']
    expect(getExchangesInWindow(player, 'anytime', session.state).some((trade) => trade.sourceId === 'M107_PotRoastRecipe')).toBe(false)
    player.improvements = ['Major_Fireplace1']
    const trade = getExchangesInWindow(player, 'anytime', session.state).find((entry) => entry.sourceId === 'M107_PotRoastRecipe')
    expect(trade).toMatchObject({ from: { horse: 1 }, to: { food: 2 } })
  })

  it('M108 feeds once per harvest and scores one bonus VP per final fuel-grain pair', () => {
    const session = setup()
    const player = session.state.players[0]!
    player.minorPlayed = ['M108_GrainDistillery']
    player.resources = fullResources({ fuel: 3, grain: 2 })

    const harvestTrades = getExchangesInWindow(player, 'harvest', session.state).filter((trade) => trade.sourceId === 'M108_GrainDistillery')
    expect(harvestTrades).toHaveLength(1)
    expect(harvestTrades[0]).toMatchObject({ from: { fuel: 1, grain: 1 }, to: { food: 5 }, max: 1 })
    expect(bonusVp(session.state)).toBe(2)

    player.resources.grain = 0
    expect(bonusVp(session.state)).toBe(0)
  })

  it('M115 gives 2 wood on play and extra wood for converted boar, cattle, and horses only', () => {
    const session = setup()
    const player = session.state.players[0]!
    player.minorHand = ['M115_OakBark']
    player.resources = fullResources({ vegetable: 1 })
    player.improvements = ['Major_Well', 'Major_Joinery']

    const resp = playMinor(session, 'M115_OakBark')
    expect(resp.state.players[0]!.resources.wood).toBe(2)

    setup()
    const reg = listener('M115-oak-bark-after-exchange')
    const result = executeCardListener(reg, directContext('M115_OakBark', 'exchange', [exchangeEvent({ boar: 1, cattle: 1, horse: 1 })]))
    expect(result?.flow).toMatchObject({ type: 'leaf', actionId: 'gain', params: { wood: 3 } })

    const ignored = executeCardListener(reg, directContext('M115_OakBark', 'exchange', [exchangeEvent({ sheep: 2 })]))
    expect(ignored).toBeUndefined()
  })

  it('M117 offers food-for-wood when collecting exactly 3 or at least 4 wood with a horse', () => {
    setup()
    const reg = listener('M117-draught-horses-after-wood-collect')

    const three = executeCardListener(reg, directContext('M117_DraughtHorses', 'collect', [movedEvent({ wood: 3 })], {
      resources: fullResources({ horse: 1, food: 1, wood: 3 }),
    }))
    expect(actionIds(three?.flow)).toEqual(['pay', 'gain'])
    expect(three?.flow).toMatchObject({ type: 'seq', optional: true })

    const four = executeCardListener(reg, directContext('M117_DraughtHorses', 'collect', [movedEvent({ wood: 4 })], {
      resources: fullResources({ horse: 1, food: 1, wood: 4 }),
    }))
    expect(four?.flow).toMatchObject({ children: [{ params: { food: 1 } }, { params: { wood: 2 } }] })

    const noHorse = executeCardListener(reg, directContext('M117_DraughtHorses', 'collect', [movedEvent({ wood: 4 })], {
      resources: fullResources({ horse: 0, food: 1, wood: 4 }),
    }))
    expect(noHorse).toBeUndefined()
  })
})
