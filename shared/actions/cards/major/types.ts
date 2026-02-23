import type { Resource } from '../../../game/types'
import type { CardEffect, CardEffectHook } from '../card-effects'

export type MajorEffectHook = CardEffectHook

export type MajorCardEffect = CardEffect & {
  cost: Partial<Resource>
  vp: number
  extraVp: boolean
  description: string[]
  scoring?: {
    resource: keyof Resource
    map: Record<string, number>
  }
}
