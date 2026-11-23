import { defineMinorCard } from '../card-source'
import { gainLeaf } from '../helpers/pay-gain-node'
import { rollAndCacheCardPick } from '../helpers/card-random'
import { moorStartCardIds } from '../../moor/start-cards'
import type { ActionFlow } from '../../contract/types'
import type { CardImpl } from '../registry'
import { registerAdHocAction } from '../../actions/helpers/ad-hoc-action-registry'

const CARD_ID = 'M102_SavingsDeposit'

const startCardNumber = (id: string) =>
  Number(id.replace('moor-start-', ''))

const passLeftLeaf = (): ActionFlow => ({
  type: 'leaf',
  actionId: 'pass-minor-card-to-left',
  sourceCard: CARD_ID,
  params: { cardId: CARD_ID },
})

// The draw happens when this leaf executes, so a preview of the stage source never rolls.
const DRAW_ACTION = 'card_M102_SavingsDeposit_draw'
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
    return startCardNumber(pick) <= (player.resources.clay ?? 0)
      ? { type: 'flow', flow: gainLeaf(CARD_ID, { food: 6 }) }
      : { type: 'ok' }
  },
})

const cardImpl = {
  effect: {
    id: CARD_ID,
    onStartHarvest: (): ActionFlow => ({
      type: 'seq',
      children: [{ type: 'leaf', actionId: DRAW_ACTION, sourceCard: CARD_ID }, passLeftLeaf()],
    }),
  },
  reaches: [] as readonly string[],
} satisfies CardImpl

export const M102_SavingsDeposit = defineMinorCard({
  meta: {
    id: CARD_ID,
    name: "Savings Deposit",
    deck: "M",
    number: 102,
    category: "FOOD_PROVIDER",
    desc: [
        "At the start of each harvest, shuffle all start cards and draw one. If its number is equal to or lower than the amount of <CLAY> you have, you immediately get 6 <FOOD>. Then pass this card to the player on your left, who adds it to their hand."
    ],
    cost: {
        "vegetable": 2
    },
    vp: 1,
    implemented: true,
    requiresFarmersOfTheMoor: true,
  },
  impl: cardImpl,
})

export const M102_SavingsDeposit_impl = M102_SavingsDeposit.impl
