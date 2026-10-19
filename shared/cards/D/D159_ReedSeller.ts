import { defineOccupationCard } from '../card-source'
import type { PlayerState } from '../../contract/types'
import { registerAdHocAction } from '../../actions/helpers/ad-hoc-action-registry'
import { createResourceSaleActions, readResourceSale } from '../../actions/effects/internal/resource-sale'

const CARD_ID = 'D159_ReedSeller'
const SALE_RULE = { resource: 'reed', amount: 1, supplyFood: 3, buyerFood: 2, offerPrompt: 'ui.cards.D159_ReedSeller.offer', buyerPrompt: 'ui.cards.D159_ReedSeller.chooseBuyer' } as const
const START = `card_${CARD_ID}_start`
const RESPOND = `card_${CARD_ID}_respond`
const saleOf = (player: PlayerState) => readResourceSale(player, CARD_ID)
createResourceSaleActions(CARD_ID, SALE_RULE).forEach(registerAdHocAction)

export const D159_ReedSeller = defineOccupationCard({
  meta: {
    id: CARD_ID,
    name: 'Reed Seller',
    deck: 'D',
    number: 159,
    category: 'FOOD_PROVIDER',
    desc: ['At any time, you can turn 1 <REED> into 3 <FOOD>. Any other player can prevent this by buying the <REED> for 2 <FOOD> from you. If multiple players are interested, choose one.'],
    cost: {},
    players: '4+',
  },
  impl: {
    effect: {
      id: CARD_ID,
      projectInteractionRequest: (_state, player, request, actionId) =>
        actionId === RESPOND && request.kind === 'choice' ? {
          ...request,
          options: request.options.map((option) => option.value === 'buy' ? {
            ...option,
            disabled: player.resources.food < SALE_RULE.buyerFood,
            disabledReasonKey: player.resources.food < SALE_RULE.buyerFood ? `cards.${CARD_ID}.buyDisabled` : undefined,
          } : option),
        } : request,
      computeResourceCommitments: (_state, owner) => {
        const sale = saleOf(owner)
        return sale ? [
          { playerId: owner.id, resources: { [SALE_RULE.resource]: SALE_RULE.amount } },
          ...sale.willing.map((playerId) => ({ playerId, resources: { food: SALE_RULE.buyerFood } })),
        ] : []
      },
    },
    listeners: [{
      id: 'D159-reed-seller-anytime', cardIds: [CARD_ID], actions: ['anytime'], phases: ['anytime'],
      handler: ({ player }) => player.resources.reed >= SALE_RULE.amount && !saleOf(player)
        ? { flow: { type: 'leaf', actionId: START, sourceCard: CARD_ID }, sourceCard: CARD_ID }
        : undefined,
    }],
  },
})
