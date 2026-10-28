import { afterEach, describe, expect, it } from 'vitest'
import { GameSession, type SessionResponse } from '../game/authoritative-session'
import { createWorkSession } from './_helpers/session-fixtures'
import { markAllWorkersUsed } from '../../shared/domain/player'
import { rehydrateState, serializeSessionSnapshot } from '../../shared/session/serialization'
import { requireActiveCardRegistry } from '../../shared/cards/active-registry'
import { assertRejectedUnchanged } from './_helpers/negative-rule-audit'

const CARD_ID = 'M108_GrainDistillery'
const sessions: ReturnType<typeof createWorkSession>[] = []

const createSession = ({ grain = 1, fuel = 3, veggieLover = false, round = 14, played = true, kiln = false } = {}) => {
  const session = createWorkSession({
    seed: 428029,
    options: { enableFarmersOfTheMoor: true, allowIncompleteFarmersOfTheMoorMinorDeal: true },
    configure: state => {
      state.round = round
      state.currentPlayerIndex = 0
      for (const player of state.players) {
        player.resources = { wood: 0, clay: 0, reed: 0, stone: 0, grain: 0, vegetable: 0,
          sheep: 0, boar: 0, cattle: 0, horse: 0, begging: 0, food: 20, fuel: 3 }
        player.minorHand = ['__test_placeholder__']
        player.occupationHand = ['__test_placeholder__']
        player.minorPlayed = []
        player.occupationPlayed = []
        player.improvements = []
        player.cardStates = {}
        player.farmTerrain = []
        markAllWorkersUsed(state, player)
      }
      const player = state.players[0]!
      player.minorPlayed = played ? [CARD_ID] : []
      player.minorHand = played ? ['__test_placeholder__'] : [CARD_ID]
      player.improvements = kiln ? ['Major_Moor_PeatCharcoalKiln'] : []
      player.occupationPlayed = veggieLover ? ['E132_VeggieLover'] : []
      player.resources.grain = grain
      player.resources.fuel = fuel
      player.resources.vegetable = veggieLover ? 1 : 0
    },
  })
  sessions.push(session)
  return session
}

const cardBonus = (response: SessionResponse, cardId = CARD_ID) => response.scores?.[0]?.categories
  .find(category => category.key === 'cardBonusVp')?.entries?.find(entry => entry.type === 'bonus' && entry.cardId === cardId)?.score ?? 0

const optionsOf = (response: SessionResponse) => response.interaction.stateId === 'wait'
  && response.interaction.request.kind === 'choice' ? response.interaction.request.options ?? [] : []

const scoringActionId = (session: GameSession) => {
  const registration = session.withCtx(() => requireActiveCardRegistry('M108 scoring entry test').getAllListeners()
    .find(entry => entry.cardIds?.includes(CARD_ID) && entry.preScoring === 'only'))
  expect(registration).toBeDefined()
  return registration!.id
}

const restore = (session: GameSession) => {
  const saved = session.withCtx(() => serializeSessionSnapshot(session.state, session))
  const restored = new GameSession(rehydrateState(JSON.parse(JSON.stringify(saved))))
  sessions.push(restored)
  const observable = (response: SessionResponse) => JSON.parse(JSON.stringify({
    players: response.state.players, events: response.state.events, log: response.state.log,
    round: response.state.round, roundPhase: response.state.roundPhase,
    scores: response.scores, interaction: response.interaction,
  }))
  expect(observable(restored.getState())).toEqual(observable(session.getState()))
  return restored
}

const advance = (session: ReturnType<typeof createSession>, response: SessionResponse,
  stop: (response: SessionResponse) => boolean = () => false): SessionResponse => {
  for (let step = 0; step < 60; step += 1) {
    expect(response.ok, response.error).toBe(true)
    if (stop(response) || response.interaction.stateId === 'gameover') return response
    if (response.interaction.stateId !== 'wait') throw new Error('Unexpected idle settlement')
    const { request, playerIndex } = response.interaction
    if (request.kind === 'feed') response = session.resolveChoice(playerIndex, 'confirm', { selections: [] })
    else if (request.kind === 'heating') {
      expect(request.required).toBe(2)
      response = session.resolveChoice(playerIndex, 'confirm', { fuelUsed: request.required, woodToFuel: 0 })
    } else if (request.kind === 'confirm-next-player' || request.kind === 'confirm-player-switch') {
      response = session.resolveChoice(playerIndex, 'confirm')
    } else if (optionsOf(response).some(option => option.value === '__skip__')) {
      response = session.resolveChoice(playerIndex, '__skip__')
    } else throw new Error(`Unexpected settlement interaction: ${JSON.stringify(response.interaction)}`)
  }
  throw new Error('Settlement did not finish')
}

const enterPayment = (session: ReturnType<typeof createSession>) => {
  const window = advance(session, session.performRoundEnd(), response => optionsOf(response)
    .some(option => option.sourceCard === CARD_ID))
  expect(window.state.gameOver).toBe(false)
  expect(window.state.players[0]!.resources.food).toBe(16)
  const entry = optionsOf(window).find(option => option.sourceCard === CARD_ID)
  expect(entry).toBeDefined()
  return session.resolveChoice(0, entry!.value)
}

afterEach(() => { for (const session of sessions.splice(0)) session.dispose() })

describe('M108 Grain Distillery pre-scoring payment', () => {
  it('does not automatically spend or score an unchosen inventory pair', () => {
    const session = createSession()
    const before = session.withCtx(() => serializeSessionSnapshot(session.state, session))
    const response = session.getState()
    expect(cardBonus(response)).toBe(0)
    expect(response.scores?.[0]?.categories.find(category => category.key === 'grains'))
      .toMatchObject({ quantity: 1, total: 1 })
    expect(response.state.players[0]!.resources).toMatchObject({ grain: 1, fuel: 3, food: 20 })
    expect(session.withCtx(() => serializeSessionSnapshot(session.state, session))).toEqual(before)
  })

  it('really pays the selected pair after the final Harvest and scores only the remaining grain', () => {
    const session = createSession()
    const offered = enterPayment(session)
    expect(offered.state.players[0]!.resources).toMatchObject({ grain: 1, fuel: 1, food: 16 })
    expect(optionsOf(offered).map(option => option.value)).toEqual([`${CARD_ID}:pairs:0`, `${CARD_ID}:pairs:1`])
    expect(optionsOf(offered).map(option => option.effectPreview)).toEqual([
      { kind: 'resourceExchange', resourcesPaid: {}, bonusVp: 0 },
      { kind: 'resourceExchange', resourcesPaid: { grain: 1, fuel: 1 }, bonusVp: 1 },
    ])
    for (const count of [2, 2]) assertRejectedUnchanged(session, () => session.resolveChoice(0, `${CARD_ID}:pairs:${count}`))
    assertRejectedUnchanged(session, () => session.resolveChoice(1, `${CARD_ID}:pairs:1`))
    const paid = session.resolveChoice(0, `${CARD_ID}:pairs:1`)
    expect(paid.ok, paid.error).toBe(true)
    expect(paid.state.players[0]!.resources).toMatchObject({ grain: 0, fuel: 0, food: 16 })
    expect(cardBonus(paid)).toBe(1)
    expect(paid.state.events.filter(event => event.type === 'resource.paid' && event.sourceCardId === CARD_ID))
      .toEqual([expect.objectContaining({ actorPlayerId: paid.state.players[0]!.id, resources: { grain: 1, fuel: 1 } })])
    expect(paid.state.log.filter(entry => entry.key === 'log.cardEffectPay' && entry.params?.cardId === CARD_ID))
      .toEqual([expect.objectContaining({ params: expect.objectContaining({ cost: { grain: 1, fuel: 1 }, cardId: CARD_ID }) })])
    const finished = advance(session, paid)
    expect(finished.state.gameOver).toBe(true)
    expect(finished.scores?.[0]?.categories.find(category => category.key === 'grains'))
      .toMatchObject({ quantity: 0, total: -1 })
    expect(cardBonus(finished)).toBe(1)
    assertRejectedUnchanged(session, () => session.resolveChoice(0, `${CARD_ID}:pairs:1`))
    assertRejectedUnchanged(session, () => session.undoStep())
  })

  it('allows zero and preserves the more valuable grain without emitting a payment', () => {
    const session = createSession()
    enterPayment(session)
    const finished = advance(session, session.resolveChoice(0, `${CARD_ID}:pairs:0`))
    expect(finished.state.players[0]!.resources).toMatchObject({ grain: 1, fuel: 1, food: 16 })
    expect(cardBonus(finished)).toBe(0)
    expect(finished.scores?.[0]?.categories.find(category => category.key === 'grains'))
      .toMatchObject({ quantity: 1, total: 1 })
    expect(finished.state.events.some(event => event.type === 'resource.paid' && event.sourceCardId === CARD_ID)).toBe(false)
  })

  it.each([{ grain: 0, fuel: 3 }, { grain: 1, fuel: 2 }, { played: false }])(
    'does not offer scoring without an owned card and both resources: %j', setup => {
      const session = createSession(setup)
      const finished = advance(session, session.performRoundEnd(), response => optionsOf(response)
        .some(option => option.sourceCard === CARD_ID))
      expect(finished.state.gameOver).toBe(true)
      expect(cardBonus(finished)).toBe(0)
      expect(finished.state.events.some(event => event.type === 'resource.paid' && event.sourceCardId === CARD_ID)).toBe(false)
    },
  )

  it.each([5, 14])('rejects the registered scoring entry in the round %i work phase', round => {
    const session = createSession({ round })
    const id = scoringActionId(session)
    expect(session.getState().interaction.anytimeActions.some(action => action.id === id)).toBe(false)
    assertRejectedUnchanged(session, () => session.takeAnytimeAction(0, id))
    assertRejectedUnchanged(session, () => session.takeAnytimeAction(0, id))
  })

  it.each([{ pairs: 0, distill: 0 }, { pairs: 0, distill: 1 }, { pairs: 1, distill: 0 }])(
    'settles E132 before M108 without merging the two choices: %j', ({ pairs, distill }) => {
      let session = createSession({ veggieLover: true })
      const id = scoringActionId(session)
      let response = session.performRoundEnd()
      expect(response.state.gameOver).toBe(false)
      expect(response.interaction.anytimeActions.some(action => action.id === id)).toBe(false)
      assertRejectedUnchanged(session, () => session.takeAnytimeAction(0, id))
      response = advance(session, response, current => optionsOf(current)
        .some(option => option.value === 'E132_VeggieLover:pairs:1'))
      expect(response.state.gameOver).toBe(false)
      expect(response.state.players[0]!.resources).toMatchObject({ grain: 1, vegetable: 1, fuel: 1, food: 16 })
      expect(response.interaction.anytimeActions.some(action => action.id === id)).toBe(false)
      assertRejectedUnchanged(session, () => session.takeAnytimeAction(0, id))
      session = restore(session)
      response = session.resolveChoice(0, `E132_VeggieLover:pairs:${pairs}`)
      if (pairs === 0) {
        const entry = optionsOf(response).find(option => option.sourceCard === CARD_ID)
        expect(entry).toBeDefined()
        expect(session.resolveChoice(0, entry!.value).ok).toBe(true)
        session = restore(session)
        response = session.resolveChoice(0, `${CARD_ID}:pairs:${distill}`)
      }
      const finished = advance(session, response)
      expect(finished.state.gameOver).toBe(true)
      expect(finished.state.players[0]!.resources).toMatchObject({ grain: 1 - pairs - distill, vegetable: 1 - pairs, fuel: 1 - distill, food: 16 })
      expect(cardBonus(finished, 'E132_VeggieLover')).toBe(pairs * 2)
      expect(cardBonus(finished)).toBe(distill)
      const payments = finished.state.events.filter(event => event.type === 'resource.paid'
        && (event.sourceCardId === CARD_ID || event.sourceCardId === 'E132_VeggieLover'))
      expect(payments).toEqual(pairs + distill === 0 ? [] : [expect.objectContaining({ sourceCardId: pairs === 1 ? 'E132_VeggieLover' : CARD_ID })])
  })

  it('can pay multiple pairs at once and leaves only unspent fuel for another scoring card', () => {
    const session = createSession({ grain: 2, fuel: 6, kiln: true })
    const offered = enterPayment(session)
    expect(optionsOf(offered).map(option => option.value)).toEqual([
      `${CARD_ID}:pairs:0`, `${CARD_ID}:pairs:1`, `${CARD_ID}:pairs:2`,
    ])
    const finished = advance(session, session.resolveChoice(0, `${CARD_ID}:pairs:2`))
    expect(finished.state.players[0]!.resources).toMatchObject({ grain: 0, fuel: 2, food: 16 })
    expect(cardBonus(finished)).toBe(2)
    expect(cardBonus(finished, 'Major_Moor_PeatCharcoalKiln')).toBe(0)
  })

  it('restores quantity choices and undo, then can spend another remaining pair without repeating payment', () => {
    let session = createSession({ grain: 2, fuel: 4 })
    enterPayment(session)
    session = restore(session)
    let response = session.resolveChoice(0, `${CARD_ID}:pairs:1`)
    expect(response.state.gameOver).toBe(false)
    expect(response.state.players[0]!.resources).toMatchObject({ grain: 1, fuel: 1, food: 16 })
    expect(cardBonus(response)).toBe(1)
    response = session.undoStep()
    expect(response.ok, response.error).toBe(true)
    expect(response.state.players[0]!.resources).toMatchObject({ grain: 2, fuel: 2, food: 16 })
    expect(cardBonus(response)).toBe(0)
    expect(optionsOf(response).map(option => option.value)).toContain(`${CARD_ID}:pairs:1`)
    expect(session.resolveChoice(0, `${CARD_ID}:pairs:1`).ok).toBe(true)
    session = restore(session)
    const entry = optionsOf(session.getState()).find(option => option.sourceCard === CARD_ID)
    expect(entry).toBeDefined()
    expect(session.resolveChoice(0, entry!.value).ok).toBe(true)
    response = session.resolveChoice(0, `${CARD_ID}:pairs:1`)
    response = advance(session, response)
    expect(response.state.gameOver).toBe(true)
    expect(response.state.players[0]!.resources).toMatchObject({ grain: 0, fuel: 0, food: 16 })
    expect(cardBonus(response)).toBe(2)
    expect(response.state.players[0]!.cardStates[CARD_ID]?.extraData?.scoringReserveBonus).toBeUndefined()
  })
})
