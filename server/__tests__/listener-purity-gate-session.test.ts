import { afterEach, describe, expect, it } from 'vitest'
import { GameSession } from '../game/authoritative-session'
import { requireActiveCardRegistry } from '../../shared/cards/active-registry'
import {
  setCardListenerInvocationInterceptor,
  type CardListenerInvocationInterceptor,
  type CardListenerRegistration,
} from '../../shared/cards/card-listeners'
import {
  ListenerPurityViolationError,
  installListenerPurityGuard,
  listenerPurityInterceptor,
} from '../../shared/cards/__tests__/listener-purity-guard'
import { setWorkersAtHome } from '../../shared/domain/player'

const PURE_CARD_ID = 'TEST_PurityGatePure'
const IMPURE_CARD_ID = 'TEST_PurityGateImpure'

const startTwoPlayerForestGame = (cardId: string, listener: CardListenerRegistration) => {
  const session = new GameSession()
  const state = session.getState().state
  state.players = state.players.slice(0, 2)
  state.currentPlayerIndex = 0
  state.roundPhase = 'work'
  const owner = state.players[0]!
  setWorkersAtHome(state, owner, 1)
  state.players.forEach((player) => {
    player.minorHand = ['__test_placeholder__']
    player.occupationHand = ['__test_placeholder__']
  })
  owner.minorPlayed.push(cardId)
  owner.resources.food = 2
  owner.resources.wood = 0
  requireActiveCardRegistry('listener-purity-gate').registerListener(listener)
  const forest = state.actionSpaces.find((space) => space.id === 'forest')!
  forest.resources.wood = 3
  session.loadState(state)
  return session
}

describe('listener purity gate in a two-player session', () => {
  afterEach(() => {
    installListenerPurityGuard()
  })

  it('keeps authoritative state unchanged until the returned flow executes', () => {
    const invocations: Array<{ listenerId: string; unchanged: boolean }> = []
    const recordingInterceptor: CardListenerInvocationInterceptor = (invocation, invoke) => {
      const before = JSON.stringify(invocation.context.state)
      const result = listenerPurityInterceptor(invocation, invoke)
      invocations.push({
        listenerId: invocation.registration.id,
        unchanged: JSON.stringify(invocation.context.state) === before,
      })
      return result
    }
    setCardListenerInvocationInterceptor(recordingInterceptor)

    const session = startTwoPlayerForestGame(PURE_CARD_ID, {
      id: `${PURE_CARD_ID}-after-forest`,
      cardIds: [PURE_CARD_ID],
      phases: ['after'],
      actions: ['place-farmer'],
      handler: (ctx) => {
        if (ctx.space?.id !== 'forest') return
        const seen = ctx.player.cardStates?.[PURE_CARD_ID]?.counters?.seen ?? 0
        return {
          flow: {
            type: 'seq',
            children: [
              { type: 'leaf', actionId: 'special-effect', sourceCard: PURE_CARD_ID, params: { kind: 'set-counter', key: 'seen', value: seen + 1 } },
              { type: 'leaf', actionId: 'gain', sourceCard: PURE_CARD_ID, params: { food: 1 } },
            ],
          },
          sourceCard: PURE_CARD_ID,
        }
      },
    })

    const resp = session.takeAction(0, 'forest')

    expect(resp.ok).toBe(true)
    const owner = resp.state.players[0]!
    expect(owner.resources.wood).toBe(3)
    expect(owner.resources.food).toBe(3)
    expect(owner.cardStates?.[PURE_CARD_ID]?.counters?.seen).toBe(1)
    const ownInvocations = invocations.filter((entry) => entry.listenerId === `${PURE_CARD_ID}-after-forest`)
    expect(ownInvocations.length).toBeGreaterThanOrEqual(1)
    expect(invocations.every((entry) => entry.unchanged)).toBe(true)
    expect(JSON.stringify(resp.state.log)).toContain(PURE_CARD_ID)
  })

  it('rejects a listener that mutates during dispatch and rolls the command back', () => {
    const session = startTwoPlayerForestGame(IMPURE_CARD_ID, {
      id: `${IMPURE_CARD_ID}-after-forest`,
      cardIds: [IMPURE_CARD_ID],
      phases: ['after'],
      actions: ['place-farmer'],
      handler: (ctx) => {
        if (ctx.space?.id !== 'forest') return
        ctx.player.resources.food += 1
      },
    })
    const before = JSON.stringify(session.getState().state)

    expect(() => session.takeAction(0, 'forest')).toThrow(ListenerPurityViolationError)
    expect(JSON.stringify(session.getState().state)).toBe(before)
    expect(session.getState().state.players[0]!.resources.food).toBe(2)
  })
})
