import { MinorImprovement, getRegisteredMinorImprovement } from '../types'
import { registerCardListener } from '../card-listeners'
import type { CardListenerRegistration, CardListenerContext } from '../card-listeners'
import type { ActionHookPhase, ActionHookResult } from '../../actions/hooks'
import type { ComplexCost, PlayerState } from '../../game/types'
import { getMajorCardEffect } from '../major'
import { meetsCardPrerequisites } from '../helpers/prerequisites'
import {
  canAffordCardPreviewCostByProvider,
  canAffordCost,
  resolveCardPreviewCostByProvider,
} from '../../actions/effects/pay-helpers'
import { computeAllBuyableCombinations, isComplexCost } from '../../actions/effects/pay'
import { gainLeaf } from '../helpers/pay-gain-node'

const CARD_ID = 'B75_WoodWorkshop'

const createPreviewPlayer = (player: PlayerState): PlayerState => ({
  ...player,
  resources: {
    ...player.resources,
    wood: (player.resources.wood ?? 0) + 1,
  },
})

const attachRequiredReturnCards = (
  cost: Partial<PlayerState['resources']> | ComplexCost | null,
  returnCards?: string[],
) => {
  if (!cost || !returnCards || returnCards.length === 0) {
    return cost
  }
  if (isComplexCost(cost)) {
    return {
      ...cost,
      cards: {
        type: 'Major',
        list: returnCards,
        required: true,
      },
    } as ComplexCost
  }
  return {
    fee: cost,
    cards: {
      type: 'Major',
      list: returnCards,
      required: true,
    },
  } as ComplexCost
}

const canPlayAnyMajorImprovement = (context: CardListenerContext, player: PlayerState) =>
  context.state.availableMajorImprovements.some((improvementId) =>
    canAffordCardPreviewCostByProvider(
      context.state,
      player,
      'improvement-any',
      improvementId,
      () => getMajorCardEffect(improvementId)?.cost ?? null,
      context.actionId,
    ),
  )

const canPlayAnyMinorImprovement = (context: CardListenerContext, player: PlayerState) =>
  player.minorHand.some((improvementId) => {
    const improvement = getRegisteredMinorImprovement(improvementId)
    if (!improvement) return false
    if (!meetsCardPrerequisites(player, improvement)) return false
    const previewCost = attachRequiredReturnCards(
      resolveCardPreviewCostByProvider(
        context.state,
        player,
        'improvement-any',
        improvement.id,
        () =>
          improvement.altCosts && improvement.altCosts.length > 0
            ? { fees: improvement.altCosts }
            : (improvement.cost ?? {}),
        context.actionId,
      ),
      improvement.returnCards,
    )
    if (!previewCost) return false
    if (isComplexCost(previewCost)) {
      return computeAllBuyableCombinations(
        player,
        previewCost,
        player.improvements,
      ).length > 0
    }
    return canAffordCost(player, previewCost)
  })

const beforeListener: CardListenerRegistration = {
  id: 'B75-wood-workshop-before-improvement',
  cardIds: [CARD_ID],
  phases: ['before' as ActionHookPhase],
  actions: ['improvement-any', 'minor-improvement'],
  handler: (_context: CardListenerContext): ActionHookResult | void => {
    return { flow: gainLeaf(CARD_ID, { wood: 1 }), sourceCard: CARD_ID }
  },
}

const isDoableListener: CardListenerRegistration = {
  id: 'B75-wood-workshop-isdoable-improvement',
  cardIds: [CARD_ID],
  phases: ['isDoable' as ActionHookPhase],
  actions: ['improvement-any', 'minor-improvement'],
  handler: (context: CardListenerContext): ActionHookResult | void => {
    if (context.doable) return
    const previewPlayer = createPreviewPlayer(context.player)
    const doable = context.actionId === 'minor-improvement'
      ? canPlayAnyMinorImprovement(context, previewPlayer)
      : canPlayAnyMajorImprovement(context, previewPlayer) ||
        canPlayAnyMinorImprovement(context, previewPlayer)
    if (doable) {
      return { doable: true }
    }
  },
}

registerCardListener(beforeListener)
registerCardListener(isDoableListener)

export const B75_WoodWorkshop = new MinorImprovement({
  id: CARD_ID,
  name: "Wood Workshop",
  deck: "B",
  number: 75,
  category: "BUILDING_RESOURCE_PROVIDER",
  desc: ["Each time before you play or build an improvement, you get 1 <WOOD>."],
  cost: {"clay":1},
  prerequisite: "1 Occupation",
  occupationPrerequisites: {"min":1},
})
