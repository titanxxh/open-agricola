import { defineOccupationCard } from '../card-source'
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

const cardImpl = {
  listeners: [listener],
  reaches: [] as readonly string[],
} satisfies CardImpl

export const C153_PatternMaker = defineOccupationCard({
  meta: {
    id: CARD_ID,
    name: 'Pattern Maker',
    deck: 'C',
    number: 153,
    category: 'POINTS_PROVIDER',
    desc: [
        'Each time another player renovates, you can exchange exactly 2 <WOOD> for 1 <GRAIN>, 1 <FOOD>, and 1 bonus <SCORE>.',
      ],
    cost: {},
    players: '4+',
    extraVp: true,
    waresSalesmanGains: [{ wood: 1, reed: 1 }],
  },
  impl: cardImpl,
})

export const C153_PatternMaker_impl = C153_PatternMaker.impl
