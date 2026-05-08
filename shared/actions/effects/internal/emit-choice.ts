import type { ActionChoiceOption, ActionDefinition } from '../../../contract/types'
import type { PromptKey } from '../../../contract/prompt-keys'

/**
 * `emit-choice` — a dedicated leaf action for cards that need to surface a
 * pending choice whose resolution is handled entirely by the card's own
 * `CardEffect.resolveChoice` hook (see GameSession.resolvePendingChoice).
 *
 * Pass the choice options and an optional promptKey via params:
 *   { promptKey: 'i18n.key', options: ActionChoiceOption[] }
 *
 * The action emits the choice; the card's resolveChoice hook handles all
 * side-effects and may return a follow-up ActionFlow. The engine's stub
 * resolveChoice below is called only if no card hook intercepts first — in
 * that case it is a safe no-op (the card hook already ran).
 */
export const emitChoiceAction: ActionDefinition = {
  id: 'emit-choice',
  nameKey: 'actions.emitChoice.name',
  descriptionKey: 'actions.emitChoice.description',
  roundAvailable: 1,
  gainPerRound: {},
  canBeExecutedByPlayer: () => true,
  execute: ({ params }) => {
    const options = (params as { options?: ActionChoiceOption[]; promptKey?: PromptKey } | undefined)?.options
    if (Array.isArray(options) && options.length > 0) {
      const promptKey = (params as { promptKey?: PromptKey } | undefined)?.promptKey
      return {
        type: 'request',
        request: { kind: 'choice', options },
        promptKey,
      }
    }
    return { type: 'ok' }
  },
  /**
   * Stub so the engine creates a paired InteractionNode in buildFlowNode.
   * The real resolution is done by the card's CardEffect.resolveChoice hook
   * which fires before this stub (in GameSession.resolvePendingChoice).
   */
  resolveChoice: () => ({ type: 'ok' }),
}
