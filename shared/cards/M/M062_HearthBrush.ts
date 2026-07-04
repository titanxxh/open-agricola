import { defineMinorCard } from '../card-source'
import type { CardImpl } from '../registry'
import { readCardExtraData } from '../helpers/card-state'
import { isMajorImprovementPlayable } from '../../actions/helpers/improvement-helpers'

const CARD_ID = 'M062_HearthBrush'
const TARGET = 'Major_Moor_TiledOven'

const buildPurchaseFlow = () => ({
  type: 'leaf' as const,
  actionId: 'improvement',
  sourceCard: CARD_ID,
  optional: true,
  params: { types: ['major'], allowedPurchases: [TARGET], trueAction: false },
  actionContext: { trueAction: false },
})

const cardImpl = {
  effect: {
    id: CARD_ID,
    onBuy: (state) => ({
      type: 'seq' as const,
      children: [
        {
          type: 'leaf' as const,
          actionId: 'special-effect',
          sourceCard: CARD_ID,
          params: { kind: 'set-extra-data', key: 'playedRound', value: state.round },
        },
        {
          type: 'leaf' as const,
          actionId: 'special-effect',
          sourceCard: CARD_ID,
          params: { kind: 'move-major-improvement-to-top', cardId: TARGET },
        },
      ],
    }),
    onEndTurn: (state, player, ctx) => {
      if (ctx?.triggerActionId !== 'place-farmer') return
      const playedRound = readCardExtraData<number>(player, CARD_ID, 'playedRound')
      if (playedRound === undefined || state.round <= playedRound) return
      if (!isMajorImprovementPlayable(state, player, TARGET, CARD_ID, [TARGET])) return
      return buildPurchaseFlow()
    },
    computeBonusScore: (_state, player) => player.improvements.includes(TARGET) ? 1 : 0,
  },
  reaches: [TARGET],
} satisfies CardImpl

export const M062_HearthBrush = defineMinorCard({
  meta: {
    id: CARD_ID,
    name: "Hearth Brush",
    deck: "M",
    number: 62,
    category: "POINTS_PROVIDER",
    desc: [
        "You can immediately move up the Tiled Oven. From the next round on, you can build it immediately after a person action by paying its cost. During scoring, it is worth 1 additional bonus <SCORE> for you."
    ],
    cost: {
        "reed": 1
    },
    extraVp: true,
    implemented: true,
    requiresFarmersOfTheMoor: true,
  },
  impl: cardImpl,
})

export const M062_HearthBrush_impl = M062_HearthBrush.impl
