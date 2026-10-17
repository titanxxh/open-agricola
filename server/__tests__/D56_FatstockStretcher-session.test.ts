import { describe, expect, it, afterEach } from 'vitest'
import { GameSession } from '../game/authoritative-session'
import { stabilizeRandomHands } from './_helpers/stabilize-random-hands'
import { resolveTriggerIfPresent } from './_helpers/trigger-select'

import '../../shared/cards/D/D056_FatstockStretcher'
import assert from 'node:assert/strict'
import { assertRejectedUnchanged } from './_helpers/negative-rule-audit'
import * as audit38Cooking from './_helpers/audit/ae-negative-38-cooking'

describe('D056_FatstockStretcher session', () => {
  const setup = () => {
    const session = new GameSession(42)
    stabilizeRandomHands(session.state.players)
    const state = session.getState().state
    state.players = state.players.slice(0, 2)
    state.currentPlayerIndex = 0
    state.round = 1

    const player = state.players[0]!
    // Place card directly
    player.minorPlayed.push('D056_FatstockStretcher')
    // Give player a Fireplace for cooking
    player.improvements.push('Major_Fireplace1')
    state.availableMajorImprovements = state.availableMajorImprovements.filter(
      (id) => id !== 'Major_Fireplace1',
    )
    // Give resources
    player.resources.sheep = 4
    player.resources.boar = 3
    player.resources.cattle = 2
    player.resources.vegetable = 2
    player.resources.grain = 3
    player.resources.food = 0

    session.loadState(state)
    return session
  }

  const enterActiveInteraction = (session: GameSession) => {
    const resp = session.takeAction(0, 'farmland')
    expect(resp.ok).toBe(true)
    return resp
  }

  it('grants 1 bonus food per sheep cooked', () => {
    const session = setup()
    enterActiveInteraction(session)

    let resp = session.takeAnytimeAction(0, 'exchange')
    expect(resp.ok).toBe(true)
    expect(resp.interaction.stateId).toBe('wait')

    // Cook 2 sheep (Fireplace trade index 0 = sheep->2food)
    resp = session.resolveChoice(0, 'bulk:0=2')
    resp = resolveTriggerIfPresent(session, resp, 'D056_FatstockStretcher')
    expect(resp.ok).toBe(true)

    const player = resp.state.players[0]!
    expect(player.resources.sheep).toBe(2)
    // 2 sheep × 2 food = 4 food from cooking
    // 2 sheep lost → 2 bonus food
    // Total = 4 + 2 = 6
    expect(player.resources.food).toBe(6)
  })

  it('grants 1 bonus food per boar cooked', () => {
    const session = setup()
    enterActiveInteraction(session)

    let resp = session.takeAnytimeAction(0, 'exchange')
    expect(resp.ok).toBe(true)

    // Cook 2 boar (Fireplace trade index 1 = boar->2food)
    resp = session.resolveChoice(0, 'bulk:1=2')
    resp = resolveTriggerIfPresent(session, resp, 'D056_FatstockStretcher')
    expect(resp.ok).toBe(true)

    const player = resp.state.players[0]!
    expect(player.resources.boar).toBe(1)
    // 2 boar × 2 food = 4 food from cooking
    // 2 boar lost → 2 bonus food
    // Total = 4 + 2 = 6
    expect(player.resources.food).toBe(6)
  })

  it('grants bonus for mixed sheep and boar', () => {
    const session = setup()
    enterActiveInteraction(session)

    let resp = session.takeAnytimeAction(0, 'exchange')
    expect(resp.ok).toBe(true)

    // Cook 1 sheep (index 0) + 1 boar (index 1)
    resp = session.resolveChoice(0, 'bulk:0=1,1=1')
    resp = resolveTriggerIfPresent(session, resp, 'D056_FatstockStretcher')
    expect(resp.ok).toBe(true)

    const player = resp.state.players[0]!
    expect(player.resources.sheep).toBe(3)
    expect(player.resources.boar).toBe(2)
    // 1 sheep × 2f + 1 boar × 2f = 4 food from cooking
    // 1 sheep + 1 boar = 2 bonus food
    // Total = 4 + 2 = 6
    expect(player.resources.food).toBe(6)
  })

  it('no bonus when cooking cattle (not sheep/pig)', () => {
    const session = setup()
    enterActiveInteraction(session)

    let resp = session.takeAnytimeAction(0, 'exchange')
    expect(resp.ok).toBe(true)

    // Cook 2 cattle (Fireplace trade index 2 = cattle->3food)
    resp = session.resolveChoice(0, 'bulk:2=2')
    resp = resolveTriggerIfPresent(session, resp, 'D056_FatstockStretcher')
    expect(resp.ok).toBe(true)

    const player = resp.state.players[0]!
    expect(player.resources.cattle).toBe(0)
    // 2 cattle × 3 food = 6 food from cooking, no bonus
    expect(player.resources.food).toBe(6)
  })

  it('no bonus when cooking vegetables (not sheep/pig)', () => {
    const session = setup()
    enterActiveInteraction(session)

    let resp = session.takeAnytimeAction(0, 'exchange')
    expect(resp.ok).toBe(true)

    // Cook 2 vegetable (Fireplace trade index 3 = vegetable->2food)
    resp = session.resolveChoice(0, 'bulk:3=2')
    resp = resolveTriggerIfPresent(session, resp, 'D056_FatstockStretcher')
    expect(resp.ok).toBe(true)

    const player = resp.state.players[0]!
    expect(player.resources.vegetable).toBe(0)
    // 2 vegetable × 2 food = 4 food from cooking, no bonus
    expect(player.resources.food).toBe(4)
  })

  it('bonus only for sheep/boar in mixed batch with cattle', () => {
    const session = setup()
    enterActiveInteraction(session)

    let resp = session.takeAnytimeAction(0, 'exchange')
    expect(resp.ok).toBe(true)

    // Cook 1 sheep (index 0) + 1 cattle (index 2)
    resp = session.resolveChoice(0, 'bulk:0=1,2=1')
    resp = resolveTriggerIfPresent(session, resp, 'D056_FatstockStretcher')
    expect(resp.ok).toBe(true)

    const player = resp.state.players[0]!
    expect(player.resources.sheep).toBe(3)
    expect(player.resources.cattle).toBe(1)
    // 1 sheep × 2f + 1 cattle × 3f = 5 food from cooking
    // Only sheep counts for bonus: 1 bonus food
    // Total = 5 + 1 = 6
    expect(player.resources.food).toBe(6)
  })
})

describe('ae-negative-38-cooking', () => {
  const { sessions, save, make, finish, buy, animal, cooked, cook } = audit38Cooking
  afterEach(() => sessions.splice(0).forEach(s => s.dispose()));
  it('D056 N1 actual one wood purchase and public cooking two sheep or one pig gain exactly one additional food per animal', () => {
      const b = cooked('D056_FatstockStretcher', false), bought = finish(b, buy(b, 'D056_FatstockStretcher'));
      assert.equal(bought.state.players[0]!.resources.wood, 0);
      const rows = [];
      for (const [type, n, food] of [['sheep', 2, 106], ['boar', 1, 103]] as const) {
          const s = cooked('D056_FatstockStretcher', true, type, n), r = cook(s, type, n);
          assert.deepEqual([r.state.players[0]!.resources[type], r.state.players[0]!.resources.food], [0, food]);
          rows.push(r);
      }
      save('D056-N1', { bought, rows });
  });
  it('D056 N2 cattle vegetables and a noncooking Sheep Walker exchange exclude the additional food', () => {
      const rows = [];
      for (const [type, food] of [['cattle', 103], ['vegetable', 102]] as const) {
          const s = cooked('D056_FatstockStretcher', true, type), r = cook(s, type);
          assert.equal(r.state.players[0]!.resources.food, food);
          rows.push(r);
      }
      const s = make('D056_FatstockStretcher', true, state => { state.players[0]!.occupationPlayed = ['B104_SheepWalker']; animal(state, 'sheep'); }), r = cook(s, 'sheep', 1, 'B104_SheepWalker');
      assert.deepEqual([r.state.players[0]!.resources.sheep, r.state.players[0]!.resources.food, r.state.players[0]!.resources.stone], [0, 100, 1]);
      save('D056-N2', { rows, r });
  });
  it('D056 N3 held Stretcher and unavailable purchase wood cannot create additional food and a no animal exchange cannot pay twice', () => { const s = cooked('D056_FatstockStretcher', false), hand = cook(s, 'sheep'); assert.equal(hand.state.players[0]!.resources.food, 102); const t = make('D056_FatstockStretcher', false), p = buy(t, 'D056_FatstockStretcher'), bad = assertRejectedUnchanged(t, () => t.resolveChoice(0, 'D056_FatstockStretcher')); const q = cooked('D056_FatstockStretcher'), once = cook(q, 'sheep'), twice = q.takeAnytimeAction(0, 'exchange'); assert.equal(twice.ok, false); assert.equal(twice.state.players[0]!.resources.food, 103); save('D056-N3', { hand, p, bad, once, twice }); });
})
