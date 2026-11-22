import { defineMinorCard } from '../../card-source'
import type { CardImpl } from '../../registry'
import { gainLeaf, payGainActionFlow } from '../../helpers/pay-gain-node'

const CARD_ID = 'CWM072_Crib'

const cardImpl = {
  effect: {
    id: CARD_ID,
    onAllWorkersPlaced: (state, player) =>
      state.events.some(
        (e) =>
          e.round === state.round &&
          e.type === 'worker.placed' &&
          e.actorPlayerId === player.id &&
          e.sourceActionId === 'family-growth',
      )
        ? {
            type: 'xor',
            optional: true,
            children: [
              gainLeaf(CARD_ID, { food: 2 }),
              payGainActionFlow({ cardId: CARD_ID, cost: { food: 2 }, gain: { score: 1 } }),
            ],
          }
        : undefined,
  },
} satisfies CardImpl

export const CWM072_Crib = defineMinorCard({
  meta: {
    id: 'CWM072_Crib',
    name: "Crib",
    deck: 'CWM',
    number: 72,
    desc: ["At the end of each work phase, if you took a Family Growth action that round, you may either get 2 food or pay 2 food for 1 bonus point."],
    cost: {
      wood: 1,
    },
    vp: 0,
    prerequisite: "",
    passing: false,
    extraVp: false,
    implemented: true,
    artUrl: '/assets/classic/CWM/CWM072.png',
  },
  impl: cardImpl,
})

export const CWM072_Crib_impl = CWM072_Crib.impl
