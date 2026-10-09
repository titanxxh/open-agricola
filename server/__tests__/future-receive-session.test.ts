import { describe, expect, it } from 'vitest'
import { GameSession } from '../game/authoritative-session'
import { markAllWorkersUsed, setActiveWorkerCount } from '../../shared/domain/player'
import { getActiveCardRegistry, requireActiveCardRegistry, setActiveCardRegistry } from '../../shared/cards/active-registry'
import { readCardExtraData } from '../../shared/cards/helpers/card-state'
import type { CardListenerRegistration } from '../../shared/cards/card-listeners'

const RECEIVE_CARD = 'X_FutureReceiveProbe'
const GAIN_CARD = 'X_FutureGainProbe'

const receiveProbe: CardListenerRegistration = {
  id: 'x-future-receive-probe',
  cardIds: [RECEIVE_CARD],
  zones: ['played'],
  actions: ['receive'],
  phases: ['after'],
  handler: (context) => {
    const sources = context.transactionEvents
      .filter((event) =>
        event.type === 'resource.moved' &&
        event.reason === 'receive' &&
        event.to.kind === 'player' &&
        event.to.playerId === context.player.id,
      )
      .map((event) => event.sourceCardId)
    if (sources.length === 0) return
    return {
      sourceCard: RECEIVE_CARD,
      countCardUse: false,
      flow: {
        type: 'leaf',
        actionId: 'special-effect',
        sourceCard: RECEIVE_CARD,
        actionContext: { targetPlayerId: context.player.id },
        params: {
          kind: 'set-extra-data',
          key: 'receiveBatch',
          value: {
            actionId: context.actionId,
            count: sources.length,
            sources,
          },
        },
      },
    }
  },
}

const gainProbe: CardListenerRegistration = {
  id: 'x-future-gain-probe',
  cardIds: [GAIN_CARD],
  zones: ['played'],
  actions: ['gain'],
  phases: ['after'],
  handler: (context) => ({
    sourceCard: GAIN_CARD,
    countCardUse: false,
    flow: {
      type: 'leaf',
      actionId: 'special-effect',
      sourceCard: GAIN_CARD,
      actionContext: { targetPlayerId: context.player.id },
      params: { kind: 'set-extra-data', key: 'gainTriggered', value: context.actionId },
    },
  }),
}

describe('future receive round-start resources', () => {
  const setup = () => {
    const outerRegistry = getActiveCardRegistry()
    const session = new GameSession(42)
    const registry = requireActiveCardRegistry('future receive test')
    registry.registerListener(receiveProbe)
    registry.registerListener(gainProbe)
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
    playerA.minorPlayed.push(RECEIVE_CARD, GAIN_CARD)
    setActiveWorkerCount(playerB, 0)
    state.futureMeeples = [
      {
        id: 'future-wood',
        cardId: 'X_FutureWood',
        playerId: playerA.id,
        round: 2,
        actionId: null,
        resources: { wood: 1 },
      },
      {
        id: 'future-clay',
        cardId: 'X_FutureClay',
        playerId: playerA.id,
        round: 2,
        actionId: null,
        resources: { clay: 2 },
      },
    ]

    session.loadState(state)
    return { session, outerRegistry }
  }

  it('batches same-player same-round resources as one receive transaction without gain dispatch', () => {
    const { session, outerRegistry } = setup()
    try {
      const resp = session.performRoundEnd()
      const playerA = resp.state.players[0]!

      expect(playerA.resources.wood).toBe(1)
      expect(playerA.resources.clay).toBe(2)
      expect(readCardExtraData(playerA, RECEIVE_CARD, 'receiveBatch')).toEqual({
        actionId: 'receive',
        count: 2,
        sources: ['X_FutureWood', 'X_FutureClay'],
      })
      expect(readCardExtraData(playerA, GAIN_CARD, 'gainTriggered')).toBeUndefined()
    } finally {
      setActiveCardRegistry(outerRegistry)
    }
  })
})
