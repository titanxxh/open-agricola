import { defineOccupationCard } from '../../card-source'
import type { CardImpl } from '../../registry'
import { constructUnitDiscountTrade } from '../../helpers/construct-cost'

const CARD_ID = 'CWM027_Heiress'

const cardImpl = {
  effect: {
    id: CARD_ID,
    stageEligibility: {
      onRoundStart: (state, player) =>
        (state.round === 6 && player.houseType === 'wood') ||
        (state.round === 10 && player.houseType === 'clay') ||
        (state.round === 13 && player.houseType === 'stone'),
    },
    onRoundStart: (state, player) =>
      (state.round === 6 && player.houseType === 'wood') ||
      (state.round === 10 && player.houseType === 'clay') ||
      (state.round === 13 && player.houseType === 'stone')
        ? {
            type: 'leaf',
            actionId: 'construct',
            optional: true,
            sourceCard: CARD_ID,
            actionContext: { max: 1, targetFarmPolicy: 'own' },
          }
        : undefined,
  },
  listeners: [
    {
      id: CARD_ID + '-room-price',
      cardIds: [CARD_ID],
      actions: ['construct'],
      phases: ['computeCosts'],
      handler: (context) =>
        context.sourceCard === CARD_ID && context.player.houseType !== 'wood'
          ? {
              trades: [
                constructUnitDiscountTrade(CARD_ID, {
                  [context.player.houseType]: context.player.houseType === 'clay' ? 1 : 2,
                }),
              ],
            }
          : undefined,
    },
  ],
} satisfies CardImpl

export const CWM027_Heiress = defineOccupationCard({
  meta: {
    id: 'CWM027_Heiress',
    name: "Heiress",
    deck: 'CWM',
    number: 27,
    desc: ["At the start of round 6, 10, and 13, if you live in a wooden house, clay house, or stone house, respectively, you may build 1 room at its normal cost, reduced by 1 <CLAY> for a clay room or 2 <STONE> for a stone room."],
    cost: {},
    vp: 0,
    prerequisite: "",
    players: '1+',
    passing: false,
    extraVp: false,
    implemented: true,
    artUrl: '/assets/classic/CWM/CWM027.png',
  },
  impl: cardImpl,
})

export const CWM027_Heiress_impl = CWM027_Heiress.impl
