import type { ActionChoiceOption, ActionDefinition } from '../../game/types'

export const noopAction: ActionDefinition = {
  id: 'noop',
  nameKey: 'actions.noop.name',
  descriptionKey: 'actions.noop.description',
  roundAvailable: 1,
  gainPerRound: {},
  canBeExecutedByPlayer: () => true,
  /**
   * When `params.options` is a non-empty array, emit a pending choice so that
   * a card's `CardEffect.resolveChoice` hook can handle the player's selection.
   * The `noop` action itself does NOT consume the choice — the card effect hook
   * is responsible for all side-effects (see GameSession.resolvePendingChoice).
   */
  execute: ({ params }) => {
    const options = (params as { options?: ActionChoiceOption[]; promptKey?: string } | undefined)?.options
    if (Array.isArray(options) && options.length > 0) {
      const promptKey = (params as { promptKey?: string } | undefined)?.promptKey
      return { type: 'choice', promptKey, options }
    }
    return { type: 'ok' }
  },
  /**
   * Stub resolveChoice so the engine creates a paired ChoiceNode in buildFlowNode.
   * The real resolution is done by the card's CardEffect.resolveChoice hook which
   * fires before this stub is called (in GameSession.resolvePendingChoice).
   */
  resolveChoice: () => ({ type: 'ok' }),
}
