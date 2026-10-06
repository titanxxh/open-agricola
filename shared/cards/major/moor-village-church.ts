import { defineMajorCard } from '../card-source'
import type { CardSourceMetaInput } from '../card-source'
import type { CardImpl } from '../registry'
import { gainLeaf, payLeaf } from '../helpers/pay-gain-node'
import type { GameState, PlayerState } from '../../contract/types'

const CARD_ID = 'Major_Moor_VillageChurch'

const cardImpl = {
  effect: {
    id: CARD_ID,
    onBuy: () => gainLeaf(CARD_ID, { food: 2 }),
    onHarvest: (_state: GameState, player: PlayerState) => {
      if ((player.resources.fuel ?? 0) < 1) return
      return {
        type: 'seq' as const,
        optional: true,
        children: [
          payLeaf({ cardId: CARD_ID, cost: { fuel: 1 } }),
          { type: 'leaf' as const, actionId: 'bonus-vp' as const, sourceCard: CARD_ID },
        ],
      }
    },
  },
} satisfies CardImpl

export const Major_Moor_VillageChurch = defineMajorCard({
  meta: {
    id: CARD_ID,
    name: 'Village Church',
    deck: 'major',
    number: 111,
    category: 'POINTS_PROVIDER',
    cost: { wood: 2, stone: 4 },
    vp: 4,
    extraVp: true,
    requiresFarmersOfTheMoor: true,
    desc: [
      '[Harvest]',
      '1<FUEL> <ARROW-1X> 1<SCORE>',
      'Immediately gain 2<FOOD>.',
    ],
  } satisfies CardSourceMetaInput,
  presentation: { counters: ['bonusVp'] },
  impl: cardImpl,
})
