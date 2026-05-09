import type { CardListenerContext, CardListenerRegistration } from '../card-listeners'
import type { ActionHookPhase, ActionHookResult } from '../../actions/hooks'
import { isCardFlagged, setCardFlag } from '../helpers/card-state'
import type { CardImpl } from '../registry'
import { C51_FishingNet } from '../../cards-display/C/C51_FishingNet'

const CARD_ID = C51_FishingNet.id

/**
 * Part 1: When an opponent uses the Fishing accumulation space,
 * the card owner gains 1 food (simplified from "opponent pays 1 food")
 * and the card is flagged for the delayed return-home effect.
 */
const listener: CardListenerRegistration = {
  id: 'C51-fishing-net-opponent-fishing',
  cardIds: [CARD_ID],
  actions: ['place-farmer'],
  phases: ['after' as ActionHookPhase],
  scope: 'opponent',
  handler: (context: CardListenerContext): ActionHookResult | void => {
    if (context.space?.id !== 'fishing') return
    const ownerId = context.ownerPlayer?.id
    if (!ownerId) return
    const triggerPlayerId = context.triggerPlayer?.id ?? context.player.id
    return {
      flow: {
        type: 'seq',
        children: [
          {
            type: 'leaf',
            actionId: 'gain',
            params: {
              food: 1,
              recipientPlayerId: ownerId,
              payerId: triggerPlayerId,
            },
            sourceCard: CARD_ID,
          },
          { type: 'leaf', actionId: 'special-effect', sourceCard: CARD_ID, params: { kind: 'set-flag', flag: true } },
        ],
      },
      sourceCard: CARD_ID,
    }
  },
}

/**
 * Part 2: BGA's Fishing Net uses `PAY` (must succeed) — when an opponent
 * tries to use Fishing without food, the entire Fishing action fails.
 * Mirror this by gating the inner `collect` action of the Fishing space via
 * an `isDoable` listener: the engine's `ActionNode` for `collect` runs the
 * isDoable hook before executing, and a `doable: false` result blocks the
 * SEQ — leaving the worker un-placed and the space resources untouched.
 *
 * `getAvailableActions` (UI affordance) and the engine ActionNode dispatch
 * (rule enforcement) both flow through `applyIsDoable`, so this single
 * listener covers both UI greying and `takeAction` rejection without
 * touching the main path.
 */
const isDoableListener: CardListenerRegistration = {
  id: 'C51-fishing-net-isDoable',
  cardIds: [CARD_ID],
  phases: ['isDoable' as ActionHookPhase],
  actions: ['collect', 'fishing'],
  scope: 'opponent',
  handler: (context: CardListenerContext): ActionHookResult | void => {
    if (context.space?.id !== 'fishing') return
    if (context.player.resources.food >= 1) return
    return { doable: false }
  },
}

export const C51_FishingNet_impl = {
  listeners: [listener, isDoableListener],
  effect: {
  id: CARD_ID,
  onReturnHome: (state, player) => {
    if (!isCardFlagged(player, CARD_ID)) return
    setCardFlag(player, CARD_ID, false)
    const fishingSpace = state.actionSpaces.find(s => s.id === 'fishing')
    if (fishingSpace) {
      fishingSpace.resources.food = (fishingSpace.resources.food ?? 0) + 2
    }
  },
},
  reaches: [] as readonly string[],
} satisfies CardImpl
