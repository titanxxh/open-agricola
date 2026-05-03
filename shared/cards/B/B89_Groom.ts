import { Occupation } from '../types'
import { gainLeaf } from '../helpers/pay-gain-node'
import type { CardImpl } from '../registry'

const CARD_ID = 'B89_Groom'

export const B89_Groom = new Occupation({
  id: CARD_ID,
  name: 'Groom',
  deck: 'B',
  number: 89,
  category: 'FARM_PLANNER',
  desc: [
    'When you play this card, immediately get 1 <WOOD>. Once you live in a stone house, at the start of each round, you can build exactly 1 stable for 1 <WOOD>.',
  ],
  cost: {},
  players: '1+',
})

export const B89_Groom_impl = {
  effect: {
  id: CARD_ID,
  onBuy: () => {
    return gainLeaf(CARD_ID, { wood: 1 })
  },
  onBeforeStartOfTurn: (_state, player) => {
    if (player.houseType !== 'stone') return
    // BGA L41-52: stables action with args costs={WOOD=>1, max=>1}; payability
    // is checked when the player chooses to act, not at trigger emission, so
    // we don't gate on `player.resources.wood < 1` here.
    return {
      type: 'leaf' as const,
      actionId: 'stables',
      sourceCard: CARD_ID,
      optional: true,
      actionContext: {
        max: 1,
        costOverride: { wood: 1 },
      },
    }
  },
},
  reaches: [] as readonly string[],
} satisfies CardImpl
