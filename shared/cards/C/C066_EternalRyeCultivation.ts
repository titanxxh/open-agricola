import { defineMinorCard } from '../card-source'
import type { ActionFlow } from '../../contract/types'
import type { CardImpl } from '../registry'

const CARD_ID = 'C066_EternalRyeCultivation'

const cardImpl = {
  effect: {
  id: CARD_ID,
  onAfterHarvest: (_state, player) => {

    const grain = player.resources.grain
    let flow: ActionFlow | null = null

    if (grain >= 3) {
      flow = {
        type: 'leaf',
        actionId: 'gain',
        params: { grain: 1 },
        sourceCard: CARD_ID,
      }
    } else if (grain === 2) {
      flow = {
        type: 'leaf',
        actionId: 'gain',
        params: { food: 1 },
        sourceCard: CARD_ID,
      }
    }

    return flow ?? undefined
  },
},
  reaches: [] as readonly string[],
} satisfies CardImpl

export const C066_EternalRyeCultivation = defineMinorCard({
  meta: {
    id: CARD_ID,
    name: "Eternal Rye Cultivation",
    deck: "C",
    number: 66,
    category: "CROP_PROVIDER",
    desc: ["After each harvest in which you have 2 or 3+ <GRAIN> in your supply, you get 1 <FOOD> or 1 additional <GRAIN>, respectively."],
    cost: {},
    prerequisite: "1 Grain Field",
  },
  impl: cardImpl,
})

export const C066_EternalRyeCultivation_impl = C066_EternalRyeCultivation.impl
