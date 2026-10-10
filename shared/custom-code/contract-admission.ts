import { cardEffectHooks, flowCardEffectHooks, isHandCardEffectHook, type CardEffectField } from '../cards/card-effects'
import type { ActionHookPhase } from '../actions/hooks'
import type { CardListenerScope } from '../cards/card-listeners'
import { assertCustomFlow } from './flow-admission'
import { isSandboxListenerAction, sandboxListenerActions } from './sandbox-listener-actions'
import { isSandboxListenerPhase, sandboxListenerPhases } from './sandbox-listener-phases'
import { isSandboxListenerScope } from './sandbox-listener-scopes'
import type { CustomCodeManifest } from './types'

/**
 * Shared admission for both executors (ADR 0025): the manifest extracted from a
 * custom card and the values its effect hooks return must stay inside the
 * Workshop Capability Contract. Anything else throws, never silently narrows.
 */

/** The anytime dispatch uses this action identity; it is not a listener action name. */
const ANYTIME_ACTION_ID = 'anytime'

const FLOW_RESULT_HOOKS = new Set<string>([...flowCardEffectHooks, 'resolveChoice', 'contributeExtraTurn'])

/** What the manifest extraction script reports before any admission. */
export type RawCustomManifest = {
  effectKeys: string[]
  effectMetadata?: { handHooks?: unknown[] }
  listeners: Array<{
    registrationId: string
    cardIds?: unknown[]
    actions?: unknown[]
    phases?: unknown[]
    scope?: unknown
  }>
}

const outsideContract = (detail: string): Error =>
  new Error(`${detail} is not in the Workshop Capability Contract`)

/**
 * An omitted filter means the deployed set, not every native action or phase.
 * Registration applies this too, so a manifest saved before ADR 0025 is bound the same way.
 */
export function boundListenerFilters(
  listener: { actions?: string[]; phases?: ActionHookPhase[] },
): { actions: string[]; phases: ActionHookPhase[] } {
  const phases = listener.phases ?? [...sandboxListenerPhases]
  const actions = listener.actions
    ?? [...sandboxListenerActions, ...(phases.includes('anytime') ? [ANYTIME_ACTION_ID] : [])]
  return { actions, phases }
}

export function normalizeCustomManifest(raw: RawCustomManifest, cardId: string): CustomCodeManifest {
  const effectHooks = raw.effectKeys.map((hook): CardEffectField => {
    if (!cardEffectHooks.includes(hook as CardEffectField)) throw outsideContract(`effect hook '${hook}'`)
    return hook as CardEffectField
  })

  const handHooks = raw.effectMetadata?.handHooks?.map((hook) => {
    if (typeof hook !== 'string' || !isHandCardEffectHook(hook)) throw outsideContract(`hand hook '${String(hook)}'`)
    return hook
  })

  const listeners = raw.listeners.map((listener) => {
    if (listener.cardIds && !(listener.cardIds.length === 1 && listener.cardIds[0] === cardId)) {
      throw new Error('listener cardIds must be [CARD_ID]')
    }
    const declaredPhases = listener.phases?.map((phase): ActionHookPhase => {
      if (!isSandboxListenerPhase(phase)) throw outsideContract(`listener phase '${String(phase)}'`)
      return phase
    })
    const declaredActions = listener.actions?.map((action) => {
      if (!isSandboxListenerAction(action)) throw outsideContract(`listener action '${String(action)}'`)
      return action as string
    })
    const { actions, phases } = boundListenerFilters({ actions: declaredActions, phases: declaredPhases })
    if (listener.scope !== undefined && !isSandboxListenerScope(listener.scope)) {
      throw outsideContract(`listener scope '${String(listener.scope)}'`)
    }
    return {
      registrationId: listener.registrationId,
      // A listener always belongs to its card; without this it would react before the card is played.
      cardIds: [cardId],
      actions,
      phases,
      scope: listener.scope as CardListenerScope | undefined,
    }
  })

  return { effectHooks, effectMetadata: handHooks ? { handHooks } : undefined, listeners }
}

/** Flow hooks may only return contract flows; query hooks keep their own result shapes. */
export function assertCustomEffectResult(hook: string, result: unknown, cardId: string): void {
  if (FLOW_RESULT_HOOKS.has(hook)) assertCustomFlow(result, cardId, hook)
}
