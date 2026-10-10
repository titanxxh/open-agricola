import { cardEffectHooks, flowCardEffectHooks, isHandCardEffectHook, type CardEffectField } from '../cards/card-effects'
import type { ActionHookPhase } from '../actions/hooks'
import type { CardListenerScope } from '../cards/card-listeners'
import { admitCustomFlow } from './flow-admission'
import { isSandboxListenerAction, sandboxListenerActions } from './sandbox-listener-actions'
import { isSandboxListenerPhase, sandboxListenerPhases } from './sandbox-listener-phases'
import { isSandboxListenerScope } from './sandbox-listener-scopes'
import { admitEffectMetadata, admitListenerData } from './sandbox-declarations'
import type { CustomCodeEffectMetadata, CustomCodeListenerManifest, CustomCodeManifest } from './types'

/**
 * Shared admission for both executors (ADR 0025): the manifest extracted from a
 * custom card and the values its effect hooks return must stay inside the
 * Workshop Capability Contract. Anything else throws, never silently narrows.
 */

/** Two phases are dispatched under their own action identity; neither is a listener action name. */
const PHASE_DISPATCH_IDS: Partial<Record<ActionHookPhase, string>> = {
  anytime: 'anytime',
  computeExchanges: 'compute-exchanges',
}

const FLOW_RESULT_HOOKS = new Set<string>([...flowCardEffectHooks, 'resolveChoice', 'contributeExtraTurn'])

/** What the manifest extraction script reports before any admission. */
export type RawCustomManifest = {
  effectKeys: string[]
  effectMetadata?: { handHooks?: unknown[] } & Record<string, unknown>
  listeners: Array<{
    registrationId: string
    cardIds?: unknown[]
    actions?: unknown[]
    phases?: unknown[]
    scope?: unknown
  } & Record<string, unknown>>
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
    ?? [...sandboxListenerActions, ...phases.flatMap(phase => PHASE_DISPATCH_IDS[phase] ?? [])]
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
      ...admitListenerData(listener, true),
    }
  })

  const effectMetadata: CustomCodeEffectMetadata = {
    ...(handHooks ? { handHooks } : {}),
    ...admitEffectMetadata(raw.effectMetadata, true),
  }
  return { effectHooks, effectMetadata: Object.keys(effectMetadata).length > 0 ? effectMetadata : undefined, listeners }
}

/** What registration copies from a saved manifest. Saving rejects a wrong type; a manifest
 * saved earlier that carries one, or a hand hook that is not open, loses that entry here. */
export function registeredEffectMetadata(manifest: CustomCodeManifest): CustomCodeEffectMetadata {
  const handHooks = manifest.effectMetadata?.handHooks?.filter(isHandCardEffectHook)
  return { ...(handHooks ? { handHooks } : {}), ...admitEffectMetadata(manifest.effectMetadata, false) }
}

export const registeredListenerData = (listener: CustomCodeListenerManifest) => admitListenerData(listener, false)

/** Positional arguments an executor passes to a hook: three, unless the hook documents more. */
const HOOK_ARGUMENT_COUNTS: Record<string, number> = {
  computeBreedThreshold: 4,
  computeBreedableAnimalCount: 5,
  computeAnimalScoreAdjustment: 4,
  onComputeSharedAnimalZones: 4,
}

export const extraHookArguments = (hook: string, args: readonly unknown[]): unknown[] =>
  args.slice(3, HOOK_ARGUMENT_COUNTS[hook] ?? 3)

type QueryResultKind = 'number' | 'array' | 'object' | 'boolean'

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
  computeResourceCommitments: 'array',
  countExtraTurns: 'number',
  enforceReorganizeOnLastHarvest: 'boolean',
  computeBreedThreshold: 'number',
  computeBreedableAnimalCount: 'number',
  computeAnimalScoreAdjustment: 'number',
  onComputeSharedAnimalZones: 'array',
}

const KIND_WORDING: Record<QueryResultKind, string> = {
  number: 'a finite number', array: 'an array', object: 'an object', boolean: 'a boolean',
}

const matchesKind = (value: unknown, kind: QueryResultKind): boolean =>
  kind === 'number' ? typeof value === 'number' && Number.isFinite(value)
    : kind === 'boolean' ? typeof value === 'boolean'
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
    throw new Error(`${hook}: must return ${KIND_WORDING[kind]}`)
  }
}
