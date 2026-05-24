import { futureMeeplesNode } from '../../actions/effects/internal/future-meeples'
import type { ActionFlow, GameState, PlayerState } from '../../contract/types'
import type { GameEvent } from '../../contract/events'
import { payLeaf } from '../helpers/pay-gain-node'
import { readCardExtraData } from '../helpers/card-state'
import type { CardImpl } from '../registry'
import { B93_Confidant } from '../../cards-display/B/B93_Confidant'

const CARD_ID = B93_Confidant.id

const countChoices = (state: GameState, player: PlayerState): ActionFlow[] => {
  const max = Math.max(2, Math.min(14 - state.round, 4))
  return Array.from({ length: max - 1 }, (_, index) => {
    const count = index + 2
    return {
      type: 'seq' as const,
      children: [
        payLeaf({ cardId: CARD_ID, cost: { food: count } }),
        futureMeeplesNode({
          cardId: CARD_ID,
          playerId: player.id,
          startRound: state.round + 1,
          count,
          resources: { food: 1 },
        }),
      ],
    }
  })
}

const isResolvedConfidantMeeple = (
  event: GameEvent,
  player: PlayerState,
  round: number,
) =>
  event.type === 'futureMeeple.resolved' &&
  event.cardId === CARD_ID &&
  event.playerId === player.id &&
  event.round === round

const receiveFlow = (round: number): ActionFlow => ({
  type: 'seq',
  children: [
    {
      type: 'leaf',
      actionId: 'special-effect',
      sourceCard: CARD_ID,
      params: { kind: 'set-extra-data', key: 'lastResolvedRound', value: round },
    },
    {
      type: 'xor',
      optional: true,
      children: [
        {
          type: 'leaf',
          actionId: 'sow',
          sourceCard: CARD_ID,
          actionContext: { trueAction: false },
        },
        {
          type: 'leaf',
          actionId: 'fence',
          sourceCard: CARD_ID,
          actionContext: {
            trueAction: false,
            fencePolicy: { costPolicy: { fence: { wood: 1 } } },
          },
        },
      ],
    },
  ],
})

export const B93_Confidant_impl = {
  effect: {
  id: CARD_ID,
  onBuy: (state, player) => {
    return {
      type: 'xor' as const,
      optional: true,
      children: countChoices(state, player),
    }
  },
  onRoundStart: (state, player) => {
    if (readCardExtraData<number>(player, CARD_ID, 'lastResolvedRound') === state.round) return
    if (!state.events.some((event) => isResolvedConfidantMeeple(event, player, state.round))) return
    return receiveFlow(state.round)
  },
},
  reaches: [] as readonly string[],
} satisfies CardImpl
