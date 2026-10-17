import { describe, expect, it, afterEach } from 'vitest'
import { GameSession } from '../game/authoritative-session'
import { stabilizeRandomHands } from './_helpers/stabilize-random-hands'

import { setWorkersAtHome } from '../../shared/domain/player'
import '../../shared/cards/A/A080_StoneTongs'
import assert from 'node:assert/strict'
import { assertRejectedUnchanged, assertUndoRestored, undoRuleSnapshot } from './_helpers/negative-rule-audit'
import { buildLogPresentationPlan } from '../../shared/events/log-mapper'
import * as audit10Accumulation from './_helpers/audit/ae-negative-10-accumulation'

describe('A080_StoneTongs session', () => {
  const setup = () => {
    const session = new GameSession(42)
    stabilizeRandomHands(session.state.players)
    const state = session.getState().state
    state.players = state.players.slice(0, 2)
    state.currentPlayerIndex = 0
    state.round = 1

    const player = state.players[0]!
    player.minorHand.push('A080_StoneTongs')
    setWorkersAtHome(state, player, 2)
    player.resources.stone = 0

    state.players[1]!.workersAvailable = 2

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

describe('ae-negative-10-accumulation', () => {
  const { TONGS, EXCURSION, WAGE, sessions, save, ready, turn, buy, deny, gainCount, purchaseUndo, tongs } = audit10Accumulation
  afterEach(() => sessions.splice(0).forEach(s => s.dispose()))
  it('A080 N1 live wood shortage rejects before fee without immediate stone', () => { deny(tongs({ played: false }), TONGS); const r = buy(tongs({ played: false, resources: { wood: 1 } }), TONGS); assert.equal(r.state.players[0]!.resources.wood, 0); assert.equal(r.state.players[0]!.resources.stone, 0); assert.equal(gainCount(r, TONGS), 0) })
  it('A080 N2 both actual quarries add one stone independent of pile quantity', () => { for (const space of ['eastern-quarry', 'western-quarry']) for (const quarry of [1, 3]) { const r = turn(tongs({ quarry }), 0, space); assert.equal(r.state.players[0]!.resources.stone, quarry + 1); assert.equal(r.state.actionSpaces.find(a => a.id === space)!.resources.stone, 0); assert.equal(gainCount(r, TONGS), 1) } })
  it('A080 N3 real passing Excursion and foreign quarry exclude owner bonus', () => {
    const s = tongs({ hand: [EXCURSION, WAGE, 'A016_RammedClay'], occupations: ['A124_Knapper'] }); const r = buy(s, EXCURSION); assert.equal(r.state.players[0]!.resources.stone, 2); assert.equal(r.state.players[0]!.resources.food, 38); assert.equal(gainCount(r, TONGS), 0); assert.equal(r.state.players[0]!.minorHand.includes(EXCURSION), false); assert.equal(r.state.players[0]!.minorPlayed.includes(EXCURSION), false); assert.equal(r.state.players[1]!.minorHand.filter(id => id === EXCURSION).length, 1)
    const events = r.state.events.filter(e => 'fromPlayerId' in e && 'toPlayerId' in e && 'cardId' in e && e.cardId === EXCURSION); assert.equal(events.length, 1); const event = events[0]; assert.ok(event && 'fromPlayerId' in event && 'toPlayerId' in event); assert.equal(event.fromPlayerId, r.state.players[0]!.id); assert.equal(event.toPlayerId, r.state.players[1]!.id); const rows = buildLogPresentationPlan(r.state.events, { playerNames: {} }).rows.filter(row => row.logEntry.key === 'log.cardPassed' && row.logEntry.params?.cardId === EXCURSION); assert.equal(rows.length, 1); const row = rows[0]; assert.ok(row); assert.deepEqual(row.sourceEventRef, { id: event.id, seq: event.seq, type: event.type }); assert.equal(row.logEntry.playerRefs?.fromPlayer, event.fromPlayerId); assert.equal(row.logEntry.playerRefs?.toPlayer, event.toPlayerId); save('actual-B006-pass-public-projection', { event, row, response: r })
    const foreign = tongs(); turn(foreign, 0, 'forest'); const q = turn(foreign, 1, 'western-quarry'); assert.equal(q.state.players[0]!.resources.stone, 0); assert.equal(q.state.players[1]!.resources.stone, 1); assert.equal(gainCount(q, TONGS), 0); const non = turn(tongs(), 0, 'forest'); assert.equal(non.state.players[0]!.resources.stone, 0); assert.equal(non.state.players[0]!.resources.wood, 3)
  })
  it('A080 N4 in hand quarry and occupied repeat never add a bonus', () => { const s = tongs({ played: false }); const first = turn(s, 0, 'western-quarry'); assert.equal(first.state.players[0]!.resources.stone, 1); turn(s, 1, 'forest'); ready(s, 0); assertRejectedUnchanged(s, () => s.takeAction(0, 'western-quarry')); const r = turn(s, 0, 'day-laborer'); assert.equal(r.state.players[0]!.resources.stone, 1); assert.equal(r.state.players[0]!.resources.food, 42); assert.equal(gainCount(r, TONGS), 0) })
  it('A080 N5 actual purchase and quarry undo restore payment pile and one replay', () => { const purchase = tongs({ played: false, resources: { wood: 1 } }); const beforePurchase = undoRuleSnapshot(purchase.getState()); buy(purchase, TONGS); purchaseUndo(purchase, beforePurchase); const bought = buy(purchase, TONGS); assert.equal(bought.state.players[0]!.resources.stone, 0); assert.equal(bought.state.players[0]!.resources.wood, 0); const s = tongs({ quarry: 3 }); const before = undoRuleSnapshot(s.getState()); turn(s, 0, 'western-quarry'); assertUndoRestored(before, s.undoAction()); const r = turn(s, 0, 'western-quarry'); assert.equal(r.state.players[0]!.resources.stone, 4); assert.equal(gainCount(r, TONGS), 1); save('Tongs-whole-use-undo-replay', r) })
})
