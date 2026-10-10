import { cardEffectHooks, flowCardEffectHooks, isHandCardEffectHook, type CardEffectField } from '../cards/card-effects'
import type { ActionHookPhase } from '../actions/hooks'
import type { CardListenerScope } from '../cards/card-listeners'
import { admitCustomFlow } from './flow-admission'
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

type QueryResultKind = 'number' | 'array' | 'object'

/**
 * The top-level type each query hook returns. A wrong one would throw inside a
 * native consumer, outside the failed-hook path; the contents stay with that consumer.
 */
export const QUERY_HOOK_RESULT_KINDS: Record<string, QueryResultKind> = {
  onBeforePlayerTurn: 'object',
  computeBonusScore: 'number',
  computeSharedPostScore: 'array',
  computeCostedBonus: 'array',
  computeExtraRoomCapacity: 'number',
  computeHarvestBreedOrderPriority: 'number',
  onComputeAnimalZones: 'array',
  computeLockedFarmTiles: 'array',
  getInvalidAnimals: 'array',
  getBuiltSpecialStables: 'array',
  getRuleContributions: 'object',
  getStatePresentation: 'object',
}

const matchesKind = (value: unknown, kind: QueryResultKind): boolean =>
  kind === 'number' ? typeof value === 'number' && Number.isFinite(value)
    : kind === 'array' ? Array.isArray(value)
      : !!value && typeof value === 'object' && !Array.isArray(value)

export const isFlowResultHook = (hook: string): boolean => FLOW_RESULT_HOOKS.has(hook)

/**
 * What a query hook contributes when it fails or returns nothing. Native
 * consumers iterate arrays and add these two numbers without checking, so the
 * sandbox adapters must not hand them `undefined`.
 */
export function neutralEffectResult(hook: string): unknown {
  if (QUERY_HOOK_RESULT_KINDS[hook] === 'array') return []
  return hook === 'computeBonusScore' || hook === 'computeExtraRoomCapacity' ? 0 : undefined
}

/** Flow hooks may only return contract flows; a query hook may return nothing or its documented top-level type. */
export function assertCustomEffectResult(hook: string, result: unknown, cardId: string): void {
  if (FLOW_RESULT_HOOKS.has(hook)) {
    admitCustomFlow(result, cardId, hook)
    return
  }
  const kind = QUERY_HOOK_RESULT_KINDS[hook]
  if (kind && result !== null && result !== undefined && !matchesKind(result, kind)) {
    throw new Error(`${hook}: must return ${kind === 'number' ? 'a finite number' : kind === 'array' ? 'an array' : 'an object'}`)
  }
}
