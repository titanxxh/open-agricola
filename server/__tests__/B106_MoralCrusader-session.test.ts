import { describe, expect, it } from 'vitest'
import { GameSession } from '../game/authoritative-session'
import { runCardEffectHook } from '../../shared/cards/card-effects'
import type { ActionFlow } from '../../shared/contract/types'

import '../../shared/cards/B/B106_MoralCrusader'

/**
 * B106 Moral Crusader (verify-only, Sprint 7a F6).
 *
 * BGA `Cards/B/B106_MoralCrusader.php::onPlayerBeforeStartOfTurn`:
 *   foreach (range(getTurn(), 14) as $turn) {
 *     $meeples = Meeples::getResourcesOnCard('turn_' . $turn, $player->getId());
 *     foreach ($meeples as $m) if ($m['type'] in goods) { $futureGoods=true; break 2; }
 *   }
 *   if ($futureGoods) return $this->gainNode([FOOD => 1]);
 *
 * Our hook (`onBeforeStartOfTurn`) inspects `state.futureMeeples` for entries owned by
 * the player whose `round >= state.round + 1` and whose resources contain at least one
 * positive good. The `state.round` is incremented just before this hook fires (mirror of
 * BGA's pre-round event), so `round + 1` is the first "remaining round space".
 */
describe('B106_MoralCrusader session (verify-only)', () => {
  const setup = () => {
    const session = new GameSession()
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

    const flow = runCardEffectHook(state, player, 'B106_MoralCrusader', 'onBeforeStartOfTurn')
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
    // "remaining" rounds that BGA scans.
    state.futureMeeples.push({
      id: 'fut-past',
      cardId: 'X',
      playerId: player.id,
      round: 5,
      actionId: null,
      resources: { food: 4 },
    })
    const flow = runCardEffectHook(state, player, 'B106_MoralCrusader', 'onBeforeStartOfTurn')
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
    const flow = runCardEffectHook(state, player, 'B106_MoralCrusader', 'onBeforeStartOfTurn')
    expect(flow).toBeNull()
  })

  it('no food when futureMeeples is empty', () => {
    const session = setup()
    const state = session.getState().state
    const player = state.players[0]!
    const flow = runCardEffectHook(state, player, 'B106_MoralCrusader', 'onBeforeStartOfTurn')
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
    const flow = runCardEffectHook(state, player, 'B106_MoralCrusader', 'onBeforeStartOfTurn')
    expect(flow).toBeNull()
  })
})
