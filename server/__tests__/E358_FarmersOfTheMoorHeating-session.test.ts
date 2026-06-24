import { describe, expect, it } from 'vitest'
import { GameSession } from '../game/authoritative-session'
import { markAllWorkersUsed, setWorkersAtHome } from '../../shared/domain/player'
import { Scoring } from '../../shared/domain'
import { computeHeatingRequirement } from '../../shared/moor/heating'
import { runCardEffectHook } from '../../shared/cards/card-effects'
import type { ActionChoiceOption } from '../../shared/contract/types'

const prepareHands = (session: GameSession) => {
  for (const player of session.state.players) {
    player.minorHand = ['__test_placeholder__']
    player.occupationHand = ['__test_placeholder__']
  }
}

const prepareHarvest = (session: GameSession) => {
  prepareHands(session)
  session.state.round = 4
  for (const player of session.state.players) {
    markAllWorkersUsed(session.state, player)
  }
}

const feedRequest = (session: GameSession) => {
  const interaction = session.getState().interaction
  expect(interaction.stateId).toBe('wait')
  expect(interaction.request.kind).toBe('feed')
  return interaction
}

const heatingRequest = (session: GameSession, playerIndex: number, required: number) => {
  const interaction = session.getState().interaction
  expect(interaction.stateId).toBe('wait')
  const request = interaction.request as { kind: string; required: number; maxFuelPayable?: number; maxWoodConvertibleToFuel?: number }
  expect(request.kind).toBe('heating')
  expect(interaction.playerIndex).toBe(playerIndex)
  expect(request.required).toBe(required)
  return request
}

const confirmHeating = (
  session: GameSession,
  playerIndex: number,
  payload: { fuelUsed: number; woodToFuel: number },
) => session.resolveChoice(playerIndex, 'confirm', payload)

const confirmNext = (session: GameSession) => {
  const pending = session.getState().interaction
  expect(pending.stateId).toBe('wait')
  expect(pending.request.kind).toBe('confirm-next-player')
  return session.resolveChoice(pending.playerIndex, 'confirm')
}

const prepareMajorPurchaseSession = (cardId: string) => {
  const session = new GameSession(58, undefined, {
    playerCount: 2,
    enableFarmersOfTheMoor: true,
    allowIncompleteFarmersOfTheMoorMinorDeal: true,
  })
  prepareHands(session)
  const player = session.state.players[0]!
  player.resources = {
    ...player.resources,
    wood: 10,
    clay: 10,
    reed: 10,
    stone: 10,
    food: 0,
    fuel: 0,
  }
  setWorkersAtHome(session.state, player, 2)
  session.state.currentPlayerIndex = 0
  session.state.round = 1
  session.state.availableMajorImprovements = [cardId]
  return session
}

const buyMajor = (session: GameSession, cardId: string) => {
  let resp = session.takeAction(0, 'major-improvement')
  expect(resp.ok).toBe(true)
  if (resp.interaction.stateId === 'wait' && resp.interaction.options?.some((option) => option.value === `major:${cardId}`)) {
    resp = session.resolveChoice(0, `major:${cardId}`)
    expect(resp.ok).toBe(true)
  }
  if (resp.interaction.stateId === 'wait' && resp.interaction.promptKey === 'prompt.selectPayment') {
    const option = resp.interaction.options?.[0]
    expect(option).toBeDefined()
    resp = session.resolveChoice(0, option!.value)
    expect(resp.ok).toBe(true)
  }
  return resp
}

const prepareAnytimeExchangeSession = (
  cardId: string,
  resources: Partial<typeof sessionResourceShape>,
  enableFarmersOfTheMoor = true,
) => {
  const session = new GameSession(59, undefined, {
    playerCount: 2,
    enableFarmersOfTheMoor,
    allowIncompleteFarmersOfTheMoorMinorDeal: enableFarmersOfTheMoor,
  })
  prepareHands(session)
  const player = session.state.players[0]!
  player.improvements = [cardId]
  player.resources = { ...player.resources, ...resources }
  setWorkersAtHome(session.state, player, 2)
  session.state.currentPlayerIndex = 0
  session.state.round = 1
  return session
}

const sessionResourceShape = {
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
}

const exchangeOnce = (
  session: GameSession,
  paid: Partial<typeof sessionResourceShape>,
  gained: Partial<typeof sessionResourceShape>,
) => {
  expect(session.takeAction(0, 'farmland').ok).toBe(true)
  let resp = session.takeAnytimeAction(0, 'exchange')
  expect(resp.ok).toBe(true)
  const option = resp.interaction.options?.find((candidate: ActionChoiceOption) => {
    const preview = candidate.effectPreview
    if (preview?.kind !== 'resourceExchange') return false
    return Object.entries(paid).every(([key, value]) => preview.resourcesPaid?.[key as keyof typeof sessionResourceShape] === value) &&
      Object.entries(gained).every(([key, value]) => preview.resourcesGained?.[key as keyof typeof sessionResourceShape] === value)
  })
  expect(option).toBeDefined()
  resp = session.resolveChoice(0, option!.value)
  expect(resp.ok).toBe(true)
  return resp
}

describe('Farmers of the Moor heating, sick workers, and Infirmary', () => {
  it('charges heating by room count with house discounts and a zero floor', () => {
    const session = new GameSession(51, undefined, {
      playerCount: 2,
      enableFarmersOfTheMoor: true,
      allowIncompleteFarmersOfTheMoorMinorDeal: true,
    })
    prepareHarvest(session)
    const [p1, p2] = session.state.players
    p1!.resources.food = 10
    p1!.resources.fuel = 10
    p1!.rooms = 3
    p1!.roomTiles = [{ row: 0, col: 0 }, { row: 0, col: 1 }, { row: 0, col: 2 }]
    p2!.resources.food = 10
    p2!.resources.fuel = 10
    p2!.houseType = 'clay'
    p2!.rooms = 3
    p2!.roomTiles = [{ row: 0, col: 0 }, { row: 0, col: 1 }, { row: 0, col: 2 }]

    expect(session.performRoundEnd().ok).toBe(true)
    heatingRequest(session, 0, 3)
    confirmHeating(session, 0, { fuelUsed: 3, woodToFuel: 0 })
    heatingRequest(session, 1, 2)

    const stoneSession = new GameSession(52, undefined, {
      playerCount: 2,
      enableFarmersOfTheMoor: true,
      allowIncompleteFarmersOfTheMoorMinorDeal: true,
    })
    prepareHarvest(stoneSession)
    for (const player of stoneSession.state.players) {
      player.resources.food = 10
      player.houseType = 'stone'
      player.rooms = 1
      player.roomTiles = [{ row: 0, col: 0 }]
    }

    const resp = stoneSession.performRoundEnd()
    expect(resp.ok).toBe(true)
    expect(resp.interaction.stateId === 'wait' && (resp.interaction.request as { kind: string }).kind === 'heating').toBe(false)
    expect(stoneSession.state.players[0]!.sickWorkerIds).toEqual([])
  })

  it('resolves food feeding before heating for the same player', () => {
    const session = new GameSession(53, undefined, {
      playerCount: 2,
      enableFarmersOfTheMoor: true,
      allowIncompleteFarmersOfTheMoorMinorDeal: true,
    })
    prepareHarvest(session)
    const [p1, p2] = session.state.players
    p1!.resources.food = 0
    p1!.resources.grain = 1
    p1!.resources.fuel = 2
    p2!.resources.food = 0
    p2!.resources.grain = 1
    p2!.resources.fuel = 2

    expect(session.performRoundEnd().ok).toBe(true)
    expect(feedRequest(session).playerIndex).toBe(0)
    session.resolveChoice(0, 'confirm', { selections: [] })

    heatingRequest(session, 0, 2)
  })

  it('requires explicit wood-to-fuel conversion and allows deterministic underpay sickness', () => {
    const session = new GameSession(54, undefined, {
      playerCount: 2,
      enableFarmersOfTheMoor: true,
      allowIncompleteFarmersOfTheMoorMinorDeal: true,
    })
    prepareHarvest(session)
    const [p1, p2] = session.state.players
    p1!.resources.food = 10
    p1!.resources.fuel = 1
    p1!.resources.wood = 1
    p2!.resources.food = 10
    p2!.resources.fuel = 2
    p2!.resources.wood = 2

    expect(session.performRoundEnd().ok).toBe(true)
    const p1Heat = heatingRequest(session, 0, 2)
    expect(p1Heat.maxFuelPayable).toBe(1)
    expect(p1Heat.maxWoodConvertibleToFuel).toBe(1)
    confirmHeating(session, 0, { fuelUsed: 2, woodToFuel: 1 })
    expect(p1!.resources.wood).toBe(0)
    expect(p1!.resources.fuel).toBe(0)
    expect(p1!.sickWorkerIds).toEqual([])

    heatingRequest(session, 1, 2)
    confirmHeating(session, 1, { fuelUsed: 0, woodToFuel: 0 })
    expect(p2!.resources.fuel).toBe(2)
    expect(p2!.resources.wood).toBe(2)
    expect(p2!.sickWorkerIds).toEqual(['2', '1'])
  })

  it('does not request heating during a Through the Seasons summer harvest', () => {
    const session = new GameSession(55, undefined, {
      playerCount: 2,
      enableFarmersOfTheMoor: true,
      allowIncompleteFarmersOfTheMoorMinorDeal: true,
      enableThroughTheSeasons: true,
    })
    prepareHarvest(session)
    session.state.throughTheSeasons!.currentSeason = 'summer'
    for (const player of session.state.players) {
      player.resources.food = 10
      player.resources.fuel = 0
    }

    const resp = session.performRoundEnd()

    expect(resp.ok).toBe(true)
    expect(resp.interaction.stateId === 'wait' && (resp.interaction.request as { kind: string }).kind === 'heating').toBe(false)
    expect(session.state.players[0]!.sickWorkerIds).toEqual([])
    expect(session.state.players[1]!.sickWorkerIds).toEqual([])
  })

  it('restricts sick workers to multi-occupancy Infirmary and clears them on return home', () => {
    const session = new GameSession(56, undefined, {
      playerCount: 2,
      enableFarmersOfTheMoor: true,
      allowIncompleteFarmersOfTheMoorMinorDeal: true,
    })
    prepareHands(session)
    const [p1, p2] = session.state.players
    p1!.sickWorkerIds = ['2']
    p2!.sickWorkerIds = ['2']
    p1!.resources.food = 0
    p2!.resources.food = 0
    setWorkersAtHome(session.state, p1!, 1)
    setWorkersAtHome(session.state, p2!, 1)

    expect(session.takeAction(0, 'day-laborer').ok).toBe(false)
    const specialCard = session.state.farmersOfTheMoor!.specialActionCards.find((card) => card.actions.includes('hiring-fair'))!
    expect(session.takeSpecialAction(0, specialCard.id, 'hiring-fair').ok).toBe(false)

    const p1Resp = session.takeAction(0, 'moor-infirmary')
    expect(p1Resp.ok).toBe(true)
    expect(p1!.resources.food).toBe(1)
    expect(session.state.actionSpaces.find((space) => space.id === 'moor-infirmary')!.takenBy).toContainEqual({
      playerId: p1!.id,
      workerId: '2',
    })

    confirmNext(session)
    const p2Resp = session.takeAction(1, 'moor-infirmary')
    expect(p2Resp.ok).toBe(true)
    expect(p2!.resources.food).toBe(1)
    expect(session.state.actionSpaces.find((space) => space.id === 'moor-infirmary')!.takenBy).toHaveLength(2)

    confirmNext(session)
    expect(p1!.sickWorkerIds).toEqual([])
    expect(p2!.sickWorkerIds).toEqual([])
  })

  it('hides ordinary action spaces when only sick workers remain at home', () => {
    const session = new GameSession(56, undefined, {
      playerCount: 2,
      enableFarmersOfTheMoor: true,
      allowIncompleteFarmersOfTheMoorMinorDeal: true,
    })
    const player = session.state.players[0]!
    player.sickWorkerIds = ['1', '2']

    expect(session.getActionAvailability(0).forest).toBe(false)
    expect(session.getAvailableActions(0).map((action) => action.spaceId)).not.toContain('forest')
    expect(session.getActionAvailability(0)['moor-infirmary']).toBe(true)
  })

  it('scores sick workers as one point instead of three', () => {
    const session = new GameSession(57, undefined, {
      playerCount: 2,
      enableFarmersOfTheMoor: true,
      allowIncompleteFarmersOfTheMoorMinorDeal: true,
    })
    const player = session.state.players[0]!
    player.sickWorkerIds = ['2']

    const farmers = Scoring.breakdown(session.state, 0).categories.find((category) => category.key === 'farmers')!

    expect(farmers.quantity).toBe(2)
    expect(farmers.total).toBe(4)
  })

  it('applies Heating Oven purchase fuel and one-room heating reduction only in Farmers of the Moor', () => {
    const session = prepareMajorPurchaseSession('Major_Moor_HeatingOven')

    const buyResp = buyMajor(session, 'Major_Moor_HeatingOven')

    const player = buyResp.state.players[0]!
    expect(player.resources.fuel).toBe(2)
    player.rooms = 3
    player.roomTiles = [{ row: 0, col: 0 }, { row: 0, col: 1 }, { row: 0, col: 2 }]
    expect(computeHeatingRequirement(buyResp.state, player)).toBe(2)

    const disabledSession = new GameSession(60, undefined, { playerCount: 2 })
    const disabledPlayer = disabledSession.state.players[0]!
    disabledPlayer.improvements = ['Major_Moor_HeatingOven']
    disabledPlayer.rooms = 3
    disabledPlayer.roomTiles = [{ row: 0, col: 0 }, { row: 0, col: 1 }, { row: 0, col: 2 }]
    expect(computeHeatingRequirement(disabledSession.state, disabledPlayer)).toBe(0)
  })

  it('caps Tiled Oven heating requirement at one fuel after house discounts', () => {
    const session = new GameSession(61, undefined, {
      playerCount: 2,
      enableFarmersOfTheMoor: true,
      allowIncompleteFarmersOfTheMoorMinorDeal: true,
    })
    const player = session.state.players[0]!
    player.improvements = ['Major_Moor_TiledOven']
    player.rooms = 5
    player.roomTiles = [
      { row: 0, col: 0 },
      { row: 0, col: 1 },
      { row: 0, col: 2 },
      { row: 1, col: 0 },
      { row: 1, col: 1 },
    ]
    expect(computeHeatingRequirement(session.state, player)).toBe(1)

    player.houseType = 'stone'
    player.rooms = 2
    player.roomTiles = [{ row: 0, col: 0 }, { row: 0, col: 1 }]
    expect(computeHeatingRequirement(session.state, player)).toBe(0)
  })

  it('offers Farmers of the Moor stall anytime conversions while owned', () => {
    let resp = exchangeOnce(
      prepareAnytimeExchangeSession('Major_Moor_FurnitureStall', { wood: 1, food: 1 }),
      { wood: 1 },
      { clay: 1 },
    )
    expect(resp.state.players[0]!.resources.wood).toBe(0)
    expect(resp.state.players[0]!.resources.clay).toBe(1)

    resp = exchangeOnce(
      prepareAnytimeExchangeSession('Major_Moor_CeramicsStall', { clay: 1, food: 1 }),
      { clay: 1 },
      { wood: 1 },
    )
    expect(resp.state.players[0]!.resources.clay).toBe(0)
    expect(resp.state.players[0]!.resources.wood).toBe(1)

    resp = exchangeOnce(
      prepareAnytimeExchangeSession('Major_Moor_BasketStall', { reed: 1, food: 1 }),
      { reed: 1 },
      { stone: 1 },
    )
    expect(resp.state.players[0]!.resources.reed).toBe(0)
    expect(resp.state.players[0]!.resources.stone).toBe(1)
  })

  it('gates Farmers of the Moor stall conversions when the expansion is disabled', () => {
    const session = prepareAnytimeExchangeSession(
      'Major_Moor_FurnitureStall',
      { wood: 1, food: 1 },
      false,
    )
    expect(session.takeAction(0, 'farmland').ok).toBe(true)

    const resp = session.takeAnytimeAction(0, 'exchange')

    expect(resp.ok).toBe(false)
  })

  it('applies Village Church purchase food and optional harvest fuel-to-bonus-vp flow', () => {
    const session = prepareMajorPurchaseSession('Major_Moor_VillageChurch')

    const buyResp = buyMajor(session, 'Major_Moor_VillageChurch')

    const player = buyResp.state.players[0]!
    expect(player.resources.food).toBe(2)
    player.resources.fuel = 1
    const flow = runCardEffectHook(buyResp.state, player, 'Major_Moor_VillageChurch', 'onHarvest')
    expect(flow).toMatchObject({
      type: 'seq',
      optional: true,
      children: [
        { type: 'leaf', actionId: 'pay', params: { fuel: 1 }, sourceCard: 'Major_Moor_VillageChurch' },
        { type: 'leaf', actionId: 'bonus-vp', sourceCard: 'Major_Moor_VillageChurch' },
      ],
    })

    player.resources.fuel = 0
    expect(runCardEffectHook(buyResp.state, player, 'Major_Moor_VillageChurch', 'onHarvest')).toBeNull()
  })
})
