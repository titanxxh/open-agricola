import { defineMinorCard } from '../../card-source'
import type { CardImpl } from '../../registry'

const CARD_ID = 'CWM106_Ruins'

const cardImpl = {
  effect: {
    id: CARD_ID,
    onBuy: () => ({
      type: 'leaf',
      actionId: 'store-on-card',
      sourceCard: CARD_ID,
      params: { stone: 4 },
    }),
    onHarvestFieldPhase: (_state, player) =>
      (player.cardStates[CARD_ID]?.counters?.stone ?? 0) > 0
        ? { type: 'leaf', actionId: 'take-from-card', sourceCard: CARD_ID, params: { stone: 1 } }
        : undefined,
  },
} satisfies CardImpl

export const CWM106_Ruins = defineMinorCard({
  meta: {
    id: 'CWM106_Ruins',
    name: "Ruins",
    deck: 'CWM',
    number: 106,
    desc: ["Immediately place 4 <STONE> on this card. During each harvest field phase, take 1 <STONE> from it."],
    cost: {
      stone: 4,
    },
    vp: 3,
    prerequisite: "",
    passing: false,
    extraVp: false,
    implemented: true,
    artUrl: '/assets/classic/CWM/CWM106.png',
  },
  presentation: { counters: ['stone'] },
  impl: cardImpl,
})

export const CWM106_Ruins_impl = CWM106_Ruins.impl
