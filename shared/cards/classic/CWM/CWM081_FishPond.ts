import { defineMinorCard } from '../../card-source'
import type { CardImpl } from '../../registry'
import { farmTokenSelection } from '../../helpers/farm-token-selection'
import { payGainActionFlow } from '../../helpers/pay-gain-node'
import { createEventQuery } from '../../../events/query'

const CARD_ID = 'CWM081_FishPond'

const token = farmTokenSelection(CARD_ID, { clay: 1 })
const cardImpl = {
  prerequisiteCheck: (player) => token.candidates(player).length > 0,
  effect: {
    id: CARD_ID,
    onBuy: (_state, player) => token.flow(player),
    computeBonusScore: (_state, player) => {
      const count = player.cardStates[CARD_ID]?.counters?.food ?? 0
      return count >= 8 ? 4 : count >= 6 ? 3 : count >= 4 ? 2 : count >= 1 ? 1 : -1
    },
  },
  listeners: [
    {
      id: CARD_ID + '-store-fish',
      cardIds: [CARD_ID],
      actions: ['collect'],
      phases: ['after'],
      handler: (context) => {
        if (context.space.id !== 'fishing') return
        const food = createEventQuery(context.actionEvents ?? [])
          .filter('resource.moved')
          .filter(
            (e) =>
              e.from.kind === 'actionSpace' &&
              e.from.spaceId === 'fishing' &&
              e.to.kind === 'player' &&
              e.to.playerId === context.player.id,
          )
          .reduce((sum, e) => sum + (e.resources.food ?? 0), 0)
        if (!food) return
        return {
          sourceCard: CARD_ID,
          flow: {
            type: 'xor',
            optional: true,
            children: Array.from(
              { length: Math.min(food, context.player.resources.food) },
              (_, i) =>
                payGainActionFlow({
                  cardId: CARD_ID,
                  cost: { food: i + 1 },
                  followUp: [
                    {
                      type: 'leaf',
                      actionId: 'store-on-card',
                      sourceCard: CARD_ID,
                      params: { food: i + 1 },
                    },
                  ],
                }),
            ),
          },
        }
      },
    },
  ],
} satisfies CardImpl

export const CWM081_FishPond = defineMinorCard({
  meta: {
    id: 'CWM081_FishPond',
    name: "Fish Pond",
    deck: 'CWM',
    number: 81,
    desc: ["Place 1 clay from the supply on an unused farmyard space, which then counts as used. Whenever you use Fishing, you may put any of the food originally accumulated there on this card. At the end of the game, at least 0, 1, 4, 6, or 8 food here gives -1, 1, 2, 3, or 4 bonus points, respectively. Returning this card removes its clay marker and stored food."],
    cost: {
      wood: 1,
    },
    vp: 0,
    prerequisite: "1 unused farmyard space",
    passing: false,
    extraVp: true,
    implemented: true,
    artUrl: '/assets/classic/CWM/CWM081.png',
  },
  presentation: { counters: ['food'] },
  impl: cardImpl,
})

export const CWM081_FishPond_impl = CWM081_FishPond.impl
