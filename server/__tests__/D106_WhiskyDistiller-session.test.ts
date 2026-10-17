import { describe, expect, it, afterEach } from 'vitest'
import { GameSession } from '../game/authoritative-session'
import { stabilizeRandomHands } from './_helpers/stabilize-random-hands'
import type { AnytimeAction } from '../../shared/contract/types'

import '../../shared/cards/D/D106_WhiskyDistiller'
import assert from 'node:assert/strict'
import * as audit47Cards from './_helpers/audit/ae-negative-47-cards'

describe('D106_WhiskyDistiller session', () => {
  const setup = () => {
    const session = new GameSession(42)
    stabilizeRandomHands(session.state.players)
    const state = session.getState().state
    state.players = state.players.slice(0, 2)
    state.currentPlayerIndex = 0
    state.round = 5
    const player = state.players[0]!
    player.occupationHand.push('D106_WhiskyDistiller')
    player.resources.grain = 1
    player.resources.food = 5
    state.futureMeeples = []
    session.loadState(state)
    session.devPlayCard(0, 'D106_WhiskyDistiller')
    return session
  }

  it('anytime listed when grain>=1 and round+2<=14', () => {
    const session = setup()
    const resp = session.takeAction(0, 'farmland')
    expect(resp.ok).toBe(true)
    const ids = resp.interaction.anytimeActions.map((a: AnytimeAction) => a.id)
    expect(ids).toContain('D106-whisky-distiller-anytime')
  })

  it('anytime hidden when no grain', () => {
    const session = setup()
    const state = session.getState().state
    state.players[0]!.resources.grain = 0
    session.loadState(state)
    const resp = session.takeAction(0, 'farmland')
    const ids = resp.interaction.anytimeActions.map((a: AnytimeAction) => a.id)
    expect(ids).not.toContain('D106-whisky-distiller-anytime')
  })

  it('anytime hidden after round 12 (round+2 > 14)', () => {
    const session = setup()
    const state = session.getState().state
    state.round = 13
    session.loadState(state)
    const resp = session.takeAction(0, 'farmland')
    const ids = resp.interaction.anytimeActions.map((a: AnytimeAction) => a.id)
    expect(ids).not.toContain('D106-whisky-distiller-anytime')
  })

  it('triggering pays 1 grain and pushes future-meeple food:4 onto round+2', () => {
    const session = setup()
    session.takeAction(0, 'farmland')
    const before = session.getState().state
    expect(before.round).toBe(5)
    expect(before.players[0]!.resources.grain).toBe(1)

    const resp = session.takeAnytimeAction(0, 'D106-whisky-distiller-anytime')
    expect(resp.ok).toBe(true)

    const after = resp.state
    expect(after.players[0]!.resources.grain).toBe(0)
    const ours = after.futureMeeples.filter(
      (e) => e.cardId === 'D106_WhiskyDistiller' && e.playerId === after.players[0]!.id,
    )
    expect(ours).toHaveLength(1)
    expect(ours[0]!.round).toBe(7) // current 5 + 2
    expect(ours[0]!.resources.food).toBe(4)
  })

  it('not given immediately at the time of triggering', () => {
    const session = setup()
    session.takeAction(0, 'farmland')
    const resp = session.takeAnytimeAction(0, 'D106-whisky-distiller-anytime')
    expect(resp.ok).toBe(true)
    // Food should not be granted yet — only at the start of round 7.
    expect(resp.state.players[0]!.resources.food).toBe(5)
  })
})

describe('ae-negative-47-cards', () => {
  const { sessions, save, ok, make, finish, anytime, future, reach } = audit47Cards
  afterEach(() => sessions.splice(0).forEach(s => s.dispose()))
  it('D106 N1 two real grain payments schedule two independent four-food deliveries and naturally release exactly eight food two rounds later', () => { const s = make('D106_WhiskyDistiller', st => { st.players[0]!.resources.grain = 2 }, true, 8), a = finish(s, anytime(s, 'D106_WhiskyDistiller'), false), b = finish(s, anytime(s, 'D106_WhiskyDistiller'), false); assert.equal(b.state.players[0]!.resources.grain, 0); assert.deepEqual(future(b, 'D106_WhiskyDistiller'), [{ round: 10, resources: { food: 4 } }, { round: 10, resources: { food: 4 } }]); const early = finish(s, reach(s, 9), false); assert.equal(early.state.players[0]!.resources.food, 100); const p = reach(s, 10), r = finish(s, p, false); assert.equal(r.state.players[0]!.resources.food, 104); assert.equal(future(r, 'D106_WhiskyDistiller').length, 0); save('D106-N1', { a, b, early, p, r }) })
  it('D106 N2 round twelve is last valid payment while round thirteen or zero grain cannot schedule food', () => { const s = make('D106_WhiskyDistiller', st => { st.players[0]!.resources.grain = 1 }, true, 12), r = finish(s, anytime(s, 'D106_WhiskyDistiller'), false); assert.deepEqual(future(r, 'D106_WhiskyDistiller'), [{ round: 14, resources: { food: 4 } }]); assert.equal(r.state.players[0]!.resources.grain, 0); const c = make('D106_WhiskyDistiller', st => { st.players[0]!.resources.grain = 1 }, true, 13); assert.equal(c.getState().interaction.anytimeActions.some(a => a.sourceCard === 'D106_WhiskyDistiller'), false); const cr = finish(c, ok(c.takeAction(0, 'day-laborer')), false); assert.equal(cr.state.players[0]!.resources.grain, 1); assert.equal(future(cr, 'D106_WhiskyDistiller').length, 0); const z = make('D106_WhiskyDistiller'); assert.equal(z.getState().interaction.anytimeActions.some(a => a.sourceCard === 'D106_WhiskyDistiller'), false); save('D106-N2', { r, cr, zero: ok(z.getState()) }) })
})
