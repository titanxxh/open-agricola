import { defineOccupationCard } from '../card-source'
import type { BonusChoice, BonusModifier } from '../../contract/types'
import { gainLeaf } from '../helpers/pay-gain-node'
import type { CardImpl } from '../registry'

const CARD_ID = 'D088_Millwright'

const COST_TYPES = ['construct', 'renovation', 'fencing', 'stables'] as const
const CHOICES: BonusChoice[] = [
  { discount: { wood: 1, grain: -1 } },
  { discount: { clay: 1, grain: -1 } },
  { discount: { stone: 1, grain: -1 } },
  { discount: { reed: 1, grain: -1 } },
]

const buildBonusModifiers = (): BonusModifier[] => {
  const modifiers: BonusModifier[] = []
  for (const costType of COST_TYPES) {
    for (let index = 0; index < 2; index += 1) {
      modifiers.push({
        type: 'bonus',
        cardId: CARD_ID,
        appliesTo: [costType],
        choices: CHOICES,
        trackChoiceIndex: false,
        optional: true,
      })
    }
  }
  return modifiers
}

const cardImpl = {
  effect: {
  id: CARD_ID,
  onBuy: () => gainLeaf(CARD_ID, { grain: 1 }),
},
  modifiers: buildBonusModifiers(),
  reaches: [] as readonly string[],
} satisfies CardImpl

export const D088_Millwright = defineOccupationCard({
  meta: {
    id: CARD_ID,
    name: 'Millwright',
    deck: 'D',
    number: 88,
    category: 'FARM_PLANNER',
    desc: [
        'You immediately get 1 <GRAIN>. Each time you build fences, stables, and rooms, or renovate your house, you can replace up to 2 building resources of any type with 1 <GRAIN> each.',
      ],
    cost: {},
    players: '1+',
  },
  impl: cardImpl,
})

export const D088_Millwright_impl = D088_Millwright.impl
