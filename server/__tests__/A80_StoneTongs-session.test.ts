import { describe, expect, it } from 'vitest'
import { type GameSession, type SessionResponse } from '../game/authoritative-session'
import { stabilizeRandomHands } from './_helpers/stabilize-random-hands'
import { setWorkersAtHome, workersAtHome } from '../../shared/domain/player'
import '../../shared/cards/A/A080_StoneTongs'
import assert from 'node:assert/strict'
import { type PlayerState } from '../../shared/contract/types'
import { createWorkSession } from './_helpers/session-fixtures'
import { assertRejectedUnchanged, assertUndoRestored, confirmNext, undoRuleSnapshot, getChoiceOptions } from './_helpers/session-assertions'
import { buildLogPresentationPlan } from '../../shared/events/log-mapper'
import { getAvailableStableSupplyCount, getOwnOrdinaryFenceReserveCount } from '../../shared/domain/supply-tokens'
import { createScenarioEvidence } from './_helpers/scenario-evidence'

const sessionEvidence = createScenarioEvidence(import.meta.url)

describe('A080_StoneTongs session', () => {
  const setup = () => {
    const session = sessionEvidence.track(createWorkSession({ seed: 42 }))
    stabilizeRandomHands(session.state.players)
    const state = session.getState().state
    state.players = state.players.slice(0, 2)
    state.currentPlayerIndex = 0
    state.round = 1

    const player = state.players[0]!
    player.minorHand.push('A080_StoneTongs')
    setWorkersAtHome(state, player, 2)
    player.resources.stone = 0

    setWorkersAtHome(state, state.players[1]!, 2)

    // Ensure stone spaces have accumulated resources
    const easternQuarry = state.actionSpaces.find((s) => s.id === 'eastern-quarry')
    if (easternQuarry) easternQuarry.resources.stone = 2
    const westernQuarry = state.actionSpaces.find((s) => s.id === 'western-quarry')
    if (westernQuarry) westernQuarry.resources.stone = 3

    session.loadState(state)
    session.devPlayCard(0, 'A080_StoneTongs')
    return session
  }

  it('gains 1 extra stone when using eastern-quarry', () => {
    const session = setup()

    const resp = session.takeAction(0, 'eastern-quarry')
    expect(resp.ok).toBe(true)

    const after = session.getState().state
    // 2 accumulated stone + 1 bonus from StoneTongs = 3
    expect(after.players[0]!.resources.stone).toBe(2 + 1)
  })

  it('gains 1 extra stone when using western-quarry', () => {
    const session = setup()

    const resp = session.takeAction(0, 'western-quarry')
    expect(resp.ok).toBe(true)

    const after = session.getState().state
    // 3 accumulated stone + 1 bonus from StoneTongs = 4
    expect(after.players[0]!.resources.stone).toBe(3 + 1)
  })

  it('does not trigger on non-stone spaces', () => {
    const session = setup()

    const resp = session.takeAction(0, 'day-laborer')
    expect(resp.ok).toBe(true)

    const after = session.getState().state
    // No bonus stone
    expect(after.players[0]!.resources.stone).toBe(0)
  })

  it('does not trigger for opponent using stone space', () => {
    const session = setup()
    const state = session.getState().state
    state.currentPlayerIndex = 1
    session.loadState(state)

    const resp = session.takeAction(1, 'eastern-quarry')
    expect(resp.ok).toBe(true)

    const after = session.getState().state
    // Owner (player 0) should not gain any stone — scope is 'player' only
    expect(after.players[0]!.resources.stone).toBe(0)
    // Opponent gains the 2 accumulated stone but no bonus
    expect(after.players[1]!.resources.stone).toBe(2)
  })
})

describe("A080 command boundaries", () => {
  const TONGS = 'A080_StoneTongs', EXCURSION = 'B006_ExcursiontotheQuarry', WAGE = 'B007_Wage'
  function setup({ played = true, resources = {}, occupations = [], hand = [], quarry = 1 }: {
    played?: boolean
    resources?: Partial<PlayerState['resources']>
    occupations?: string[]
    hand?: string[]
    quarry?: number
  } = {}) {
    const s = sessionEvidence.track(createWorkSession({ seed: 1077, configure: state => {
        state.round = 14
        state.availableMajorImprovements = []
        for (const p of state.players) {
          p.minorHand = ['__test_placeholder__']
          p.occupationHand = ['__test_placeholder__']
          p.minorPlayed = []
          p.occupationPlayed = []
          p.improvements = []
          p.cardStates = {}
          Object.assign(p.resources, { wood: 0, clay: 0, reed: 0, stone: 0, grain: 0, vegetable: 0, sheep: 0, boar: 0, cattle: 0, food: 40, begging: 0 })
        }
        const owner = state.players[0]!
        owner.minorHand = [...(!played ? [TONGS, WAGE, 'A016_RammedClay'] : []), ...hand, '__test_placeholder__']
        owner.minorPlayed = played ? [TONGS] : []
        owner.occupationPlayed = occupations
        Object.assign(owner.resources, resources)
        state.actionSpaces.find(a => a.id === 'eastern-quarry')!.resources.stone = quarry
        state.actionSpaces.find(a => a.id === 'western-quarry')!.resources.stone = quarry
        state.actionSpaces.find(a => a.id === 'forest')!.resources.wood = 3
      } }))
    for (const p of s.state.players) {
      assert.equal(p.workers.length, 5)
      assert.equal(workersAtHome(s.state, p).length, 2)
      assert.equal(s.withCtx(() => getOwnOrdinaryFenceReserveCount(p)), 15)
      assert.equal(s.withCtx(() => getAvailableStableSupplyCount(s.state, p)), 4)
    }
    return s
  }
  function ok(r: SessionResponse) {
    assert.equal(r.ok, true, r.error)
    return r
  }
  function opts(r: SessionResponse) {
    assert.ok(r.interaction.stateId === 'wait' && r.interaction.request.kind === 'choice', JSON.stringify(r.interaction))
    return getChoiceOptions(r)
  }
  function ready(s: GameSession, actor: number) {
    let r = s.getState()
    if (r.interaction.stateId === 'wait' && r.interaction.request.kind === 'confirm-next-player')
      r = confirmNext(s, r)
    assert.equal(r.interaction.stateId, 'idle', JSON.stringify(r.interaction))
    assert.equal(r.state.currentPlayerIndex, actor)
    return r
  }
  function turn(s: GameSession, actor: number, space: string) {
    const before = ready(s, actor), r = ok(s.takeAction(actor, space))
    sessionEvidence.record('take-action', { command: 'takeAction', actor, space, before, response: r })
    return r
  }
  function choose(s: GameSession, r: SessionResponse, value: string) {
    assert.ok(r.interaction.stateId === 'wait')
    assert.ok(opts(r).some(o => o.value === value && !o.disabled))
    return ok(s.resolveChoice(r.interaction.playerIndex, value))
  }
  function menu(s: GameSession) {
    let r = turn(s, 0, 'meeting-place')
    if (r.interaction.stateId === 'wait' && r.interaction.request.kind === 'choice') {
      const o = getChoiceOptions(r).find(o => o.value.startsWith('action-improvement-'))
      if (o)
        r = choose(s, r, o.value)
    }
    sessionEvidence.record('minor-menu', r)
    return r
  }
  function buy(s: GameSession, card: string) {
    const r = menu(s)
    assert.ok(opts(r).some(o => o.value === card && !o.disabled))
    const bought = choose(s, r, card)
    sessionEvidence.record('actual-purchase', { before: r, card, response: bought })
    return bought
  }
  function deny(s: GameSession, card: string) {
    const r = menu(s)
    assert.equal(opts(r).some(o => o.value === card && !o.disabled), false)
    const denied = assertRejectedUnchanged(s, () => s.resolveChoice(0, card))
    sessionEvidence.record('rejected-native-card', { before: r, card, response: denied })
    const food = r.state.players[0]!.resources.food
    const retry = choose(s, r, WAGE)
    assert.equal(retry.state.players[0]!.resources.food - food, 2)
    assert.equal(retry.state.players[0]!.minorPlayed.includes(card), false)
    sessionEvidence.record('legal-original-pending-retry', retry)
  }
  function gainCount(r: SessionResponse, card: string) {
    return r.state.log.filter(e => e.key === 'log.cardEffectGain' && e.params?.cardId === card).length
  }
  function purchaseUndo(s: GameSession, before: string) {
    const r = ok(s.undoAction())
    const normalize = (v: string) => JSON.parse(v, (key, value: unknown) => key === 'playedCards' ? undefined : value)
    assert.deepEqual(normalize(undoRuleSnapshot(r)), normalize(before))
    const packet = r.state.publicEventArchive.at(-1)
    assert.ok(packet?.type === 'publicEvents.canceled' && packet.reason === 'undoAction')
    sessionEvidence.record('purchase-undo', r)
  }
  function tongs(config: Parameters<typeof setup>[0] = {}) {
    return setup({ ...config })
  }
  it("live wood shortage rejects before fee without immediate stone", () => {
    deny(tongs({ played: false }), TONGS)
    const r = buy(tongs({ played: false, resources: { wood: 1 } }), TONGS)
    assert.equal(r.state.players[0]!.resources.wood, 0)
    assert.equal(r.state.players[0]!.resources.stone, 0)
    assert.equal(gainCount(r, TONGS), 0)
  })
  it("both actual quarries add one stone independent of pile quantity", () => {
    for (const space of ['eastern-quarry', 'western-quarry'])
      for (const [quarry, expectedStone] of [[1, 2], [3, 4]] satisfies Array<[
        number,
        number
      ]>) {
        const r = turn(tongs({ quarry }), 0, space)
        assert.equal(r.state.players[0]!.resources.stone, expectedStone)
        assert.equal(r.state.actionSpaces.find(a => a.id === space)!.resources.stone, 0)
        assert.equal(gainCount(r, TONGS), 1)
      }
  })
  it("real passing Excursion and foreign quarry exclude owner bonus", () => {
    const s = tongs({ hand: [EXCURSION, WAGE, 'A016_RammedClay'], occupations: ['A124_Knapper'] })
    const r = buy(s, EXCURSION)
    assert.equal(r.state.players[0]!.resources.stone, 2)
    assert.equal(r.state.players[0]!.resources.food, 38)
    assert.equal(gainCount(r, TONGS), 0)
    assert.equal(r.state.players[0]!.minorHand.includes(EXCURSION), false)
    assert.equal(r.state.players[0]!.minorPlayed.includes(EXCURSION), false)
    assert.equal(r.state.players[1]!.minorHand.filter(id => id === EXCURSION).length, 1)
    const events = r.state.events.filter(e => 'fromPlayerId' in e && 'toPlayerId' in e && 'cardId' in e && e.cardId === EXCURSION)
    assert.equal(events.length, 1)
    const event = events[0]
    assert.ok(event && 'fromPlayerId' in event && 'toPlayerId' in event)
    assert.equal(event.fromPlayerId, r.state.players[0]!.id)
    assert.equal(event.toPlayerId, r.state.players[1]!.id)
    const rows = buildLogPresentationPlan(r.state.events, { playerNames: {} }).rows.filter(row => row.logEntry.key === 'log.cardPassed' && row.logEntry.params?.cardId === EXCURSION)
    assert.equal(rows.length, 1)
    const row = rows[0]
    assert.ok(row)
    assert.deepEqual(row.sourceEventRef, { id: event.id, seq: event.seq, type: event.type })
    assert.equal(row.logEntry.playerRefs?.fromPlayer, event.fromPlayerId)
    assert.equal(row.logEntry.playerRefs?.toPlayer, event.toPlayerId)
    sessionEvidence.record('actual-B006-pass-public-projection', { event, row, response: r })
    const foreign = tongs()
    turn(foreign, 0, 'forest')
    const q = turn(foreign, 1, 'western-quarry')
    assert.equal(q.state.players[0]!.resources.stone, 0)
    assert.equal(q.state.players[1]!.resources.stone, 1)
    assert.equal(gainCount(q, TONGS), 0)
    const non = turn(tongs(), 0, 'forest')
    assert.equal(non.state.players[0]!.resources.stone, 0)
    assert.equal(non.state.players[0]!.resources.wood, 3)
  })
  it("in hand quarry and occupied repeat never add a bonus", () => {
    const s = tongs({ played: false })
    const first = turn(s, 0, 'western-quarry')
    assert.equal(first.state.players[0]!.resources.stone, 1)
    turn(s, 1, 'forest')
    ready(s, 0)
    assertRejectedUnchanged(s, () => s.takeAction(0, 'western-quarry'))
    const r = turn(s, 0, 'day-laborer')
    assert.equal(r.state.players[0]!.resources.stone, 1)
    assert.equal(r.state.players[0]!.resources.food, 42)
    assert.equal(gainCount(r, TONGS), 0)
  })
  it("actual purchase and quarry undo restore payment pile and one replay", () => {
    const purchase = tongs({ played: false, resources: { wood: 1 } })
    const beforePurchase = undoRuleSnapshot(purchase.getState())
    buy(purchase, TONGS)
    purchaseUndo(purchase, beforePurchase)
    const bought = buy(purchase, TONGS)
    assert.equal(bought.state.players[0]!.resources.stone, 0)
    assert.equal(bought.state.players[0]!.resources.wood, 0)
    const s = tongs({ quarry: 3 })
    const before = undoRuleSnapshot(s.getState())
    turn(s, 0, 'western-quarry')
    assertUndoRestored(before, s.undoAction())
    const r = turn(s, 0, 'western-quarry')
    assert.equal(r.state.players[0]!.resources.stone, 4)
    assert.equal(gainCount(r, TONGS), 1)
    sessionEvidence.record('Tongs-whole-use-undo-replay', r)
  })
})
