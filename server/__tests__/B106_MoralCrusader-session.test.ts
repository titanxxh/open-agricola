import { describe, expect, it, afterEach } from 'vitest'
import { GameSession } from '../game/authoritative-session'
import { runCardEffectHook } from '../../shared/cards/card-effects'
import type { ActionFlow } from '../../shared/contract/types'

import '../../shared/cards/B/B106_MoralCrusader'
import assert from 'node:assert/strict'
import { assertRuleOutcome } from './_helpers/negative-rule-audit'
import * as audit25Crusader from './_helpers/audit/ae-negative-25-crusader'

/**
 * B106 Moral Crusader (verify-only, Sprint 7a F6).
 *
 * The reference `Cards/B/the reference::onPlayerBeforeStartOfTurn`:
 *   foreach (range(getTurn(), 14) as $turn) {
 *     $meeples = Meeples::getResourcesOnCard('turn_' . $turn, $player->getId());
 *     foreach ($meeples as $m) if ($m['type'] in goods) { $futureGoods=true; break 2; }
 *   }
 *   if ($futureGoods) return $this->gainNode([FOOD => 1]);
 *
 * Our hook (`onBeforeStartOfTurn`) inspects `state.futureMeeples` for entries owned by
 * the player whose `round >= state.round + 1` and whose resources contain at least one
 * positive good. The `state.round` is incremented just before this hook fires (mirror of
 * The reference's pre-round event), so `round + 1` is the first "remaining round space".
 */
describe('B106_MoralCrusader session (verify-only)', () => {
  const setup = () => {
    const session = new GameSession(42)
    const state = session.getState().state
    state.players = state.players.slice(0, 2)
    state.currentPlayerIndex = 0
    state.round = 5
    const player = state.players[0]!
    player.occupationPlayed.push('B106_MoralCrusader')
    state.futureMeeples = []
    session.loadState(state)
    return session
  }

  it('returns gain food:1 flow when player has goods promised on a future round', () => {
    const session = setup()
    const state = session.getState().state
    const player = state.players[0]!
    state.futureMeeples.push({
      id: 'fut-1',
      cardId: 'D106_WhiskyDistiller',
      playerId: player.id,
      round: 7,
      actionId: null,
      resources: { food: 4 },
    })

    const flow = session.withCtx(() => runCardEffectHook(state, player, 'B106_MoralCrusader', 'onBeforeStartOfTurn'))
    expect(flow).not.toBeNull()
    const leaf = flow as Extract<ActionFlow, { type: 'leaf' }>
    expect(leaf.type).toBe('leaf')
    expect(leaf.actionId).toBe('gain')
    expect(leaf.params).toEqual({ food: 1 })
  })

  it('no food when only past-round entries remain', () => {
    const session = setup()
    const state = session.getState().state
    const player = state.players[0]!
    // Push entry for round 5 — equal to current round, so NOT in the
    // "remaining" rounds that the reference scans.
    state.futureMeeples.push({
      id: 'fut-past',
      cardId: 'X',
      playerId: player.id,
      round: 5,
      actionId: null,
      resources: { food: 4 },
    })
    const flow = session.withCtx(() => runCardEffectHook(state, player, 'B106_MoralCrusader', 'onBeforeStartOfTurn'))
    expect(flow).toBeNull()
  })

  it('no food when entries belong to opponent', () => {
    const session = setup()
    const state = session.getState().state
    const player = state.players[0]!
    const opponent = state.players[1]!
    state.futureMeeples.push({
      id: 'fut-opp',
      cardId: 'X',
      playerId: opponent.id,
      round: 8,
      actionId: null,
      resources: { food: 4 },
    })
    const flow = session.withCtx(() => runCardEffectHook(state, player, 'B106_MoralCrusader', 'onBeforeStartOfTurn'))
    expect(flow).toBeNull()
  })

  it('no food when futureMeeples is empty', () => {
    const session = setup()
    const state = session.getState().state
    const player = state.players[0]!
    const flow = session.withCtx(() => runCardEffectHook(state, player, 'B106_MoralCrusader', 'onBeforeStartOfTurn'))
    expect(flow).toBeNull()
  })

  it('no food when entry resources are all zero', () => {
    const session = setup()
    const state = session.getState().state
    const player = state.players[0]!
    state.futureMeeples.push({
      id: 'fut-empty',
      cardId: 'X',
      playerId: player.id,
      round: 9,
      actionId: null,
      resources: {},
    })
    const flow = session.withCtx(() => runCardEffectHook(state, player, 'B106_MoralCrusader', 'onBeforeStartOfTurn'))
    expect(flow).toBeNull()
  })
})

describe('ae-negative-25-crusader', () => {
  const { sessions, save, ok, make, promise, reach } = audit25Crusader
  afterEach(()=>sessions.splice(0).forEach(s=>s.dispose()))
  it('B106 N1 real Pond Hut purchase promises three future foods and natural next round adds exactly one Crusader food',()=>{const s=make(),control=make(false),a=promise(s),b=promise(control),r=reach(s,9),c=reach(control,9);assert.equal(r.state.players[0]!.resources.food,c.state.players[0]!.resources.food+1);assert.equal(r.state.futureMeeples.filter(e=>e.playerId===r.state.players[0]!.id).length,2);save('B106-N1',{a,b,r,c})})
  it('B106 N2 final promised delivery still qualifies before round start and later no promise round adds no Crusader food',()=>{const s=make(),control=make(false),a=promise(s),b=promise(control),r=reach(s,11),c=reach(control,11);assert.equal(r.state.futureMeeples.filter(e=>e.playerId===r.state.players[0]!.id).length,0);const after=reach(s,12),other=reach(control,12);assert.equal(after.state.futureMeeples.filter(e=>e.playerId===after.state.players[0]!.id).length,0);const actual={round11Delta:r.state.players[0]!.resources.food-c.state.players[0]!.resources.food,round12Delta:after.state.players[0]!.resources.food-other.state.players[0]!.resources.food};save('B106-N2',{a,b,r,c,after,other,actual});assertRuleOutcome(actual,{round11Delta:3,round12Delta:3})})
  it('B106 N3 no future promise and card still in hand grant no extra food at a real round transition',()=>{const s=make(true,false),control=make(false,false),r=reach(s,9),c=reach(control,9);assert.equal(r.state.players[0]!.resources.food,c.state.players[0]!.resources.food);assert.equal(r.state.futureMeeples.length,0);save('B106-N3',{r,c})})
  it('B106 N4 undoing the actual promise purchase removes future goods and prevents the next round bonus',()=>{const s=make(),a=promise(s),undone=ok(s.undoAction());assert.equal(undone.state.futureMeeples.filter(e=>e.playerId===undone.state.players[0]!.id).length,0);assert.equal(undone.state.players[0]!.resources.wood,1);const control=make(false,false),r=reach(s,9),c=reach(control,9);assert.equal(r.state.players[0]!.resources.food,c.state.players[0]!.resources.food);save('B106-N4',{a,undone,r,c})})
})
