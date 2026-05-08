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
 * Major improvement card metadata. Majors carry both CardDefinition fields
 * (id / name / deck / number / desc / vp / cost / exchanges / scoring / ...)
 * and CardEffect hooks (onBuy / onHarvest / ...). Built as an intersection
 * with CardDefinition so getCardDefinition can return majors via the unified
 * catalog entry.
 *
 * `cost`, `vp`, `extraVp`, `desc` are required for majors (CardDefinition
 * has them as optional / generic).
 */
export type MajorCardData = CardDefinition &
  CardEffect & {
    cost: Partial<Resource> | ComplexCost
    vp: number
    extraVp: boolean
    desc: string[]
  }
