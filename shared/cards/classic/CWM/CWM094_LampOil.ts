import { defineMinorCard } from '../../card-source'
import type { CardImpl } from '../../registry'
import { gainLeaf } from '../../helpers/pay-gain-node'
import { getAssignedAnimalsByType } from '../../../domain/animals'

const CARD_ID = 'CWM094_LampOil'

const cardImpl = {
  prerequisiteCheck: (player) =>
    Object.values(getAssignedAnimalsByType({ ...player, cardStates: {} })).reduce(
      (a, b) => a + b,
      0,
    ) >= 2,
  listeners: [
    {
      id: CARD_ID + '-occupation',
      cardIds: [CARD_ID],
      actions: ['occupation'],
      phases: ['before'],
      handler: () => ({ sourceCard: CARD_ID, flow: gainLeaf(CARD_ID, { food: 1 }) }),
    },
  ],
} satisfies CardImpl

export const CWM094_LampOil = defineMinorCard({
  meta: {
    id: 'CWM094_LampOil',
    name: "Lamp Oil",
    deck: 'CWM',
    number: 94,
    desc: ["Immediately before you play an occupation card, you get 1 food. Its prerequisite requires 2 animals of any types, excluding animals kept on cards."],
    cost: {
      wood: 2,
      clay: 2,
    },
    vp: 2,
    prerequisite: "2 animals outside cards",
    passing: false,
    extraVp: false,
    implemented: true,
    artUrl: '/assets/classic/CWM/CWM094.png',
  },
  impl: cardImpl,
})

export const CWM094_LampOil_impl = CWM094_LampOil.impl
