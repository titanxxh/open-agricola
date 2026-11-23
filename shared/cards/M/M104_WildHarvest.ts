import { defineMinorCard } from '../card-source'
import { gainLeaf } from '../helpers/pay-gain-node'
import { rollAndCacheCardPick } from '../helpers/card-random'
import { moorStartCardIds } from '../../moor/start-cards'
import type { CardImpl } from '../registry'
import { registerAdHocAction } from '../../actions/helpers/ad-hoc-action-registry'
import { countTerrain } from './moor-batch1-helpers'

const CARD_ID = 'M104_WildHarvest'

const startCardNumber = (id: string) =>
  Number(id.replace('moor-start-', ''))

// The draw happens when this leaf executes, so a preview of the stage source never rolls.
const DRAW_ACTION = 'card_M104_WildHarvest_draw'
registerAdHocAction({
  id: DRAW_ACTION,
  nameKey: 'ui.interactionUseAbility',
  descriptionKey: 'ui.interactionUseAbility',
  roundAvailable: 1,
  gainPerRound: {},
  canBeExecutedByPlayer: () => true,
  execute: ({ state, player, reportProtectedObservation }) => {
    const pick = rollAndCacheCardPick(
      state,
      player,
      CARD_ID,
      `harvest-${state.round}`,
      moorStartCardIds,
      reportProtectedObservation,
    )
    state.pendingUndoBoundary = true
    return countTerrain(player, 'forest') >= startCardNumber(pick)
      ? { type: 'flow', flow: gainLeaf(CARD_ID, { food: 1 }) }
      : { type: 'ok' }
  },
})

const cardImpl = {
  effect: {
    id: CARD_ID,
    onBuy: () => gainLeaf(CARD_ID, { food: 1 }),
    onStartHarvest: () => ({ type: 'leaf', actionId: DRAW_ACTION, sourceCard: CARD_ID }),
  },
  reaches: [] as readonly string[],
} satisfies CardImpl

export const M104_WildHarvest = defineMinorCard({
  meta: {
    id: CARD_ID,
    name: "Wild Harvest",
    deck: "M",
    number: 104,
    category: "FOOD_PROVIDER",
    desc: [
        "When you play this card, you immediately get 1 <FOOD>. At the start of each harvest, shuffle all start cards and draw one. If its number is equal to or lower than the number of <FOREST> you have, you immediately get 1 <FOOD>."
    ],
    cost: {},
    implemented: true,
    requiresFarmersOfTheMoor: true,
  },
  impl: cardImpl,
})

export const M104_WildHarvest_impl = M104_WildHarvest.impl
