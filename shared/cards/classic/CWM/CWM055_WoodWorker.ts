import { defineOccupationCard } from '../../card-source'
import type { CardImpl } from '../../registry'
import { returnToSpaceThenGainFlow } from '../../helpers/pay-gain-node'

const CARD_ID = 'CWM055_WoodWorker'

const cardImpl = {
  listeners: [
    {
      id: CARD_ID + '-place-food',
      cardIds: [CARD_ID],
      phases: ['after'],
      actionSpaces: 'all',
      handler: ({ player }) =>
        player.resources.food > 0
          ? returnToSpaceThenGainFlow({ cardId: CARD_ID, cost: { food: 1 }, gain: { wood: 1 } })
          : undefined,
    },
    {
      id: CARD_ID + '-take-food',
      cardIds: [CARD_ID],
      phases: ['before'],
      actionSpaces: 'all',
      scope: 'any',
      mandatory: true,
      handler: ({ space, player }) =>
        Object.values(space.gainPerRound).some((n) => n > 0) || !(space.resources.food > 0)
          ? undefined
          : {
              sourceCard: CARD_ID,
              flow: {
                type: 'leaf',
                // A standard collect, so acquisition reactions see food taken from this space.
                actionId: 'collect',
                sourceCard: CARD_ID,
                targetPlayerId: player.id,
                actionContext: { spaceId: space.id, resourceTypes: ['food'] },
              },
            },
    },
  ],
} satisfies CardImpl

export const CWM055_WoodWorker = defineOccupationCard({
  meta: {
    id: 'CWM055_WoodWorker',
    name: "Wood Worker",
    deck: 'CWM',
    number: 55,
    desc: ["After using an action space, you may place 1 <FOOD> from your supply on it to get 1 <WOOD>. The next player to use that space takes the <FOOD>."],
    cost: {},
    vp: 0,
    prerequisite: "",
    players: '4+',
    passing: false,
    extraVp: true,
    implemented: true,
    artUrl: '/assets/classic/CWM/CWM055.png',
  },
  impl: cardImpl,
})

export const CWM055_WoodWorker_impl = CWM055_WoodWorker.impl
