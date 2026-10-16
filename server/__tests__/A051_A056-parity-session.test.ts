import { describe, expect, it } from 'vitest'
import { GameSession, type SessionResponse } from '../game/authoritative-session'
import { setWorkersAtHome } from '../../shared/domain/player'
import { stabilizeRandomHands } from './_helpers/stabilize-random-hands'
import { resolveTriggerIfPresent } from './_helpers/trigger-select'
import '../../shared/cards/A/A051_DriftNetBoat'
import '../../shared/cards/A/A056_Basket'
import assert from 'node:assert/strict'
import { type PlayerState, type GameState } from '../../shared/contract/types'
import { createWorkSession } from './_helpers/session-fixtures'
import { assertEmptyAccumulationRejected, assertRejectedUnchanged, assertUndoRestored, confirmNext, undoRuleSnapshot, getChoiceOptions } from './_helpers/session-assertions'
import { createScenarioEvidence } from './_helpers/scenario-evidence'
const sessionEvidence = createScenarioEvidence(import.meta.url)
const FILLER = '__test_placeholder__'
const setup = ({ cardId, played = true, resources = {}, forestWood = 3, fishingFood = 3 }: {
  cardId: string
  played?: boolean
  resources?: Record<string, number>
  forestWood?: number
  fishingFood?: number
}) => {
  const session = sessionEvidence.track(createWorkSession({ seed: 7051, options: { playerCount: 2 } }))
  stabilizeRandomHands(session.state.players)
  const state = session.getState().state
  state.currentPlayerIndex = 0
  state.round = 5
  state.roundPhase = 'work'
  state.availableMajorImprovements = []
  state.actionSpaces.forEach((space) => { space.takenBy = [] })
  state.players.forEach((player) => {
    setWorkersAtHome(state, player, 2)
    player.minorHand = [FILLER]
    player.occupationHand = [FILLER]
    player.minorPlayed = []
    player.occupationPlayed = []
    player.resources = {
      ...player.resources, wood: 0, clay: 0, reed: 0, stone: 0, food: 0, grain: 0,
      vegetable: 0, sheep: 0, boar: 0, cattle: 0, begging: 0,
    }
  })
  const owner = state.players[0]!
  owner.minorHand = played ? [FILLER] : [cardId]
  owner.minorPlayed = played ? [cardId] : []
  Object.assign(owner.resources, resources)
  state.actionSpaces.find((space) => space.id === 'forest')!.resources.wood = forestWood
  state.actionSpaces.find((space) => space.id === 'fishing')!.resources.food = fishingFood
  session.loadState(state)
  return session
}
const options = (response: SessionResponse) => response.interaction.stateId === 'wait'
  ? getChoiceOptions(response) ?? []
  : []
const playMinor = (session: GameSession, cardId: string) => {
  let response = session.takeAction(0, 'meeting-place')
  for (let guard = 0; guard < 6 && response.state.players[0]!.minorHand.includes(cardId); guard += 1) {
    if (response.interaction.stateId !== 'wait') break
    const card = options(response).find((option) => option.value === cardId)
    const branch = options(response).find((option) => option.value.startsWith('action-improvement-'))
    const next = card ?? branch
    if (!next) break
    response = session.resolveChoice(response.interaction.playerIndex, next.value)
  }
  return response
}
describe('A051 Drift-Net Boat parity', () => {
  const CARD_ID = 'A051_DriftNetBoat'

  it('A051 S1: paying one wood and one reed plays Drift-Net Boat', () => {
    const response = playMinor(setup({ cardId: CARD_ID, played: false, resources: { wood: 1, reed: 1 } }), CARD_ID)
    expect(response.state.players[0]!.minorPlayed).toContain(CARD_ID)
    expect(response.state.players[0]!.resources).toMatchObject({ wood: 0, reed: 0 })
  })

  it('A051 S2: Fishing gains its accumulated food plus two additional food', () => {
    const response = setup({ cardId: CARD_ID }).takeAction(0, 'fishing')
    expect(response.ok, response.error).toBe(true)
    expect(response.state.players[0]!.resources.food).toBe(5)
  })

  it('A051 S3: a non-Fishing accumulation space grants no Drift-Net Boat food', () => {
    const response = setup({ cardId: CARD_ID }).takeAction(0, 'forest')
    expect(response.state.players[0]!.resources.food).toBe(0)
  })
})
describe('A056 Basket parity', () => {
  const CARD_ID = 'A056_Basket'

  it('A056 S1: paying one reed plays Basket', () => {
    const response = playMinor(setup({ cardId: CARD_ID, played: false, resources: { reed: 1 } }), CARD_ID)
    expect(response.state.players[0]!.minorPlayed).toContain(CARD_ID)
    expect(response.state.players[0]!.resources.reed).toBe(0)
  })

  const useBasket = (session: GameSession) => {
    const response = resolveTriggerIfPresent(session, session.takeAction(0, 'forest'), CARD_ID)
    expect(response.interaction.stateId).toBe('wait')
    if (response.interaction.stateId !== 'wait') return response
    const accept = options(response).find((option) => option.value !== '__skip__')
    expect(accept, JSON.stringify(response.interaction)).toBeDefined()
    return session.resolveChoice(response.interaction.playerIndex, accept!.value)
  }

  it('A056 S2: after taking wood, Basket returns two wood to that space and gains three food', () => {
    const response = useBasket(setup({ cardId: CARD_ID }))
    expect(response.state.players[0]!.resources).toMatchObject({ wood: 1, food: 3 })
    expect(response.state.actionSpaces.find((space) => space.id === 'forest')!.resources.wood).toBe(2)
  })

  it('A056 S3: the Basket exchange may be declined', () => {
    const session = setup({ cardId: CARD_ID })
    let response = resolveTriggerIfPresent(session, session.takeAction(0, 'forest'), CARD_ID)
    assert.ok(response.interaction.stateId === 'wait')
    response = session.resolveChoice(response.interaction.playerIndex, '__skip__')
    expect(response.state.players[0]!.resources).toMatchObject({ wood: 3, food: 0 })
    expect(response.state.actionSpaces.find((space) => space.id === 'forest')!.resources.wood).toBe(0)
  })

  it('A056 S4: taking one wood may combine it with one existing wood for Basket', () => {
    const response = useBasket(setup({ cardId: CARD_ID, resources: { wood: 1 }, forestWood: 1 }))
    expect(response.state.players[0]!.resources).toMatchObject({ wood: 0, food: 3 })
    expect(response.state.actionSpaces.find((space) => space.id === 'forest')!.resources.wood).toBe(2)
  })

  it('A056 S5: a non-wood accumulation space does not offer Basket', () => {
    const session = setup({ cardId: CARD_ID, resources: { wood: 2 }, forestWood: 0 })
    const state = session.getState().state
    state.actionSpaces.find((space) => space.id === 'clay-pit')!.resources.clay = 3
    session.loadState(state)
    const response = session.takeAction(0, 'clay-pit')
    expect(JSON.stringify(response.interaction)).not.toContain(CARD_ID)
    expect(response.state.players[0]!.resources).toMatchObject({ wood: 2, food: 0 })
  })
})
describe("A056 command boundaries", () => {
  const WAGE = 'B007_Wage'
  const BASKET = 'A056_Basket'
  const CULTIVATOR = 'A091_ShiftingCultivator', MUSHROOM = 'A108_MushroomCollector'
  function setup({ played = true, round = 14, occupations = [], hand = [], extra = [], resources = {}, opponent = {}, opponentHand = [], stock = 3, noCard = false }: {
    played?: boolean
    round?: number
    occupations?: string[]
    hand?: string[]
    extra?: string[]
    resources?: Partial<PlayerState['resources']>
    opponent?: Partial<PlayerState['resources']>
    opponentHand?: string[]
    stock?: number
    noCard?: boolean
  } = {}) {
    const s = sessionEvidence.track(createWorkSession({ seed: 854, configure: state => {
        state.round = round
        state.availableMajorImprovements = []
        state.players.forEach(p => {
          p.minorHand = ['__test_placeholder__']
          p.occupationHand = ['__test_placeholder__']
          p.minorPlayed = []
          p.occupationPlayed = []
          p.improvements = []
          p.cardStates = {}
          Object.assign(p.resources, { wood: 0, clay: 0, reed: 0, stone: 0, food: 40, grain: 0, vegetable: 0, sheep: 0, boar: 0, cattle: 0, begging: 0 })
        })
        const p = state.players[0]!
        p.minorHand = [...(!played && !noCard ? ["A056_Basket", WAGE, 'A016_RammedClay'] : []), ...hand, '__test_placeholder__']
        p.minorPlayed = [...(played && !noCard ? ["A056_Basket"] : []), ...extra]
        p.occupationPlayed = occupations
        Object.assign(p.resources, resources)
        Object.assign(state.players[1]!.resources, opponent)
        state.players[1]!.minorHand = [...opponentHand, '__test_placeholder__']
        state.actionSpaces.find(a => a.id === 'forest')!.resources.wood = stock
      } }))
    return s
  }
  function ok(r: SessionResponse) { assert.equal(r.ok, true, r.error); return r; }
  function opts(r: SessionResponse) { return r.interaction.stateId === 'wait' && (r.interaction.request.kind === 'choice' || r.interaction.request.kind === 'select-trigger') ? getChoiceOptions(r) : []; }
  function choose(s: GameSession, r: SessionResponse, predicate: (o: {
    value: string
    labelKey?: string
    sourceCard?: string
  }) => boolean) { assert.ok(r.interaction.stateId === 'wait', JSON.stringify(r.interaction)); const matches = opts(r).filter(predicate); assert.equal(matches.length, 1, JSON.stringify(r.interaction)); const o = matches[0]; assert.ok(o, JSON.stringify(r.interaction)); return ok(s.resolveChoice(r.interaction.playerIndex, o.value)); }
  function ready(s: GameSession, actor: number) {
    let r = s.getState()
    if (r.interaction.stateId === 'wait' && r.interaction.request.kind === 'confirm-next-player')
      r = confirmNext(s, r)
    assert.equal(r.interaction.stateId, 'idle', JSON.stringify(r.interaction))
    assert.equal(r.state.currentPlayerIndex, actor)
    return r
  }
  function turn(s: GameSession, actor: number, space: string) { ready(s, actor); return ok(s.takeAction(actor, space)); }
  function minorMenu(s: GameSession, card: string) {
    let r = turn(s, 0, 'meeting-place')
    sessionEvidence.record("purchase menu", r)
    if (!opts(r).some(o => o.value === card) && opts(r).some(o => o.value.startsWith('action-improvement-')))
      r = choose(s, r, o => o.value.startsWith('action-improvement-'))
    return r
  }
  function buy(s: GameSession, card: string) { const r = minorMenu(s, card); return r.state.players[0]!.minorPlayed.includes(card) ? r : choose(s, r, o => o.value === card); }
  function deny(s: GameSession, card: string) { const r = minorMenu(s, card); assert.ok(opts(r).some(o => o.value === WAGE && !('disabled' in o && o.disabled)), JSON.stringify(r.interaction)); assert.equal(opts(r).some(o => o.value === card && !('disabled' in o && o.disabled)), false); assertRejectedUnchanged(s, () => s.resolveChoice(0, card)); assert.equal(s.getState().state.players[0]!.minorPlayed.includes(card), false); const food = r.state.players[0]!.resources.food; const retry = ok(s.resolveChoice(0, WAGE)); resource(retry, 'food', food + 2); assert.equal(retry.state.players[0]!.minorPlayed.includes(card), false); }
  function gainCount(r: SessionResponse, card: string) { return r.state.log.filter(e => e.key === 'log.cardEffectGain' && e.params?.cardId === card).length; }
  function resource(r: SessionResponse, key: 'food' | 'wood' | 'begging', value: number, actor = 0) { assert.equal(r.state.players[actor]!.resources[key], value); }
  function forest(r: SessionResponse) { return r.state.actionSpaces.find(a => a.id === 'forest')!; }
  function basket(config: Parameters<typeof setup>[0] = {}) { return setup({ resources: { food: 0 }, ...config }); }
  function accept(s: GameSession, r: SessionResponse) {
    const accepted = opts(r).filter(o => o.value !== '__skip__' && o.value !== '__pass__' && !('disabled' in o && o.disabled))
    assert.equal(accepted.length, 1, JSON.stringify(r.interaction))
    const option = accepted[0]
    assert.ok(option)
    return ok(s.resolveChoice(r.interaction.stateId === 'wait' ? r.interaction.playerIndex : 0, option.value))
  }
  function source(s: GameSession, r: SessionResponse, card: string) {
    if (r.interaction.stateId === 'wait' && r.interaction.request.kind === 'select-trigger')
      r = ok(s.resolveChoice(0, card))
    if (r.interaction.stateId === 'wait' && r.interaction.sourceCard === card && r.interaction.request.kind === 'choice')
      r = accept(s, r)
    return r
  }
  function basketFacts(r: SessionResponse, wood: number, food: number, stock: number) { resource(r, 'wood', wood); resource(r, 'food', food); assert.equal(forest(r).resources.wood, stock); }
  it("reed shortage rejects forged Basket before exact reed purchase", () => {
    deny(basket({ played: false }), BASKET)
    const r = buy(basket({ played: false, resources: { reed: 1, food: 0 } }), BASKET)
    assert.equal(r.state.players[0]!.resources.reed, 0)
    assert.ok(r.state.players[0]!.minorPlayed.includes(BASKET))
  })
  it("Forest three returns exactly two wood to the original space once", () => {
    const s = basket()
    const offer = turn(s, 0, 'forest')
    const old = opts(offer).find(o => o.value !== '__skip__')
    assert.ok(old)
    const r = accept(s, offer)
    basketFacts(r, 1, 3, 2)
    assert.equal(forest(r).takenBy.length, 1)
    assertRejectedUnchanged(s, () => s.resolveChoice(0, old.value))
  })
  it("collected one wood may combine old wood but total one cannot exchange", () => {
    const control = basket({ stock: 1, resources: { wood: 1, food: 0 } })
    basketFacts(accept(control, turn(control, 0, 'forest')), 0, 3, 2)
    const s = basket({ stock: 1 })
    const r = turn(s, 0, 'forest')
    assert.ok(r.interaction.stateId === 'wait' && r.interaction.request.kind === 'confirm-next-player')
    basketFacts(r, 1, 0, 0)
    assertRejectedUnchanged(s, () => s.resolveChoice(0, '0'))
  })
  it("empty wood accumulation rejects without spending two existing wood", () => {
    const s = basket({ stock: 0, resources: { wood: 2, food: 0 } })
    const r = assertEmptyAccumulationRejected(s, 0, 'forest')
    basketFacts(r, 2, 0, 0)
    assert.equal(forest(r).takenBy.length, 0)
  })
  it("decline and actual undo restore wood before replaying a decline", () => {
    const decline = basket()
    turn(decline, 0, 'forest')
    basketFacts(ok(decline.resolveChoice(0, '__skip__')), 3, 0, 0)
    const s = basket()
    const before = undoRuleSnapshot(s.getState())
    accept(s, turn(s, 0, 'forest'))
    assertUndoRestored(before, s.undoAction())
    turn(s, 0, 'forest')
    basketFacts(ok(s.resolveChoice(0, '__skip__')), 3, 0, 0)
  })
  it("nonwood accumulation and real opponent Forest do not trigger holder Basket", () => {
    const non = turn(basket({ resources: { wood: 2, food: 0 } }), 0, 'clay-pit')
    resource(non, 'wood', 2)
    resource(non, 'food', 0)
    const s = basket({ resources: { wood: 2, food: 0 }, opponent: { food: 0 } })
    turn(s, 0, 'grain-seeds')
    const r = turn(s, 1, 'forest')
    resource(r, 'wood', 2)
    resource(r, 'food', 0)
    resource(r, 'wood', 3, 1)
    resource(r, 'food', 0, 1)
    assert.equal(forest(r).resources.wood, 0)
  })
  it("later Basket food cannot fund earlier Shifting Cultivator before collection", () => {
    for (const food of [0, 3]) {
      const s = basket({ occupations: [CULTIVATOR], resources: { food } })
      let r = turn(s, 0, 'forest')
      if (food === 3) {
        r = accept(s, r)
        assert.ok(r.interaction.stateId === 'wait' && r.interaction.request.kind === 'farm-select')
        r = ok(s.commitSelectionChoice(0, { tile: { row: 0, col: 0 } }))
      }
      r = accept(s, r)
      basketFacts(r, 1, 3, 2)
      assert.equal(r.state.players[0]!.fields.length, food === 3 ? 1 : 0)
      assertRejectedUnchanged(s, () => s.resolveChoice(0, CULTIVATOR))
    }
  })
  it("two immediately-after sources consume once and undo restores original wood", () => {
    for (const first of [BASKET, MUSHROOM]) {
      const s = basket({ occupations: [MUSHROOM] })
      const before = undoRuleSnapshot(s.getState())
      let r = turn(s, 0, 'forest')
      assert.ok(r.interaction.stateId === 'wait' && r.interaction.request.kind === 'select-trigger')
      r = source(s, r, first)
      assertRejectedUnchanged(s, () => s.resolveChoice(0, first))
      r = source(s, r, first === BASKET ? MUSHROOM : BASKET)
      basketFacts(r, 0, 5, 3)
      assert.equal(gainCount(r, BASKET), 1)
      assert.equal(gainCount(r, MUSHROOM), 1)
      assertUndoRestored(before, s.undoAction())
      basketFacts(s.getState(), 0, 0, 3)
    }
  })
})
describe("A051 command boundaries", () => {
  const BOAT = 'A051_DriftNetBoat'
  function setup({ played = true, round = 5, resources = {}, forest = 3, fishing = 2, pigs = 1, configure = () => { } }: {
    played?: boolean
    round?: number
    resources?: Partial<PlayerState['resources']>
    forest?: number
    fishing?: number
    pigs?: number
    configure?: (state: GameState) => void
  } = {}) {
    const s = sessionEvidence.track(createWorkSession({ seed: 4242, configure(state) {
        state.round = round
        state.players.forEach(p => {
          p.minorHand = ['B007_Wage', 'A054_Credit']
          p.occupationHand = ['__test_placeholder__']
          p.minorPlayed = []
          p.occupationPlayed = []
          Object.assign(p.resources, { wood: 0, clay: 0, reed: 0, stone: 0, food: 20, grain: 0, vegetable: 0, sheep: 0, boar: 0, cattle: 0 })
        })
        const p = state.players[0]!
        if (played)
          p.minorPlayed = ["A051_DriftNetBoat"]
        else
          p.minorHand.push("A051_DriftNetBoat")
        Object.assign(p.resources, resources)
        stock(state, 'forest', 'wood', forest)
        stock(state, 'fishing', 'food', fishing)
        stock(state, 'pig-market', 'boar', pigs)
        configure(state)
      } }))
    assert.equal(s.getState().state.roundPhase, 'work')
    assert.equal(s.getState().interaction.stateId, 'idle')
    return s
  }
  function stock(state: GameState, space: string, resource: 'wood' | 'food' | 'boar' | 'clay', count: number) {
    const action = state.actionSpaces.find(a => a.id === space)
    assert.ok(action)
    action.resources[resource] = count
  }
  function ok(r: SessionResponse) { assert.equal(r.ok, true, r.error); return r; }
  function ready(s: GameSession, actor: number) {
    let r = s.getState()
    if (r.interaction.stateId === 'wait' && r.interaction.request.kind === 'confirm-next-player')
      r = confirmNext(s, r)
    assert.equal(r.interaction.stateId, 'idle', JSON.stringify(r.interaction))
    assert.equal(r.state.currentPlayerIndex, actor)
    return r
  }
  function turn(s: GameSession, actor: number, space: string) { ready(s, actor); const r = ok(s.takeAction(actor, space)); assert.equal(r.state.actionSpaces.find(a => a.id === space)!.takenBy.some(w => w.playerId === r.state.players[actor]!.id), true); return r; }
  function choices(r: SessionResponse) { ok(r); assert.ok(r.interaction.stateId === 'wait' && r.interaction.request.kind === 'choice', JSON.stringify(r.interaction)); return getChoiceOptions(r); }
  function enter(s: GameSession) {
    let r = turn(s, 0, 'meeting-place')
    const branch = choices(r).find(o => o.value.startsWith('action-improvement-'))
    if (branch)
      r = ok(s.resolveChoice(0, branch.value))
    return r
  }
  function offered(r: SessionResponse, card: string) { return choices(r).some(o => o.value === card && !o.disabled); }
  function buy(s: GameSession, r: SessionResponse, card: string) {
    assert.equal(offered(r, card), true)
    const result = ok(s.resolveChoice(0, card))
    assert.equal(result.state.players[0]!.minorPlayed.includes(card), true)
    assert.equal(result.state.players[0]!.minorHand.includes(card), false)
    const events = result.state.events.filter(e => e.type === 'card.played' && e.cardId === card)
    assert.equal(events.length, 1)
    const event = events[0]!
    assert.ok(event.type === 'card.played')
    assert.equal(event.actorPlayerId, result.state.players[0]!.id)
    assert.deepEqual(event.payment?.resources ?? {}, card === BOAT ? { wood: 1, reed: 1 } : {})
    return result
  }
  function values(r: SessionResponse, actor = 0) { return r.state.players[actor]!.resources; }
  function bonus(r: SessionResponse, card: string, amount: number) {
    const events = r.state.events.filter(e => e.type === 'resource.moved' && e.sourceCardId === card && e.reason === 'cardEffect')
    assert.equal(events.length, amount === 0 ? 0 : 1)
    if (amount) {
      const e = events[0]!
      assert.ok(e.type === 'resource.moved')
      assert.deepEqual(e.resources, { food: amount })
      assert.deepEqual(e.to, { kind: 'player', playerId: r.state.players[0]!.id })
    }
  }
  function retryFree(s: GameSession, card: string) { const r = enter(s); assert.equal(offered(r, card), false); assertRejectedUnchanged(s, () => s.resolveChoice(0, card)); return buy(s, r, 'A054_Credit'); }
  it("actual purchase pays one wood and one reed and earns one printed point", () => {
    const s = setup({ played: false, resources: { wood: 1, reed: 1 } })
    const r = buy(s, enter(s), BOAT)
    assert.ok(r.scores)
    const score = r.scores[0]!.categories.find(c => c.key === 'cards')?.entries.find(e => e.type === 'card' && e.cardId === BOAT)?.score
    assert.equal(score, 1)
    assert.equal(values(r).wood, 0)
    assert.equal(values(r).reed, 0)
    assert.equal(values(r).food, 20)
    bonus(r, BOAT, 0)
    return { paid: { wood: 1, reed: 1 }, wood: 0, reed: 0, score }
  })
  it("missing reed rejects a forged purchase before a legal free card retry", () => {
    const s = setup({ played: false, resources: { wood: 1 } })
    const r = retryFree(s, BOAT)
    assert.equal(values(r).wood, 1)
    assert.equal(values(r).reed, 0)
    assert.equal(r.state.players[0]!.minorHand.includes(BOAT), true)
    return { wood: 1, reed: 0, cardInHand: true }
  })
  it("missing wood rejects a forged purchase before a legal free card retry", () => {
    const s = setup({ played: false, resources: { reed: 1 } })
    const r = retryFree(s, BOAT)
    assert.equal(values(r).wood, 0)
    assert.equal(values(r).reed, 1)
    assert.equal(r.state.players[0]!.minorHand.includes(BOAT), true)
    return { wood: 0, reed: 1, cardInHand: true }
  })
  it("stocked Fishing gives two accumulated and two supplemental food", () => { const r = turn(setup(), 0, 'fishing'); assert.equal(values(r).food, 24); bonus(r, BOAT, 2); return { food: 24 }; })
  it("ordinary Day Laborer and Credit food gains give no Fishing bonus", () => { const r = turn(setup(), 0, 'day-laborer'); assert.equal(values(r).food, 22); bonus(r, BOAT, 0); const s = setup(); const q = buy(s, enter(s), 'A054_Credit'); assert.equal(values(q).food, 25); bonus(q, BOAT, 0); return { dayFood: 22, creditFood: 25 }; })
  it("Forest gives wood without a Fishing bonus", () => { const r = turn(setup(), 0, 'forest'); assert.equal(values(r).wood, 3); assert.equal(values(r).food, 20); bonus(r, BOAT, 0); return { wood: 3, food: 20 }; })
  it("opponent Fishing cannot grant owner supplemental food", () => { const s = setup(); turn(s, 0, 'grain-seeds'); const r = turn(s, 1, 'fishing'); assert.equal(values(r).food, 20); assert.equal(values(r, 1).food, 22); bonus(r, BOAT, 0); return { ownerFood: 20, opponentFood: 22 }; })
  it("Fishing while the card is in hand gives accumulated food only", () => { const r = turn(setup({ played: false }), 0, 'fishing'); assert.equal(values(r).food, 22); bonus(r, BOAT, 0); return { food: 22 }; })
  it("empty Fishing rejects without supplemental food", () => { const s = setup({ fishing: 0 }); const r = assertEmptyAccumulationRejected(s, 0, 'fishing'); assert.equal(values(r).food, 20); bonus(r, BOAT, 0); return { emptyEntryRejected: true, supplementalFood: 0 }; })
  it("occupied Fishing rejects a repeated request before a legal retry", () => { const s = setup(); turn(s, 0, 'fishing'); turn(s, 1, 'forest'); ready(s, 0); assertRejectedUnchanged(s, () => s.takeAction(0, 'fishing')); const r = turn(s, 0, 'grain-seeds'); assert.equal(values(r).food, 24); assert.equal(values(r).grain, 1); return { food: 24, grain: 1 }; })
  it("undo restores Fishing stock and bonus before one legal retry", () => { const s = setup(); const before = undoRuleSnapshot(s.getState()); turn(s, 0, 'fishing'); assertUndoRestored(before, s.undoAction()); const r = turn(s, 0, 'fishing'); assert.equal(values(r).food, 24); bonus(r, BOAT, 2); return { oaRestored: true, retryFood: 24 }; })
})
