import { MinorImprovement } from '../types'
import { registerCardEffect } from '../card-effects'
import type { ActionFlow } from '../../game/types'

const CARD_ID = 'E9_BarteringHut'

// BGA: Up to 2 times, pay 2/3/4 building resources (1 each, chosen as XOR) to gain 1 sheep/pig/cattle.
registerCardEffect({
  id: CARD_ID,
  onBuy: () => {
    const makeAnimalOption = (animal: 'sheep' | 'boar' | 'cattle', cost: number): ActionFlow => {
      const payChoices: ActionFlow[] = [
        { type: 'leaf' as const, actionId: 'pay-resources', sourceCard: CARD_ID, params: { wood: 1 } },
        { type: 'leaf' as const, actionId: 'pay-resources', sourceCard: CARD_ID, params: { clay: 1 } },
        { type: 'leaf' as const, actionId: 'pay-resources', sourceCard: CARD_ID, params: { reed: 1 } },
        { type: 'leaf' as const, actionId: 'pay-resources', sourceCard: CARD_ID, params: { stone: 1 } },
      ]
      const paySteps: ActionFlow[] = Array.from({ length: cost }, () => ({
        type: 'xor' as const,
        children: payChoices,
      }))
      return {
        type: 'seq' as const,
        children: [
          { type: 'leaf' as const, actionId: 'gain', sourceCard: CARD_ID, params: { [animal]: 1 } },
          ...paySteps,
        ],
      }
    }

    const oneTime: ActionFlow = {
      type: 'xor' as const,
      optional: true,
      children: [
        makeAnimalOption('sheep', 2),
        makeAnimalOption('boar', 3),
        makeAnimalOption('cattle', 4),
      ],
    }

    return {
      type: 'seq' as const,
      children: [oneTime, oneTime],
    }
  },
})

export const E9_BarteringHut = new MinorImprovement({
  id: CARD_ID,
  name: 'Bartering Hut',
  deck: 'E',
  number: 9,
  category: 'ANIMAL_HANDLER',
  desc: ['Up to two times: Immediately spend any 2/3/4 building resources for 1 <SHEEP>/<PIG>/<CATTLE> from the general supply.'],
  passing: true,
})
