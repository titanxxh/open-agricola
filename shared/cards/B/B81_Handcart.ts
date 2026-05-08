import { MinorImprovement } from '../types'
import type { ActionFlow, Resource } from '../../contract/types'
import type { CardImpl } from '../registry'

const CARD_ID = 'B81_Handcart'

// B81 Handcart: Before each work phase, you can take 1 building resource from at most
// one accumulation space containing at least 6 wood / 5 clay / 4 reed / 4 stone.
// BGA: startOfWork -> we use onRoundStart.
// Like A82_WorkCertificate, we gain from general supply.

const THRESHOLDS: Record<string, number> = {
  wood: 6,
  clay: 5,
  reed: 4,
  stone: 4,
}

const BUILDING_RESOURCES: (keyof Resource)[] = ['wood', 'clay', 'reed', 'stone']

export const B81_Handcart = new MinorImprovement({
  id: CARD_ID,
  name: 'Handcart',
  deck: 'B',
  number: 81,
  category: 'BUILDING_RESOURCE_PROVIDER',
  desc: ['Before each work phase, you can take 1 building resource from at most one <WOOD>/<CLAY>/<REED>/<STONE> accumulation space containing at least 6/5/4/4 building resources of the same type.'],
  cost: { wood: 1 },
  evenMoreSet: true,
})

export const B81_Handcart_impl = {
  effect: {
  id: CARD_ID,
  onRoundStart: (state, _player) => {

    const choices: ActionFlow[] = []
    for (const space of state.actionSpaces) {
      for (const resource of BUILDING_RESOURCES) {
        const threshold = THRESHOLDS[resource]
        if (!threshold) continue
        if ((space.gainPerRound[resource] ?? 0) <= 0) continue
        if ((space.resources[resource] ?? 0) < threshold) continue
        choices.push({
          type: 'leaf',
          actionId: 'gain',
          params: { [resource]: 1 },
          sourceCard: CARD_ID,
          choiceLabelKey: 'ui.interactionTakeFromSpace',
          choiceLabelParams: { resource, spaceId: space.id, spaceName: space.nameKey },
        })
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
