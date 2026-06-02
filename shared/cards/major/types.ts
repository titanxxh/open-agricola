import type { Resource, ComplexCost } from '../../contract/types'
import type { CardEffect, CardEffectHook } from '../card-effects'
import type { CardDefinition } from '../../contract/cards'

/**
 * Hooks majors are allowed to register. Excludes `onBeforePlayerTurn`
 * because that hook returns `{ skipTurn?: boolean } | void` rather than
 * `ActionFlow | void`, and `applyMajorEffectForImprovement` assumes every
 * hook is flow-shaped.
 */
export type MajorEffectHook = Exclude<CardEffectHook, 'onBeforePlayerTurn'>

/**
 * Display-only major card metadata (no hooks). Used by cards-display/major
 * and consumed via `getMajorCardDisplay` from client tree-shake-friendly paths.
 */
export type MajorCardDisplay = CardDefinition & {
  cost: Partial<Resource> | ComplexCost
  vp: number
  extraVp: boolean
  desc: string[]
}

/**
 * Major hooks layer. Map-keyed by major id in `cards/major/effects.ts`.
 */
export type MajorHooks = Pick<
  CardEffect,
  MajorEffectHook | 'computeBonusScore' | 'computeCostedBonus'
>

/**
 * Composite type used by callers (improvement / exchange / round / catalog).
 * `cards/major/index.ts` builds these by merging display data with effects.
 */
export type MajorCardData = MajorCardDisplay & MajorHooks
