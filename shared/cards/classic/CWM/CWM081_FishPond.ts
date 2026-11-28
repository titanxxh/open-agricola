import { createEventQuery } from '../../../events/query'
import { defineMinorCard } from '../../card-source'
import { farmTokenSelection } from '../../helpers/farm-token-selection'
import { payGainActionFlow } from '../../helpers/pay-gain-node'
import type { CardImpl } from '../../registry'

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
      id: `${CARD_ID}-store-fish`,
      cardIds: [CARD_ID],
      actionSpaces: ['fishing'],
      phases: ['after'],
      handler: (context) => {
        const collectedFood = createEventQuery(context.actionEvents ?? [])
          .filter('resource.moved')
          .filter(
            (event) =>
              event.reason === 'collect'
              && event.from.kind === 'actionSpace'
              && event.from.spaceId === 'fishing'
              && event.to.kind === 'player'
              && event.to.playerId === context.player.id,
          )
          .reduce((sum, event) => sum + (event.resources.food ?? 0), 0)
        const maxFood = Math.min(collectedFood, context.player.resources.food ?? 0)
        if (maxFood <= 0) return
        return {
          sourceCard: CARD_ID,
          flow: {
            type: 'xor',
            optional: true,
            children: Array.from({ length: maxFood }, (_, index) =>
              payGainActionFlow({
                cardId: CARD_ID,
                cost: { food: index + 1 },
                followUp: [
                  {
                    type: 'leaf',
                    actionId: 'store-on-card',
                    sourceCard: CARD_ID,
                    params: { food: index + 1 },
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
    id: CARD_ID,
    name: 'Fish Pond',
    deck: 'CWM',
    number: 81,
    cost: { clay: 1 },
    vp: 0,
    extraVp: true,
    prerequisite: '1 Unused space',
    desc: [
      'Place 1 <CLAY> from the general supply on 1 Unused farmyard space. It now counts as used. Whenever you use the __space:fishing|Fishing__ action space, you may place some or all of the <FOOD> on this card. At the end of the game, you receive -1/1/2/3/4 bonus <SCORE> for 0/1/4/6/8 <FOOD> on this card.',
    ],
    artUrl: 'assets/classic/CWM/CWM081.png',
    implemented: true,
  },
  presentation: { counters: ['food'] },
  impl: cardImpl,
})

export const CWM081_FishPond_impl = CWM081_FishPond.impl
