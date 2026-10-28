import { defineOccupationCard } from '../card-source'
import { playerHasCardCapability } from '../helpers/card-type'
import type { CardImpl } from '../registry'
import type { CardExchange } from '../../contract/cards'
import type { GameState } from '../../contract/types'
import { createSingleHarvestExchange } from '../helpers/stage-effects'

const CARD_ID = 'B101_FurnitureCarpenter'
const exchange = {
  from: { food: 2 }, to: {}, max: 1, sourceId: CARD_ID, triggers: ['harvest'],
  sideEffect: { type: 'bonusVp', amount: 1 },
} satisfies CardExchange
const recipeOf = (state: GameState) => state.players.some(
  player => playerHasCardCapability(player, 'joineryIdentity', { asType: 'major' }),
) ? exchange : undefined

const cardImpl = {
  listeners: [{
    id: `${CARD_ID}:harvest-exchange`,
    cardIds: [CARD_ID],
    actions: ['compute-exchanges'],
    phases: ['computeExchanges'],
    handler: ({ state, extraData }) => {
      const recipe = extraData?.window === 'harvest' ? recipeOf(state) : undefined
      return recipe ? { sourceCard: CARD_ID, extraExchanges: [recipe] } : undefined
    },
  }],
  effect: {
    id: CARD_ID,
    onHarvestFieldPhase: createSingleHarvestExchange(CARD_ID, recipeOf),
  },
  reaches: [] as readonly string[],
} satisfies CardImpl

export const B101_FurnitureCarpenter = defineOccupationCard({
  meta: {
    id: CARD_ID,
    name: 'Furniture Carpenter',
    deck: 'B',
    number: 101,
    category: 'POINTS_PROVIDER',
    desc: ['Each harvest, if any player (including you) owns the Joinery or an upgrade thereof, you can buy exactly 1 bonus <SCORE> for 2 <FOOD>.'],
    cost: {},
    players: '1+',
    extraVp: true,
  },
  presentation: { counters: ['bonusVp'] },
  impl: cardImpl,
})

export const B101_FurnitureCarpenter_impl = B101_FurnitureCarpenter.impl
