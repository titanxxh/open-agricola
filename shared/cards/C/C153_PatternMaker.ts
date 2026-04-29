import { Occupation } from '../types'
import type { CardListenerRegistration } from '../card-listeners'
import type { ActionHookPhase, ActionHookResult } from '../../actions/hooks'
import { payLeaf, gainLeaf } from '../helpers/pay-gain-node'
import type { CardImpl } from '../registry'

const CARD_ID = 'C153_PatternMaker'

/**
 * C153 Pattern Maker:
 * Each time another player renovates, the card owner can optionally
 * pay 2 wood to get 1 grain + 1 food + 1 bonus VP.
 */
const listener: CardListenerRegistration = {
  id: 'C153-pattern-maker-opponent-renovate',
  cardIds: [CARD_ID],
  actions: ['renovate-house'],
  phases: ['after' as ActionHookPhase],
  scope: 'opponent',
  handler: (): ActionHookResult | void => {
    return {
      flow: {
        type: 'seq',
        optional: true,
        children: [
          payLeaf({
            cardId: CARD_ID,
            cost: { wood: 2 },
            choiceLabelKey: 'ui.interactionResourceExchange',
            choiceLabelParams: {
              resourcesPaid: { wood: 2 },
              resourcesGained: { grain: 1, food: 1 },
              bonusVp: 1,
            },
          }),
          {
            type: 'leaf',
            actionId: 'bonus-vp',
            sourceCard: CARD_ID,
          },
          gainLeaf(CARD_ID, { grain: 1, food: 1 }),
        ],
      },
      sourceCard: CARD_ID,
    }
  },
}

export const C153_PatternMaker = new Occupation({
  id: CARD_ID,
  name: 'Pattern Maker',
  deck: 'C',
  number: 153,
  category: 'BONUS_POINT_GENERATOR',
  desc: [
    'Each time another player renovates, you can exchange exactly 2 <WOOD> for 1 <GRAIN>, 1 <FOOD>, and 1 bonus <SCORE>.',
  ],
  cost: {},
  players: '4+',
})

export const C153_PatternMaker_impl = {
  listeners: [listener],
  reaches: [] as readonly string[],
} satisfies CardImpl
