import { defineMinorCard } from '../../card-source'
import type { CardImpl } from '../../registry'

const CARD_ID = 'OLD_E13_Axe'
const cardImpl = {
  modifiers: [
    {
      type: 'trade',
      cardId: CARD_ID,
      appliesTo: ['construct'],
      scope: 'unit',
      groupId: 'classic-room-base',
      groupMax: 1,
      groupScope: 'unit',
      from: {},
      to: { wood: 3 },
      conditions: { roomMaterialWood: 1 },
      unitPrice: { wood: 2, reed: 2 },
    },
  ],
} satisfies CardImpl
export const OLD_E13_Axe = defineMinorCard({
  meta: {
    id: 'OLD_E13_Axe',
    name: '斧头',
    deck: 'E',
    number: 13,
    desc: ['你建造每间木屋只需花费2根木头和2捆芦苇。'],
    cost: {
      wood: 1,
      stone: 1,
    },
    vp: 0,
    prerequisite: '',
    passing: false,
    extraVp: false,
    implemented: true,
    locales: {
      zh: {
        name: '斧头',
        desc: ['你建造每间木屋只需花费2根木头和2捆芦苇。'],
        prerequisite: '',
      },
    },
  },
  impl: cardImpl,
})
export const OLD_E13_Axe_impl = OLD_E13_Axe.impl
