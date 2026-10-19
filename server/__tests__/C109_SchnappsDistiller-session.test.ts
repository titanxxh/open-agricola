import { withActiveRegistry } from '../../shared/cards/active-registry'
import { createOfficialCardRegistry } from '../../shared/cards/__tests__/card-environment'
import { describe, expect, it, afterEach } from 'vitest'
import { C109_SchnappsDistiller } from '../../shared/cards/C/C109_SchnappsDistiller'
import { getExchangesInWindow } from '../../shared/actions/effects/exchange'
import type { PlayerState, Resource } from '../../shared/contract/types'
import { markAllWorkersUsed, setActiveWorkerCount } from '../../shared/domain/player'
import { GameSession } from '../game/authoritative-session'
import { stabilizeRandomHands } from './_helpers/stabilize-random-hands'
import assert from 'node:assert/strict'
import { assertRejectedUnchanged } from './_helpers/negative-rule-audit'
import * as audit47Cards from './_helpers/audit/ae-negative-47-cards'

const enterFeeding = (session: GameSession) => {
  let response = session.performRoundEnd()
  while (response.interaction.stateId === 'wait'
    && session.peekEnginePendingEnvelope()?.syntheticKind === 'post-reap-anytime') {
    response = session.resolveChoice(response.interaction.playerIndex, '__skip__')
    expect(response.ok, response.error).toBe(true)
  }
  return response
}

const CARD_ID = 'C109_SchnappsDistiller'

const makePlayer = (overrides: Partial<PlayerState> = {}): PlayerState => ({
  id: 'p1',
  name: 'P1',
  color: 'red',
  resources: {
    wood: 0, clay: 0, reed: 0, stone: 0, food: 0, grain: 0,
    vegetable: 0, sheep: 0, boar: 0, cattle: 0, begging: 0,
  } as Resource,
  rooms: 2,
  houseType: 'wood',
  fields: [],
  fences: 0,
  roomTiles: [],
  stableTiles: [],
  improvements: [],
  minorHand: [],
  minorPlayed: [],
  occupationHand: [],
  occupationPlayed: [],
  houseAnimals: {},
  stableAnimals: {},
  pastures: [],
  fenceSegments: [],
  majorEffects: { wellRounds: 0 },
  startPlayer: false,
  activeModifiers: [],
  cardStates: {},
  ...overrides,
})

const setupHarvestSession = () => {
  const session = new GameSession(42)
  stabilizeRandomHands(session.state.players)
  const state = session.getState().state
  state.players = state.players.slice(0, 2)
  state.currentPlayerIndex = 0
  state.round = 4
  state.roundPhase = 'work'
  for (const player of state.players) {
    markAllWorkersUsed(state, player)
    setActiveWorkerCount(player, 0)
    player.resources.food = 0
  }
  const distiller = state.players[0]!
  setActiveWorkerCount(distiller, 1)
  distiller.occupationPlayed.push(CARD_ID)
  distiller.resources.vegetable = 2
  session.loadState(state)
  return session
}

describe('C109_SchnappsDistiller — metadata exchange', () => {
  it('rejects an over-limit harvest exchange and accepts a legal retry', () => {
    const session = setupHarvestSession()
    let response = enterFeeding(session)
    expect(response.interaction.stateId).toBe('wait')
    if (response.interaction.stateId !== 'wait') throw new Error('expected harvest feed')
    expect(response.interaction).toMatchObject({
      playerIndex: 0,
      request: {
        kind: 'feed',
        remaining: 2,
        foodUsed: 0,
        maxTradeTimesBySourceId: { [CARD_ID]: 1 },
      },
    })
    expect(response.scores).toHaveLength(2)

    const before = session.getState()
    response = session.resolveChoice(0, 'confirm', {
      selections: [{
        sourceId: CARD_ID,
        exchangeIndex: 0,
        count: 2,
        sourceName: 'forged client label',
      }],
    })

    expect(response.ok).toBe(false)
    expect(response.state).toEqual(before.state)
    expect(response.interaction).toEqual(before.interaction)

    response = session.resolveChoice(0, 'confirm', {
      selections: [{
        sourceId: CARD_ID,
        exchangeIndex: 0,
        count: 1,
        sourceName: 'Schnapps Distiller',
      }],
    })

    expect(response.ok).toBe(true)
    expect(response.state.players[0]!.resources).toMatchObject({
      vegetable: 1,
      food: 3,
      begging: 0,
    })
    expect(response.state.players[0]!.cardStates[CARD_ID]?.extraData?.harvestExchangeUsage)
      .toEqual({ round: 4, count: 1 })
    expect(response.state).toMatchObject({ round: 5, roundPhase: 'work' })
    expect(response.interaction.stateId).toBe('idle')
    expect(response.scores).toHaveLength(2)

    const convertedEvents = response.state.events.filter((event) => event.type === 'harvest.feedConverted')
    const feedingEvents = response.state.events.filter((event) =>
      event.type === 'resource.paid' && event.paymentFor === 'feeding',
    )
    expect(convertedEvents).toEqual([
      expect.objectContaining({
        playerId: response.state.players[0]!.id,
        source: CARD_ID,
        cost: { vegetable: 1 },
        food: { food: 5 },
      }),
    ])
    expect(feedingEvents).toEqual([
      expect.objectContaining({ resources: expect.objectContaining({ food: 2 }) }),
    ])
    expect(convertedEvents[0]!.seq).toBeLessThan(feedingEvents[0]!.seq)
    expect(response.state.log).toEqual(expect.arrayContaining([
      expect.objectContaining({
        key: 'log.harvestFeedConvert',
        params: expect.objectContaining({ cost: { vegetable: 1 }, food: { food: 5 } }),
      }),
      expect.objectContaining({
        key: 'log.harvestFeedDetail',
        params: expect.objectContaining({ resources: expect.objectContaining({ food: 2 }) }),
      }),
    ]))
  })

  it('declines the optional harvest exchange and leaves the vegetable for normal feeding', () => {
    const session = setupHarvestSession()
    let response = enterFeeding(session)
    expect(response.interaction.stateId).toBe('wait')
    if (response.interaction.stateId !== 'wait') throw new Error('expected harvest feed')

    response = session.resolveChoice(0, 'confirm', { selections: [] })

    expect(response.ok).toBe(true)
    expect(response.state.players[0]!.resources).toMatchObject({
      vegetable: 2,
      food: 0,
      begging: 2,
    })
    expect(response.state.players[0]!.cardStates[CARD_ID]?.extraData?.harvestExchangeUsage)
      .toBeUndefined()
    expect(response.state.events.some((event) => event.type === 'harvest.feedConverted')).toBe(false)
    expect(response.state.events).toContainEqual(expect.objectContaining({
      type: 'resource.paid',
      paymentFor: 'feeding',
      resources: expect.objectContaining({ begging: 2 }),
    }))
    expect(response.state.log.some((entry) => entry.key === 'log.harvestFeedConvert')).toBe(false)
    expect(response.state.log).toContainEqual(expect.objectContaining({
      key: 'log.harvestFeedDetail',
      params: expect.objectContaining({ resources: expect.objectContaining({ begging: 2 }) }),
    }))
    expect(response.state).toMatchObject({ round: 5, roundPhase: 'work' })
    expect(response.interaction.stateId).toBe('idle')
    expect(response.scores).toHaveLength(2)
  })

  it('does not offer or execute the exchange during a work-phase action', () => {
    const session = new GameSession(42)
    stabilizeRandomHands(session.state.players)
    const state = session.getState().state
    state.players = state.players.slice(0, 2)
    state.currentPlayerIndex = 0
    state.round = 2
    state.roundPhase = 'work'
    state.players[0]!.occupationPlayed.push(CARD_ID)
    state.players[0]!.resources.vegetable = 1
    state.players[0]!.resources.food = 0
    session.loadState(state)

    const response = session.takeAction(0, 'farmland')

    expect(response.ok).toBe(true)
    expect(response.state.players[0]!.resources).toMatchObject({ vegetable: 1, food: 0 })
    expect(response.state.players[0]!.cardStates[CARD_ID]?.extraData?.harvestExchangeUsage)
      .toBeUndefined()
    expect(response.state.events.some((event) => event.type === 'harvest.feedConverted')).toBe(false)
    expect(response.state.log.some((entry) => entry.key === 'log.harvestFeedConvert')).toBe(false)
    expect(response.interaction.anytimeActions.some((action) => action.sourceCard === CARD_ID)).toBe(false)
    expect(response.scores).toHaveLength(2)
  })

  it('declares a single harvest exchange (1 vegetable -> 5 food, max:1)', () => {
    const exchanges = C109_SchnappsDistiller.exchanges ?? []
    expect(exchanges).toHaveLength(1)
    const ex = exchanges[0]!
    expect(ex.from.vegetable).toBe(1)
    expect(ex.to.food).toBe(5)
    expect(ex.max).toBe(1)
    expect(ex.sourceId).toBe(CARD_ID)
    expect(ex.triggers).toEqual(['harvest'])
  })

  it('appears in harvest window for player who played it', () => {
    const ruleRegistry = createOfficialCardRegistry()
    const player = makePlayer({ occupationPlayed: [CARD_ID] })
    const trades = withActiveRegistry(ruleRegistry, () => getExchangesInWindow(player, 'harvest'))
    expect(trades).toHaveLength(1)
    expect(trades[0]!.from.vegetable).toBe(1)
    expect(trades[0]!.to.food).toBe(5)
    expect(trades[0]!.sourceId).toBe(CARD_ID)
  })

  it('not visible in anytime window (harvest-only)', () => {
    const ruleRegistry = createOfficialCardRegistry()
    const player = makePlayer({ occupationPlayed: [CARD_ID] })
    const trades = withActiveRegistry(ruleRegistry, () => getExchangesInWindow(player, 'anytime'))
    expect(trades).toHaveLength(0)
  })
})

describe('ae-negative-47-cards', () => {
  const { sessions, save, ok, make, finish, feedMenu, harvestTrade, workTrade } = audit47Cards
  afterEach(() => sessions.splice(0).forEach(s => s.dispose()))
  it('C109 N1 harvest exchanges exactly one vegetable for five food and rejects two before legal retry', () => { const s = make('C109_SchnappsDistiller', st => { st.players[0]!.resources.vegetable = 2 }, true, 4), p = feedMenu(s), rejected = assertRejectedUnchanged(s, () => harvestTrade(s, 'C109_SchnappsDistiller', 2)), r = finish(s, harvestTrade(s, 'C109_SchnappsDistiller', 1), false); assert.equal(r.state.players[0]!.resources.vegetable, 1); assert.equal(r.state.players[0]!.resources.food, 101); assert.ok(r.state.events.some(e => e.type === 'harvest.feedConverted' && e.source === 'C109_SchnappsDistiller'));  save('C109-N1', { p, rejected, r }) })
  it('C109 N2 declining harvest conversion and work phase action keep vegetables while zero supply cannot convert', () => { const s = make('C109_SchnappsDistiller', st => { st.players[0]!.resources.vegetable = 2 }, true, 4), p = feedMenu(s), r = finish(s, ok(s.resolveChoice(0, 'confirm', { selections: [] })), false); assert.equal(r.state.players[0]!.resources.vegetable, 2); assert.equal(r.state.players[0]!.resources.food, 96); const w = make('C109_SchnappsDistiller', st => { st.players[0]!.resources.vegetable = 2 }), wr = finish(w, ok(w.takeAction(0, 'grain-seeds')), false); assert.equal(wr.state.players[0]!.resources.vegetable, 2); assert.equal(wr.state.players[0]!.resources.food, 100); const c = make('C109_SchnappsDistiller', st => { st.players[0]!.resources.food = 0 }, true, 4), cp = feedMenu(c), rejected = assertRejectedUnchanged(c, () => harvestTrade(c, 'C109_SchnappsDistiller', 1)), cr = finish(c, ok(c.resolveChoice(0, 'confirm', { selections: [] })), false); assert.equal(cr.state.players[0]!.resources.food, 0); save('C109-N2', { p, r, wr, cp, rejected, cr }) })
  it('C109 N3 actual work exchange permits Fireplace two-food vegetable conversion and excludes five-food distillation', () => { const s = make('C109_SchnappsDistiller', st => { st.players[0]!.resources.vegetable = 1; st.players[0]!.improvements = ['Major_Fireplace1'] }), a = workTrade(s, 'C109_SchnappsDistiller', 'vegetable'); save('C109-N3', a) })
})
