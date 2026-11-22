import { defineOccupationCard } from '../../card-source'
import type { CardImpl } from '../../registry'
import type { CostModifier } from '../../../contract/types'

const CARD_ID = 'CWM011_Contractor'

const cardImpl = {
  modifiers: [
    ...(['wood', 'clay', 'reed', 'stone'] as const).flatMap((resource) => [
      {
        type: 'trade',
        cardId: CARD_ID,
        appliesTo: ['construct'],
        from: { food: 1 },
        to: { [resource]: 1 },
        max: 2,
        scope: 'action',
        groupId: CARD_ID,
        groupMax: 2,
      },
      {
        type: 'trade',
        cardId: CARD_ID,
        appliesTo: ['renovation', 'major-improvement', 'minor-improvement'],
        from: { food: 1 },
        to: { [resource]: 1 },
        max: 1,
        groupId: CARD_ID,
        groupMax: 1,
      },
    ]),
  ] as CostModifier[],
} satisfies CardImpl

export const CWM011_Contractor = defineOccupationCard({
  meta: {
    id: 'CWM011_Contractor',
    name: "Contractor",
    deck: 'CWM',
    number: 11,
    desc: ["When building rooms, renovating, or playing an improvement, you may substitute 1 <FOOD> for 1 building resource. You may substitute up to 2 resources per room-building action, or 1 resource per renovation or improvement."],
    cost: {},
    vp: 0,
    prerequisite: "",
    players: '1+',
    passing: false,
    extraVp: false,
    implemented: true,
    artUrl: '/assets/classic/CWM/CWM011.png',
  },
  impl: cardImpl,
})

export const CWM011_Contractor_impl = CWM011_Contractor.impl
