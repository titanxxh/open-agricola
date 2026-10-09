import { describe, expect, it } from 'vitest'
import { GameSession } from '../game/authoritative-session'
import { markAllWorkersUsed, setActiveWorkerCount } from '../../shared/domain/player'
import { getActiveCardRegistry, requireActiveCardRegistry, setActiveCardRegistry } from '../../shared/cards/active-registry'
import { readCardExtraData } from '../../shared/cards/helpers/card-state'
import type { CardListenerRegistration } from '../../shared/cards/card-listeners'

const LISTENER_CARD = 'X_HandFutureMeepleListener'

const handFutureMeepleListener: CardListenerRegistration = {
  id: 'x-hand-future-meeple-listener',
  cardIds: [LISTENER_CARD],
  zones: ['hand'],
  actions: ['future-meeple-resolved'],
  phases: ['immediatelyAfter'],
  handler: (context) => {
    const resolved = context.transactionEvents.find((event) => event.type === 'futureMeeple.resolved')
    if (!resolved || context.ownerCardZone !== 'hand') return undefined
    return {
      sourceCard: LISTENER_CARD,
      countCardUse: false,
      flow: {
        type: 'leaf',
        actionId: 'special-effect',
        sourceCard: LISTENER_CARD,
        actionContext: { targetPlayerId: context.ownerPlayer?.id },
        params: { kind: 'set-extra-data', key: 'seenFutureMeeple', value: true },
      },
    }
  },
}

describe('future meeple resolved card listener dispatch', () => {
  const setup = () => {
    const outerRegistry = getActiveCardRegistry()
    const session = new GameSession(42)
    requireActiveCardRegistry('future meeple listener test')
      .registerListener(handFutureMeepleListener)
    const state = session.getState().state
    state.players = state.players.slice(0, 2)
    state.round = 1
    state.players.forEach((player) => {
      markAllWorkersUsed(state, player)
      setActiveWorkerCount(player, 1)
      player.minorHand = ['__test_placeholder__']
      player.occupationHand = ['__test_placeholder__']
    })

    const playerA = state.players[0]!
    const playerB = state.players[1]!
    playerA.startPlayer = true
    playerB.startPlayer = false
    playerA.name = 'PlayerA'
    playerB.name = 'PlayerB'
    playerA.minorHand = [LISTENER_CARD]
    state.futureMeeples = [{
      id: 'future-sheep',
      cardId: 'X_FutureSheep',
      playerId: playerA.id,
      round: 2,
      actionId: null,
      resources: { sheep: 1 },
    }]
    setActiveWorkerCount(playerB, 0)

    session.loadState(state)
    return { session, outerRegistry }
  }

  it('dispatches resolved future meeple events to hand-zone listeners', () => {
    const { session, outerRegistry } = setup()
    try {
      const resp = session.performRoundEnd()
      const playerA = resp.state.players[0]!
      expect(readCardExtraData<boolean>(playerA, LISTENER_CARD, 'seenFutureMeeple')).toBe(true)
      expect(resp.state.events.some((event) =>
        event.type === 'card.stateChanged'
        && event.sourceCardId === LISTENER_CARD
        && event.key === 'seenFutureMeeple'
        && !Object.hasOwn(event, 'value'),
      )).toBe(true)
    } finally {
      setActiveCardRegistry(outerRegistry)
    }
  })
})
