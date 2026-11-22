import { defineMinorCard } from '../../card-source'
import type { CardImpl } from '../../registry'
import { payGainFlow, gainLeaf } from '../../helpers/pay-gain-node'

const CARD_ID = 'CWM079_FestivalHall'

const cardImpl = {
  effect: {
    id: CARD_ID,
    onEndHarvestFieldPhase: () =>
      payGainFlow({
        cardId: CARD_ID,
        cost: { grain: 1 },
        gain: { food: 2 },
        followUp: [
          {
            type: 'xor',
            children: ['wood', 'clay', 'reed', 'stone'].map((resource) =>
              gainLeaf(CARD_ID, { [resource]: 1 }),
            ),
          },
        ],
      }),
  },
} satisfies CardImpl

export const CWM079_FestivalHall = defineMinorCard({
  meta: {
    id: 'CWM079_FestivalHall',
    name: "Festival Hall",
    deck: 'CWM',
    number: 79,
    desc: ["After each harvest field phase, you may convert at most 1 <GRAIN> into 2 <FOOD> and 1 building resource of your choice. Card <FIELD> count toward the prerequisite; an extra field phase supplied by a card does not trigger this effect."],
    cost: {
      wood: 1,
      clay: 1,
    },
    vp: 1,
    prerequisite: "2 grain fields",
    passing: false,
    extraVp: false,
    implemented: true,
    artUrl: '/assets/classic/CWM/CWM079.png',
  },
  impl: cardImpl,
})

export const CWM079_FestivalHall_impl = CWM079_FestivalHall.impl
