import type { ActionFlow, GameState, PlayerState } from '../../contract/types'
import { getCardEffect } from '../card-effects'
import { timedRuleSources } from '../timed-rule-obligations'

/** Freeze sources at entry; activation preview determines live qualification. */
export const buildEndTurnReactionFlow = (
  state: GameState,
  player: PlayerState,
  triggerActionId?: string | null,
): ActionFlow | undefined => {
  const sources = [...new Set([
    ...player.improvements, ...player.minorPlayed, ...player.occupationPlayed,
    ...timedRuleSources(state, player, id => getCardEffect(id)?.timedRules ?? []).map(source => source.cardId),
  ])].filter(cardId => getCardEffect(cardId)?.onEndTurn)
  const children: ActionFlow[] = sources.map(cardId => ({
    type: 'leaf',
    actionId: 'activate-card-effect',
    sourceCard: cardId,
    targetPlayerId: player.id,
    params: {
      cardId, hook: 'onEndTurn', ownerPlayerId: player.id, targetPlayerId: player.id,
      ...(triggerActionId ? { triggerActionId } : {}),
    },
    ...(sources.length > 1 ? { optional: true, actionContext: { commitOnTriggerSelection: true } } : {}),
  }))
  if (children.length === 0) return
  if (children.length === 1) return children[0]
  return { type: 'parallel', mode: 'trigger-select', children, anytimeWindow: { allowed: true, blockedIds: [] } }
}
