import { defineMinorCard } from '../../card-source'
import type { CardImpl } from '../../registry'
import { cardResourceWithdrawal } from '../../helpers/card-resource-withdrawal'
import { getLogicalFields } from '../../helpers/card-field'

const CARD_ID = 'CWM083_FreeRangeChickens'

const cardImpl = {
  listeners: [cardResourceWithdrawal(CARD_ID, 'food')],
  effect: {
    id: CARD_ID,
    stageEligibility: {
      onRoundStart: (_state, player) =>
        getLogicalFields(player).some((f) =>
          f.stacks.some((s) => s.kind === 'grain' && s.remaining > 0),
        ),
    },
    onRoundStart: (_state, player) =>
      getLogicalFields(player).some((f) =>
        f.stacks.some((s) => s.kind === 'grain' && s.remaining > 0),
      )
        ? { type: 'leaf', actionId: 'store-on-card', sourceCard: CARD_ID, params: { food: 1 } }
        : undefined,
    computeBonusScore: (_state, player) =>
      Math.min(2, Math.floor((player.cardStates[CARD_ID]?.counters?.food ?? 0) / 3)),
  },
} satisfies CardImpl

export const CWM083_FreeRangeChickens = defineMinorCard({
  meta: {
    id: 'CWM083_FreeRangeChickens',
    name: "Free Range Chickens",
    deck: 'CWM',
    number: 83,
    desc: ["At the start of each round, if you have at least one <GRAIN> <FIELD>, place 1 <FOOD> from the supply on this card. You may take its <FOOD> at any time. At the end of the game, at least 3 or 6 <FOOD> remaining here gives 1 or 2 bonus <SCORE>. Card <FIELD> count as <GRAIN> <FIELD>."],
    cost: {
      wood: 1,
    },
    vp: 0,
    prerequisite: "1 grain field",
    passing: false,
    extraVp: true,
    implemented: true,
    artUrl: '/assets/classic/CWM/CWM083.png',
  },
  presentation: { counters: ['food'] },
  impl: cardImpl,
})

export const CWM083_FreeRangeChickens_impl = CWM083_FreeRangeChickens.impl
