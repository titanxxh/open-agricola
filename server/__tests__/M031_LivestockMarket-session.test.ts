import { describe, expect, it } from 'vitest'
import { GameSession } from '../game/authoritative-session'
import { M031_LivestockMarket } from '../../shared/cards/M/M031_LivestockMarket'
import { getCardEffect } from '../../shared/cards/card-effects'
import { meetsCardPrerequisites } from '../../shared/cards/helpers/prerequisites'
import type { ActionFlow, PlayerState, Resource, Trade } from '../../shared/contract/types'
import '../../shared/cards/B/B012_Stockyard'
import '../../shared/cards/C/C148_MudWallower'

const CARD_ID = 'M031_LivestockMarket'
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
  horse: 0,
  fuel: 0,
  begging: 0,
  ...overrides,
})

const setup = () => {
  const session = new GameSession(375, undefined, {
    playerCount: 2,
    enableFarmersOfTheMoor: true,
    allowIncompleteFarmersOfTheMoorMinorDeal: true,
  })
  const state = session.getState().state
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
    player.stableAnimals = {}
    player.farmTerrain = []
  }
  session.loadState(state)
  return session
}

const makeSingleExchangeBoard = (player: PlayerState) => {
  player.minorHand = [CARD_ID]
  player.resources = fullResources({ sheep: 5 })
  player.pastures = [
    {
      id: 'sheep-pasture',
      size: 2,
      tiles: [{ row: 1, col: 0 }, { row: 1, col: 1 }],
      stables: 0,
      animalType: 'sheep',
      animalCount: 4,
    },
  ]
  player.houseAnimalType = 'sheep'
  player.houseAnimalCount = 1
}

const makeC148NetNeutralBoarBoard = (player: PlayerState) => {
  player.minorHand = [CARD_ID]
  player.occupationPlayed = ['C148_MudWallower']
  player.cardStates = {
    C148_MudWallower: { counters: { counter: 0, held: 1 } },
  }
  player.resources = fullResources({ sheep: 4, boar: 1 })
  player.pastures = [
    {
      id: 'sheep-pasture',
      size: 2,
      tiles: [{ row: 1, col: 0 }, { row: 1, col: 1 }],
      stables: 0,
      animalType: 'sheep',
      animalCount: 4,
    },
    {
      id: 'boar-pasture',
      size: 1,
      tiles: [{ row: 2, col: 0 }],
      stables: 0,
      animalType: null,
      animalCount: 0,
    },
    {
      id: 'cattle-pasture',
      size: 1,
      tiles: [{ row: 2, col: 1 }],
      stables: 0,
      animalType: null,
      animalCount: 0,
    },
  ]
}

const makeC148CapacityTrapBoard = (player: PlayerState) => {
  player.minorHand = [CARD_ID]
  player.occupationPlayed = ['C148_MudWallower']
  player.cardStates = {
    C148_MudWallower: { counters: { counter: 0, held: 1 } },
  }
  player.resources = fullResources({ sheep: 4, boar: 1 })
  player.pastures = [
    {
      id: 'sheep-pasture',
      size: 2,
      tiles: [{ row: 1, col: 0 }, { row: 1, col: 1 }],
      stables: 0,
      animalType: 'sheep',
      animalCount: 4,
    },
  ]
}

const makeStockyardNetNeutralBoarBoard = (player: PlayerState) => {
  player.minorHand = [CARD_ID]
  player.minorPlayed = ['B012_Stockyard']
  player.cardStates = {
    B012_Stockyard: { extraData: { animalCounts: { boar: 1 } } },
  }
  player.resources = fullResources({ sheep: 4, boar: 1 })
  player.pastures = [
    {
      id: 'sheep-pasture',
      size: 2,
      tiles: [{ row: 1, col: 0 }, { row: 1, col: 1 }],
      stables: 0,
      animalType: 'sheep',
      animalCount: 4,
    },
  ]
}

const playMinor = (session: GameSession) => {
  let resp = session.takeAction(0, 'meeting-place')
  expect(resp.ok).toBe(true)
  expect(resp.interaction.stateId).toBe('wait')
  if (resp.interaction.stateId !== 'wait') return resp
  const playMinorOption = resp.interaction.options?.find((entry) => entry.value !== '__skip__')
  expect(playMinorOption).toBeDefined()
  resp = session.resolveChoice(0, playMinorOption!.value)
  expect(resp.ok).toBe(true)
  return resp
}

const directTrades = (flow: ActionFlow | undefined): Trade[] => {
  if (!flow) return []
  const leaves = flow.type === 'leaf' ? [flow] : flow.children.filter((child) => child.type === 'leaf')
  return leaves
    .map((leaf) => leaf.actionContext?.directTrade as Trade | undefined)
    .filter((trade): trade is Trade => trade !== undefined)
}

describe('M031_LivestockMarket session', () => {
  it('requires at least 5 total animals', () => {
    const session = setup()
    const state = session.getState().state
    const player = state.players[0]!

    player.resources = fullResources({ sheep: 2, boar: 2 })
    expect(meetsCardPrerequisites(player, M031_LivestockMarket, state.round, state)).toBe(false)

    player.resources = fullResources({ sheep: 2, boar: 2, cattle: 1 })
    expect(meetsCardPrerequisites(player, M031_LivestockMarket, state.round, state)).toBe(true)
  })

  it('onBuy enumerates only exchange candidates whose final animal totals fit', () => {
    const session = setup()
    const state = session.getState().state
    const player = state.players[0]!
    makeSingleExchangeBoard(player)
    player.minorPlayed.push(CARD_ID)
    session.loadState(state)

    const effect = getCardEffect(CARD_ID)
    expect(effect).not.toBeNull()
    const flow = effect!.onBuy!(state, player) as ActionFlow
    expect(flow).toBeDefined()
    expect(flow.type).toBe('xor')
    expect(flow.optional).toBe(true)
    expect(directTrades(flow)).toEqual([
      {
        from: { sheep: 1 },
        to: { boar: 1 },
        sourceId: CARD_ID,
      },
    ])
  })

  it('plays the selected exchange and then opens system animal reorg', () => {
    const session = setup()
    const state = session.getState().state
    const player = state.players[0]!
    makeSingleExchangeBoard(player)
    session.loadState(state)

    let resp = playMinor(session)
    expect(resp.interaction.stateId).toBe('wait')
    if (resp.interaction.stateId !== 'wait') return
    const exchangeOption = resp.interaction.options?.find((option) => option.value !== '__skip__')
    expect(exchangeOption).toBeDefined()

    resp = session.resolveChoice(0, exchangeOption!.value)
    expect(resp.ok).toBe(true)
    expect(resp.state.players[0]!.resources).toMatchObject({ sheep: 4, boar: 1 })
    expect(resp.interaction.stateId).toBe('wait')
    if (resp.interaction.stateId !== 'wait') return
    expect(resp.interaction.request.kind).toBe('animal-reorg')

    resp = session.resolveChoice(0, 'confirm', {
      zones: [
        { id: 'sheep-pasture', zoneType: 'pasture', animalType: 'sheep', animalCount: 4 },
        { id: 'house', zoneType: 'house', animalType: 'boar', animalCount: 1 },
      ],
    })
    expect(resp.ok).toBe(true)
    expect(resp.state.players[0]!.resources).toMatchObject({ sheep: 4, boar: 1 })
    expect(resp.state.players[0]!.pastures[0]).toMatchObject({ animalType: 'sheep', animalCount: 4 })
    expect(resp.state.players[0]!.houseAnimalType).toBe('boar')
    expect(resp.state.players[0]!.houseAnimalCount).toBe(1)
  })

  it('spends C148-held boar on net-neutral boar exchanges when no board boar is available', () => {
    const session = setup()
    const state = session.getState().state
    const player = state.players[0]!
    makeC148NetNeutralBoarBoard(player)
    session.loadState(state)

    let resp = playMinor(session)
    expect(resp.interaction.stateId).toBe('wait')
    if (resp.interaction.stateId !== 'wait') return
    const exchangeOption = resp.interaction.options?.find((option) => {
      const preview = option.effectPreview
      return preview?.kind === 'resourceExchange'
        && preview.resourcesPaid?.sheep === 1
        && preview.resourcesPaid?.boar === 1
        && preview.resourcesGained?.boar === 1
        && preview.resourcesGained?.cattle === 1
    })
    expect(exchangeOption).toBeDefined()

    resp = session.resolveChoice(0, exchangeOption!.value)
    expect(resp.ok).toBe(true)
    expect(resp.state.players[0]!.resources).toMatchObject({ sheep: 3, boar: 1, cattle: 1 })
    expect(resp.state.players[0]!.cardStates.C148_MudWallower?.counters?.held).toBe(0)
  })

  it('filters net-neutral boar exchanges that only fit before C148 payment reduces capacity', () => {
    const session = setup()
    const state = session.getState().state
    const player = state.players[0]!
    makeC148CapacityTrapBoard(player)
    player.minorPlayed.push(CARD_ID)
    session.loadState(state)

    const effect = getCardEffect(CARD_ID)
    expect(effect).not.toBeNull()
    const flow = effect!.onBuy!(state, player) as ActionFlow
    expect(directTrades(flow)).not.toContainEqual({
      from: { sheep: 1, boar: 1 },
      to: { boar: 1, cattle: 1 },
      sourceId: CARD_ID,
    })
  })

  it('deducts boar from normal animal-holder cards on net-neutral boar exchanges', () => {
    const session = setup()
    const state = session.getState().state
    const player = state.players[0]!
    makeStockyardNetNeutralBoarBoard(player)
    session.loadState(state)

    let resp = playMinor(session)
    expect(resp.interaction.stateId).toBe('wait')
    if (resp.interaction.stateId !== 'wait') return
    const exchangeOption = resp.interaction.options?.find((option) => {
      const preview = option.effectPreview
      return preview?.kind === 'resourceExchange'
        && preview.resourcesPaid?.sheep === 1
        && preview.resourcesPaid?.boar === 1
        && preview.resourcesGained?.boar === 1
        && preview.resourcesGained?.cattle === 1
    })
    expect(exchangeOption).toBeDefined()

    resp = session.resolveChoice(0, exchangeOption!.value)
    expect(resp.ok).toBe(true)
    expect(resp.state.players[0]!.resources).toMatchObject({ sheep: 3, boar: 1, cattle: 1 })
    const animalCounts = resp.state.players[0]!.cardStates.B012_Stockyard?.extraData?.animalCounts as Record<string, number> | undefined
    expect(animalCounts?.boar ?? 0).toBe(0)
  })
})
