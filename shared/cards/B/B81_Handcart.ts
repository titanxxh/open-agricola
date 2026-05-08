import type { ActionFlow, Resource } from '../../contract/types'
import type { CardImpl } from '../registry'
import { B81_Handcart } from '../../cards-display/B/B81_Handcart'

const CARD_ID = B81_Handcart.id

const THRESHOLDS: Record<string, number> = {
  wood: 6,
  clay: 5,
  reed: 4,
  stone: 4,
}

const BUILDING_RESOURCES: (keyof Resource)[] = ['wood', 'clay', 'reed', 'stone']

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
