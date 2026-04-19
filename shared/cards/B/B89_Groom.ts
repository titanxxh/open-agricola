import { Occupation } from '../types'
import { registerCardEffect } from '../card-effects'
import { gainLeaf } from '../helpers/pay-gain-node'

const CARD_ID = 'B89_Groom'

/**
 * B89 Groom
 * When you play this card, immediately get 1 wood.
 * Once you live in a stone house, at the start of each round,
 * you can build exactly 1 stable for 1 wood.
 *
 * BGA: onBuy → gain 1 wood. onPlayerStartOfTurn → optional stables action
 * with max 1 and cost 1 wood.
 *
 * In open-agricola the "start of turn" corresponds to onBeforeStartOfTurn.
 * We return an optional pay-then-build-stable flow.
 */

registerCardEffect({
  id: CARD_ID,
  onBuy: () => {
    return gainLeaf(CARD_ID, { wood: 1 })
  },
  onBeforeStartOfTurn: (_state, player) => {
    if (player.houseType !== 'stone') return
    if (player.resources.wood < 1) return

    // Optional: pay 1 wood, build 1 stable
    return {
      type: 'seq',
      optional: true,
      promptKey: 'log.cardEffect',
      children: [
        {
          type: 'leaf',
          actionId: 'pay-resources',
          params: { wood: 1 },
          sourceCard: CARD_ID,
        },
        {
          type: 'leaf',
          actionId: 'stables',
          params: { max: 1 },
          sourceCard: CARD_ID,
        },
      ],
    }
  },
})

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
