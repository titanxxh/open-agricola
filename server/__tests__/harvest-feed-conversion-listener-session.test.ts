import { describe, expect, it } from 'vitest'
import { GameSession } from '../game/authoritative-session'
import { markAllWorkersUsed, setActiveWorkerCount } from '../../shared/domain/player'
import { getActiveCardRegistry, requireActiveCardRegistry, setActiveCardRegistry } from '../../shared/cards/active-registry'
import { readCardExtraData } from '../../shared/cards/helpers/card-state'
import type { CardListenerRegistration } from '../../shared/cards/card-listeners'
import '../../shared/cards/C/C059_SchnappsDistillery'

const LISTENER_CARD = 'X_HandFeedConversionListener'

const handFeedConversionListener: CardListenerRegistration = {
  id: 'x-hand-feed-conversion-listener',
  cardIds: [LISTENER_CARD],
  zones: ['hand'],
  actions: ['harvest-feed-conversion'],
  phases: ['immediatelyAfter'],
  handler: (context) => {
    const converted = context.transactionEvents.find((event) => event.type === 'harvest.feedConverted')
    if (!converted || context.ownerCardZone !== 'hand') return undefined
    return {
      sourceCard: LISTENER_CARD,
      countCardUse: false,
      flow: {
        type: 'leaf',
        actionId: 'special-effect',
        sourceCard: LISTENER_CARD,
        actionContext: { targetPlayerId: context.ownerPlayer?.id },
        params: { kind: 'set-extra-data', key: 'seenFeedConverted', value: true },
      },
    }
  },
}

describe('harvest feed conversion card listener dispatch', () => {
  const setup = () => {
    const outerRegistry = getActiveCardRegistry()
    const session = new GameSession()
    requireActiveCardRegistry('harvest feed conversion listener test')
      .registerListener(handFeedConversionListener)
    const state = session.getState().state
    state.players = state.players.slice(0, 2)
    state.round = 4
    state.players.forEach((player) => {
      markAllWorkersUsed(state, player)
      setActiveWorkerCount(player, 1)
      player.resources.food = 0
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
    playerA.minorPlayed.push('C059_SchnappsDistillery')
    playerA.resources.vegetable = 1
    setActiveWorkerCount(playerB, 0)

    session.loadState(state)
    return { session, outerRegistry }
  }

  it('dispatches conversion events to hand-zone listeners', () => {
    const { session, outerRegistry } = setup()
    try {
      let resp = session.performRoundEnd()
      if (!(resp.interaction.stateId === 'wait' && resp.interaction.request.kind === 'feed')) {
        throw new Error('expected harvest feed pending')
      }

      resp = session.resolveChoice(0, 'confirm', { selections: [
        {
          sourceId: 'C059_SchnappsDistillery',
          exchangeIndex: 0,
          count: 1,
          sourceName: 'Schnapps Distillery',
        },
      ] })

      const playerA = resp.state.players[0]!
      expect(readCardExtraData<boolean>(playerA, LISTENER_CARD, 'seenFeedConverted')).toBe(true)
      expect(resp.state.events.some((event) =>
        event.type === 'card.stateChanged'
        && event.sourceCardId === LISTENER_CARD
        && event.key === 'seenFeedConverted'
        && !Object.hasOwn(event, 'value'),
      )).toBe(true)
    } finally {
      setActiveCardRegistry(outerRegistry)
    }
  })
})
