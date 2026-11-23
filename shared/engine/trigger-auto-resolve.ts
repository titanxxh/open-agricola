import type { GameState } from '../contract/types'
import { playerPreferences } from '../domain/player-preferences'
import { isActivateCardActionNode } from './activation-action'
import { ActionNode } from './nodes/action-node'
import type { ParallelNode } from './nodes'
import type { EngineNode } from './types'
import type { TriggerOptionState } from './trigger-select'

const isCardActivation = (node: EngineNode): boolean =>
  isActivateCardActionNode(node) || (node instanceof ActionNode && node.actionId === 'activate-card-effect')

/**
 * The trigger child this selector resolves without asking (#2039, reference
 * `ParallelNode::getChoices` / `Engine::proceed`). Only card activations
 * qualify; extra-turn providers and injected windows always wait for the player.
 * - With the chooser's auto-resolve setting on: the first applicable mandatory
 *   independent child, in frozen source order.
 * - In any case: a sole applicable mandatory child.
 * A sole optional child keeps [card, Pass]: accepting an activation also accepts
 * a card's leaf-root optional effect, and a listener activation counts a card use.
 * A selector that opens its own anytime window resolves nothing by itself while a
 * dormant source remains: the player may still use the window to make it applicable.
 * The chooser's setting is read when the selector is first evaluated and frozen on the node.
 */
export const autoResolvedTriggerChild = (
  node: ParallelNode,
  optionStates: readonly TriggerOptionState[],
  state: GameState,
  fallbackChooserId: string,
): TriggerOptionState | undefined => {
  const applicable = optionStates.filter(entry => entry.applicable)
  if (!applicable.some(entry => isCardActivation(entry.child))) return undefined
  if (node.anytimeWindow?.allowed && applicable.length < optionStates.length) return undefined
  const chooserId = node.triggerOwnerPlayerId ?? node.ownerPlayerId ?? fallbackChooserId
  node.autoResolveIndependent ??= playerPreferences(state.players.find(player => player.id === chooserId))
    .autoResolveIndependentReactions
  if (node.autoResolveIndependent) {
    const independent = applicable.find(entry =>
      isCardActivation(entry.child) && entry.mandatory && entry.doable && entry.independent)
    if (independent) return independent
  }
  const sole = applicable.length === 1 ? applicable[0] : undefined
  return sole?.doable && sole.mandatory && isCardActivation(sole.child) ? sole : undefined
}
