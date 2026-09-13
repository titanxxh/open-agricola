import { describe, expect, it } from 'vitest'
import { GameSession, type SessionResponse } from '../game/authoritative-session'
import { markAllWorkersUsed } from '../../shared/domain/player'
import { rehydrateState, serializeSessionSnapshot } from '../../shared/session/serialization'
import { requireActiveCardRegistry } from '../../shared/cards/active-registry'

const CARD_ID = 'D159_ReedSeller'
const SALE = 'D159-reed-seller-anytime'

const setup = () => {
  const session = new GameSession(893159, undefined, { playerCount: 4 })
  for (const player of session.state.players) {
    player.minorHand = ['__test_placeholder__']
    player.occupationHand = ['__test_placeholder__']
    player.resources.food = 3
  }
  session.state.players[0]!.occupationHand = [CARD_ID]
  session.state.players[0]!.resources.reed = 2
  let response = session.takeAction(0, 'lessons')
  if (!response.state.players[0]!.occupationPlayed.includes(CARD_ID)) response = session.resolveChoice(0, CARD_ID)
  expect(response.ok, response.error).toBe(true)
  expect(response.state.players[0]!.occupationPlayed).toContain(CARD_ID)
  return session
}

const confirmSwitches = (session: GameSession, initial: SessionResponse): SessionResponse => {
  let response = initial
  for (let step = 0; step < 8 && response.interaction.stateId === 'wait' && response.interaction.request.kind === 'confirm-player-switch'; step++) {
    response = session.resolveChoice(response.interaction.request.fromPlayerIndex, 'confirm')
    expect(response.ok, response.error).toBe(true)
  }
  return response
}

const answer = (session: GameSession, initial: SessionResponse, player: number, value: string) => {
  const response = confirmSwitches(session, initial)
  expect(response.interaction.stateId).toBe('wait')
  expect(response.interaction.playerIndex).toBe(player)
  expect(response.interaction.sourceCard).toBe(CARD_ID)
  const answered = session.resolveChoice(player, value)
  expect(answered.ok, answered.error).toBe(true)
  return answered
}

describe('D159 Reed Seller', () => {
  it.each([false, true])('transfers only the chosen buyer payment when several players are willing: %s', (multiple) => {
    const session = setup()
    let response = session.takeAnytimeAction(0, SALE)
    expect(response.ok, response.error).toBe(true)
    response = answer(session, response, 1, 'buy')
    expect(response.state.players[1]!.resources.food).toBe(3)
    response = answer(session, response, 2, multiple ? 'buy' : 'decline')
    response = answer(session, response, 3, 'decline')
    response = confirmSwitches(session, response)
    if (multiple) {
      expect(response.interaction.playerIndex).toBe(0)
      const before = structuredClone(response.state.players)
      const rejected = session.resolveChoice(0, response.state.players[3]!.id)
      expect(rejected.ok).toBe(false)
      expect(rejected.state.players).toEqual(before)
      response = session.resolveChoice(0, response.state.players[2]!.id)
    }
    expect(response.ok, response.error).toBe(true)
    expect(response.state.players[0]!.resources).toMatchObject({ reed: 1, food: 5 })
    expect(response.state.players[multiple ? 2 : 1]!.resources).toMatchObject({ reed: 1, food: 1 })
    expect(response.state.players[multiple ? 1 : 2]!.resources.food).toBe(3)
  })

  it('lets an initially unaffordable buyer cook before accepting and rejects premature acceptance', () => {
    const session = setup()
    const buyer = session.state.players[1]!
    buyer.resources.food = 1
    buyer.resources.sheep = 1
    buyer.houseAnimalType = 'sheep'
    buyer.houseAnimalCount = 1
    buyer.improvements = ['Major_Fireplace1']
    let response = confirmSwitches(session, session.takeAnytimeAction(0, SALE))
    expect(response.interaction.playerIndex).toBe(1)
    const rejected = session.resolveChoice(1, 'buy')
    expect(rejected.ok).toBe(false)
    expect(rejected.interaction.playerIndex).toBe(1)
    expect(rejected.state.players[1]!.resources.food).toBe(1)
    response = session.takeAnytimeAction(1, 'exchange')
    expect(response.ok, response.error).toBe(true)
    const cooking = response.interaction.request.options.find((option) =>
      option.effectPreview?.kind === 'resourceExchange' && option.effectPreview.resourcesPaid?.sheep === 1)!
    response = session.resolveChoice(1, cooking.value)
    expect(response.ok, response.error).toBe(true)
    response = answer(session, response, 1, 'buy')
    response = answer(session, response, 2, 'decline')
    response = answer(session, response, 3, 'decline')
    response = confirmSwitches(session, response)
    expect(response.state.players[1]!.resources).toMatchObject({ food: 1, reed: 1, sheep: 0 })
    expect(response.state.players[0]!.resources).toMatchObject({ food: 5, reed: 1 })
  })

  it.each([0, 1])('suspends feeding with %i grain for a sale without prepaying other players', (grain) => {
    const session = setup()
    session.state.round = 4
    session.state.players[0]!.resources.food = 1
    session.state.players[0]!.resources.grain = grain
    for (const player of session.state.players) markAllWorkersUsed(session.state, player)
    session.loadState(session.state)
    let response = session.performRoundEnd()
    for (let step = 0; step < 12 && response.interaction.request.kind !== 'feed'; step++) {
      response = confirmSwitches(session, response)
      if (response.interaction.request.kind === 'feed') break
      response = session.resolveChoice(response.interaction.playerIndex, '__skip__')
      expect(response.ok, response.error).toBe(true)
    }
    expect(response.interaction.request.kind).toBe('feed')
    expect(response.state.players[1]!.resources.food).toBe(3)
    response = session.takeAnytimeAction(0, SALE)
    expect(response.ok, response.error).toBe(true)
    response = answer(session, response, 1, 'buy')
    response = answer(session, response, 2, 'decline')
    response = answer(session, response, 3, 'decline')
    response = confirmSwitches(session, response)
    expect(response.interaction.request.kind).toBe('feed')
    expect(response.interaction.playerIndex).toBe(0)
    expect(response.state.players[0]!.resources).toMatchObject({ food: 2, reed: 1, begging: 0 })
    response = session.resolveChoice(0, 'confirm', { selections: [] })
    expect(response.ok, response.error).toBe(true)
    expect(response.state.players[0]!.resources).toMatchObject({ food: 0, reed: 1, begging: 1 })
    expect(response.state.players[1]!.resources.food).toBe(0)
    expect(response.state.players[1]!.resources.begging).toBe(3)
  })

  it('preserves the offered reed while allowing the seller to spend surplus reed', () => {
    const session = setup()
    session.state.players[0]!.occupationPlayed.push('C139_BasketmakersWife')
    let response = session.takeAnytimeAction(0, SALE)
    response = answer(session, response, 1, 'buy')
    response = answer(session, response, 2, 'buy')
    response = answer(session, response, 3, 'decline')
    response = confirmSwitches(session, response)
    expect(response.interaction.playerIndex).toBe(0)
    response = session.takeAnytimeAction(0, 'exchange')
    expect(response.ok, response.error).toBe(true)
    const trade = response.interaction.request.options.find((option) => option.sourceCard === 'C139_BasketmakersWife')!
    const index = trade.value.split(':')[1]
    const before = structuredClone(response.state.players)
    response = session.resolveChoice(0, `bulk:${index}=2`)
    expect(response.ok).toBe(false)
    expect(response.state.players).toEqual(before)
    expect(response.interaction.stateId).toBe('wait')
    response = session.resolveChoice(0, `bulk:${index}=1`)
    expect(response.ok, response.error).toBe(true)
    expect(response.state.players[0]!.resources.reed).toBe(1)
    response = session.resolveChoice(0, response.state.players[1]!.id)
    expect(response.ok, response.error).toBe(true)
    expect(response.state.players[0]!.resources).toMatchObject({ reed: 0, food: 7 })
  })

  it('restores public responses and completes the same sale after serialization', () => {
    const session = setup()
    const response = answer(session, session.takeAnytimeAction(0, SALE), 1, 'buy')
    const snapshot = serializeSessionSnapshot(session.state, session)
    const restored = new GameSession(rehydrateState(JSON.parse(JSON.stringify(snapshot))))
    let next = restored.getState()
    expect(next.state.players[0]!.cardStates[CARD_ID]?.extraData?.sale).toEqual(response.state.players[0]!.cardStates[CARD_ID]?.extraData?.sale)
    next = answer(restored, next, 2, 'decline')
    next = answer(restored, next, 3, 'decline')
    next = confirmSwitches(restored, next)
    expect(next.state.players[0]!.resources).toMatchObject({ reed: 1, food: 5 })
    expect(next.state.players[1]!.resources).toMatchObject({ reed: 1, food: 1 })
  })

  it('accepts the refreshed feed catalog after acquiring a cookery in a nested anytime flow', () => {
    const session = new GameSession(893161)
    session.state.round = 4
    for (const player of session.state.players) {
      player.minorHand = ['__test_placeholder__']
      player.occupationHand = ['__test_placeholder__']
      player.resources.food = 0
      markAllWorkersUsed(session.state, player)
    }
    const player = session.state.players[0]!
    const cardId = '__test_feed_cookery__'
    player.minorPlayed = [cardId]
    player.resources.clay = 2
    player.resources.grain = 1
    player.resources.vegetable = 2
    session.loadState(session.state)
    session.withCtx(() => requireActiveCardRegistry('feed catalog refresh').registerListener({
      id: cardId, cardIds: [cardId], phases: ['anytime'],
      handler: ({ player: owner }) => owner.improvements.includes('Major_Fireplace1') ? undefined : {
        flow: { type: 'leaf', actionId: 'improvement', sourceCard: cardId, params: { types: ['major'], allowedPurchases: ['Major_Fireplace1'] } },
      },
    }))
    let response = session.performRoundEnd()
    while (response.interaction.request.kind === 'choice') response = session.resolveChoice(response.interaction.playerIndex, '__skip__')
    expect(response.interaction.request.kind).toBe('feed')
    response = session.takeAnytimeAction(0, cardId)
    expect(response.ok, response.error).toBe(true)
    if (response.interaction.request.kind === 'choice') response = session.resolveChoice(0, 'Major_Fireplace1')
    expect(response.ok, response.error).toBe(true)
    expect(response.interaction.request.kind).toBe('feed')
    response = session.resolveChoice(0, 'confirm', { selections: [{ sourceId: 'Major_Fireplace1', exchangeIndex: 3, count: 2 }] })
    expect(response.ok, response.error).toBe(true)
    expect(response.state.players[0]!.resources).toMatchObject({ vegetable: 0, food: 0, begging: 0 })
  })

  it('enforces resource commitments from another card without special-casing Reed Seller', () => {
    const session = new GameSession(893160)
    for (const player of session.state.players) {
      player.minorHand = ['__test_placeholder__']
      player.occupationHand = ['__test_placeholder__']
    }
    const player = session.state.players[0]!
    const cardId = '__test_resource_commitment__'
    player.minorPlayed = [cardId]
    player.occupationPlayed = ['C139_BasketmakersWife']
    player.resources.reed = 2
    session.withCtx(() => requireActiveCardRegistry('resource commitment test').loadImpl(cardId, {
      effect: { id: cardId, computeResourceCommitments: (_state, owner) => [{ playerId: owner.id, resources: { reed: 1 } }] },
    }))
    let response = session.takeAnytimeAction(0, 'exchange')
    expect(response.ok).toBe(true)
    const option = response.interaction.request.options.find((entry) => entry.sourceCard === 'C139_BasketmakersWife')!
    const index = option.value.split(':')[1]
    const before = structuredClone(response.state.players)
    response = session.resolveChoice(0, `bulk:${index}=2`)
    expect(response.ok).toBe(false)
    expect(response.state.players).toEqual(before)
    response = session.resolveChoice(0, `bulk:${index}=1`)
    expect(response.ok, response.error).toBe(true)
    expect(response.state.players[0]!.resources.reed).toBe(1)
  })

  it('sells one reed for three food when every other player declines', () => {
    const session = setup()
    let response = session.takeAnytimeAction(0, SALE)
    expect(response.ok, response.error).toBe(true)
    expect(response.state.players[0]!.resources).toMatchObject({ reed: 2, food: 3 })
    for (const index of [1, 2, 3]) response = answer(session, response, index, 'decline')
    response = confirmSwitches(session, response)
    expect(response.state.players[0]!.resources).toMatchObject({ reed: 1, food: 6 })
    expect(response.state.players.slice(1).map((player) => player.resources.food)).toEqual([3, 3, 3])
    expect(response.state.players[0]!.cardStates[CARD_ID]?.extraData?.sale).toBeUndefined()
    expect(response.state.log.some((entry) => JSON.stringify(entry.params).includes(CARD_ID))).toBe(true)
    expect(session.takeAnytimeAction(0, SALE).ok).toBe(true)
  })
})
