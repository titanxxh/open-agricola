import { defineMinorCard } from '../card-source'
import { gainLeaf } from '../helpers/pay-gain-node'
import { familySize } from '../../domain/player'
import type { ActionFlow } from '../../contract/types'
import type { CardImpl } from '../registry'

const CARD_ID = 'B022_WalkingBoots'

const cardImpl = {
  prerequisiteCheck: (player) => familySize(player) <= 4,
  effect: {
    id: CARD_ID,
    onBuy: (_state, _player): ActionFlow => ({
      type: 'seq',
      children: [
        gainLeaf(CARD_ID, { food: 2 }),
        {
          type: 'leaf',
          actionId: 'place-farmer',
          sourceCard: CARD_ID,
          actionContext: {
            trueAction: false,
            extraPlacement: true,
            workerSource: { kind: 'supply', disposition: 'remove-from-game' },
          },
        },
      ],
    }),
  },
  reaches: [] as readonly string[],
} satisfies CardImpl

export const B022_WalkingBoots = defineMinorCard({
  meta: {
    id: CARD_ID,
    name: 'Walking Boots',
    deck: 'B',
    number: 22,
    category: 'ACTIONS_BOOSTER',
    desc: ['You immediately get 2 <FOOD>. You must immediately place a person from your supply. If you do, in the next returning home phase, you must remove that person from play.'],
    cost: {},
    prerequisite: 'At Most 4 People',
  },
  impl: cardImpl,
})

export const B022_WalkingBoots_impl = B022_WalkingBoots.impl
