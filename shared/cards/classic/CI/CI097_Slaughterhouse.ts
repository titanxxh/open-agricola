import { defineMinorCard } from '../../card-source'
import type { CardImpl } from '../../registry'
import { createEventQuery } from '../../../events/query'
import { animalKeysForState } from '../../../contract/animals'
import { gainLeaf } from '../../helpers/pay-gain-node'

const CARD_ID = 'CI097_Slaughterhouse'

const cardImpl = {
  effect: { id: CARD_ID, computeHarvestFeedingOrderPriority: () => 1 },
  listeners: [
    {
      id: CARD_ID + '-slaughter',
      cardIds: [CARD_ID],
      actions: ['exchange'],
      phases: ['after'],
      scope: 'opponent',
      handler: (context) =>
        createEventQuery(context.actionEvents ?? [])
          .filter('resource.exchanged')
          .some(
            (e) =>
              (e.gained.food ?? 0) > 0 &&
              animalKeysForState(context.state).some((animal) => (e.paid[animal] ?? 0) > 0),
          )
          ? { sourceCard: CARD_ID, flow: gainLeaf(CARD_ID, { food: 1 }) }
          : undefined,
    },
  ],
} satisfies CardImpl

export const CI097_Slaughterhouse = defineMinorCard({
  meta: {
    id: 'CI097_Slaughterhouse',
    name: 'Slaughterhouse',
    deck: 'CI',
    number: 97,
    desc: [
      'Whenever another player converts at least 1 animal into <food>, you receive 1 <food>. During the feeding phase of each harvest, you feed after the other players.',
    ],
    rules: ['If both __Slaughterman__ and __Slaughterhouse__ are in play, their owners feed in their normal relative turn order.'],
    cost: {
      stone: 2,
      clay: 2,
    },
    vp: 2,
    prerequisite: '',
    passing: false,
    extraVp: false,
    implemented: true,
  },
  impl: cardImpl,
})
export const CI097_Slaughterhouse_impl = CI097_Slaughterhouse.impl
