import { describe, expect, it } from 'vitest'
import { GameSession } from '../game/authoritative-session'
import { markAllWorkersUsed, setWorkersAtHome } from '../../shared/domain/player'
import { Scoring } from '../../shared/domain'
import { runCardEffectHook } from '../../shared/cards/card-effects'
import type { ActionChoiceOption, GameState } from '../../shared/contract/types'

const findCardFor = (
  session: GameSession,
  actionId: string,
) => session.state.farmersOfTheMoor!.specialActionCards.find((card) =>
  card.actions.includes(actionId as never),
)!

const prepareHands = (session: GameSession) => {
  for (const player of session.state.players) {
    player.minorHand = ['__test_placeholder__']
    player.occupationHand = ['__test_placeholder__']
  }
}

const cardBonusVp = (state: GameState, playerIndex = 0) =>
  Scoring.breakdown(state, playerIndex).categories.find((category) => category.key === 'cardBonusVp')?.total ?? 0

const prepareMajorPurchaseSession = (
  cardId: string,
  resources = { wood: 10, clay: 10, reed: 10, stone: 10, food: 0 },
) => {
  const session = new GameSession(62, undefined, {
    playerCount: 2,
    enableFarmersOfTheMoor: true,
  })
  prepareHands(session)
  const player = session.state.players[0]!
  player.resources = { ...player.resources, ...resources }
  setWorkersAtHome(session.state, player, 2)
  session.state.currentPlayerIndex = 0
  session.state.round = 3
  session.state.availableMajorImprovements = [cardId]
  return session
}

const choosePaymentIfNeeded = (session: GameSession, resp: ReturnType<GameSession['takeAction']>) => {
  if (resp.interaction.stateId !== 'wait' || resp.interaction.promptKey !== 'prompt.selectPayment') return resp
  const option = resp.interaction.options?.[0]
  expect(option).toBeDefined()
  const next = session.resolveChoice(resp.interaction.playerIndex ?? 0, option!.value)
  expect(next.ok).toBe(true)
  return next
}

const buyMajor = (session: GameSession, cardId: string) => {
  let resp = session.takeAction(0, 'major-improvement')
  expect(resp.ok).toBe(true)
  if (resp.interaction.stateId === 'wait' && resp.interaction.promptKey === 'ui.interactionChooseImprovement') {
    const option = resp.interaction.options?.find(
      (candidate: ActionChoiceOption) => candidate.value === `major:${cardId}`,
    )
    expect(option).toBeDefined()
    resp = session.resolveChoice(0, `major:${cardId}`)
    expect(resp.ok).toBe(true)
  }
  return choosePaymentIfNeeded(session, resp)
}

const performRoundEndThroughReorganize = (session: GameSession) => {
  let resp = session.performRoundEnd()
  expect(resp.ok).toBe(true)
  if (resp.interaction.stateId === 'wait' && resp.interaction.promptKey === 'ui.interactionAnimalReorg') {
    resp = session.resolveChoice(
      resp.interaction.playerIndex ?? 0,
      'confirm',
      (resp.interaction as { zones?: unknown }).zones,
    )
    expect(resp.ok).toBe(true)
    resp = session.performRoundEnd()
    expect(resp.ok).toBe(true)
  }
  return resp
}

describe('Farmers of the Moor remaining major improvements', () => {
  it('Peat Charcoal Kiln increases Cut Peat fuel and scores fuel reserves', () => {
    const noHorseSession = new GameSession(63, undefined, {
      playerCount: 2,
      enableFarmersOfTheMoor: true,
    })
    const noHorsePlayer = noHorseSession.state.players[0]!
    noHorsePlayer.improvements = ['Major_Moor_PeatCharcoalKiln']
    const noHorseMoor = noHorsePlayer.farmTerrain!.find((tile) => tile.kind === 'moor')!

    expect(noHorseSession.takeSpecialAction(0, findCardFor(noHorseSession, 'cut-peat').id, 'cut-peat', { tile: noHorseMoor }).ok).toBe(true)
    expect(noHorsePlayer.resources.fuel).toBe(4)

    const horseSession = new GameSession(64, undefined, {
      playerCount: 2,
      enableFarmersOfTheMoor: true,
    })
    const horsePlayer = horseSession.state.players[0]!
    horsePlayer.improvements = ['Major_Moor_PeatCharcoalKiln']
    horsePlayer.resources.horse = 1
    const horseMoor = horsePlayer.farmTerrain!.find((tile) => tile.kind === 'moor')!

    expect(horseSession.takeSpecialAction(0, findCardFor(horseSession, 'cut-peat').id, 'cut-peat', { tile: horseMoor }).ok).toBe(true)
    expect(horsePlayer.resources.fuel).toBe(5)
    expect(cardBonusVp(horseSession.state)).toBe(2)

    horsePlayer.resources.fuel = 3
    expect(cardBonusVp(horseSession.state)).toBe(1)
  })

  it('Foresters Lodge increases Fell Trees wood and scores visible forests', () => {
    const session = new GameSession(65, undefined, {
      playerCount: 2,
      enableFarmersOfTheMoor: true,
    })
    const player = session.state.players[0]!
    player.improvements = ['Major_Moor_ForestersLodge']
    const forest = player.farmTerrain!.find((tile) => tile.kind === 'forest')!

    expect(session.takeSpecialAction(0, findCardFor(session, 'fell-trees').id, 'fell-trees', { tile: forest }).ok).toBe(true)
    expect(player.resources.wood).toBe(3)
    expect(cardBonusVp(session.state)).toBe(4)

    const horseSession = new GameSession(66, undefined, {
      playerCount: 2,
      enableFarmersOfTheMoor: true,
    })
    const horsePlayer = horseSession.state.players[0]!
    horsePlayer.improvements = ['Major_Moor_ForestersLodge']
    horsePlayer.resources.horse = 1
    const horseForest = horsePlayer.farmTerrain!.find((tile) => tile.kind === 'forest')!

    expect(horseSession.takeSpecialAction(0, findCardFor(horseSession, 'fell-trees').id, 'fell-trees', { tile: horseForest }).ok).toBe(true)
    expect(horsePlayer.resources.wood).toBe(4)
  })

  it('Museum of the Moors discounts only the specified major improvements', () => {
    const discountedSession = prepareMajorPurchaseSession('Major_Well', {
      wood: 0,
      clay: 0,
      reed: 0,
      stone: 3,
      food: 0,
    })
    discountedSession.state.players[0]!.improvements = ['Major_Moor_MuseumOfTheMoors']

    const discounted = buyMajor(discountedSession, 'Major_Well')

    expect(discounted.state.players[0]!.improvements).toContain('Major_Well')
    expect(discounted.state.players[0]!.resources.stone).toBe(0)

    const blockedSession = prepareMajorPurchaseSession('Major_Fireplace1', {
      wood: 0,
      clay: 1,
      reed: 0,
      stone: 0,
      food: 0,
    })
    blockedSession.state.players[0]!.improvements = ['Major_Moor_MuseumOfTheMoors']

    const blocked = blockedSession.takeAction(0, 'major-improvement')

    if (blocked.ok && blocked.interaction.stateId === 'wait' && blocked.interaction.options) {
      expect(blocked.interaction.options?.map((option) => option.value)).not.toContain('major:Major_Fireplace1')
    } else {
      expect(blockedSession.state.players[0]!.improvements).not.toContain('Major_Fireplace1')
      expect(blockedSession.state.players[0]!.resources.clay).toBe(1)
    }
  })

  it('Riding Stables schedules future food and only pays it with at least two horses', () => {
    const purchaseSession = prepareMajorPurchaseSession('Major_Moor_RidingStables')

    const purchased = buyMajor(purchaseSession, 'Major_Moor_RidingStables')

    const scheduled = purchased.state.futureMeeples.filter((entry) => entry.cardId === 'Major_Moor_RidingStables')
    expect(scheduled.map((entry) => entry.round)).toEqual(Array.from({ length: 11 }, (_, index) => index + 4))
    expect(scheduled.every((entry) => entry.resources.food === 1)).toBe(true)
    expect(scheduled.every((entry) => entry.actionContext?.resourceCondition)).toBe(true)

    const blockedSession = new GameSession(67, undefined, {
      playerCount: 2,
      enableFarmersOfTheMoor: true,
    })
    const blockedPlayer = blockedSession.state.players[0]!
    blockedSession.state.round = 3
    blockedSession.state.futureMeeples = [{
      id: 'riding-blocked',
      cardId: 'Major_Moor_RidingStables',
      playerId: blockedPlayer.id,
      round: 4,
      actionId: null,
      resources: { food: 1 },
      actionContext: { resourceCondition: { kind: 'min-resource', resource: 'horse', amount: 2 } },
    }]
    blockedPlayer.resources.horse = 1
    blockedPlayer.houseAnimalType = 'horse'
    blockedPlayer.houseAnimalCount = 1
    const foodBefore = blockedPlayer.resources.food
    for (const player of blockedSession.state.players) markAllWorkersUsed(blockedSession.state, player)

    performRoundEndThroughReorganize(blockedSession)
    expect(blockedSession.state.round).toBe(4)
    expect(blockedPlayer.resources.food).toBe(foodBefore)
    expect(blockedSession.state.futureMeeples).toEqual([])

    const paidSession = new GameSession(68, undefined, {
      playerCount: 2,
      enableFarmersOfTheMoor: true,
    })
    const paidPlayer = paidSession.state.players[0]!
    paidSession.state.round = 3
    paidSession.state.futureMeeples = [{
      id: 'riding-paid',
      cardId: 'Major_Moor_RidingStables',
      playerId: paidPlayer.id,
      round: 4,
      actionId: null,
      resources: { food: 1 },
      actionContext: { resourceCondition: { kind: 'min-resource', resource: 'horse', amount: 2 } },
    }]
    paidPlayer.resources.horse = 2
    paidPlayer.houseAnimalType = 'horse'
    paidPlayer.houseAnimalCount = 1
    paidPlayer.stableTiles = [{ row: 0, col: 0 }]
    paidPlayer.stableAnimals = { '0-0': 'horse' }
    const paidFoodBefore = paidPlayer.resources.food
    for (const player of paidSession.state.players) markAllWorkersUsed(paidSession.state, player)

    performRoundEndThroughReorganize(paidSession)
    expect(paidSession.state.round).toBe(4)
    expect(paidPlayer.resources.food).toBe(paidFoodBefore + 1)
  })

  it('Riding Stables onBuy does nothing after round 14', () => {
    const session = new GameSession(69, undefined, {
      playerCount: 2,
      enableFarmersOfTheMoor: true,
    })
    session.state.round = 14
    const player = session.state.players[0]!

    expect(runCardEffectHook(session.state, player, 'Major_Moor_RidingStables', 'onBuy')).toBeNull()
  })
})
