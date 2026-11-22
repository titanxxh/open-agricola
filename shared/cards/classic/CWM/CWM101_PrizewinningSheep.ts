import { defineMinorCard } from '../../card-source'
import type { CardImpl } from '../../registry'
import { gainLeaf } from '../../helpers/pay-gain-node'

const CARD_ID = 'CWM101_PrizewinningSheep'

const cardImpl = {
  effect: {
    id: CARD_ID,
    onBuy: () => ({
      type: 'xor',
      children: ['wood', 'clay', 'reed', 'stone'].map((resource) =>
        gainLeaf(CARD_ID, { [resource]: 1 }),
      ),
    }),
  },
} satisfies CardImpl

export const CWM101_PrizewinningSheep = defineMinorCard({
  meta: {
    id: 'CWM101_PrizewinningSheep',
    name: "Prizewinning Sheep",
    deck: 'CWM',
    number: 101,
    desc: ["Immediately get 1 building resource of your choice. Afterwards, pass this card to the next player, who adds it to their hand."],
    cost: {},
    vp: 0,
    prerequisite: "1 sheep",
    passing: true,
    extraVp: false,
    implemented: true,
    artUrl: '/assets/classic/CWM/CWM101.png',
  },
  impl: cardImpl,
})

export const CWM101_PrizewinningSheep_impl = CWM101_PrizewinningSheep.impl
