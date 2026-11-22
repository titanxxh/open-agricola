import { defineOccupationCard } from '../../card-source'
import type { CardImpl } from '../../registry'

const CARD_ID = 'CWM037_MasterStableman'

const cardImpl = {
  listeners: [
    {
      id: CARD_ID + '-animal-space',
      cardIds: [CARD_ID],
      actionSpaces: ['sheep-market', 'pig-market', 'cattle-market'],
      phases: ['before'],
      handler: (context) =>
        (['sheep', 'boar', 'cattle'] as const).some(
          (animal) =>
            (context.space.gainPerRound[animal] ?? 0) > 0 &&
            (context.space.resources[animal] ?? 0) >= 2,
        )
          ? {
              sourceCard: CARD_ID,
              flow: {
                type: 'leaf',
                actionId: 'stables',
                sourceCard: CARD_ID,
                optional: true,
                actionContext: { max: 2, exactCost: { wood: 1, max: 2 }, targetFarmPolicy: 'own' },
              },
            }
          : undefined,
    },
  ],
} satisfies CardImpl

export const CWM037_MasterStableman = defineOccupationCard({
  meta: {
    id: 'CWM037_MasterStableman',
    name: "Master Stableman",
    deck: 'CWM',
    number: 37,
    desc: ["Immediately before receiving at least 2 animals from an animal accumulation space, you may build up to 2 <STABLE> for 1 <WOOD> each. Animals received through card effects do not count."],
    cost: {},
    vp: 0,
    prerequisite: "",
    players: '3+',
    passing: false,
    extraVp: false,
    implemented: true,
    artUrl: '/assets/classic/CWM/CWM037.png',
  },
  impl: cardImpl,
})

export const CWM037_MasterStableman_impl = CWM037_MasterStableman.impl
