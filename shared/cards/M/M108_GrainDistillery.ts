import { defineMinorCard } from '../card-source'
import type { CardImpl } from '../registry'

const CARD_ID = 'M108_GrainDistillery'

const cardImpl = {
  effect: {
    id: CARD_ID,
    computeBonusScore: (_state, player) =>
      Math.min(player.resources.fuel ?? 0, player.resources.grain ?? 0),
  },
  reaches: [] as readonly string[],
} satisfies CardImpl

export const M108_GrainDistillery = defineMinorCard({
  meta: {
    id: CARD_ID,
    name: "Grain Distillery",
    deck: "M",
    number: 108,
    category: "FOOD_PROVIDER",
    desc: [
        "Harvest: once, you can turn 1 <FUEL> and 1 <GRAIN> into 5 <FOOD>. Any number of times during scoring: 1 <FUEL> and 1 <GRAIN> <ARROW> 1 bonus point."
    ],
    cost: {
        "stone": 2,
        "sheep": 1
    },
    vp: 1,
    extraVp: true,
    exchanges: [
        { from: { fuel: 1, grain: 1 }, to: { food: 5 }, max: 1, sourceId: CARD_ID, triggers: ['harvest'] },
      ],
    implemented: true,
    requiresFarmersOfTheMoor: true,
  },
  impl: cardImpl,
})

export const M108_GrainDistillery_impl = M108_GrainDistillery.impl
