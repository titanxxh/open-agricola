import type { Resource, ComplexCost } from '../../../game/types'
import type { CardEffect, CardEffectHook } from '../card-effects'

export type MajorEffectHook = CardEffectHook

export type MajorCardEffect = CardEffect & {
  cost: Partial<Resource> | ComplexCost
  vp: number
  extraVp: boolean
  description: string[]
  isCookery?: boolean
  isBaking?: boolean
  returnCards?: string[]
  scoring?: {
    resource: keyof Resource
    map: Record<string, number>
  }
}
