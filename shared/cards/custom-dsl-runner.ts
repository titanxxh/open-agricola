/**
 * DSL → ActionFlow converter for custom workshop cards.
 *
 * The DSL is a JSON-serialisable structure that the LLM generates.
 * It is intentionally limited — no arbitrary code execution.
 * Only whitelisted actions and conditions are supported.
 *
 * DSL shape (TypeScript types used at runtime too):
 *
 *   CardDslEffects = {
 *     onReturnHome?: DslEffect
 *     onRoundStart?: DslEffect
 *     onHarvest?: DslEffect
 *     onBuy?: DslEffect
 *     ...
 *   }
 *
 *   DslEffect = {
 *     optional?: boolean
 *     condition?: DslCondition
 *     flow: DslStep[]
 *   }
 *
 *   DslStep = {
 *     action: 'gain' | 'pay-resources' | 'bonus-vp' | 'exchange'
 *     params?: Record<string, number>
 *   }
 */

import type { ActionFlow, GameState, PlayerState } from '../game/types.ts'
import type { CardEffect, CardEffectHook } from './card-effects.ts'

// ── DSL Types ────────────────────────────────────────────────────────────────

export type DslStep = {
  action: string
  params?: Record<string, number | string>
}

export type DslCondition =
  | { player_has_resource: Record<string, number> }
  | { round_gte: number }
  | { family_size_gte: number }
  | { player_has_card: string }

export type DslEffect = {
  optional?: boolean
  condition?: DslCondition
  flow: DslStep[]
}

export type CardDslEffects = Partial<Record<CardEffectHook, DslEffect>>

// ── Whitelisted action IDs ───────────────────────────────────────────────────

const ALLOWED_ACTIONS = new Set([
  'gain',
  'pay-resources',
  'bonus-vp',
  'gain-other-players',
  'exchange',
  'bake-bread',
])

// ── Condition evaluator ──────────────────────────────────────────────────────

function evalCondition(condition: DslCondition, state: GameState, player: PlayerState): boolean {
  if ('player_has_resource' in condition) {
    for (const [res, min] of Object.entries(condition.player_has_resource)) {
      const have = (player.resources as Record<string, number>)[res] ?? 0
      if (have < min) return false
    }
    return true
  }
  if ('round_gte' in condition) {
    return state.round >= condition.round_gte
  }
  if ('family_size_gte' in condition) {
    return player.familySize >= condition.family_size_gte
  }
  if ('player_has_card' in condition) {
    const cardId = condition.player_has_card
    return (
      player.minorPlayed.includes(cardId) ||
      player.occupationPlayed.includes(cardId)
    )
  }
  return true
}

// ── DSL step → ActionFlow leaf ───────────────────────────────────────────────

function stepToLeaf(step: DslStep, sourceCard: string): ActionFlow {
  if (!ALLOWED_ACTIONS.has(step.action)) {
    throw new Error(`DSL: action "${step.action}" is not whitelisted`)
  }
  // params are resource amounts (number values only, sanitised)
  const params: Record<string, number> = {}
  for (const [k, v] of Object.entries(step.params ?? {})) {
    if (typeof v === 'number' && Number.isFinite(v)) {
      params[k] = Math.floor(Math.max(0, v))
    }
  }
  return {
    type: 'leaf',
    actionId: step.action,
    params,
    sourceCard,
  }
}

// ── Effect → handler function ────────────────────────────────────────────────

function effectToHandler(
  effect: DslEffect,
  cardId: string,
): (state: GameState, player: PlayerState) => ActionFlow | void {
  return (state: GameState, player: PlayerState): ActionFlow | void => {
    // Check condition if present
    if (effect.condition && !evalCondition(effect.condition, state, player)) {
      return undefined
    }
    // Must own the card
    const owns =
      player.minorPlayed.includes(cardId) ||
      player.occupationPlayed.includes(cardId)
    if (!owns) return undefined

    const children: ActionFlow[] = effect.flow.map((step) => stepToLeaf(step, cardId))
    if (children.length === 0) return undefined
    if (children.length === 1) {
      return { ...(children[0] as Extract<ActionFlow, { type: 'leaf' }>), optional: effect.optional ?? false }
    }
    return {
      type: 'seq',
      optional: effect.optional ?? false,
      children,
    }
  }
}

// ── Main export ──────────────────────────────────────────────────────────────

/**
 * Convert a CardDslEffects object into a CardEffect suitable for registerCardEffect().
 */
export function dslToCardEffect(cardId: string, dsl: CardDslEffects): CardEffect {
  const effect: CardEffect = { id: cardId }

  const hooks: CardEffectHook[] = [
    'onBuy', 'onRoundStart', 'onRoundEnd', 'onReturnHome',
    'onHarvest', 'onBeforeFeed', 'onAfterFeed',
    'onHarvestFieldPhase', 'onStartHarvestFeedingPhase',
    'onAfterHarvest', 'onBeforeHarvest',
  ]

  for (const hook of hooks) {
    const dslEffect = dsl[hook]
    if (!dslEffect) continue
    // onRoundEnd and similar have no return value in the engine — skip them for now;
    // the hooks that return ActionFlow | void are the useful ones.
    ;(effect as Record<string, unknown>)[hook] = effectToHandler(dslEffect, cardId)
  }

  return effect
}
