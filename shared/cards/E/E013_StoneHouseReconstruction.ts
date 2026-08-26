import { defineMinorCard } from '../card-source'
import type { CardListenerRegistration, CardListenerContext } from '../card-listeners'
import type { ActionHookPhase, ActionHookResult } from '../../actions/hooks'
import { isActionDoableInFlowContext } from '../../actions/flow'
import { getActionDefinition } from '../../actions/index'
import { isCardFlagged } from '../helpers/card-state'
import type { CardImpl } from '../registry'

const CARD_ID = 'E013_StoneHouseReconstruction'
/**
 * E13 Stone House Reconstruction — At any time, you can renovate your clay house
 * to a stone house without placing a person. (You must pay the normal renovation cost.)
 *
 * Rule: isListeningTo → player has clay house and card not flagged.
 * Once flagged (used), stays flagged (once per game implicitly via room type).
 *
 * Implementation: anytime listener checks for clay house type, not flagged.
 * Triggers renovation action (which handles the cost and house type change).
 */
const anytimeListener: CardListenerRegistration = {
  id: 'E13-stone-house-reconstruction-anytime',
  cardIds: [CARD_ID],
  phases: ['anytime' as ActionHookPhase],
  preScoring: true,
  handler: (context: CardListenerContext): ActionHookResult | void => {
    if (isCardFlagged(context.player, CARD_ID)) return
    if (context.player.houseType !== 'clay') return
    const renovation = getActionDefinition('renovate-house')
    if (!renovation || !isActionDoableInFlowContext({
      actionId: renovation.id,
      action: renovation,
      state: context.state,
      player: context.player,
      space: context.space,
      sourceCard: CARD_ID,
      resolveAction: getActionDefinition,
    })) return
    return {
      flow: {
        type: 'seq',
        children: [
          { type: 'leaf', actionId: 'special-effect', sourceCard: CARD_ID, params: { kind: 'set-flag', flag: true } },
          { type: 'leaf', actionId: 'renovate-house', sourceCard: CARD_ID },
          { type: 'leaf', actionId: 'special-effect', sourceCard: CARD_ID, params: { kind: 'set-flag', flag: false } },
        ],
      },
      sourceCard: CARD_ID,
      labelKey: 'cards.E013_StoneHouseReconstruction.anytime',
    }
  },
}

const cardImpl = {
  listeners: [anytimeListener],
  reaches: [] as readonly string[],
} satisfies CardImpl

export const E013_StoneHouseReconstruction = defineMinorCard({
  meta: {
    id: CARD_ID,
    name: 'Stone House Reconstruction',
    deck: 'E',
    number: 13,
    category: 'FARMYARD_-_HOUSE_BUILDING_OR_RENOVATION',
    desc: ['At any time, you can renovate your clay house to a stone house without placing a person. (You must pay the normal renovation cost.)'],
    cost: { stone: 1 },
    vp: 1,
  },
  impl: cardImpl,
})

export const E013_StoneHouseReconstruction_impl = E013_StoneHouseReconstruction.impl
