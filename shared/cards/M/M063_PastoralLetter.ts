import { defineMinorCard } from '../card-source'
import type { CardImpl } from '../registry'
import { readCardExtraData } from '../helpers/card-state'
import { isMajorImprovementPlayable } from '../../actions/helpers/improvement-helpers'

const CARD_ID = 'M063_PastoralLetter'
const TARGET = 'Major_Moor_VillageChurch'
const CHURCH = 'M068_Church'

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
    computeBonusScore: (_state, player) =>
      (player.improvements.includes(TARGET) ? 1 : 0) +
      (player.minorPlayed.includes(CHURCH) ? 1 : 0),
  },
  reaches: [TARGET, CHURCH],
} satisfies CardImpl

export const M063_PastoralLetter = defineMinorCard({
  meta: {
    id: CARD_ID,
    name: "Pastoral Letter",
    deck: "M",
    number: 63,
    category: "POINTS_PROVIDER",
    desc: [
        "You can immediately move up the Village Church. From the next round on, you can build it immediately after a person action by paying its cost. During scoring, the Church and Village Church are each worth 1 additional bonus point for you."
    ],
    cost: {},
    extraVp: true,
    prerequisite: "2 Major Improvements",
    implemented: true,
    requiresFarmersOfTheMoor: true,
  },
  impl: cardImpl,
})

export const M063_PastoralLetter_impl = M063_PastoralLetter.impl
