import type { ActionFlow } from '../../contract/types'
import type { CardImpl } from '../registry'
import { E9_BarteringHut } from '../../cards-display/E/E9_BarteringHut'
export { E9_BarteringHut }

const CARD_ID = E9_BarteringHut.id

export const E9_BarteringHut_impl = {
  effect: {
  id: CARD_ID,
  onBuy: () => {
    const makeAnimalOption = (animal: 'sheep' | 'boar' | 'cattle', cost: number): ActionFlow => {
      const payChoices: ActionFlow[] = [
        { type: 'leaf' as const, actionId: 'pay', sourceCard: CARD_ID, params: { wood: 1 } },
        { type: 'leaf' as const, actionId: 'pay', sourceCard: CARD_ID, params: { clay: 1 } },
        { type: 'leaf' as const, actionId: 'pay', sourceCard: CARD_ID, params: { reed: 1 } },
        { type: 'leaf' as const, actionId: 'pay', sourceCard: CARD_ID, params: { stone: 1 } },
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
},
  reaches: [] as readonly string[],
} satisfies CardImpl
