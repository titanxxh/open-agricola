import { defineMinorCard } from '../../card-source'
import type { CardImpl } from '../../registry'
import { gainLeaf, bonusVpLeaf } from '../../helpers/pay-gain-node'
import { hasNoUnusedFarmyardSpaces } from '../../../domain/farm'
import { isCardFlagged } from '../../helpers/card-state'

const CARD_ID = 'CFL009_EbonyShoe'

const cardImpl = {
  effect: {
    id: CARD_ID,
    onBuy: (state) => {
      const clay = [1, 3, 6, 9].filter((rounds) => 14 - state.round >= rounds).length
      if (clay > 0) return gainLeaf(CARD_ID, { clay })
    },
  },
  listeners: [
    {
      id: CARD_ID + '-full-farm',
      cardIds: [CARD_ID],
      events: ['farm.spacesUsed'],
      phases: ['after'],
      scope: 'any',
      handler: (context) => {
        const owner = context.ownerPlayer ?? context.player
        const actor = context.triggerPlayer ?? context.player
        if (isCardFlagged(owner, CARD_ID) || !hasNoUnusedFarmyardSpaces(actor)) return
        return {
          flow: {
            type: 'seq',
            targetPlayerId: owner.id,
            children: [
              {
                type: 'leaf',
                actionId: 'special-effect',
                sourceCard: CARD_ID,
                params: { kind: 'set-flag', flag: true },
              },
              {
                ...bonusVpLeaf(CARD_ID, 3),
                targetPlayerId: actor.id,
                actionContext: { targetPlayerId: actor.id },
              },
            ],
          },
        }
      },
    },
  ],
} satisfies CardImpl

export const CFL009_EbonyShoe = defineMinorCard({
  meta: {
    id: 'CFL009_EbonyShoe',
    name: 'Ebony Shoe',
    deck: 'CFL',
    number: 9,
    cost: {
      wood: 1,
    },
    extraVp: true,
    desc: [
      'When you play this card, if at least 1/3/6/9 rounds remain, you get 1/2/3/4 <CLAY>. The next player to use all their farmyard spaces gets 3 bonus points.',
    ],
    implemented: true,
    artUrl: 'assets/classic/CFL/CFL009.png',
  },
  presentation: { counters: ['bonusVp'] },
  impl: cardImpl,
})
