import { defineMinorCard } from '../card-source'
import type { ActionFlow, Resource } from '../../contract/types'
import type { CardImpl } from '../registry'
import { createPartialTakeFromSpaceLeaf } from '../helpers/partial-take'

const CARD_ID = 'B081_Handcart'
const THRESHOLDS: Record<string, number> = {
  wood: 6,
  clay: 5,
  reed: 4,
  stone: 4,
}

const BUILDING_RESOURCES: (keyof Resource)[] = ['wood', 'clay', 'reed', 'stone']

const cardImpl = {
  effect: {
  id: CARD_ID,
  onBeforeWork: (state, _player) => {

    const choices: ActionFlow[] = []
    for (const space of state.actionSpaces) {
      for (const resource of BUILDING_RESOURCES) {
        const threshold = THRESHOLDS[resource]
        if (!threshold) continue
        if ((space.gainPerRound[resource] ?? 0) <= 0) continue
        if ((space.resources[resource] ?? 0) < threshold) continue
        choices.push(createPartialTakeFromSpaceLeaf({
          sourceCard: CARD_ID,
          spaceId: space.id,
          spaceName: space.nameKey,
          resource,
        }))
      }
    }

    if (choices.length === 0) return

    return {
      type: 'xor',
      optional: true,
      children: choices,
    }
  },
},
  reaches: [] as readonly string[],
} satisfies CardImpl

export const B081_Handcart = defineMinorCard({
  meta: {
    id: CARD_ID,
    name: 'Handcart',
    deck: 'B',
    number: 81,
    category: 'BUILDING_RESOURCE_PROVIDER',
    desc: ['Before each work phase, you can take 1 building resource from at most one <WOOD>/<CLAY>/<REED>/<STONE> accumulation space containing at least 6/5/4/4 building resources of the same type.'],
    cost: { wood: 1 },
    evenMoreSet: true,
  },
  impl: cardImpl,
})

export const B081_Handcart_impl = B081_Handcart.impl
