import { defineMinorCard } from '../card-source'
import { payGainActionFlow } from '../helpers/pay-gain-node'
import type { CardImpl } from '../registry'
import type { RoundPreparationContext } from '../../contract/card-effect-hooks'

const CARD_ID = 'B070_NewPurchase'
const harvestRounds = [4, 7, 9, 11, 13, 14]
const isHarvestPreparation = (round: number, context?: RoundPreparationContext): boolean =>
  harvestRounds.includes(context?.kind === 'before-reveal' ? context.nextRound : round)

const cardImpl = {
  effect: {
    id: CARD_ID,
    stageEligibility: {
      onBeforeStartOfTurn: (state, _player, ctx) => isHarvestPreparation(state.round, ctx.roundPreparation),
    },
    onBeforeStartOfTurn: (state, _player, ctx) => {
      if (!isHarvestPreparation(state.round, ctx?.roundPreparation)) return
      return {
        type: 'or',
        optional: true,
        requiresExplicitChoice: true,
        children: [
          payGainActionFlow({ cardId: CARD_ID, cost: { food: 2 }, gain: { grain: 1 } }),
          payGainActionFlow({ cardId: CARD_ID, cost: { food: 4 }, gain: { vegetable: 1 } }),
        ],
      }
    },
  },
  reaches: [] as readonly string[],
} satisfies CardImpl

export const B070_NewPurchase = defineMinorCard({
  meta: {
    id: CARD_ID,
    name: "New Purchase",
    deck: "B",
    number: 70,
    category: "CROP_PROVIDER",
    desc: ['Before the start of each round that ends with a harvest, you can buy one of each of the following crops: 2 <FOOD> <ARROW> 1 <GRAIN>; 4 <FOOD> <ARROW> 1 <VEGETABLE>'],
    cost: {},
    players: "1+",
  },
  impl: cardImpl,
})

export const B070_NewPurchase_impl = B070_NewPurchase.impl
