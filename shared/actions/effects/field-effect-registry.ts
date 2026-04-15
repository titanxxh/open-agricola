import type { PlayerState } from '../../game/types'

export type FieldEffectContext = {
  player: PlayerState
  fields: string[]
  sourceCard: string | undefined
}

export type FieldEffectHandler = (ctx: FieldEffectContext) => void

const registry = new Map<string, FieldEffectHandler>()

export const registerFieldEffect = (name: string, handler: FieldEffectHandler) => {
  registry.set(name, handler)
}

export const runFieldEffect = (name: string, ctx: FieldEffectContext): boolean => {
  const handler = registry.get(name)
  if (!handler) return false
  handler(ctx)
  return true
}
