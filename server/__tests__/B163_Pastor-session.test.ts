import type { GameSession as SessionRuleOwner } from '../game/authoritative-session'
import { CardRegistry as TestCardRegistry } from '../../shared/cards/registry'
import { withActiveRegistry } from '../../shared/cards/active-registry'
import { createOfficialCardRegistry } from '../../shared/cards/__tests__/card-environment'
import { describe, expect, it, afterEach } from 'vitest'
import { GameSession } from '../game/authoritative-session'
import {
  getRegisteredCardListeners,
  executeCardListener,
  type CardListenerContext,
} from '../../shared/cards/card-listeners'
import { getCardEffect } from '../../shared/cards/card-effects'

import '../../shared/cards/B/B163_Pastor'
import { mkActionSpace } from '../../shared/cards/__tests__/fixtures'
import assert from 'node:assert/strict'
import * as audit30Native from './_helpers/audit/ae-negative-30-native'

const CARD_ID = 'B163_Pastor'

const findListener = (ruleOwner: SessionRuleOwner | TestCardRegistry, id: string) =>
  {
  const lookupRule1 = () => getRegisteredCardListeners().find((l) => l.id === id)
  return ruleOwner instanceof TestCardRegistry ? withActiveRegistry(ruleOwner, lookupRule1) : ruleOwner.withCtx(lookupRule1)
}

const setupSession = () => {
  const session = new GameSession(42)
  const state = session.getState().state
  state.players = state.players.slice(0, 2)
  state.currentPlayerIndex = 0
  return session
}

describe('B163_Pastor effect.onBuy', () => {
  it('returns the gain+flag flow when owner sits alone at 2 rooms at buy time', () => {
    const session = setupSession()
    const state = session.getState().state
    const owner = state.players[0]!
    const opp = state.players[1]!
    owner.rooms = 2
    opp.rooms = 1
    owner.occupationPlayed = [CARD_ID]
    session.loadState(state)

    const effect = session.withCtx(() => getCardEffect(CARD_ID))
    expect(effect?.onBuy).toBeDefined()

    const flow = session.withCtx(() => effect!.onBuy!(state, owner))
    expect(flow).toBeDefined()
    expect(flow!.type).toBe('seq')
    if (flow!.type === 'seq') {
      const gain = flow.children[0]
      expect(gain.type).toBe('leaf')
      if (gain.type === 'leaf') {
        expect(gain.params).toEqual({ wood: 3, clay: 2, reed: 1, stone: 1 })
      }
      const setFlag = flow.children[1]
      expect(setFlag.type).toBe('leaf')
      if (setFlag.type === 'leaf') {
        expect(setFlag.params).toEqual({ kind: 'set-flag', flag: true })
      }
    }
  })

  it('returns nothing when owner has only 1 room at buy time', () => {
    const session = setupSession()
    const state = session.getState().state
    const owner = state.players[0]!
    owner.rooms = 1
    owner.occupationPlayed = [CARD_ID]
    session.loadState(state)

    const effect = session.withCtx(() => getCardEffect(CARD_ID))
    const flow = session.withCtx(() => effect!.onBuy!(state, owner))
    expect(flow).toBeUndefined()
  })

  it('returns nothing when an opponent also has 2 rooms at buy time', () => {
    const session = setupSession()
    const state = session.getState().state
    const owner = state.players[0]!
    const opp = state.players[1]!
    owner.rooms = 2
    opp.rooms = 2
    owner.occupationPlayed = [CARD_ID]
    session.loadState(state)

    const effect = session.withCtx(() => getCardEffect(CARD_ID))
    const flow = session.withCtx(() => effect!.onBuy!(state, owner))
    expect(flow).toBeUndefined()
  })

  it('returns nothing when the card is already flagged (one-time)', () => {
    const session = setupSession()
    const state = session.getState().state
    const owner = state.players[0]!
    const opp = state.players[1]!
    owner.rooms = 2
    opp.rooms = 1
    owner.occupationPlayed = [CARD_ID]
    owner.cardStates = { [CARD_ID]: { flagged: true } }
    session.loadState(state)

    const effect = session.withCtx(() => getCardEffect(CARD_ID))
    const flow = session.withCtx(() => effect!.onBuy!(state, owner))
    expect(flow).toBeUndefined()
  })
})

describe('B163_Pastor after-construct listener (regression)', () => {
  it('listener is still registered for construct/after', () => {
    const ruleRegistry = createOfficialCardRegistry()
    const listener = findListener(ruleRegistry, 'B163-pastor-after-construct')
    expect(listener).toBeDefined()
    expect(listener!.actions).toEqual(['construct'])
    expect(listener!.phases).toEqual(['after'])
  })

  it('fires gain+flag when an opponent constructs a 2-room owner alone', () => {

    const session = setupSession()
    const listener = findListener(session, 'B163-pastor-after-construct')!
    const state = session.getState().state
    const owner = state.players[0]!
    const opp = state.players[1]!
    owner.rooms = 2
    opp.rooms = 1
    owner.occupationPlayed = [CARD_ID]
    session.loadState(state)

    const result = session.withCtx(() => executeCardListener(listener, {
      state,
      player: opp,
      ownerPlayer: owner,
      space: mkActionSpace({ id: 'construct' }),
      actionId: 'construct',
      phase: 'after',
      result: { type: 'ok' },
    } as CardListenerContext))

    expect(result?.flow).toBeDefined()
    expect(result!.flow!.type).toBe('seq')
  })
})

describe('ae-negative-30-native', () => {
  const { sessions, commands, save, make, finish, ready, play, rooms, res, expansion } = audit30Native
  afterEach(() => { sessions.splice(0).forEach(s => s.dispose()); commands.splice(0); });
  it('B163 N1 real purchase as the only two-room household gains the bundle', () => { const s = make('B163_Pastor', st => st.players.slice(1).forEach(p => rooms(p, 3)), false), r = finish(s, play(s, 'B163_Pastor')); res(r, { wood: 3, clay: 2, reed: 1, stone: 1 }); save('B163-N1', r); });
  it('B163 N2 actual last tied opponent room construction triggers the delayed bundle', () => { const s = make('B163_Pastor', st => { st.players.slice(2).forEach(p => rooms(p, 3)); Object.assign(st.players[1]!.resources, { wood: 5, reed: 2 }); }, false), bought = finish(s, play(s, 'B163_Pastor')); res(bought, { wood: 0, clay: 0, reed: 0, stone: 0 }); ready(s); const r = finish(s, expansion(s, 1, true)); res(r, { wood: 3, clay: 2, reed: 1, stone: 1 }); assert.equal(r.state.players[1]!.rooms, 3); save('B163-N2', { bought, r }); });
  it('B163 N3 ties three-room owner held card and a second construction exclude repeat rewards', () => { for (const mode of ['tie', 'three', 'hand', 'repeat']) {
      const s = make('B163_Pastor', st => { if (mode === 'three')
          rooms(st.players[0]!, 3); if (mode === 'repeat')
          st.players.slice(1).forEach(p => rooms(p, 3)); if (mode === 'hand')
          st.players.slice(2).forEach(p => rooms(p, 3)); Object.assign(st.players[1]!.resources, { wood: 5, reed: 2 }); if (mode === 'hand')
          st.currentPlayerIndex = 1; }, false);
      let r = mode === 'hand' ? finish(s, expansion(s, 1, true)) : finish(s, play(s, 'B163_Pastor'));
      if (mode === 'repeat') {
          ready(s);
          r = finish(s, expansion(s, 1, true));
      }
      res(r, mode === 'repeat' ? { wood: 3, clay: 2, reed: 1, stone: 1 } : { wood: 0, clay: 0, reed: 0, stone: 0 });
      save(`B163-N3-${mode}`, r);
  } });
})
