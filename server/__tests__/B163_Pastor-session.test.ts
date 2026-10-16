import type { GameSession as SessionRuleOwner } from '../game/authoritative-session'
import { CardRegistry as TestCardRegistry } from '../../shared/cards/registry'
import { withActiveRegistry } from '../../shared/cards/active-registry'
import { createOfficialCardRegistry } from '../../shared/cards/__tests__/card-environment'
import { describe, expect, it } from 'vitest'
import { GameSession } from '../game/authoritative-session'
import {
  getRegisteredCardListeners,
  executeCardListener,
  type CardListenerContext,
} from '../../shared/cards/card-listeners'
import { getCardEffect } from '../../shared/cards/card-effects'

import '../../shared/cards/B/B163_Pastor'
import { mkActionSpace } from '../../shared/cards/__tests__/fixtures'

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
