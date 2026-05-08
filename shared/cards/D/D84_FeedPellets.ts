import { MinorImprovement } from '../types'
import { payLeaf, gainLeaf } from '../helpers/pay-gain-node'
import type { ActionFlow } from '../../contract/types'
import type { CardImpl } from '../registry'

const CARD_ID = 'D84_FeedPellets'

const ANIMAL_TYPES = ['sheep', 'boar', 'cattle'] as const

export const D84_FeedPellets = new MinorImprovement({
  id: CARD_ID,
  name: "Feed Pellets",
  deck: "D",
  number: 84,
  category: "LIVESTOCK_PROVIDER",
  desc: ['When you play this card, you immediately get 1 <SHEEP>. In the feeding phase of each harvest, you can exchange exactly 1 <VEGETABLE> for 1 animal of a type you already have.'],
  cost: {},
})

export const D84_FeedPellets_impl = {
  effect: {
  id: CARD_ID,
  onBuy: () => gainLeaf(CARD_ID, { sheep: 1 }),
  onHarvestFeedingPhase: (_state, player) => {
    if (player.resources.vegetable < 1) return
    const ownedTypes = ANIMAL_TYPES.filter(t => player.resources[t] > 0)
    if (ownedTypes.length === 0) return
    const children: ActionFlow[] = ownedTypes.map(type => ({
      type: 'seq' as const,
      children: [
        payLeaf({ cardId: CARD_ID, cost: { vegetable: 1 } }),
        gainLeaf(CARD_ID, { [type]: 1 }),
      ],
      choiceLabelKey: 'ui.interactionResourceExchange',
      choiceLabelParams: { resourcesPaid: { vegetable: 1 }, resourcesGained: { [type]: 1 } },
    }))
    if (children.length === 1) {
      return {
        ...children[0]!,
        optional: true,
      } as ActionFlow
    }
    return {
      type: 'xor',
      optional: true,
      children,
    } as ActionFlow
  },
},
  reaches: [] as readonly string[],
} satisfies CardImpl
