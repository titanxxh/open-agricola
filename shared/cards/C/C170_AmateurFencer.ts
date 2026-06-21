import { defineOccupationCard } from '../card-source'
import type { ActionFlow, GameState, PlayerState } from '../../contract/types'
import { canStartFencing } from '../../actions/effects/fencing'
import type { CardImpl } from '../registry'

const CARD_ID = 'C170_AmateurFencer'
const ONE_SPACE_PASTURE_CONTEXT = {
  trueAction: false,
  fencePolicy: {
    segmentBounds: { total: { min: 1, max: 4 } },
    newPastureBounds: {
      count: { min: 1, max: 1 },
      totalSize: { min: 1, max: 1 },
    },
    costPolicy: { fence: { wood: 0 } },
  },
}

const oneSpacePastureFlow = (): ActionFlow => ({
  type: 'leaf',
  actionId: 'fence',
  sourceCard: CARD_ID,
  optional: true,
  actionContext: ONE_SPACE_PASTURE_CONTEXT,
})

const cardImpl = {
  effect: {
    id: CARD_ID,
    onBuy: (state: GameState, player: PlayerState) => {
      if (player.pastures.length > 0) return
      if (!canStartFencing(state, player, undefined, ONE_SPACE_PASTURE_CONTEXT)) return
      return oneSpacePastureFlow()
    },
  },
  reaches: [] as readonly string[],
} satisfies CardImpl

export const C170_AmateurFencer = defineOccupationCard({
  meta: {
    id: CARD_ID,
    name: 'Amateur Fencer',
    deck: 'C',
    number: 170,
    category: 'FARM_PLANNER',
    desc: ['When you play this card, if you have no pastures yet, you can immediately fence exactly 1 space in your farmyard without paying wood for the fences.'],
    cost: {},
    players: '5+',
  },
  impl: cardImpl,
})

export const C170_AmateurFencer_impl = C170_AmateurFencer.impl
