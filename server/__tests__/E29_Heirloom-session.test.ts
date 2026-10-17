import { describe, expect, it, afterEach } from 'vitest'
import { GameSession } from '../game/authoritative-session'
import { meetsCardPrerequisites } from '../../shared/cards/helpers/prerequisites'

import '../../shared/cards/E/E029_Heirloom'
import { E029_Heirloom } from '../../shared/cards/E/E029_Heirloom'
import assert from 'node:assert/strict'
import * as audit33Native from './_helpers/audit/ae-negative-33-native'

describe('E029_Heirloom session', () => {
  const setup = () => {
    const session = new GameSession(42)
    const state = session.getState().state
    state.players = state.players.slice(0, 2)
    state.currentPlayerIndex = 0
    return session
  }

  it('blocked when day-laborer is empty', () => {
    const session = setup()
    const state = session.getState().state
    const player = state.players[0]!
    const dl = state.actionSpaces.find((s) => s.id === 'day-laborer')
    expect(dl).toBeTruthy()
    dl!.takenBy = []
    expect(session.withCtx(() => meetsCardPrerequisites(player, E029_Heirloom, state.round, state))).toBe(false)
  })

  it('playable when player has person on day-laborer', () => {
    const session = setup()
    const state = session.getState().state
    const player = state.players[0]!
    const dl = state.actionSpaces.find((s) => s.id === 'day-laborer')!
    dl.takenBy = [{ playerId: player.id, workerId: '1' }]
    expect(session.withCtx(() => meetsCardPrerequisites(player, E029_Heirloom, state.round, state))).toBe(true)
  })

  it('blocked when opponent occupies day-laborer', () => {
    const session = setup()
    const state = session.getState().state
    const player = state.players[0]!
    const opponent = state.players[1]!
    const dl = state.actionSpaces.find((s) => s.id === 'day-laborer')!
    dl.takenBy = [{ playerId: opponent.id, workerId: '1' }]
    expect(session.withCtx(() => meetsCardPrerequisites(player, E029_Heirloom, state.round, state))).toBe(false)
  })
})

describe('ae-negative-33-native', () => {
  const { sessions, traces, save, make, take, finish, ready, fill, reach, final, purchase, rejectBuy, resource, bonus, points } = audit33Native
  afterEach(() => { sessions.splice(0).forEach(s => s.dispose()); traces.splice(0); });
  it("E029 N1 real owner Day Laborer placement enables free Heirloom and its actual final two base points", () => { const s = make('E029_Heirloom', undefined, false, 14), labor = finish(s, take(s, 0, 'day-laborer')); fill(s); assert.equal(ready(s).state.currentPlayerIndex, 0); const bought = purchase(s, 'E029_Heirloom'); resource(bought, { food: 102 }); const r = final(s); assert.equal(points(r, 'E029_Heirloom'), 2); assert.equal(bonus(r, 'E029_Heirloom'), 0); save('E029-N1', { labor, bought, r }); });
  it("E029 N2 empty Day Laborer or a real opponent person cannot satisfy the purchase prerequisite", () => { for (const opponent of [false, true]) {
      const s = make('E029_Heirloom', st => { if (opponent)
          st.currentPlayerIndex = 1; }, false);
      if (opponent) {
          finish(s, take(s, 1, 'day-laborer'));
          ready(s);
      }
      save(`E029-N2-${opponent}`, rejectBuy(s, 'E029_Heirloom'));
  } });
  it("E029 N3 held Heirloom and next-round returned persons cannot supply its point or placement prerequisite", () => { const h = make('E029_Heirloom', undefined, false, 14), held = final(h); assert.equal(points(held, 'E029_Heirloom'), 0); const s = make('E029_Heirloom', undefined, false, 5); finish(s, take(s, 0, 'day-laborer')); const next = reach(s, 6); assert.equal(next.state.actionSpaces.find(x => x.id === 'day-laborer')!.takenBy.length, 0); const rejected = rejectBuy(s, 'E029_Heirloom'); save('E029-N3', { held, next, rejected }); });
})
