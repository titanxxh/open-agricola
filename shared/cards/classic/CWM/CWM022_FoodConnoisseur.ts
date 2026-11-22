import { defineOccupationCard } from '../../card-source'
import type { CardImpl } from '../../registry'
import { pushToCardStack, getCardStack } from '../../helpers/card-state'
import { isTravelingPlayersSpaceId } from '../../helpers/action-space-categories'

const CARD_ID = 'CWM022_FoodConnoisseur'

const cardImpl = {
  effect: {
    id: CARD_ID,
    onBuy: (_state, player) => {
      pushToCardStack(player, CARD_ID, ['clay', 'vegetable', 'stone', 'grain', 'wood', 'reed'])
    },
  },
  listeners: [
    {
      id: CARD_ID + '-food',
      cardIds: [CARD_ID],
      actionSpaces: 'all',
      phases: ['after'],
      handler: (context) =>
        (['day-laborer', 'fishing'].includes(context.space.id) ||
          isTravelingPlayersSpaceId(context.space.id)) &&
        getCardStack(context.player, CARD_ID).length > 0
          ? {
              sourceCard: CARD_ID,
              flow: { type: 'leaf', actionId: 'pop-card-stack', sourceCard: CARD_ID },
            }
          : undefined,
    },
  ],
} satisfies CardImpl

export const CWM022_FoodConnoisseur = defineOccupationCard({
  meta: {
    id: 'CWM022_FoodConnoisseur',
    name: "Food Connoisseur",
    deck: 'CWM',
    number: 22,
    desc: ["Stack 1 <CLAY>, 1 <VEGETABLE>, 1 <STONE>, 1 <GRAIN>, 1 <WOOD>, and 1 <REED> on this card, from bottom to top. Whenever you use __Day Laborer__, __Fishing__, or __Traveling Players__, take the top good."],
    cost: {},
    vp: 0,
    prerequisite: "",
    players: '1+',
    passing: false,
    extraVp: false,
    implemented: true,
    artUrl: '/assets/classic/CWM/CWM022.png',
  },
  presentation: { stack: true },
  impl: cardImpl,
})

export const CWM022_FoodConnoisseur_impl = CWM022_FoodConnoisseur.impl
